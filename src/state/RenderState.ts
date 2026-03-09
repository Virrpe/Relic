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
  
  // Loop mode defaults
  loopEnabled: false,
  loopDuration: 3.0,
  frameCount: 30
};
