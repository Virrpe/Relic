<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { WebGLRenderer } from './renderer/WebGLRenderer';
  import { generateMotif } from './source/MotifLibrary';
  import { loadImage, generatePointCloudFromImage, type ImageData } from './source/ImageIngestion';
  import { renderText, generatePointCloudFromText, type TextData } from './source/TextMask';
  import { generateMapsFromPreset, generateMapsFromMotifPack } from './source/MotifProcessor';
  import { generateDualFieldPointCloud, type DualFieldConfig } from './pointcloud/DualFieldPointCloud';
  import { loadMotifPack, loadGrayImage, type MotifPack, type PlateUploadSlots, type DiagnosticView, createEmptyPlateSlots, createPreviewCanvas } from './source/MotifPack';
  import { DEFAULT_RENDER_STATE, type RenderState } from './state/RenderState';
  import { PRESETS, getPreset } from './presets/index';

  let canvas: HTMLCanvasElement;
  let renderer: WebGLRenderer | null = null;
  
  // Reactive state
  let state: RenderState = { ...DEFAULT_RENDER_STATE };
  let canvasWidth = 800;
  let canvasHeight = 600;
  
  // Image data
  let currentImage: ImageData | null = null;
  let isLoadingImage = false;
  
  // Text data
  let currentText: TextData | null = null;
  let textInput = 'RELIC';

  // Motif pack data
  let currentMotifPack: MotifPack | null = null;
  let isLoadingMotifPack = false;
  let motifPackError: string | null = null;
  let plateSlots: PlateUploadSlots = createEmptyPlateSlots();
  let diagnosticView: DiagnosticView = 'full';
  let previewCanvases: Record<string, HTMLCanvasElement> = {};

  // Dual field config
  let useDualField = false;

  // Quality tiers for density mapping
  const QUALITY_DENSITY = {
    low: 0.3,
    medium: 0.5,
    high: 1.0
  };

  function regenerateCloud() {
    if (!renderer) return;
    
    const effectiveDensity = state.density * QUALITY_DENSITY[state.qualityTier];
    
    let cloud;
    if (useDualField) {
      // Use dual-field rendering
      let luminance: Float32Array;
      let width: number;
      let height: number;
      
      if (state.sourceMode === 'image' && currentImage) {
        luminance = currentImage.luminance;
        width = currentImage.width;
        height = currentImage.height;
      } else if (state.sourceMode === 'text' && currentText) {
        luminance = currentText.luminance;
        width = currentText.width;
        height = currentText.height;
      } else if (state.sourceMode === 'motif-pack' && currentMotifPack) {
        // Use motif pack - generate maps from pack plates
        const maps = generateMapsFromMotifPack(currentMotifPack);
        luminance = maps.structural;
        width = maps.width;
        height = maps.height;
      } else {
        // Generate from preset
        const maps = generateMapsFromPreset(state.presetId, state.seed);
        luminance = maps.structural;
        width = maps.width;
        height = maps.height;
      }
      
      const dfConfig: Partial<DualFieldConfig> = {
        density: effectiveDensity,
        seed: state.seed,
        dissolveEnabled: state.dissolveEnabled,
        dissolveDirection: state.dissolveDirection,
        dissolveEdge: state.dissolveEdge,
        dissolveWidth: state.dissolveWidth,
        glitchEnabled: state.glitchEnabled,
        glitchIntensity: state.glitchIntensity
      };
      
      const dualCloud = generateDualFieldPointCloud(luminance, width, height, dfConfig);
      cloud = dualCloud.combined;
    } else {
      // Legacy single-field rendering
      if (state.sourceMode === 'image' && currentImage) {
        cloud = generatePointCloudFromImage(currentImage, effectiveDensity, state.seed);
      } else if (state.sourceMode === 'text' && currentText) {
        cloud = generatePointCloudFromText(currentText, effectiveDensity, state.seed);
      } else {
        cloud = generateMotif(state.presetId, effectiveDensity, state.seed);
      }
    }
    renderer.setPointCloud(cloud);
  }

  function handleModeChange(mode: 'motif' | 'image' | 'text' | 'motif-pack') {
    state.sourceMode = mode;
    if (mode === 'motif') {
      currentImage = null;
      currentText = null;
      currentMotifPack = null;
    } else if (mode === 'image') {
      currentText = null;
      currentMotifPack = null;
    } else if (mode === 'text') {
      currentImage = null;
      currentMotifPack = null;
      if (!currentText) {
        // Generate default text
        currentText = renderText(textInput);
      }
    } else if (mode === 'motif-pack') {
      currentImage = null;
      currentText = null;
      // Regenerate if pack is loaded, otherwise just switch mode
      if (currentMotifPack) {
        regenerateCloud();
      }
      return; // Don't call regenerateCloud again below
    }
    regenerateCloud();
  }

  function handleTextInput(e: Event) {
    const target = e.target as HTMLInputElement;
    textInput = target.value;
    if (textInput.trim()) {
      currentText = renderText(textInput);
      regenerateCloud();
    }
  }

  async function handleFileUpload(e: Event) {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;
    
    // Validate file type
    if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
      console.error('Invalid file type. Use JPG, PNG, or WebP.');
      return;
    }
    
    isLoadingImage = true;
    try {
      currentImage = await loadImage(file);
      state.sourceMode = 'image';
      regenerateCloud();
    } catch (err) {
      console.error('Failed to load image:', err);
    } finally {
      isLoadingImage = false;
    }
  }

  // Handle motif pack plate upload
  async function handlePlateUpload(plateType: keyof PlateUploadSlots, e: Event) {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;
    
    // Validate file type
    if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
      motifPackError = `Invalid file type for ${plateType}. Use JPG, PNG, or WebP.`;
      return;
    }
    
    // Store the file
    plateSlots[plateType] = file;
    plateSlots = plateSlots; // Trigger reactivity
    
    // Update preview
    try {
      const grayImage = await loadGrayImage(file);
      previewCanvases[plateType] = createPreviewCanvas(grayImage);
      previewCanvases = previewCanvases;
    } catch (err) {
      console.error(`Failed to preview ${plateType}:`, err);
    }
    
    motifPackError = null;
    
    // Try to load complete pack if all required plates are present
    await tryLoadMotifPack();
  }

  async function tryLoadMotifPack() {
    const requiredPlates: (keyof PlateUploadSlots)[] = ['alpha', 'structure', 'tone'];
    const hasAllRequired = requiredPlates.every(plate => plateSlots[plate] !== null);
    
    if (!hasAllRequired) {
      return;
    }
    
    isLoadingMotifPack = true;
    motifPackError = null;
    
    try {
      currentMotifPack = await loadMotifPack(plateSlots);
      state.sourceMode = 'motif-pack';
      regenerateCloud();
    } catch (err) {
      motifPackError = err instanceof Error ? err.message : 'Failed to load motif pack';
      console.error('Failed to load motif pack:', err);
    } finally {
      isLoadingMotifPack = false;
    }
  }

  function clearMotifPack() {
    currentMotifPack = null;
    plateSlots = createEmptyPlateSlots();
    previewCanvases = {};
    motifPackError = null;
    state.sourceMode = 'motif';
    regenerateCloud();
  }

  function handlePresetChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    state.presetId = target.value;
    const preset = getPreset(state.presetId);
    if (preset) {
      state = { ...state, ...preset.defaultParams };
    }
    regenerateCloud();
  }

  function handleSliderChange(key: keyof RenderState) {
    return (e: Event) => {
      const target = e.target as HTMLInputElement;
      const value = parseFloat(target.value);
      state = { ...state, [key]: value };
      
      // Density or seed changes require cloud regeneration
      if (key === 'density' || key === 'seed') {
        regenerateCloud();
      }
    };
  }

  function toggleDualField() {
    useDualField = !useDualField;
    regenerateCloud();
  }

  function handleDissolveToggle() {
    state.dissolveEnabled = !state.dissolveEnabled;
    if (useDualField) regenerateCloud();
  }

  function handleGlitchToggle() {
    state.glitchEnabled = !state.glitchEnabled;
    if (useDualField) regenerateCloud();
  }

  function handleExport(scale: number) {
    if (!renderer) return;
    let filename: string;
    if (state.sourceMode === 'image') {
      filename = `relic-image-${Date.now()}.png`;
    } else if (state.sourceMode === 'text') {
      filename = `relic-text-${Date.now()}.png`;
    } else {
      filename = `relic-${state.presetId}-${Date.now()}.png`;
    }
    renderer.downloadPNG(filename, scale);
  }

  function handleQualityChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    state.qualityTier = target.value as 'low' | 'medium' | 'high';
    regenerateCloud();
  }

  onMount(() => {
    // Initialize renderer
    renderer = new WebGLRenderer(canvas);
    renderer.resize(canvasWidth, canvasHeight);
    
    // Generate initial cloud
    regenerateCloud();
    
    // Start animation - pass a getter to always get current state
    renderer.startAnimation(() => state);
    
    // Handle resize
    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        canvasWidth = entry.contentRect.width;
        canvasHeight = entry.contentRect.height;
        renderer?.resize(canvasWidth, canvasHeight);
      }
    });
    
    resizeObserver.observe(canvas.parentElement!);
    
    return () => {
      resizeObserver.disconnect();
    };
  });

  onDestroy(() => {
    renderer?.destroy();
  });
