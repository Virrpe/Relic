<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { WebGLRenderer } from './renderer/WebGLRenderer';
  import { generateMotif } from './source/MotifLibrary';
  import { loadImage, generatePointCloudFromImage, type ImageData } from './source/ImageIngestion';
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
  let fileInput: HTMLInputElement;

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
    if (state.sourceMode === 'image' && currentImage) {
      cloud = generatePointCloudFromImage(currentImage, effectiveDensity, state.seed);
    } else {
      cloud = generateMotif(state.presetId, effectiveDensity, state.seed);
    }
    renderer.setPointCloud(cloud);
  }

  function handleModeChange(mode: 'motif' | 'image') {
    state.sourceMode = mode;
    if (mode === 'motif') {
      currentImage = null;
    }
    regenerateCloud();
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

  function handleExport(scale: number) {
    if (!renderer) return;
    const filename = state.sourceMode === 'image' 
      ? `relic-image-${Date.now()}.png`
      : `relic-${state.presetId}-${Date.now()}.png`;
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
    
    // Start animation
    renderer.startAnimation(state);
    
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
        </div>
      </label>
      
      {#if state.sourceMode === 'image'}
        <label>
          <span>Upload Image</span>
          <input 
            type="file" 
            accept="image/jpeg,image/png,image/webp"
            bind:this={fileInput}
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
  }
  
  .canvas-container canvas {
    max-width: 100%;
    max-height: 100%;
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
</style>
