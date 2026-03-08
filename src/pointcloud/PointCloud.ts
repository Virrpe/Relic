// Point cloud data contract
// Packed as Float32Array: [x, y, weight, seed, ...] per particle
export interface PointCloud {
  buffer: Float32Array;
  particleCount: number;
}

export function createPointCloud(buffer: Float32Array, particleCount: number): PointCloud {
  return { buffer, particleCount };
}

export function getStride(): number {
  // 4 floats per particle: x, y, weight, seed
  return 4;
}
