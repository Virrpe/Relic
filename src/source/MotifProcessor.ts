// MotifProcessor: Unified processor for generating motif maps from various sources
// Provides explicit mask-based source of truth for dual-field rendering

import { generateMapsFromLuminance, type MotifMaps } from './MotifMaps';
import { type ImageData } from './ImageIngestion';
import { renderText } from './TextMask';
import { getSkullMotif, getMothMotif, type MotifData } from './MotifFromSVG';

// Flag to enable SVG-based motifs for better recognition
const USE_SVG_MOTIFS = true;

// Preset mask definitions - explicit mask data for each preset
// These replace procedural guesses with proper SDF-like representations

export interface PresetMaskDefinition {
  id: string;
  name: string;
  // Grid resolution for the mask
  resolution: number;
  // Protected zone definitions (iconic voids)
  protectedZones: Array<{
    x: number;      // 0-1 normalized
    y: number;      // 0-1 normalized
    radius: number; // 0-1 normalized
    type: 'void' | 'critical' | 'structural';
  }>;
  // Shape function that generates the mask
  shapeFn: (x: number, y: number) => number;
}

// Skull preset mask - improved for static mode truth with clearer features
const skullMaskDefinition: PresetMaskDefinition = {
  id: 'skull',
  name: 'Skull',
  resolution: 256,
  protectedZones: [
    // Eye sockets - critical voids
    { x: 0.36, y: 0.475, radius: 0.09, type: 'void' },
    { x: 0.64, y: 0.475, radius: 0.09, type: 'void' },
    // Nose cavity
    { x: 0.5, y: 0.375, radius: 0.06, type: 'void' },
    // Teeth gaps
    { x: 0.41, y: 0.235, radius: 0.02, type: 'void' },
    { x: 0.5, y: 0.235, radius: 0.02, type: 'void' },
    { x: 0.59, y: 0.235, radius: 0.02, type: 'void' },
  ],
  shapeFn: (x: number, y: number): number => {
    const nx = (x - 0.5) * 2;
    const ny = (y - 0.5) * 2;
    
    // === CRANIUM (upper skull) ===
    const craniumRX = 0.65;
    const craniumRY = 0.55;
    const craniumDist = Math.sqrt((nx / craniumRX) ** 2 + ((ny + 0.1) / craniumRY) ** 2);
    const cranium = craniumDist < 1 ? Math.pow(1 - craniumDist, 0.7) : 0;
    
    // === JAW (lower skull) ===
    const jawTaper = 1 - Math.max(0, (ny + 0.5) / 0.4);
    const jawWidth = 0.35 * jawTaper + 0.15;
    const jawY = ny + 0.55;
    const inJaw = Math.abs(nx) < jawWidth && jawY > 0 && jawY < 0.35 
      ? Math.pow(1 - jawY / 0.35, 0.8) * (1 - Math.abs(nx) / jawWidth * 0.3)
      : 0;
    
    // === CHEEKBONES ===
    const cheekL = Math.sqrt((nx + 0.4) ** 2 + (ny - 0.15) ** 2);
    const cheekR = Math.sqrt((nx - 0.4) ** 2 + (ny - 0.15) ** 2);
    const cheek = Math.max(
      cheekL < 0.18 ? Math.pow(1 - cheekL / 0.18, 0.6) : 0,
      cheekR < 0.18 ? Math.pow(1 - cheekR / 0.18, 0.6) : 0
    );
    
    // === EYE SOCKETS (void) ===
    const eyeL = Math.sqrt(((nx + 0.28) / 0.9) ** 2 + ((ny - 0.05) / 1.1) ** 2);
    const eyeR = Math.sqrt(((nx - 0.28) / 0.9) ** 2 + ((ny - 0.05) / 1.1) ** 2);
    const eyeInvert = Math.max(
      eyeL < 0.16 ? -0.6 : 0,
      eyeR < 0.16 ? -0.6 : 0
    );
    
    // === NASAL CAVITY (void) ===
    const noseDist = Math.abs(nx) * 2.5 + (ny + 0.25);
    const noseInvert = noseDist < 0.18 ? -0.5 : 0;
    
    // === BROW RIDGE ===
    const browY = ny + 0.25;
    const brow = Math.abs(nx) < 0.45 && browY > -0.08 && browY < 0.05
      ? Math.pow(1 - Math.abs(browY) / 0.08, 2) * 0.4 * (1 - Math.abs(nx) / 0.45 * 0.5)
      : 0;
    
    let weight = cranium * 0.9 + inJaw * 0.85 + cheek + brow + eyeInvert + noseInvert;
    return Math.max(0, Math.min(1, weight * 0.95));
  }
};

// Moth preset mask - explicit void zones for wing gaps
const mothMaskDefinition: PresetMaskDefinition = {
  id: 'moth',
  name: 'Moth',
  resolution: 256,
  protectedZones: [
    // Wing body separation
    { x: 0.5, y: 0.5, radius: 0.06, type: 'void' },
    // Antenna bases
    { x: 0.42, y: 0.85, radius: 0.03, type: 'void' },
    { x: 0.58, y: 0.85, radius: 0.03, type: 'void' },
  ],
  shapeFn: (x: number, y: number): number => {
    const nx = (x - 0.5) * 2;
    const ny = (y - 0.5) * 2;
    
    // Wings
    const wingL = Math.sqrt(((nx + 0.3) / 0.75) ** 2 + (ny / 0.45) ** 2);
    const wingR = Math.sqrt(((nx - 0.3) / 0.75) ** 2 + (ny / 0.45) ** 2);
    const wings = Math.max(
      wingL < 1 ? 1 - wingL : 0,
      wingR < 1 ? 1 - wingR : 0
    );
    
    // Body
    const body = Math.abs(nx) < 0.1 && Math.abs(ny) < 0.65 
      ? (1 - Math.abs(nx) / 0.1) * (1 - Math.abs(ny) / 0.65) * 0.8 
      : 0;
    
    // Head
    const headDist = Math.sqrt(nx * nx + (ny - 0.55) * (ny - 0.55));
    const head = headDist < 0.12 ? 1 - headDist / 0.12 : 0;
    
    // Antennae
    const antL = Math.sqrt((nx + 0.08 - ny * 0.25) ** 2 + (ny - 0.65) ** 2);
    const antR = Math.sqrt((nx - 0.08 + ny * 0.25) ** 2 + (ny - 0.65) ** 2);
    const antennae = Math.max(
      antL < 0.4 ? (1 - antL / 0.4) * 0.5 : 0,
      antR < 0.4 ? (1 - antR / 0.4) * 0.5 : 0
    );
    
    return Math.min(1, wings * 0.85 + body + head * 0.9 + antennae * 0.7);
  }
};

