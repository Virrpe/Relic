// MotifProcessor: Unified processor for generating motif maps from various sources
// Provides explicit mask-based source of truth for dual-field rendering

import { generateMapsFromLuminance, type MotifMaps } from './MotifMaps';
import { type ImageData } from './ImageIngestion';
import { renderText } from './TextMask';
import { type MotifPack } from './MotifPack';
import { type Bounds } from '../pointcloud/PointCloud';

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

// Skull preset mask - explicit void zones for eye sockets, nose, teeth gaps
const skullMaskDefinition: PresetMaskDefinition = {
  id: 'skull',
  name: 'Skull',
  resolution: 256,
  protectedZones: [
    // Eye sockets - critical voids
    { x: 0.35, y: 0.45, radius: 0.08, type: 'void' },
    { x: 0.65, y: 0.45, radius: 0.08, type: 'void' },
    // Nose cavity
    { x: 0.5, y: 0.38, radius: 0.05, type: 'void' },
    // Teeth gaps
    { x: 0.42, y: 0.22, radius: 0.025, type: 'void' },
    { x: 0.5, y: 0.22, radius: 0.025, type: 'void' },
    { x: 0.58, y: 0.22, radius: 0.025, type: 'void' },
  ],
  shapeFn: (x: number, y: number): number => {
    const nx = (x - 0.5) * 2;
    const ny = (y - 0.5) * 2;
    
    // Cranium
    const craniumDist = Math.sqrt(nx * nx + (ny + 0.1) * (ny + 0.1));
    const cranium = craniumDist < 0.85 ? 1 - (craniumDist / 0.85) * 0.4 : 0;
    
    // Jaw
    const jawY = ny + 0.55;
    const inJaw = Math.abs(nx) < 0.45 && jawY > -0.15 && jawY < 0.25 
      ? (1 - Math.abs(nx) / 0.45) * (1 - (jawY + 0.15) / 0.4) 
      : 0;
    
    // Cheekbones
    const cheekL = Math.sqrt((nx + 0.35) * (nx + 0.35) + (ny - 0.05) * (ny - 0.05));
    const cheekR = Math.sqrt((nx - 0.35) * (nx - 0.35) + (ny - 0.05) * (ny - 0.05));
    const cheek = Math.max(
      cheekL < 0.22 ? (1 - cheekL / 0.22) * 0.6 : 0,
      cheekR < 0.22 ? (1 - cheekR / 0.22) * 0.6 : 0
    );
    
    // Brow ridge
    const browY = ny - 0.2;
    const brow = Math.abs(nx) < 0.5 && browY > -0.1 && browY < 0.05
      ? (1 - Math.abs(nx) / 0.5) * 0.4
      : 0;
    
    return Math.min(1, Math.max(0, cranium + inJaw * 0.9 + cheek + brow));
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
export function generateMapsFromPreset(
  presetId: string,
  seed: number
): MotifMaps {
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
export function generateMotifMaps(
  source: { type: 'preset'; id: string } | { type: 'image'; data: ImageData } | { type: 'text'; content: string },
  seed: number
): MotifMaps {
  switch (source.type) {
    case 'preset':
      return generateMapsFromPreset(source.id, seed);
    case 'image':
      return generateMapsFromImage(source.data, seed);
    case 'text':
      return generateMapsFromText(source.content, seed);
  }
}

// Generate MotifMaps from a MotifPack - uses the plates directly
export function generateMapsFromMotifPack(pack: MotifPack): MotifMaps {
  const { width, height, alpha } = pack;
  
  // Use alpha as the primary structural mask
  // This represents silhouette/occupancy truth
  const structural: Float32Array = alpha.data;
  
  // Compute edge map from structural (alpha) using Sobel
  const edge = computeEdgeMapFromGray(structural, width, height);
  
  // Compute distance map from structural
  const distance = computeDistanceMapFromGray(structural, width, height);
  
  // Generate protected zones based on structure plate
  // High structure values indicate areas to preserve
  const protectedZones = detectProtectedZonesFromStructure(structural, width, height);
  
  const bounds = computeBoundsFromLuminance(structural, width, height);
  
  return {
    structural,
    edge,
    distance,
    protectedZones,
    width,
    height,
    bounds
  };
}

// Compute edge map from grayscale data using Sobel
function computeEdgeMapFromGray(data: Float32Array, width: number, height: number): Float32Array {
  const edge = new Float32Array(width * height);
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      
      // Sobel kernels
      const gx = 
        -data[(y - 1) * width + (x - 1)] + data[(y - 1) * width + (x + 1)] +
        -2 * data[y * width + (x - 1)] + 2 * data[y * width + (x + 1)] +
        -data[(y + 1) * width + (x - 1)] + data[(y + 1) * width + (x + 1)];
        
      const gy = 
        -data[(y - 1) * width + (x - 1)] - 2 * data[(y - 1) * width + x] - data[(y - 1) * width + (x + 1)] +
        data[(y + 1) * width + (x - 1)] + 2 * data[(y + 1) * width + x] + data[(y + 1) * width + (x + 1)];
      
      edge[idx] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  
  // Normalize
  let maxEdge = 0;
  for (let i = 0; i < edge.length; i++) {
    if (edge[i] > maxEdge) maxEdge = edge[i];
  }
  
  if (maxEdge > 0) {
    for (let i = 0; i < edge.length; i++) {
      edge[i] /= maxEdge;
    }
  }
  
  return edge;
}

// Compute distance map from grayscale data (simplified for performance)
function computeDistanceMapFromGray(data: Float32Array, width: number, height: number): Float32Array {
  const distance = new Float32Array(width * height);
  const threshold = 0.15;
  
  // Simplified: use data values directly as a distance approximation
  // Positive = inside, Negative = outside
  for (let i = 0; i < data.length; i++) {
    if (data[i] > threshold) {
      // Inside: use normalized value
      distance[i] = -data[i];
    } else {
      // Outside: use distance from threshold
      distance[i] = (threshold - data[i]) * 2;
    }
  }
  
  return distance;
}

// Detect protected zones from structure plate (simplified for performance)
function detectProtectedZonesFromStructure(
  _structure: Float32Array, 
  _width: number, 
  _height: number
): Array<{ x: number; y: number; radius: number; type: 'void' | 'critical' | 'structural' }> {
  // Simplified: return empty zones array for now
  // The structural information is still used in the point generation
  return [];
}

// Compute bounds from luminance data
function computeBoundsFromLuminance(
  luminance: Float32Array, 
  width: number, 
  height: number
): Bounds {
  const threshold = 0.1;
  
  let minX = width, maxX = 0;
  let minY = height, maxY = 0;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (luminance[idx] > threshold) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }
  
  // Default bounds if nothing found
  if (minX > maxX) {
    return { minX: 0, maxX: width - 1, minY: 0, maxY: height - 1, width: width, height: height, centerX: 0.5, centerY: 0.5 };
  }
  
  const boundsWidth = maxX - minX;
  const boundsHeight = maxY - minY;
  
  return { 
    minX, 
    maxX, 
    minY, 
    maxY,
    width: boundsWidth,
    height: boundsHeight,
    centerX: (minX + maxX) / 2 / width,
    centerY: (minY + maxY) / 2 / height
  };
}
