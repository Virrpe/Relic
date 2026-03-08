// Preset contract - tuned for tonal-field aesthetic with authored defaults
export interface Preset {
  id: string;
  name: string;
  defaultParams: {
    density?: number;
    pointSize?: number;
    wind?: number;
    turbulence?: number;
    erosion?: number;
    erosionX?: number;
    erosionY?: number;
    brightness?: number;
    contrast?: number;
  };
}

export const PRESETS: Preset[] = [
  {
    id: 'skull',
    name: 'Skull',
    // Dense, atmospheric, heavy erosion for ancient bone feel
    defaultParams: {
      density: 0.7,
      pointSize: 2.8,
      wind: 0.25,
      turbulence: 0.25,
      erosion: 0.15,
      erosionX: 0.2,
      erosionY: 0.8,
      brightness: 0.95,
      contrast: 1.15
    }
  },
  {
    id: 'moth',
    name: 'Moth',
    // Ethereal, lighter, upward drift (floating feel)
    defaultParams: {
      density: 0.55,
      pointSize: 2.2,
      wind: 0.45,
      turbulence: 0.35,
      erosion: 0.12,
      erosionX: 0,
      erosionY: 1.0,
      brightness: 1.0,
      contrast: 1.05
    }
  },
  {
    id: 'saint',
    name: 'Saint',
    // Stable, reverent, minimal erosion (halo-like glow)
    defaultParams: {
      density: 0.6,
      pointSize: 2.5,
      wind: 0.15,
      turbulence: 0.1,
      erosion: 0.05,
      erosionX: 0,
      erosionY: 0.3,
      brightness: 1.1,
      contrast: 1.0
    }
  },
  {
    id: 'drift',
    name: 'Drift',
    // Heavy drift, chaotic - debris floating in water
    defaultParams: {
      density: 0.45,
      pointSize: 2.0,
      wind: 0.7,
      turbulence: 0.55,
      erosion: 0.3,
      erosionX: 0.8,
      erosionY: 0.5,
      brightness: 0.85,
      contrast: 0.95
    }
  },
  {
    id: 'ruin',
    name: 'Ruin',
    // Very dense, large chunks, heavy decay
    defaultParams: {
      density: 0.4,
      pointSize: 3.5,
      wind: 0.3,
      turbulence: 0.45,
      erosion: 0.35,
      erosionX: -0.3,
      erosionY: 0.6,
      brightness: 0.8,
      contrast: 1.25
    }
  },
  {
    id: 'heart',
    name: 'Heart',
    // Warm, dense, stable (life force)
    defaultParams: {
      density: 0.7,
      pointSize: 2.2,
      wind: 0.2,
      turbulence: 0.08,
      erosion: 0.03,
      erosionX: 0,
      erosionY: 0.2,
      brightness: 1.15,
      contrast: 1.0
    }
  },
  {
    id: 'eel',
    name: 'Eel',
    defaultParams: {
      density: 0.5,
      pointSize: 1.8,
      wind: 0.5,
      turbulence: 0.35,
      erosion: 0.2,
      brightness: 0.95,
      contrast: 1.05
    }
  }
];

export function getPreset(id: string): Preset | undefined {
  return PRESETS.find(p => p.id === id);
}
