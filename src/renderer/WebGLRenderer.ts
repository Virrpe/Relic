import type { PointCloud } from '../pointcloud/PointCloud';
import type { RenderState } from '../state/RenderState';
import stippleVert from './shaders/stipple.vert?raw';
import stippleFrag from './shaders/stipple.frag?raw';

export class WebGLRenderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private buffer: WebGLBuffer | null = null;
  private layerBuffer: WebGLBuffer | null = null; // For layerType attribute
  private pointCloud: PointCloud | null = null;
  private animationId: number | null = null;
  private startTime: number = 0;

  // Fit-to-viewport transform
  private scaleX = 1;
  private scaleY = 1;
  private offsetX = 0;
  private offsetY = 0;

  // Uniform locations
  private uTime: WebGLUniformLocation | null = null;
  private uWind: WebGLUniformLocation | null = null;
  private uTurbulence: WebGLUniformLocation | null = null;
  private uErosion: WebGLUniformLocation | null = null;
  private uBrightness: WebGLUniformLocation | null = null;
  private uContrast: WebGLUniformLocation | null = null;
  private uPointSize: WebGLUniformLocation | null = null;
  private uResolution: WebGLUniformLocation | null = null;
  private uTransform: WebGLUniformLocation | null = null;

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
    const vertShader = this.compileShader(gl.VERTEX_SHADER, stippleVert);
    const fragShader = this.compileShader(gl.FRAGMENT_SHADER, stippleFrag);
    
    if (!vertShader || !fragShader) {
      throw new Error('Failed to compile shaders');
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
    this.uTime = gl.getUniformLocation(this.program, 'uTime');
    this.uWind = gl.getUniformLocation(this.program, 'uWind');
    this.uTurbulence = gl.getUniformLocation(this.program, 'uTurbulence');
    this.uErosion = gl.getUniformLocation(this.program, 'uErosion');
    this.uBrightness = gl.getUniformLocation(this.program, 'uBrightness');
    this.uContrast = gl.getUniformLocation(this.program, 'uContrast');
    this.uPointSize = gl.getUniformLocation(this.program, 'uPointSize');
    this.uResolution = gl.getUniformLocation(this.program, 'uResolution');
    this.uTransform = gl.getUniformLocation(this.program, 'uTransform');
    
    // Create VAO
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    
    // Create buffer for point data (x, y, weight, seed)
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    
    // Point attribute (x, y, weight, seed) - 4 floats, stride 0 (interleaved)
    const loc = gl.getAttribLocation(this.program, 'aPoint');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 0, 0);
    
    // Create separate buffer for layerType (5th float)
    this.layerBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.layerBuffer);
    
    // Layer type attribute - 1 float per point
    const layerLoc = gl.getAttribLocation(this.program, 'aLayerType');
    if (layerLoc >= 0) {
      gl.enableVertexAttribArray(layerLoc);
      gl.vertexAttribPointer(layerLoc, 1, gl.FLOAT, false, 0, 0);
    }
    
    gl.bindVertexArray(null);
    
    // Set clear color
    gl.clearColor(0.04, 0.04, 0.06, 1.0);
    
    this.startTime = performance.now();
  }

  private compileShader(type: number, source: string): WebGLShader | null {
    const gl = this.gl;
    const shader = gl.createShader(type);
    if (!shader) return null;
    
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

  setPointCloud(cloud: PointCloud): void {
    this.pointCloud = cloud;
    this.computeFitToViewport();
    this.updateBuffer();
  }

  private computeFitToViewport(): void {
    if (!this.pointCloud || !this.canvas) return;

    const bounds = this.pointCloud.bounds;

    // Handle empty bounds
    if (bounds.width === 0 || bounds.height === 0) {
      this.scaleX = 1;
      this.scaleY = 1;
      this.offsetX = 0;
      this.offsetY = 0;
      return;
    }

    // Leave some margin
    const margin = 0.85;

    // Compute scales to fit width and height
    const scaleToFitWidth = (2 * margin) / bounds.width;
    const scaleToFitHeight = (2 * margin) / bounds.height;

    // Use uniform scaling (smaller of the two) to fit content
    const scale = Math.min(scaleToFitWidth, scaleToFitHeight);
    this.scaleX = scale;
    this.scaleY = scale;

    // Center the content
    this.offsetX = -bounds.centerX * this.scaleX;
    this.offsetY = -bounds.centerY * this.scaleY;
  }

  private updateBuffer(): void {
    if (!this.pointCloud || !this.buffer || !this.layerBuffer) return;
    
    const gl = this.gl;
    const buffer = this.pointCloud.buffer;
    const count = this.pointCloud.particleCount;
    
    // Handle empty point cloud
    if (count === 0) {
      return;
    }
    
    // Extract point data (x, y, weight, seed) - first 4 floats per point
    const pointData = new Float32Array(count * 4);
    const layerData = new Float32Array(count);
    
    for (let i = 0; i < count; i++) {
      const srcOffset = i * 5;
      const dstOffset = i * 4;
      
      // Copy first 4 floats
      pointData[dstOffset] = buffer[srcOffset];
      pointData[dstOffset + 1] = buffer[srcOffset + 1];
      pointData[dstOffset + 2] = buffer[srcOffset + 2];
      pointData[dstOffset + 3] = buffer[srcOffset + 3];
      
      // Extract layer type (5th float) - default to 0 if not present
      layerData[i] = srcOffset + 4 < buffer.length ? buffer[srcOffset + 4] : 0;
    }
    
    // Bind and populate point data buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, pointData, gl.STATIC_DRAW);
    
    // Bind and populate layer type buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, this.layerBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, layerData, gl.STATIC_DRAW);
  }

  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
    this.computeFitToViewport();
  }

  render(state: RenderState): void {
    const gl = this.gl;
    
    if (!this.program || !this.vao || !this.pointCloud) return;
    
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    
    // Update uniforms
    const time = (performance.now() - this.startTime) / 1000;
    gl.uniform1f(this.uTime, time);
    gl.uniform1f(this.uWind, state.wind);
    gl.uniform1f(this.uTurbulence, state.turbulence);
    gl.uniform1f(this.uErosion, state.erosion);
    gl.uniform1f(this.uBrightness, state.brightness);
    gl.uniform1f(this.uContrast, state.contrast);
    gl.uniform1f(this.uPointSize, state.pointSize);
    gl.uniform2f(this.uResolution, this.canvas.width, this.canvas.height);
    gl.uniform4f(this.uTransform, this.scaleX, this.scaleY, this.offsetX, this.offsetY);
    
    // Draw points
    gl.drawArrays(gl.POINTS, 0, this.pointCloud.particleCount);
    
    gl.bindVertexArray(null);
  }

  startAnimation(stateGetter: () => RenderState): void {
    const animate = () => {
      this.render(stateGetter());
      this.animationId = requestAnimationFrame(animate);
    };
    animate();
  }

  stopAnimation(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  exportPNG(scale: number = 1): string {
    const width = this.canvas.width * scale;
    const height = this.canvas.height * scale;
    
    // Create export canvas
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = width;
    exportCanvas.height = height;
    const ctx = exportCanvas.getContext('2d');
    
    if (!ctx) {
      throw new Error('Failed to create export context');
    }
    
    // Fill with background
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, width, height);
    
    // Draw WebGL canvas scaled
    ctx.drawImage(this.canvas, 0, 0, width, height);
    
    return exportCanvas.toDataURL('image/png');
  }

  downloadPNG(filename: string = 'relic-export.png', scale: number = 1): void {
    const dataUrl = this.exportPNG(scale);
    const link = document.createElement('a');
    link.download = filename;
    link.href = dataUrl;
    link.click();
  }

  destroy(): void {
    this.stopAnimation();
    
    const gl = this.gl;
    if (this.buffer) gl.deleteBuffer(this.buffer);
    if (this.layerBuffer) gl.deleteBuffer(this.layerBuffer);
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.program) gl.deleteProgram(this.program);
  }
}
