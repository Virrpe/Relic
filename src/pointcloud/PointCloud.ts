// Point cloud data contract
// Packed as Float32Array: [x, y, weight, seed, ...] per particle

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
    const x = buffer[i * 4];
    const y = buffer[i * 4 + 1];
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
