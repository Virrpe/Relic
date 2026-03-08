import { 
  createPointCloud, 
  type PointCloud,
  type RenderLayer,
  type ParticleType,
  LAYER_VALUES,
  PARTICLE_TYPE_VALUES,
  STRIDE
} from '../pointcloud/PointCloud';

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

// Configuration for multi-layer generation (motif mode)
export interface MotifLayerConfig {
  layer: RenderLayer;
  particleType: ParticleType;
  densityMultiplier: number;
  sizeMultiplier: number;
  erosionBias: number;
  layerWeight: number; // Weight contribution from shape function
}

// Motif-specific layer configs (denser, larger than text mode)
export const MOTIF_LAYER_CONFIGS: MotifLayerConfig[] = [
  {
    layer: 'atmospheric',
    particleType: 'dust',
    densityMultiplier: 0.5,
    sizeMultiplier: 0.5,
    erosionBias: 0.4,
    layerWeight: 0.2
  },
  {
    layer: 'structural',
    particleType: 'medium',
    densityMultiplier: 1.0,
    sizeMultiplier: 1.0,
    erosionBias: 0.15,
    layerWeight: 1.0
  },
  {
    layer: 'accent',
    particleType: 'chunk',
    densityMultiplier: 0.2,
    sizeMultiplier: 2.0,
    erosionBias: 0.0,
    layerWeight: 0.8
  }
];

// Compute focal regions from shape function (areas of high detail)
function computeMotifFocalMap(
  shapeFn: (x: number, y: number) => number,
  gridSize: number
): Float32Array {
  const focal = new Float32Array(gridSize * gridSize);
  
  for (let gy = 1; gy < gridSize - 1; gy++) {
    for (let gx = 1; gx < gridSize - 1; gx++) {
      const jx = gx / gridSize;
      const jy = gy / gridSize;
      
      // Check if this is an edge/detail area (high gradient)
      const leftWeight = shapeFn((gx - 1) / gridSize, jy);
      const rightWeight = shapeFn((gx + 1) / gridSize, jy);
      const topWeight = shapeFn(jx, (gy - 1) / gridSize);
      const bottomWeight = shapeFn(jx, (gy + 1) / gridSize);
      
      const gradient = Math.abs(rightWeight - leftWeight) + Math.abs(bottomWeight - topWeight);
      focal[gy * gridSize + gx] = gradient;
    }
  }
  
  // Normalize
  let maxFocal = 0;
  for (let i = 0; i < focal.length; i++) {
    if (focal[i] > maxFocal) maxFocal = focal[i];
  }
  if (maxFocal > 0) {
    for (let i = 0; i < focal.length; i++) {
      focal[i] /= maxFocal;
    }
  }
  
  return focal;
}

// Generate point cloud from a shape function with multi-layer approach
export function generatePointCloud(
  shapeFn: (x: number, y: number) => number,
  density: number,
  seed: number,
  layerConfigs: MotifLayerConfig[] = MOTIF_LAYER_CONFIGS
): PointCloud {
  const random = seededRandom(seed);
  
  // Determine grid size based on density (motif = denser)
  const gridSize = Math.floor(60 + density * 180);
  
  // Compute focal map for accent placement
  const focalMap = computeMotifFocalMap(shapeFn, gridSize);
  
  const points: number[] = [];
  
  // Pre-compute layer and type values
  const layerValues = layerConfigs.map(c => LAYER_VALUES[c.layer]);
  const typeValues = layerConfigs.map(c => PARTICLE_TYPE_VALUES[c.particleType]);
  
  for (let gy = 0; gy < gridSize; gy++) {
    for (let gx = 0; gx < gridSize; gx++) {
      // Jittered sampling
      const jx = (gx + random()) / gridSize;
      const jy = (gy + random()) / gridSize;
      
      const weight = shapeFn(jx, jy);
      const isFocal = focalMap[gy * gridSize + gx] > 0.3;
      
      // Add some spatial variation
      const px = (jx - 0.5) * 1.8 + (random() - 0.5) * 0.015;
      const py = (jy - 0.5) * 1.8 + (random() - 0.5) * 0.015;
      
      // Generate particles for each layer
      for (let layerIdx = 0; layerIdx < layerConfigs.length; layerIdx++) {
        const config = layerConfigs[layerIdx];
        const layerDensity = density * config.densityMultiplier;
        
        // Atmospheric layer: background dust everywhere
        if (config.layer === 'atmospheric') {
          // Atmospheric appears in and around shape - creates the "fog" effect
          if (random() < layerDensity * 0.25 + 0.03) {
            const particleWeight = (weight * config.layerWeight + random() * 0.15) * 0.4;
            
            points.push(
              px + (random() - 0.5) * 0.1,
              py + (random() - 0.5) * 0.1,
              Math.max(0, particleWeight),
              random(),
              layerValues[layerIdx],
              typeValues[layerIdx],
              config.erosionBias
            );
          }
        }
        // Structural layer: main form
        else if (config.layer === 'structural') {
          if (weight > 0.05 && random() < weight * layerDensity * 0.9 + 0.08) {
            points.push(
              px, py,
              weight * config.layerWeight,
              random(),
              layerValues[layerIdx],
              typeValues[layerIdx],
              config.erosionBias
            );
          }
        }
        // Accent layer: focal details, chunky particles
        else if (config.layer === 'accent') {
          if (isFocal && weight > 0.1 && random() < weight * layerDensity * 0.6) {
            // Occasionally use streak particles for variety
            const useStreak = random() > 0.75;
            
            points.push(
              px, py,
              Math.min(1, weight * 1.3),
              random(),
              layerValues[layerIdx],
              useStreak ? PARTICLE_TYPE_VALUES['streak'] : typeValues[layerIdx],
              0
            );
          }
        }
      }
    }
  }
  
  const buffer = new Float32Array(points);
  return createPointCloud(buffer, points.length / STRIDE);
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
