// Core render state contract
export interface RenderState {
  sourceMode: 'image' | 'text' | 'motif';
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
  qualityTier: 'high'
};
