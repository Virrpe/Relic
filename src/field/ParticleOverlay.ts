// ParticleOverlay: Sparse particle effects for atmosphere
// Renders AFTER field composite as secondary overlay

import type { RenderState } from '../state/RenderState';

export interface ParticleConfig {
  count: number;
  type: 'ash' | 'debris' | 'dust' | 'mixed';
  speed: number;
  direction: [number, number];
  size: number;
  opacity: number;
}

export class ParticleOverlay {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private particleBuffer: WebGLBuffer | null = null;
  
  // Particle data
  private particleCount = 500;
  private positions: Float32Array;
  private velocities: Float32Array;
  private seeds: Float32Array;
  
  // Uniforms
  private uTime: WebGLUniformLocation | null = null;
  private uResolution: WebGLUniformLocation | null = null;
  private uWind: WebGLUniformLocation | null = null;
  private uTurbulence: WebGLUniformLocation | null = null;
  private uParticleOpacity: WebGLUniformLocation | null = null;
  private uParticleSize: WebGLUniformLocation | null = null;
  
  // Particle type settings
  private particleType: 'ash' | 'debris' | 'dust' | 'mixed' = 'ash';
  private particleSpeed = 1.0;
  private particleOpacity = 0.5;
  private particleSize = 2.0;
  
  // Vertex shader for particles
  private vertShaderSrc = `#version 300 es
    precision highp float;
    
    in vec3 aPosition;
    in float aSeed;
    
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uWind;
    uniform float uTurbulence;
    uniform float uParticleSize;
    
    out float vSeed;
    out float vAlpha;
    
    float hash(float n) {
      return fract(sin(n) * 43758.5453123);
    }
    
    void main() {
      vSeed = aSeed;
      
      vec3 pos = aPosition;
      
      // Time-based movement
      float t = uTime * 0.5;
      
      // Wind displacement
      pos.x += sin(t + aSeed * 10.0) * uWind * 0.3;
      pos.y += t * uParticleSpeed * 0.1;
      
      // Turbulence
      pos.x += sin(t * 2.0 + pos.y * 5.0) * uTurbulence * 0.1;
      pos.y += cos(t * 1.5 + pos.x * 5.0) * uTurbulence * 0.05;
      
      // Wrap around (particles that go off-screen reappear)
      pos.y = mod(pos.y, 1.0);
      pos.x = mod(pos.x + 1.0, 1.0);
      
      // Convert to clip space
      vec2 clipPos = pos.xy * 2.0 - 1.0;
      
      // Point size varies by type
      gl_PointSize = uParticleSize * (0.5 + hash(aSeed) * 0.5);
      
      // Fade based on vertical position (fade at edges)
      vAlpha = smoothstep(0.0, 0.2, pos.y) * smoothstep(1.0, 0.8, pos.y);
      
      gl_Position = vec4(clipPos, 0.0, 1.0);
    }
  `;
  
  // Fragment shader for particles
  private fragShaderSrc = `#version 300 es
    precision highp float;
    
    in float vSeed;
    in float vAlpha;
    
    uniform float uParticleOpacity;
    
    out vec4 fragColor;
    
    float hash(float n) {
      return fract(sin(n) * 43758.5453123);
    }
    
    void main() {
      // Circular particle shape
      vec2 coord = gl_PointCoord - vec2(0.5);
      float dist = length(coord);
      if (dist > 0.5) discard;
      
      // Soft edge
      float alpha = 1.0 - smoothstep(0.2, 0.5, dist);
      
      // Variation
      float var = hash(vSeed * 100.0);
      
      // Dark particles (ash/debris)
      vec3 color = vec3(0.1, 0.1, 0.12);
      
      // Mix in some lighter particles
      color = mix(color, vec3(0.3, 0.28, 0.25), var * 0.3);
      
      alpha *= vAlpha * uParticleOpacity * (0.5 + var * 0.5);
      
      fragColor = vec4(color, alpha);
    }
  `;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.positions = new Float32Array(this.particleCount * 3);
    this.velocities = new Float32Array(this.particleCount * 2);
    this.seeds = new Float32Array(this.particleCount);
    
