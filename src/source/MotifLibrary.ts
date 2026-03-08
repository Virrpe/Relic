import { createPointCloud, type PointCloud } from '../pointcloud/PointCloud';

// Seeded random number generator
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// Skull shape function - returns weight (0-1) for a given x,y position
function skullShape(x: number, y: number): number {
  // Normalize to -1 to 1
  const nx = x * 2 - 1;
  const ny = y * 2 - 1;
  
  // Skull outline - rounded rectangle with some characteristic features
  const cr = 0.7; // Cranium radius
  const jawH = 0.25; // Jaw height
  
  // Cranium (top part)
  const craniumDist = Math.sqrt(nx * nx + (ny + 0.15) * (ny + 0.15));
  const inCranium = craniumDist < cr ? 1 - (craniumDist / cr) * 0.3 : 0;
  
  // Jaw (bottom part)
  const jawY = ny + 0.55;
  const inJaw = Math.abs(nx) < 0.4 && jawY > 0 && jawY < jawH ? 1 - (jawY / jawH) * 0.5 : 0;
  
  // Cheekbones
  const cheekL = Math.sqrt((nx + 0.35) * (nx + 0.35) + (ny - 0.1) * (ny - 0.1));
  const cheekR = Math.sqrt((nx - 0.35) * (nx - 0.35) + (ny - 0.1) * (ny - 0.1));
  const cheek = Math.max(
    cheekL < 0.2 ? 1 - cheekL * 5 : 0,
    cheekR < 0.2 ? 1 - cheekR * 5 : 0
  ) * 0.5;
  
  // Eye sockets (negative)
  const eyeL = Math.sqrt((nx + 0.25) * (nx + 0.25) + (ny - 0.05) * (ny - 0.05));
  const eyeR = Math.sqrt((nx - 0.25) * (nx - 0.25) + (ny - 0.05) * (ny - 0.05));
  const eyeInvert = Math.max(
    eyeL < 0.15 ? -0.5 : 0,
    eyeR < 0.15 ? -0.5 : 0
  );
  
  // Nose cavity
  const noseDist = Math.abs(nx) + Math.abs(ny + 0.2);
  const noseInvert = noseDist < 0.12 ? -0.4 : 0;
  
  // Combine
  let weight = Math.max(0, inCranium + inJaw + cheek + eyeInvert + noseInvert);
  return Math.max(0, Math.min(1, weight));
}

// Moth shape
function mothShape(x: number, y: number): number {
  const nx = (x - 0.5) * 2;
  const ny = (y - 0.5) * 2;
  
  // Wing shape - two ellipses
  const wingL = Math.sqrt(((nx + 0.3) / 0.8) ** 2 + (ny / 0.5) ** 2);
  const wingR = Math.sqrt(((nx - 0.3) / 0.8) ** 2 + (ny / 0.5) ** 2);
  const wings = Math.max(
    wingL < 1 ? 1 - wingL : 0,
    wingR < 1 ? 1 - wingR : 0
  );
  
  // Body
  const body = Math.abs(nx) < 0.08 && Math.abs(ny) < 0.6 ? 1 - Math.abs(ny) / 0.6 : 0;
  
  // Antennae
  const antL = Math.sqrt((nx + 0.1 - ny * 0.3) ** 2 + (ny - 0.5) ** 2);
  const antR = Math.sqrt((nx - 0.1 + ny * 0.3) ** 2 + (ny - 0.5) ** 2);
  const antennae = Math.max(
    antL < 0.5 ? (1 - antL * 2) * 0.5 : 0,
    antR < 0.5 ? (1 - antR * 2) * 0.5 : 0
  );
  
  return Math.min(1, wings * 0.8 + body + antennae);
}

// Saint shape (stylized figure)
function saintShape(x: number, y: number): number {
  const nx = (x - 0.5) * 2;
  const ny = (y - 0.5) * 2;
  
  // Halo
  const haloDist = Math.sqrt(nx * nx + (ny + 0.7) * (ny + 0.7));
  const halo = haloDist < 0.15 ? 1 - haloDist / 0.15 : 0;
  
  // Head
  const headDist = Math.sqrt(nx * nx + (ny + 0.5) * (ny + 0.5));
  const head = headDist < 0.15 ? 1 - headDist / 0.15 : 0;
  
  // Body/Robe
  const body = Math.abs(nx) < 0.2 && ny > -0.4 && ny < 0.4 ? 
    (1 - Math.abs(nx) / 0.2) * (1 - (ny + 0.4) / 0.8) : 0;
  
  return Math.min(1, halo * 0.7 + head + body * 0.9);
}

