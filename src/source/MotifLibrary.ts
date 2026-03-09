import { createPointCloud, type PointCloud } from '../pointcloud/PointCloud';
import { getSkullMotif, getMothMotif } from './MotifFromSVG';

// Flag to enable SVG-based rendering for better motif recognition
const USE_SVG_MOTIFS = true;

// Seeded random number generator
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// Skull shape function - returns weight (0-1) for a given x,y position
// Improved version with clearer features for static mode truth
function skullShape(x: number, y: number): number {
  // Normalize to -1 to 1
  const nx = x * 2 - 1;
  const ny = y * 2 - 1;
  
  // === CRANIUM (upper skull) ===
  // Large elliptical cranium
  const craniumRX = 0.65;
  const craniumRY = 0.55;
  const craniumDist = Math.sqrt((nx / craniumRX) ** 2 + ((ny + 0.1) / craniumRY) ** 2);
  const cranium = craniumDist < 1 ? Math.pow(1 - craniumDist, 0.7) : 0;
  
  // === JAW (lower skull) ===
  // Tapered jaw section
  const jawTaper = 1 - Math.max(0, (ny + 0.5) / 0.4); // Tapers as we go down
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
  
  // === EYE SOCKETS (void - darker) ===
  const eyeL = Math.sqrt(((nx + 0.28) / 0.9) ** 2 + ((ny - 0.05) / 1.1) ** 2);
  const eyeR = Math.sqrt(((nx - 0.28) / 0.9) ** 2 + ((ny - 0.05) / 1.1) ** 2);
  const eyeInvert = Math.max(
    eyeL < 0.16 ? -0.6 : 0,
    eyeR < 0.16 ? -0.6 : 0
  );
  
  // === NASAL CAVITY (void - triangular) ===
  // Inverted triangle for nose hole
  const noseDist = Math.abs(nx) * 2.5 + (ny + 0.25);
  const noseInvert = noseDist < 0.18 ? -0.5 : 0;
  
  // === BROW RIDGE ===
  const browY = ny + 0.25;
  const brow = Math.abs(nx) < 0.45 && browY > -0.08 && browY < 0.05
    ? Math.pow(1 - Math.abs(browY) / 0.08, 2) * 0.4 * (1 - Math.abs(nx) / 0.45 * 0.5)
    : 0;
  
  // === TEMPLE RECESSIONS ===
  const templeL = Math.sqrt((nx + 0.55) ** 2 + (ny + 0.05) ** 2);
  const templeR = Math.sqrt((nx - 0.55) ** 2 + (ny + 0.05) ** 2);
  const temple = Math.max(
    templeL < 0.12 ? -0.2 : 0,
    templeR < 0.12 ? -0.2 : 0
  );
  
  // Combine all features
  let weight = cranium * 0.9 + inJaw * 0.85 + cheek + brow + eyeInvert + noseInvert + temple;
  return Math.max(0, Math.min(1, weight * 0.95));
}

