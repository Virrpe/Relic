// Point cloud data contract
// Packed as Float32Array: [x, y, weight, seed, layerType, markType] per particle (stride 6)
// Legacy format: [x, y, weight, seed] per particle (stride 4)

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
  stride: number; // Number of floats per point (4 for legacy, 6 for new)
}

export function createPointCloud(buffer: Float32Array, particleCount: number, stride: number = 4): PointCloud {
  const bounds = computeBounds(buffer, particleCount, stride);
  return { buffer, particleCount, bounds, stride };
}

function computeBounds(buffer: Float32Array, particleCount: number, stride: number): Bounds {
  if (particleCount === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0, centerX: 0, centerY: 0 };
  }

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  for (let i = 0; i < particleCount; i++) {
    const x = buffer[i * stride];
    const y = buffer[i * stride + 1];
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

export function getStride(): number {
  // 4 floats per particle: x, y, weight, seed
  return 4;
}
