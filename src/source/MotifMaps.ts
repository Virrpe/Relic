// MotifMaps: Generates structural, edge, and distance maps from motif sources
// This is the source of truth for dual-field rendering

import type { Bounds } from '../pointcloud/PointCloud';

export interface MotifMaps {
  // Structural mask: binary-ish map of where the motif exists
  structural: Float32Array;
  // Edge map: outlines/contours of the motif
  edge: Float32Array;
  // Distance map: distance from edge (negative = inside, positive = outside)
  distance: Float32Array;
  // Protected zones: regions that should survive erosion
  protectedZones: ProtectedZone[];
  width: number;
  height: number;
  bounds: Bounds;
}

export interface ProtectedZone {
  // Normalized coordinates (0-1)
  x: number;
  y: number;
  radius: number;
  // Zone type for different preservation strategies
  type: 'void' | 'critical' | 'structural';
}

// Generate maps from luminance data (for images and text)
export function generateMapsFromLuminance(
  luminance: Float32Array,
  width: number,
  height: number,
  _seed: number
): MotifMaps {
  // Compute structural mask (thresholded luminance)
  const structural = computeStructuralMask(luminance, width, height);
  
  // Compute edge map using Sobel operator
  const edge = computeEdgeMap(structural, width, height);
  
  // Compute distance map (signed distance from edge)
  const distance = computeDistanceMap(structural, width, height);
  
  // Detect protected zones from the motif
  const protectedZones = detectProtectedZones(luminance, width, height);
  
  const bounds = computeBoundsFromLuminance(luminance, width, height);
  
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

function computeStructuralMask(luminance: Float32Array, width: number, height: number): Float32Array {
  const structural = new Float32Array(width * height);
  const threshold = 0.15;
  
  for (let i = 0; i < luminance.length; i++) {
    // Create a slightly smoothed structural mask
    const l = luminance[i];
    structural[i] = l > threshold ? Math.pow((l - threshold) / (1 - threshold), 0.7) : 0;
  }
  
  return structural;
}

// Compute edge map using Sobel operator
function computeEdgeMap(structural: Float32Array, width: number, height: number): Float32Array {
  const edge = new Float32Array(width * height);
  
  // Sobel kernels
  const sobelX = [
    -1, 0, 1,
    -2, 0, 2,
    -1, 0, 1
  ];
  
  const sobelY = [
    -1, -2, -1,
    0, 0, 0,
    1, 2, 1
  ];
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      
      let gx = 0;
      let gy = 0;
      
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const kidx = (ky + 1) * 3 + (kx + 1);
          const pidx = (y + ky) * width + (x + kx);
          gx += structural[pidx] * sobelX[kidx];
          gy += structural[pidx] * sobelY[kidx];
        }
      }
      
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

// Compute signed distance map using EDT (Euclidean Distance Transform)
// Negative = inside, Positive = outside
function computeDistanceMap(structural: Float32Array, width: number, height: number): Float32Array {
  const distance = new Float32Array(width * height);
  const threshold = 0.5;
  
  // Binary image
  const binary = new Uint8Array(width * height);
  for (let i = 0; i < structural.length; i++) {
    binary[i] = structural[i] > threshold ? 1 : 0;
  }
  
  // Compute distance transform for inside
  const distInside = edt2D(binary, width, height, 1);
  
  // Compute distance transform for outside  
  const distOutside = edt2D(binary, width, height, 0);
  
  // Combine: negative inside, positive outside
  for (let i = 0; i < width * height; i++) {
    const dIn = distInside[i];
    const dOut = distOutside[i];
    
    // Normalize and scale
    distance[i] = (dOut - dIn) / Math.max(width, height);
  }
  
  return distance;
}

// 2D Euclidean Distance Transform (single-pass algorithm)
function edt2D(binary: Uint8Array, width: number, height: number, inside: number): Float32Array {
  const dist = new Float32Array(width * height);
  
  // First pass: horizontal
  for (let y = 0; y < height; y++) {
    if (inside === 1) {
      // Distance from inside pixels
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (binary[idx] === inside) {
          dist[idx] = 0;
        } else if (x > 0) {
          dist[idx] = dist[idx - 1] + 1;
        } else {
          dist[idx] = width;
        }
      }
      // Right to left pass
      for (let x = width - 2; x >= 0; x--) {
        const idx = y * width + x;
        if (dist[idx + 1] + 1 < dist[idx]) {
          dist[idx] = dist[idx + 1] + 1;
        }
      }
    } else {
      // Distance from outside pixels (inverted)
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (binary[idx] !== inside) {
          dist[idx] = 0;
        } else if (x > 0) {
          dist[idx] = dist[idx - 1] + 1;
        } else {
          dist[idx] = width;
        }
      }
      for (let x = width - 2; x >= 0; x--) {
        const idx = y * width + x;
        if (dist[idx + 1] + 1 < dist[idx]) {
          dist[idx] = dist[idx + 1] + 1;
        }
      }
    }
  }
  
  // Second pass: vertical
  for (let x = 0; x < width; x++) {
    for (let y = 1; y < height; y++) {
      const idx = y * width + x;
      const upIdx = (y - 1) * width + x;
      if (dist[upIdx] + 1 < dist[idx]) {
        dist[idx] = dist[upIdx] + 1;
      }
    }
    for (let y = height - 2; y >= 0; y--) {
      const idx = y * width + x;
      const downIdx = (y + 1) * width + x;
      if (dist[downIdx] + 1 < dist[idx]) {
        dist[idx] = dist[downIdx] + 1;
      }
    }
  }
  
  return dist;
}