// Heart shape
function heartShape(x: number, y: number): number {
  const nx = (x - 0.5) * 2;
  const ny = (y - 0.5) * 2;
  
  // Two circles for top lobes
  const topL = Math.sqrt((nx + 0.35) ** 2 + (ny + 0.25) ** 2);
  const topR = Math.sqrt((nx - 0.35) ** 2 + (ny + 0.25) ** 2);
  const top = Math.max(
    topL < 0.35 ? 1 - topL / 0.35 : 0,
    topR < 0.35 ? 1 - topR / 0.35 : 0
  );
  
  // Triangle for bottom point
  const triY = ny - 0.3;
  const triW = 0.35 - triY * 0.5;
  const inTri = triY > 0 && triY < 0.6 && Math.abs(nx) < triW ? 
    (1 - triY / 0.6) * (1 - Math.abs(nx) / triW) : 0;
  
  return Math.min(1, top * 0.9 + inTri);
}

// Eel shape
function eelShape(x: number, y: number): number {
  const nx = (x - 0.5) * 2;
  const ny = (y - 0.5) * 2;
  
  // Sinuous body
  const wave = Math.sin(nx * 4) * 0.1;
  const body = Math.sqrt(nx * nx + (ny - wave) * (ny - wave));
  const inBody = body < 0.12 ? 1 - body / 0.12 : 0;
  
  // Head
  const head = Math.sqrt((nx - 0.4) ** 2 + (ny - wave) ** 2);
  const headDist = head < 0.15 ? 1 - head / 0.15 : 0;
  
  return Math.min(1, inBody * 0.8 + headDist);
}

// Generate point cloud from a shape function
export function generatePointCloud(
  shapeFn: (x: number, y: number) => number,
  density: number,
  seed: number
): PointCloud {
  const random = seededRandom(seed);
  
  // Determine grid size based on density
  const gridSize = Math.floor(50 + density * 150);
  const points: number[] = [];
  
  for (let gy = 0; gy < gridSize; gy++) {
    for (let gx = 0; gx < gridSize; gx++) {
      // Jittered sampling
      const jx = (gx + random()) / gridSize;
      const jy = (gy + random()) / gridSize;
      
      const weight = shapeFn(jx, jy);
      
      // Probabilistic inclusion based on weight
      if (weight > 0.05 && random() < weight * density + 0.1) {
        // Add some spatial variation
        const px = (jx - 0.5) * 1.8 + (random() - 0.5) * 0.02;
        const py = (jy - 0.5) * 1.8 + (random() - 0.5) * 0.02;
        
        points.push(px, py, weight, random());
      }
    }
  }
  
  const buffer = new Float32Array(points);
  return createPointCloud(buffer, points.length / 4);
}

// Preset generators
export function generateMotif(motifId: string, density: number, seed: number): PointCloud {
  switch (motifId) {
    case 'skull':
      return generatePointCloud(skullShape, density, seed);
    case 'moth':
      return generatePointCloud(mothShape, density, seed);
    case 'saint':
      return generatePointCloud(saintShape, density, seed);
    case 'heart':
      return generatePointCloud(heartShape, density, seed);
    case 'eel':
      return generatePointCloud(eelShape, density, seed);
    case 'drift':
      return generatePointCloud((x, y) => {
        const nx = (x - 0.5) * 2;
        const ny = (y - 0.5) * 2;
        return Math.exp(-(nx * nx + ny * ny) * 2);
      }, density, seed);
    case 'ruin':
      return generatePointCloud((x, y) => {
        const nx = Math.floor(x * 8) / 8;
        const ny = Math.floor(y * 8) / 8;
        return (Math.sin(nx * 10) * Math.cos(ny * 10) + 1) * 0.3;
      }, density, seed);
    default:
      return generatePointCloud(skullShape, density, seed);
  }
}