    this.initParticles();
    this.initGL();
  }

  private initParticles(): void {
    for (let i = 0; i < this.particleCount; i++) {
      // Random position
      this.positions[i * 3] = Math.random();     // x
      this.positions[i * 3 + 1] = Math.random(); // y
      this.positions[i * 3 + 2] = Math.random() * 0.1; // z (for depth)
      
      // Random velocity
      this.velocities[i * 2] = (Math.random() - 0.5) * 0.01;
      this.velocities[i * 2 + 1] = Math.random() * 0.02;
      
      // Random seed
      this.seeds[i] = Math.random();
    }
  }

  private initGL(): void {
    const gl = this.gl;
    
    // Compile shaders
    const vertShader = this.compileShader(gl.VERTEX_SHADER, this.vertShaderSrc);
    const fragShader = this.compileShader(gl.FRAGMENT_SHADER, this.fragShaderSrc);
    
    if (!vertShader || !fragShader) {
      console.error('Failed to compile particle shaders');
      return;
    }
    
    // Create program
    this.program = gl.createProgram();
    if (!this.program) return;
    
    gl.attachShader(this.program, vertShader);
    gl.attachShader(this.program, fragShader);
    gl.linkProgram(this.program);
    
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      console.error('Particle program link failed');
      return;
    }
    
    // Get uniform locations
    this.uTime = gl.getUniformLocation(this.program, 'uTime');
    this.uResolution = gl.getUniformLocation(this.program, 'uResolution');
    this.uWind = gl.getUniformLocation(this.program, 'uWind');
    this.uTurbulence = gl.getUniformLocation(this.program, 'uTurbulence');
    this.uParticleOpacity = gl.getUniformLocation(this.program, 'uParticleOpacity');
    this.uParticleSize = gl.getUniformLocation(this.program, 'uParticleSize');
    
    // Create VAO
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    
    // Create position buffer
    this.particleBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.positions, gl.STATIC_DRAW);
    
    const posLoc = gl.getAttribLocation(this.program, 'aPosition');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);
    
    // Create seed buffer
    const seedBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, seedBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.seeds, gl.STATIC_DRAW);
    
    const seedLoc = gl.getAttribLocation(this.program, 'aSeed');
    gl.enableVertexAttribArray(seedLoc);
    gl.vertexAttribPointer(seedLoc, 1, gl.FLOAT, false, 0, 0);
    
    gl.bindVertexArray(null);
  }

  private compileShader(type: number, source: string): WebGLShader | null {
    const gl = this.gl;
    const shader = gl.createShader(type);
    
    if (!shader) return null;
    
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    
    return shader;
  }

  // Set particle type
  setType(type: 'ash' | 'debris' | 'dust' | 'mixed'): void {
    this.particleType = type;
    
    switch (type) {
      case 'ash':
        this.particleCount = 300;
        this.particleSize = 2.0;
        this.particleSpeed = 0.5;
        break;
      case 'debris':
        this.particleCount = 200;
        this.particleSize = 4.0;
        this.particleSpeed = 1.5;
        break;
      case 'dust':
        this.particleCount = 500;
        this.particleSize = 1.5;
        this.particleSpeed = 0.3;
        break;
      case 'mixed':
      default:
        this.particleCount = 400;
        this.particleSize = 2.5;
        this.particleSpeed = 0.8;
        break;
    }
  }

  // Set opacity
  setOpacity(opacity: number): void {
    this.particleOpacity = opacity;
  }

  // Render particles (should be called after field composite)
  render(state: RenderState, time: number): void {
    if (!this.program || !this.vao) return;
    
    const gl = this.gl;
    
    // Enable blending for particles
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    
    // Set uniforms
    gl.uniform1f(this.uTime, time);
    gl.uniform2f(this.uResolution, this.gl.canvas.width, this.gl.canvas.height);
    gl.uniform1f(this.uWind, state.wind);
    gl.uniform1f(this.uTurbulence, state.turbulence);
    gl.uniform1f(this.uParticleOpacity, this.particleOpacity);
    gl.uniform1f(this.uParticleSize, this.particleSize);
    
    // Draw particles
    gl.drawArrays(gl.POINTS, 0, this.particleCount);
    
    gl.bindVertexArray(null);
    
    // Disable blending
    gl.disable(gl.BLEND);
  }

  // Check if particles are enabled
  isEnabled(): boolean {
    return this.particleOpacity > 0;
  }

  // Destroy
  destroy(): void {
    const gl = this.gl;
    
    if (this.program) {
      gl.deleteProgram(this.program);
    }
    
    if (this.vao) {
      gl.deleteVertexArray(this.vao);
    }
    
    if (this.particleBuffer) {
      gl.deleteBuffer(this.particleBuffer);
    }
  }
}