// Heart preset mask - explicit void for top curves
const heartMaskDefinition: PresetMaskDefinition = {
  id: 'heart',
  name: 'Heart',
  resolution: 256,
  protectedZones: [
    // Center cleft (top)
    { x: 0.5, y: 0.65, radius: 0.04, type: 'void' },
  ],
  shapeFn: (x: number, y: number): number => {
    const nx = (x - 0.5) * 2;
    const ny = (y - 0.5) * 2;
    
    // Top lobes
    const topL = Math.sqrt((nx + 0.35) ** 2 + (ny + 0.25) ** 2);
    const topR = Math.sqrt((nx - 0.35) ** 2 + (ny + 0.25) ** 2);
    const top = Math.max(
      topL < 0.35 ? 1 - topL / 0.35 : 0,
      topR < 0.35 ? 1 - topR / 0.35 : 0
    );
    
    // Bottom triangle
    const triY = ny - 0.3;
    const triW = 0.35 - triY * 0.5;
    const inTri = triY > 0 && triY < 0.6 && Math.abs(nx) < triW 
      ? (1 - triY / 0.6) * (1 - Math.abs(nx) / triW) 
      : 0;
    
    return Math.min(1, top * 0.9 + inTri);
  }
};

// All preset definitions
export const PRESET_MASKS: Record<string, PresetMaskDefinition> = {
  skull: skullMaskDefinition,
  moth: mothMaskDefinition,
  heart: heartMaskDefinition,
  // Add more as needed
};

// Generate MotifMaps from a preset
export async function generateMapsFromPreset(
  presetId: string,
  seed: number
): Promise<MotifMaps> {
  // Use SVG-based motifs for skull and moth when enabled
  if (USE_SVG_MOTIFS && (presetId === 'skull' || presetId === 'moth' || presetId === 'skull_clean' || presetId === 'moth_clean')) {
    try {
      const motifData: MotifData = presetId === 'skull' || presetId === 'skull_clean' 
        ? await getSkullMotif() 
        : await getMothMotif();
      
      const maps = generateMapsFromLuminance(motifData.luminance, motifData.width, motifData.height, seed);
      
      // Add appropriate protected zones based on motif
      if (presetId === 'skull' || presetId === 'skull_clean') {
        maps.protectedZones = [
          { x: 0.35, y: 0.4, radius: 0.12, type: 'void' },
          { x: 0.65, y: 0.4, radius: 0.12, type: 'void' },
          { x: 0.5, y: 0.5, radius: 0.08, type: 'void' },
        ];
      } else {
        maps.protectedZones = [
          { x: 0.5, y: 0.45, radius: 0.1, type: 'void' },
          { x: 0.35, y: 0.8, radius: 0.08, type: 'void' },
          { x: 0.65, y: 0.8, radius: 0.08, type: 'void' },
        ];
      }
      
      return maps;
    } catch (e) {
      console.warn('SVG motif failed, falling back to procedural:', e);
    }
  }
  
  // Fallback to procedural
  const preset = PRESET_MASKS[presetId] || skullMaskDefinition;
  
  // Generate luminance from preset shape
  const { resolution } = preset;
  const luminance = new Float32Array(resolution * resolution);
  
  for (let y = 0; y < resolution; y++) {
    for (let x = 0; x < resolution; x++) {
      const idx = y * resolution + x;
      luminance[idx] = preset.shapeFn(x / resolution, y / resolution);
    }
  }
  
  // Generate maps from luminance
  const maps = generateMapsFromLuminance(luminance, resolution, resolution, seed);
  
  // Override protected zones with preset definitions
  maps.protectedZones = preset.protectedZones.map(zone => ({
    x: zone.x,
    y: zone.y,
    radius: zone.radius,
    type: zone.type
  }));
  
  return maps;
}

// Generate MotifMaps from image
export function generateMapsFromImage(
  imageData: ImageData,
  seed: number
): MotifMaps {
  return generateMapsFromLuminance(
    imageData.luminance,
    imageData.width,
    imageData.height,
    seed
  );
}

// Generate MotifMaps from text
export function generateMapsFromText(
  text: string,
  seed: number
): MotifMaps {
  const textData = renderText(text);
  return generateMapsFromLuminance(
    textData.luminance,
    textData.width,
    textData.height,
    seed
  );
}

// Unified function to get maps from any source
export async function generateMotifMaps(
  source: { type: 'preset'; id: string } | { type: 'image'; data: ImageData } | { type: 'text'; content: string },
  seed: number
): Promise<MotifMaps> {
  switch (source.type) {
    case 'preset':
      return generateMapsFromPreset(source.id, seed);
    case 'image':
      return generateMapsFromImage(source.data, seed);
    case 'text':
      return generateMapsFromText(source.content, seed);
  }
}