// Moth shape - improved for better recognition in static mode
function mothShape(x: number, y: number): number {
  const nx = (x - 0.5) * 2;
  const ny = (y - 0.5) * 2;
  
  // === WINGS ===
  // Upper wings - larger, more angular
  // Left upper wing
  const wingULX = nx + 0.35;
  const wingULY = ny + 0.15;
  const wingUL = Math.sqrt((wingULX / 0.75) ** 2 + (wingULY / 0.55) ** 2);
  
  // Right upper wing  
  const wingURX = nx - 0.35;
  const wingURY = ny + 0.15;
  const wingUR = Math.sqrt((wingURX / 0.75) ** 2 + (wingURY / 0.55) ** 2);
  
  // Lower wings - smaller, more rounded
  const wingLLX = nx + 0.3;
  const wingLLY = ny - 0.35;
  const wingLL = Math.sqrt((wingLLX / 0.6) ** 2 + (wingLLY / 0.45) ** 2);
  
  const wingLRX = nx - 0.3;
  const wingLRY = ny - 0.35;
  const wingLR = Math.sqrt((wingLRX / 0.6) ** 2 + (wingLRY / 0.45) ** 2);
  
  const wings = Math.max(
    wingUL < 1 ? Math.pow(1 - wingUL, 0.8) : 0,
    wingUR < 1 ? Math.pow(1 - wingUR, 0.8) : 0,
    wingLL < 1 ? Math.pow(1 - wingLL, 0.8) * 0.9 : 0,
    wingLR < 1 ? Math.pow(1 - wingLR, 0.8) * 0.9 : 0
  );
  
  // === BODY ===
  // Thorax (middle section)
  const thorax = Math.sqrt((nx / 0.1) ** 2 + ((ny + 0.2) / 0.15) ** 2);
  const thoraxFill = thorax < 1 ? Math.pow(1 - thorax, 0.7) : 0;
  
  // Abdomen (tail section)
  const abdomen = Math.sqrt((nx / 0.07) ** 2 + ((ny - 0.25) / 0.35) ** 2);
  const abdomenFill = abdomen < 1 ? Math.pow(1 - abdomen, 0.8) : 0;
  
  // === HEAD ===
  const head = Math.sqrt(nx * nx + (ny + 0.4) ** 2);
  const headFill = head < 0.12 ? Math.pow(1 - head / 0.12, 0.7) : 0;
  
  // === ANTENNAE ===
  // Curved antennae extending from head
  const antL1 = Math.sqrt((nx + 0.08 - (ny + 0.45) * 0.4) ** 2 + (ny + 0.55) ** 2);
  const antL2 = Math.sqrt((nx + 0.15 - (ny + 0.35) * 0.6) ** 2 + (ny + 0.5) ** 2);
  const antennaeL = Math.max(
    antL1 < 0.5 ? (1 - antL1) * 0.5 : 0,
    antL2 < 0.4 ? (1 - antL2) * 0.4 : 0
  );
  
  const antR1 = Math.sqrt((nx - 0.08 + (ny + 0.45) * 0.4) ** 2 + (ny + 0.55) ** 2);
  const antR2 = Math.sqrt((nx - 0.15 + (ny + 0.35) * 0.6) ** 2 + (ny + 0.5) ** 2);
  const antennaeR = Math.max(
    antR1 < 0.5 ? (1 - antR1) * 0.5 : 0,
    antR2 < 0.4 ? (1 - antR2) * 0.4 : 0
  );
  
  // Wing body gap (void between wings)
  const wingGap = Math.abs(nx) < 0.12 && Math.abs(ny) < 0.5 ? -0.3 : 0;
  
  return Math.min(1, wings * 0.85 + thoraxFill + abdomenFill * 0.9 + headFill + antennaeL + antennaeR + wingGap);
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

// Preset generators - use SVG for skull/moth when enabled
export async function generateMotif(motifId: string, density: number, seed: number): Promise<PointCloud> {
  // Use SVG-based motifs for skull and moth
  if (USE_SVG_MOTIFS && (motifId === 'skull' || motifId === 'moth' || motifId === 'skull_clean' || motifId === 'moth_clean')) {
    try {
      const motifData = motifId === 'skull' || motifId === 'skull_clean'
        ? await getSkullMotif()
        : await getMothMotif();
      
      // Generate point cloud from SVG luminance
      const random = seededRandom(seed);
      const { width, height, luminance } = motifData;
      const points: number[] = [];
      
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          const weight = luminance[idx];
          
          // Sample based on density
          if (weight > 0.15 && random() < density) {
            const px = x / width;
            const py = y / height;
            points.push(px, py, weight, random());
          }
        }
      }
      
      const buffer = new Float32Array(points);
      return createPointCloud(buffer, points.length / 4);
    } catch (e) {
      console.warn('SVG motif failed, falling back to procedural:', e);
    }
  }
  
  // Fallback to procedural
  switch (motifId) {
    case 'skull':
    case 'skull_clean':
      return generatePointCloud(skullShape, density, seed);
    case 'moth':
    case 'moth_clean':
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
