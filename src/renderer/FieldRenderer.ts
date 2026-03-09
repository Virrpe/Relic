// FieldRenderer: Full-screen quad renderer for field-based rendering
// Renders by sampling field textures instead of point clouds

import { FieldTextureManager, FIELD_INDICES, MAX_FIELD_SIZE } from '../field/FieldTextureManager';
import { ParticleOverlay } from '../field/ParticleOverlay';
import type { RenderState } from '../state/RenderState';
import fieldRenderVert from './shaders/field-render.vert?raw';
import fieldRenderFrag from './shaders/field-render.frag?raw';

// Debug view IDs
export const DEBUG_VIEWS = {
  FINAL: 0,
  ALPHA: 1,
  STRUCTURE: 2,
  TONE: 3,
  ACCENT: 4,
  ATMO: 5,
  EDGE: 6,
  EROSION: 7,
  COMPOSITE_STYLIZED: 8
} as const;

export type DebugView = typeof DEBUG_VIEWS[keyof typeof DEBUG_VIEWS];

export class FieldRenderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private textureManager: FieldTextureManager | null = null;
  
  // Uniform locations
  private uFieldTextures: WebGLUniformLocation | null = null;
  private uFieldResolutions: WebGLUniformLocation | null = null;
  private uCanvasResolution: WebGLUniformLocation | null = null;
  private uTime: WebGLUniformLocation | null = null;
  private uBrightness: WebGLUniformLocation | null = null;
  private uContrast: WebGLUniformLocation | null = null;
  private uDebugView: WebGLUniformLocation | null = null;
  private uFieldErosionAmount: WebGLUniformLocation | null = null;
  private uFieldErosionSeed: WebGLUniformLocation | null = null;
  
  // Phase 3: Pixel stylization uniforms
  private uFieldPixelSize: WebGLUniformLocation | null = null;
  private uFieldPixelQuantize: WebGLUniformLocation | null = null;
  private uFieldBlockDisplace: WebGLUniformLocation | null = null;
  private uFieldEdgeBreakup: WebGLUniformLocation | null = null;
  
  // Phase 4: Dissolve uniforms
  private uFieldDissolveEnabled: WebGLUniformLocation | null = null;
  private uFieldDissolveDirection: WebGLUniformLocation | null = null;
  private uFieldDissolveEdge: WebGLUniformLocation | null = null;
  private uFieldDissolveWidth: WebGLUniformLocation | null = null;
  private uFieldDissolveNoise: WebGLUniformLocation | null = null;
  
  // Phase 4: Glitch uniforms
  private uFieldGlitchEnabled: WebGLUniformLocation | null = null;
  private uFieldGlitchIntensity: WebGLUniformLocation | null = null;
  private uFieldGlitchBlockSize: WebGLUniformLocation | null = null;
  private uFieldGlitchSpeed: WebGLUniformLocation | null = null;
  
  // Debug view state
  private debugView: number = DEBUG_VIEWS.FINAL;
  
  // Erosion parameters
  private erosionAmount: number = 0;
  private erosionSeed: number = 0;
  
  // Phase 5: Particle overlay
  private particleOverlay: ParticleOverlay | null = null;
  private particleOpacity: number = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true
    });
    
    if (!gl) {
      throw new Error('WebGL2 not supported');
    }
    
    this.gl = gl;
    this.init();
  }

  private init(): void {
    const gl = this.gl;
    
    // Create shader program
    const vertShader = this.compileShader(gl.VERTEX_SHADER, fieldRenderVert);
    const fragShader = this.compileShader(gl.FRAGMENT_SHADER, fieldRenderFrag);
    
    if (!vertShader || !fragShader) {
      throw new Error('Failed to compile field render shaders');
    }
    
    this.program = gl.createProgram();
    if (!this.program) {
      throw new Error('Failed to create program');
    }
    
    gl.attachShader(this.program, vertShader);
    gl.attachShader(this.program, fragShader);
    gl.linkProgram(this.program);
    
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(this.program);
      throw new Error('Program link failed: ' + info);
    }
    
    // Get uniform locations
    this.uFieldTextures = gl.getUniformLocation(this.program, 'uFieldTextures');
    this.uFieldResolutions = gl.getUniformLocation(this.program, 'uFieldResolutions');
    this.uCanvasResolution = gl.getUniformLocation(this.program, 'uCanvasResolution');
    this.uTime = gl.getUniformLocation(this.program, 'uTime');
    this.uBrightness = gl.getUniformLocation(this.program, 'uBrightness');
    this.uContrast = gl.getUniformLocation(this.program, 'uContrast');
    this.uDebugView = gl.getUniformLocation(this.program, 'uDebugView');
    this.uFieldErosionAmount = gl.getUniformLocation(this.program, 'uFieldErosionAmount');
    this.uFieldErosionSeed = gl.getUniformLocation(this.program, 'uFieldErosionSeed');
    
    // Phase 3: Pixel stylization
    this.uFieldPixelSize = gl.getUniformLocation(this.program, 'uFieldPixelSize');
    this.uFieldPixelQuantize = gl.getUniformLocation(this.program, 'uFieldPixelQuantize');
    this.uFieldBlockDisplace = gl.getUniformLocation(this.program, 'uFieldBlockDisplace');
    this.uFieldEdgeBreakup = gl.getUniformLocation(this.program, 'uFieldEdgeBreakup');
    
    // Phase 4: Dissolve
    this.uFieldDissolveEnabled = gl.getUniformLocation(this.program, 'uFieldDissolveEnabled');
    this.uFieldDissolveDirection = gl.getUniformLocation(this.program, 'uFieldDissolveDirection');
    this.uFieldDissolveEdge = gl.getUniformLocation(this.program, 'uFieldDissolveEdge');
    this.uFieldDissolveWidth = gl.getUniformLocation(this.program, 'uFieldDissolveWidth');
    this.uFieldDissolveNoise = gl.getUniformLocation(this.program, 'uFieldDissolveNoise');
    
    // Phase 4: Glitch
    this.uFieldGlitchEnabled = gl.getUniformLocation(this.program, 'uFieldGlitchEnabled');
    this.uFieldGlitchIntensity = gl.getUniformLocation(this.program, 'uFieldGlitchIntensity');
    this.uFieldGlitchBlockSize = gl.getUniformLocation(this.program, 'uFieldGlitchBlockSize');
    this.uFieldGlitchSpeed = gl.getUniformLocation(this.program, 'uFieldGlitchSpeed');
    
    // Create full-screen quad VAO
    this.createFullScreenQuad();
    
    // Create texture manager
    this.textureManager = new FieldTextureManager(gl);
    
    // Create particle overlay
    this.particleOverlay = new ParticleOverlay(gl);
    
    // Set clear color
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
  }

  private compileShader(type: number, source: string): WebGLShader | null {
    const gl = this.gl;
    const shader = gl.createShader(type);
    
    if (!shader) {
      console.error('Failed to create shader');
      return null;
    }
    
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      console.error('Shader compile error:', info);
      gl.deleteShader(shader);
      return null;
    }
    
    return shader;
  }

  private createFullScreenQuad(): void {
    const gl = this.gl;
    
    // Full-screen triangle strip
    const vertices = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
       1,  1
    ]);
    
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    
    const loc = gl.getAttribLocation(this.program!, 'aPosition');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    
    gl.bindVertexArray(null);
  }

  // Load motif pack data
  loadMotifPack(pack: { width: number; height: number; alpha: { data: Float32Array }; structure: { data: Float32Array }; tone: { data: Float32Array }; accent?: { data: Float32Array } | null; atmo?: { data: Float32Array } | null }): void {
    if (!this.textureManager) return;
    
    this.textureManager.loadMotifPack(pack as any);
  }

  // Load from structural map (fallback)
  loadFromStructuralMap(luminance: Float32Array, width: number, height: number): void {
    if (!this.textureManager) return;
    
    this.textureManager.loadFromStructuralMap(luminance, width, height);
  }

  // Set debug view
  setDebugView(view: number): void {
    this.debugView = view;
  }

  // Set erosion parameters
  setErosion(amount: number, seed: number): void {
    this.erosionAmount = amount;
    this.erosionSeed = seed;
  }
  
  // Set particle overlay parameters
  setParticleOpacity(opacity: number): void {
    this.particleOpacity = opacity;
    if (this.particleOverlay) {
      this.particleOverlay.setOpacity(opacity);
    }
  }
  
  setParticleType(type: 'ash' | 'debris' | 'dust' | 'mixed'): void {
    if (this.particleOverlay) {
      this.particleOverlay.setType(type);
    }
  }

  // Render a frame
  render(state: RenderState, time: number): void {
    if (!this.textureManager?.isReady()) {
      // No data loaded, render black
      const gl = this.gl;
      gl.clear(gl.COLOR_BUFFER_BIT);
      return;
    }
    
    const gl = this.gl;
    
    // Use our shader program
    gl.useProgram(this.program);
    
    // Bind textures
    this.textureManager.bindTextures(0);
    
    // Set texture samplers
    const textureSlots = [];
    for (let i = 0; i < 7; i++) {
      textureSlots.push(i);
    }
    gl.uniform1iv(this.uFieldTextures, textureSlots);
    
    // Set field resolutions
    const [fieldWidth, fieldHeight] = this.textureManager.getResolution();
    gl.uniform2f(this.uFieldResolutions, fieldWidth, fieldHeight);
    
    // Set canvas resolution
    gl.uniform2f(this.uCanvasResolution, this.canvas.width, this.canvas.height);
    
    // Set time
    gl.uniform1f(this.uTime, time);
    
    // Set brightness/contrast from state
    gl.uniform1f(this.uBrightness, state.brightness);
    gl.uniform1f(this.uContrast, state.contrast);
    
    // Set debug view
    gl.uniform1i(this.uDebugView, this.debugView);
    
    // Set erosion parameters
    gl.uniform1f(this.uFieldErosionAmount, this.erosionAmount);
    gl.uniform1f(this.uFieldErosionSeed, this.erosionSeed);
    
    // Set Phase 3: Pixel stylization parameters
    gl.uniform1f(this.uFieldPixelSize, state.fieldPixelSize);
    gl.uniform1f(this.uFieldPixelQuantize, state.fieldPixelQuantize ? 1.0 : 0.0);
    gl.uniform1f(this.uFieldBlockDisplace, state.fieldBlockDisplace);
    gl.uniform1f(this.uFieldEdgeBreakup, state.fieldEdgeBreakup);
    
    // Set Phase 4: Dissolve parameters
    // Convert direction string to float
    let dissolveDirection = 0;
    if (state.fieldDissolveDirection === 'right-left') dissolveDirection = 0.25;
    else if (state.fieldDissolveDirection === 'bottom-top') dissolveDirection = 0.5;
    else if (state.fieldDissolveDirection === 'top-bottom') dissolveDirection = 0.75;
    
    gl.uniform1f(this.uFieldDissolveEnabled, state.fieldDissolveEnabled ? 1.0 : 0.0);
    gl.uniform1f(this.uFieldDissolveDirection, dissolveDirection);
    gl.uniform1f(this.uFieldDissolveEdge, state.fieldDissolveEdge);
    gl.uniform1f(this.uFieldDissolveWidth, state.fieldDissolveWidth);
    gl.uniform1f(this.uFieldDissolveNoise, state.fieldDissolveNoise);
    
    // Set Phase 4: Glitch parameters
    gl.uniform1f(this.uFieldGlitchEnabled, state.fieldGlitchEnabled ? 1.0 : 0.0);
    gl.uniform1f(this.uFieldGlitchIntensity, state.fieldGlitchIntensity);
    gl.uniform1f(this.uFieldGlitchBlockSize, state.fieldGlitchBlockSize);
    gl.uniform1f(this.uFieldGlitchSpeed, state.fieldGlitchSpeed);
    
    // Draw full-screen quad
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    
    // Phase 5: Render particle overlay
    if (this.particleOverlay && this.particleOpacity > 0) {
      this.particleOverlay.render(state, time);
    }
  }

  // Resize handler
  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
  }

  // Check if ready
  isReady(): boolean {
    return this.textureManager?.isReady() ?? false;
  }

  // Get texture manager for external access
  getTextureManager(): FieldTextureManager | null {
    return this.textureManager;
  }

  // Destroy renderer
  destroy(): void {
    const gl = this.gl;
    
    if (this.program) {
      gl.deleteProgram(this.program);
    }
    
    if (this.vao) {
      gl.deleteVertexArray(this.vao);
    }
    
    this.textureManager?.destroy();
  }
}
