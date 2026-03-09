// Core render state contract
export interface RenderState {
  sourceMode: 'image' | 'text' | 'motif' | 'motif-pack';
  presetId: string;
  seed: number;
  density: number;
  pointSize: number;
  wind: number;
  turbulence: number;
  erosion: number;
  brightness: number;
  contrast: number;
  qualityTier: 'low' | 'medium' | 'high';
  
  // Dual-field parameters
  dissolveEnabled: boolean;
  dissolveDirection: number; // 0-1 (0=left, 1=right)
  dissolveEdge: number;     // 0-1 position
  dissolveWidth: number;    // 0-1 width
  
  // Glitch parameters
  glitchEnabled: boolean;
  glitchIntensity: number;  // 0-1
  
  // Field-specific erosion parameters (Phase 2)
  fieldErosionAmount: number;    // 0-1, strength of erosion
  fieldErosionMode: 'outside-in' | 'edge' | 'uniform';
  fieldErosionSeed: number;     // for noise patterns
  
  // Pixel stylization parameters (Phase 3)
  fieldPixelSize: number;       // pixel block size (e.g., 2-8 pixels)
  fieldPixelQuantize: boolean;  // reduce color depth
  fieldBlockDisplace: number;   // block jitter amount
  fieldEdgeBreakup: number;     // edge fragmentation
  
  // Dissolve parameters (Phase 4)
  fieldDissolveEnabled: boolean;
  fieldDissolveDirection: 'left-right' | 'right-left' | 'top-bottom' | 'bottom-top';
  fieldDissolveEdge: number;    // 0-1 position
  fieldDissolveWidth: number;   // transition width
  fieldDissolveNoise: number;   // edge irregularity
  
  // Glitch parameters (Phase 4)
  fieldGlitchEnabled: boolean;
  fieldGlitchIntensity: number;  // 0-1
  fieldGlitchBlockSize: number; // row/block height for corruption
  fieldGlitchSpeed: number;     // animation speed
  
  // Particle overlay parameters (Phase 5)
  fieldParticleEnabled: boolean;
  fieldParticleOpacity: number;  // 0-1
  fieldParticleType: 'ash' | 'debris' | 'dust' | 'mixed';
  
  // Loop mode
  loopEnabled: boolean;
  loopDuration: number;     // seconds
  frameCount: number;       // frames for GIF
}

export const DEFAULT_RENDER_STATE: RenderState = {
  sourceMode: 'motif',
  presetId: 'skull',
  seed: 42,
  density: 0.5,
  pointSize: 2.0,
  wind: 0.3,
  turbulence: 0.2,
  erosion: 0.1,
  brightness: 1.0,
  contrast: 1.0,
  qualityTier: 'high',
  
  // Dual-field defaults
  dissolveEnabled: false,
  dissolveDirection: 0.5,
  dissolveEdge: 0.5,
  dissolveWidth: 0.15,
  
  // Glitch defaults
  glitchEnabled: false,
  glitchIntensity: 0.3,
  
  // Field erosion defaults (Phase 2)
  fieldErosionAmount: 0,
  fieldErosionMode: 'outside-in',
  fieldErosionSeed: 42,
  
  // Pixel stylization defaults (Phase 3)
  fieldPixelSize: 1,
  fieldPixelQuantize: false,
  fieldBlockDisplace: 0,
  fieldEdgeBreakup: 0,
  
  // Field dissolve defaults (Phase 4)
  fieldDissolveEnabled: false,
  fieldDissolveDirection: 'left-right',
  fieldDissolveEdge: 0.5,
  fieldDissolveWidth: 0.15,
  fieldDissolveNoise: 0.1,
  
  // Field glitch defaults (Phase 4)
  fieldGlitchEnabled: false,
  fieldGlitchIntensity: 0.3,
  fieldGlitchBlockSize: 10,
  fieldGlitchSpeed: 1.0,
  
  // Particle overlay defaults (Phase 5)
  fieldParticleEnabled: false,
  fieldParticleOpacity: 0.5,
  fieldParticleType: 'ash',
  
  // Loop mode defaults
  loopEnabled: false,
  loopDuration: 3.0,
  frameCount: 30
};
