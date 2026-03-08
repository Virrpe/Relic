// Point cloud data contract
// Packed as Float32Array: [x, y, weight, seed, layer, particleType, erosionBias, ...] per particle

export type RenderLayer = 
  | 'atmospheric'   // Background dust, noise, ambient particles
  | 'structural'    // Core form, main structure
  | 'accent';       // Focal points, highlights, detail

export type ParticleType = 
  | 'dust'          // Tiny, sparse ambient particles
  | 'medium'        // Standard structural particles
  | 'chunk'         // Larger, chunkier particles
  | 'streak';       // Elongated trail-like particles

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export interface PointCloud {
  buffer: Float32Array;
  particleCount: number;
  bounds: Bounds;
}

export function createPointCloud(buffer: Float32Array, particleCount: number): PointCloud {
  const bounds = computeBounds(buffer, particleCount);
  return { buffer, particleCount, bounds };
}

function computeBounds(buffer: Float32Array, particleCount: number): Bounds {
  if (particleCount === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0, centerX: 0, centerY: 0 };
  }

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  for (let i = 0; i < particleCount; i++) {
    const x = buffer[i * STRIDE];
    const y = buffer[i * STRIDE + 1];
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2
  };
}

export const STRIDE = 8;
// 8 floats per particle: x, y, weight, seed, layer, particleType, erosionBias

export function getStride(): number {
  return STRIDE;
}

// Layer and type constants for encoding
export const LAYER_VALUES: Record<RenderLayer, number> = {
  atmospheric: 0.0,
  structural: 0.5,
  accent: 1.0
};

export const PARTICLE_TYPE_VALUES: Record<ParticleType, number> = {
  dust: 0.0,
  medium: 0.33,
  chunk: 0.66,
  streak: 1.0
};