</script>

<div class="app">
  <div class="canvas-container">
    <canvas bind:this={canvas}></canvas>
  </div>
  
  <div class="controls">
    <div class="control-header">
      <h1>RELIC</h1>
      <span class="subtitle">erosion engine</span>
    </div>
    
    <div class="control-section">
      <label>
        <span>Mode</span>
        <div class="mode-buttons">
          <button 
            class:active={state.sourceMode === 'motif'}
            on:click={() => handleModeChange('motif')}
          >Motif</button>
          <button 
            class:active={state.sourceMode === 'image'}
            on:click={() => handleModeChange('image')}
          >Image</button>
          <button 
            class:active={state.sourceMode === 'text'}
            on:click={() => handleModeChange('text')}
          >Text</button>
          <button 
            class:active={state.sourceMode === 'motif-pack'}
            on:click={() => handleModeChange('motif-pack')}
          >Pack</button>
        </div>
      </label>
      
      {#if state.sourceMode === 'image'}
        <label>
          <span>Upload Image</span>
          <input 
            type="file" 
            accept="image/jpeg,image/png,image/webp"
            on:change={handleFileUpload}
            disabled={isLoadingImage}
          />
          {#if isLoadingImage}
            <span class="loading">Loading...</span>
          {/if}
          {#if currentImage && !isLoadingImage}
            <span class="loaded">Image loaded ({currentImage.width}x{currentImage.height})</span>
          {/if}
        </label>
      {/if}
      
      {#if state.sourceMode === 'text'}
        <label>
          <span>Enter Text</span>
          <input 
            type="text" 
            value={textInput}
            on:input={handleTextInput}
            placeholder="Enter text..."
          />
        </label>
      {/if}
      
      {#if state.sourceMode === 'motif'}
        <label>
          <span>Preset</span>
          <select value={state.presetId} on:change={handlePresetChange}>
            {#each PRESETS as preset}
              <option value={preset.id}>{preset.name}</option>
            {/each}
          </select>
        </label>
      {/if}
      
      {#if state.sourceMode === 'motif-pack'}
        <div class="motif-pack-upload">
          <span>Plate Uploads (Required: alpha, structure, tone)</span>
          
          {#if motifPackError}
            <span class="error">{motifPackError}</span>
          {/if}
          
          {#if isLoadingMotifPack}
            <span class="loading">Loading motif pack...</span>
          {/if}
          
          <label class="plate-upload">
            <span>Alpha (silhouette) *</span>
            <input 
              type="file" 
              accept="image/jpeg,image/png,image/webp"
              on:change={(e) => handlePlateUpload('alpha', e)}
            />
            {#if previewCanvases.alpha}
              <img src={previewCanvases.alpha.toDataURL()} alt="alpha preview" class="preview-thumb" />
            {:else if plateSlots.alpha}
              <span class="loaded">File selected</span>
            {/if}
          </label>
          
          <label class="plate-upload">
            <span>Structure (preservation) *</span>
            <input 
              type="file" 
              accept="image/jpeg,image/png,image/webp"
              on:change={(e) => handlePlateUpload('structure', e)}
            />
            {#if previewCanvases.structure}
              <img src={previewCanvases.structure.toDataURL()} alt="structure preview" class="preview-thumb" />
            {:else if plateSlots.structure}
              <span class="loaded">File selected</span>
            {/if}
          </label>
          
          <label class="plate-upload">
            <span>Tone (density) *</span>
            <input 
              type="file" 
              accept="image/jpeg,image/png,image/webp"
              on:change={(e) => handlePlateUpload('tone', e)}
            />
            {#if previewCanvases.tone}
              <img src={previewCanvases.tone.toDataURL()} alt="tone preview" class="preview-thumb" />
            {:else if plateSlots.tone}
              <span class="loaded">File selected</span>
            {/if}
          </label>
          
          <label class="plate-upload optional">
            <span>Accent (highlights) - Optional</span>
            <input 
              type="file" 
              accept="image/jpeg,image/png,image/webp"
              on:change={(e) => handlePlateUpload('accent', e)}
            />
            {#if previewCanvases.accent}
              <img src={previewCanvases.accent.toDataURL()} alt="accent preview" class="preview-thumb" />
            {:else if plateSlots.accent}
              <span class="loaded">File selected</span>
            {/if}
          </label>
          
          <label class="plate-upload optional">
            <span>Atmo (atmosphere) - Optional</span>
            <input 
              type="file" 
              accept="image/jpeg,image/png,image/webp"
              on:change={(e) => handlePlateUpload('atmo', e)}
            />
            {#if previewCanvases.atmo}
              <img src={previewCanvases.atmo.toDataURL()} alt="atmo preview" class="preview-thumb" />
            {:else if plateSlots.atmo}
              <span class="loaded">File selected</span>
            {/if}
          </label>
          
          {#if currentMotifPack}
            <span class="loaded">Motif Pack loaded ({currentMotifPack.width}x{currentMotifPack.height})</span>
            <button class="generate-btn" on:click={() => regenerateCloud()}>Generate Points</button>
            <button class="clear-btn" on:click={clearMotifPack}>Clear Pack</button>
            
            <label>
              <span>Diagnostic View</span>
              <select bind:value={diagnosticView}>
                <option value="full">Full Stack</option>
                <option value="alpha">Alpha Only</option>
                <option value="structure">Structure Only</option>
                <option value="tone">Tone Only</option>
                <option value="accent">Accent Only</option>
                <option value="atmo">Atmo Only</option>
                <option value="alpha-structure">Alpha + Structure</option>
                <option value="alpha-structure-tone">Alpha + Structure + Tone</option>
              </select>
            </label>
          {/if}
        </div>
      {/if}
      
      <label>
        <span>Quality</span>
        <select value={state.qualityTier} on:change={handleQualityChange}>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </label>
    </div>
    
    <div class="control-section">
      <h3>Dual-Field Rendering</h3>
      <label class="toggle">
        <input type="checkbox" checked={useDualField} on:change={toggleDualField} />
        <span>Enable Dual-Field Mode</span>
      </label>
      
      {#if useDualField}
        <label class="toggle">
          <input type="checkbox" checked={state.dissolveEnabled} on:change={handleDissolveToggle} />
          <span>Dissolve Effect</span>
        </label>
        
        {#if state.dissolveEnabled}
          <label>
            <span>Dissolve Direction: {state.dissolveDirection < 0.5 ? 'Left' : 'Right'}</span>
            <input 
              type="range" 
              min="0" 
              max="1" 
              step="0.1" 
              value={state.dissolveDirection}
              on:input={handleSliderChange('dissolveDirection')}
            />
          </label>
          
          <label>
            <span>Dissolve Edge: {(state.dissolveEdge * 100).toFixed(0)}%</span>
            <input 
              type="range" 
              min="0" 
              max="1" 
              step="0.05" 
              value={state.dissolveEdge}
              on:input={handleSliderChange('dissolveEdge')}
            />
          </label>
        {/if}
        
        <label class="toggle">
          <input type="checkbox" checked={state.glitchEnabled} on:change={handleGlitchToggle} />
          <span>Glitch Effect</span>
        </label>
        
        {#if state.glitchEnabled}
          <label>
            <span>Glitch Intensity: {(state.glitchIntensity * 100).toFixed(0)}%</span>
            <input 
              type="range" 
              min="0" 
              max="1" 
              step="0.1" 
              value={state.glitchIntensity}
              on:input={handleSliderChange('glitchIntensity')}
            />
          </label>
        {/if}
      {/if}
    </div>
    
    <div class="control-section">
      <label>
        <span>Density: {state.density.toFixed(2)}</span>
        <input 
          type="range" 
          min="0.1" 
          max="1" 
          step="0.01" 
          value={state.density}
          on:input={handleSliderChange('density')}
        />
      </label>
      
      <label>
        <span>Point Size: {state.pointSize.toFixed(1)}</span>
        <input 
          type="range" 
          min="0.5" 
          max="5" 
          step="0.1" 
          value={state.pointSize}
          on:input={handleSliderChange('pointSize')}
        />
      </label>
    </div>
    
    <div class="control-section">
      <label>
        <span>Wind: {state.wind.toFixed(2)}</span>
        <input 
          type="range" 
          min="0" 
          max="1" 
          step="0.01" 
          value={state.wind}
          on:input={handleSliderChange('wind')}
        />
      </label>
      
      <label>
        <span>Turbulence: {state.turbulence.toFixed(2)}</span>
        <input 
          type="range" 
          min="0" 
          max="1" 
          step="0.01" 
          value={state.turbulence}
          on:input={handleSliderChange('turbulence')}
        />
      </label>
      
      <label>
        <span>Erosion: {state.erosion.toFixed(2)}</span>
        <input 
          type="range" 
          min="0" 
          max="1" 
          step="0.01" 
          value={state.erosion}
          on:input={handleSliderChange('erosion')}
        />
      </label>
    </div>
    
    <div class="control-section">
      <label>
        <span>Brightness: {state.brightness.toFixed(2)}</span>
        <input 
          type="range" 
          min="0.5" 
          max="1.5" 
          step="0.01" 
          value={state.brightness}
          on:input={handleSliderChange('brightness')}
        />
      </label>
      
      <label>
        <span>Contrast: {state.contrast.toFixed(2)}</span>
        <input 
          type="range" 
          min="0.5" 
          max="1.5" 
          step="0.01" 
          value={state.contrast}
          on:input={handleSliderChange('contrast')}
        />
      </label>
      
      <label>
        <span>Seed: {state.seed}</span>
        <input 
          type="range" 
          min="0" 
          max="9999" 
          step="1" 
          value={state.seed}
          on:input={handleSliderChange('seed')}
        />
      </label>
    </div>
    
    <div class="control-section export-section">
      <span>Export</span>
      <div class="export-buttons">
        <button on:click={() => handleExport(1)}>1x</button>
        <button on:click={() => handleExport(2)}>2x</button>
        <button on:click={() => handleExport(4)}>4x</button>
      </div>
    </div>
  </div>
</div>

<style>
  .app {
    display: flex;
    width: 100%;
    height: 100%;
    background: #0a0a0a;
    color: #e0e0e0;
  }
  
  .canvas-container {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0a0a0f;
    padding: 20px;
    min-height: 300px;
  }
  
  .canvas-container canvas {
    width: 100%;
    height: 100%;
    object-fit: contain;
    border: 1px solid #222;
  }
  
  .controls {
    width: 320px;
    background: #111;
    border-left: 1px solid #222;
    padding: 24px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  /* Mobile responsive - stack vertically */
  @media (max-width: 768px) {
    .app {
      flex-direction: column;
    }
    
    .canvas-container {
      flex: none;
      height: 50vh;
      min-height: 250px;
    }
    
    .controls {
      width: 100%;
      border-left: none;
      border-top: 1px solid #222;
      max-height: 50vh;
    }
  }
  
  .control-header {
    text-align: center;
    padding-bottom: 16px;
    border-bottom: 1px solid #222;
  }
  
  .control-header h1 {
    font-size: 28px;
    font-weight: 300;
    letter-spacing: 8px;
    margin: 0;
  }
  
  .control-header .subtitle {
    font-size: 10px;
    letter-spacing: 4px;
    color: #666;
    text-transform: uppercase;
  }
  
  .control-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  
  .control-section > span {
    font-size: 10px;
    letter-spacing: 2px;
    color: #666;
    text-transform: uppercase;
    margin-bottom: 4px;
  }
  
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  
  label > span {
    font-size: 11px;
    color: #888;
  }
  
  select, input[type="range"] {
    width: 100%;
  }
  
  .toggle {
    flex-direction: row;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }
  
  .toggle input[type="checkbox"] {
    width: auto;
    margin: 0;
  }
  
  .toggle span {
    font-size: 12px;
    color: #888;
  }
  
  .control-section h3 {
    font-size: 11px;
    letter-spacing: 2px;
    color: #aaa;
    text-transform: uppercase;
    margin: 0 0 8px 0;
  }
  
  select {
    background: #1a1a1a;
    border: 1px solid #333;
    color: #e0e0e0;
    padding: 8px 12px;
    font-size: 13px;
    font-family: inherit;
    cursor: pointer;
  }
  
  select:hover {
    border-color: #444;
  }
  
  input[type="range"] {
    -webkit-appearance: none;
    appearance: none;
    height: 4px;
    background: #222;
    border-radius: 2px;
    cursor: pointer;
  }
  
  input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 14px;
    height: 14px;
    background: #888;
    border-radius: 50%;
    cursor: pointer;
  }
  
  input[type="range"]::-webkit-slider-thumb:hover {
    background: #aaa;
  }
  
  .export-section {
    margin-top: auto;
    padding-top: 16px;
    border-top: 1px solid #222;
  }
  
  .export-buttons {
    display: flex;
    gap: 8px;
  }
  
  .export-buttons button {
    flex: 1;
    padding: 10px;
    background: #1a1a1a;
    border: 1px solid #333;
    color: #e0e0e0;
    font-size: 12px;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .export-buttons button:hover {
    background: #2a2a2a;
    border-color: #555;
  }

  .mode-buttons {
    display: flex;
    gap: 8px;
  }

  .mode-buttons button {
    flex: 1;
    padding: 8px;
    background: #1a1a1a;
    border: 1px solid #333;
    color: #888;
    font-size: 12px;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.2s;
  }

  .mode-buttons button:hover {
    border-color: #555;
  }

  .mode-buttons button.active {
    background: #2a2a2a;
    color: #e0e0e0;
    border-color: #555;
  }

  input[type="file"] {
    font-size: 12px;
    color: #888;
  }

  input[type="file"]::file-selector-button {
    padding: 6px 12px;
    background: #1a1a1a;
    border: 1px solid #333;
    color: #e0e0e0;
    cursor: pointer;
    margin-right: 8px;
  }

  input[type="file"]::file-selector-button:hover {
    border-color: #555;
  }

  .loading, .loaded {
    font-size: 10px;
    color: #666;
    margin-top: 4px;
  }

  .loaded {
    color: #4a4;
  }

  input[type="text"] {
    width: 100%;
    padding: 8px 12px;
    background: #1a1a1a;
    border: 1px solid #333;
    color: #e0e0e0;
    font-size: 13px;
    font-family: inherit;
    cursor: pointer;
  }

  input[type="text"]:hover {
    border-color: #444;
  }

  input[type="text"]:focus {
    outline: none;
    border-color: #555;
  }

  /* Motif Pack Upload Styles */
  .motif-pack-upload {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    background: #1a1a1a;
    border: 1px solid #333;
    border-radius: 4px;
  }

  .motif-pack-upload > span:first-child {
    font-size: 11px;
    color: #888;
    margin-bottom: 4px;
  }

  .plate-upload {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 8px;
    padding: 6px 0;
  }

  .plate-upload > span {
    flex: 0 0 120px;
    font-size: 11px;
    color: #aaa;
  }

  .plate-upload input[type="file"] {
    flex: 1;
  }

  .plate-upload.optional {
    opacity: 0.7;
  }

  .plate-upload.optional > span {
    color: #777;
  }

  .preview-thumb {
    width: 40px;
    height: 40px;
    object-fit: contain;
    border: 1px solid #444;
    background: #000;
  }

  .clear-btn {
    padding: 8px 12px;
    background: #2a1a1a;
    border: 1px solid #443;
    color: #d88;
    font-size: 11px;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.2s;
    margin-top: 8px;
  }

  .clear-btn:hover {
    background: #3a2a2a;
    border-color: #664;
  }

  .generate-btn {
    padding: 8px 12px;
    background: #2a2a3a;
    border: 1px solid #446;
    color: #aaf;
    font-size: 11px;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.2s;
    margin-top: 8px;
    margin-right: 8px;
  }

  .generate-btn:hover {
    background: #3a3a4a;
    border-color: #668;
  }

  .error {
    font-size: 11px;
    color: #d44;
    padding: 4px 8px;
    background: #2a1a1a;
    border-radius: 2px;
  }
</style>
