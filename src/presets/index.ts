// Preset contract
export interface Preset {
  id: string;
  name: string;
  defaultParams: {
    density?: number;
    pointSize?: number;
    wind?: number;
    turbulence?: number;
    erosion?: number;
    brightness?: number;
    contrast?: number;
  };
}

export const PRESETS: Preset[] = [
  {
    id: 'skull',
    name: 'Skull',
    defaultParams: {
      density: 0.6,
      pointSize: 2.5,
      wind: 0.3,
      turbulence: 0.2,
      erosion: 0.1,
      brightness: 1.0,
      contrast: 1.1
    }
  },
  {
    id: 'moth',
    name: 'Moth',
    defaultParams: {
      density: 0.5,
      pointSize: 2.0,
      wind: 0.4,
      turbulence: 0.3,
      erosion: 0.15,
      brightness: 0.95,
      contrast: 1.0
    }
  },
  {
    id: 'saint',
    name: 'Saint',
    defaultParams: {
      density: 0.55,
      pointSize: 2.2,
      wind: 0.2,
      turbulence: 0.15,
      erosion: 0.08,
      brightness: 1.05,
      contrast: 1.05
    }
  },
  {
    id: 'drift',
    name: 'Drift',
    defaultParams: {
      density: 0.4,
      pointSize: 1.8,
      wind: 0.6,
      turbulence: 0.5,
      erosion: 0.25,
      brightness: 0.9,
      contrast: 0.95
    }
  },
  {
    id: 'ruin',
    name: 'Ruin',
    defaultParams: {
      density: 0.35,
      pointSize: 3.0,
      wind: 0.35,
      turbulence: 0.4,
      erosion: 0.3,
      brightness: 0.85,
      contrast: 1.2
    }
  },
  {
    id: 'heart',
    name: 'Heart',
    defaultParams: {
      density: 0.65,
      pointSize: 2.0,
      wind: 0.25,
      turbulence: 0.1,
      erosion: 0.05,
      brightness: 1.1,
      contrast: 1.0
    }
  },
  {
    id: 'eel',
    name: 'Eel',
    defaultParams: {
      density: 0.45,
      pointSize: 1.5,
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