// Detect protected zones based on motif characteristics
function detectProtectedZones(luminance: Float32Array, width: number, height: number): ProtectedZone[] {
  const zones: ProtectedZone[] = [];
  const threshold = 0.2;
  
  // Find dark regions (voids) - eye sockets, text counters, gaps
  // Use blob detection to find disconnected dark regions
  const visited = new Uint8Array(width * height);
  
  for (let y = 5; y < height - 5; y += 5) {
    for (let x = 5; x < width - 5; x += 5) {
      const idx = y * width + x;
      
      if (visited[idx]) continue;
      
      // Check if this is a void region (dark spot inside bright area)
      if (luminance[idx] < threshold) {
        // Flood fill to find extent
        const region = floodFillRegion(luminance, visited, width, height, x, y, threshold, 0.3);
        
        if (region.pixels.length > 5 && region.pixels.length < width * height * 0.3) {
          // Calculate center and radius
          let cx = 0, cy = 0;
          for (const [px, py] of region.pixels) {
            cx += px;
            cy += py;
          }
          cx /= region.pixels.length;
          cy /= region.pixels.length;
          
          // Calculate approximate radius
          let maxDist = 0;
          for (const [px, py] of region.pixels) {
            const d = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
            if (d > maxDist) maxDist = d;
          }
          
          zones.push({
            x: cx / width,
            y: cy / height,
            radius: maxDist / Math.min(width, height),
            type: 'void'
          });
        }
      }
    }
  }
  
  // Detect critical structural points (high edge density areas)
  const edge = computeEdgeMap(luminance, width, height);
  
  // Find local maxima in edge density
  const blockSize = Math.max(8, Math.floor(width / 20));
  for (let by = blockSize; by < height - blockSize; by += blockSize) {
    for (let bx = blockSize; bx < width - blockSize; bx += blockSize) {
      let sum = 0;
      let count = 0;
      
      for (let dy = -blockSize / 2; dy < blockSize / 2; dy++) {
        for (let dx = -blockSize / 2; dx < blockSize / 2; dx++) {
          const px = Math.floor(bx + dx);
          const py = Math.floor(by + dy);
          if (px >= 0 && px < width && py >= 0 && py < height) {
            sum += edge[py * width + px];
            count++;
          }
        }
      }
      
      const avgEdge = sum / count;
      
      if (avgEdge > 0.3) {
        zones.push({
          x: bx / width,
          y: by / height,
          radius: blockSize / Math.min(width, height) * 1.5,
          type: 'critical'
        });
      }
    }
  }
  
  return zones;
}

function floodFillRegion(
  luminance: Float32Array,
  visited: Uint8Array,
  width: number,
  height: number,
  startX: number,
  startY: number,
  maxVal: number,
  minVal: number
): { pixels: [number, number][] } {
  const pixels: [number, number][] = [];
  const stack: [number, number][] = [[startX, startY]];
  
  while (stack.length > 0 && pixels.length < 1000) {
    const [x, y] = stack.pop()!;
    const idx = y * width + x;
    
    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    if (visited[idx]) continue;
    if (luminance[idx] > maxVal || luminance[idx] < minVal) continue;
    
    visited[idx] = 1;
    pixels.push([x, y]);
    
    stack.push([x + 1, y]);
    stack.push([x - 1, y]);
    stack.push([x, y + 1]);
    stack.push([x, y - 1]);
  }
  
  return { pixels };
}

function computeBoundsFromLuminance(luminance: Float32Array, width: number, height: number): Bounds {
  let minX = width, maxX = 0;
  let minY = height, maxY = 0;
  const threshold = 0.15;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (luminance[y * width + x] > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  
  if (maxX === 0) {
    return {
      minX: 0, maxX: width,
      minY: 0, maxY: height,
      width: width, height: height,
      centerX: width / 2, centerY: height / 2
    };
  }
  
  return {
    minX, maxX, minY, maxY,
    width: maxX - minX,
    height: maxY - minY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2
  };
}

// Check if a point is in a protected zone
export function isPointProtected(
  x: number, // normalized 0-1
  y: number, // normalized 0-1
  zones: ProtectedZone[],
  erosionStrength: number
): boolean {
  for (const zone of zones) {
    const dx = x - zone.x;
    const dy = y - zone.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    // Zone protection scales with erosion
    const effectiveRadius = zone.radius * (1 + erosionStrength * 2);
    
    if (dist < effectiveRadius) {
      // Voids are always protected
      if (zone.type === 'void') return true;
      
      // Critical zones get extra protection under erosion
      if (zone.type === 'critical' && erosionStrength > 0.3) return true;
    }
  }
  
  return false;
}

// Get dissolve factor for a point (0 = intact, 1 = fully dissolved)
export function getDissolveFactor(
  x: number, // normalized -1 to 1
  dissolveDirection: number, // 0-1, direction of dissolve (0=left, 1=right)
  dissolveEdge: number, // 0-1, position of dissolve edge
  dissolveWidth: number // 0-1, width of transition zone
): number {
  // Convert to 0-1 range for calculation
  const normalizedX = (x + 1) / 2;
  
  // Calculate distance from dissolve edge
  let distFromEdge: number;
  
  if (dissolveDirection < 0.5) {
    // Dissolve from left to right
    distFromEdge = normalizedX - dissolveEdge;
  } else {
    // Dissolve from right to left
    distFromEdge = dissolveEdge - normalizedX;
  }
  
  // Soft transition
  const factor = 1 - smoothstep(-dissolveWidth, dissolveWidth, distFromEdge);
  
  return Math.max(0, Math.min(1, factor));
}

// Smoothstep helper function
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
