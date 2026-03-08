// DualFieldPointCloud: Generates three point layers for dual-field rendering
// - Structural: core motif points that should remain readable
// - Atmospheric: ambient particles for Yudho-like dirty atmosphere
// - Accent: highlight points for visual interest

import { createPointCloud, type PointCloud } from './PointCloud';
import { type MotifMaps, isPointProtected, getDissolveFactor, generateMapsFromLuminance } from '../source/MotifMaps';

// Seeded random number generator
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

export interface DualFieldConfig {
  // Overall density multiplier
  density: number;
  seed: number;
  
  // Layer ratios (should sum to ~1)
  structuralRatio: number;    // Core motif points
  atmosphericRatio: number;   // Ambient/dust particles
  accentRatio: number;       // Highlight points
  
  // Dissolve settings
  dissolveEnabled: boolean;
  dissolveDirection: number; // 0-1 (0=left, 1=right)
  dissolveEdge: number;      // 0-1 position of dissolve line
  dissolveWidth: number;     // 0-1 width of transition zone
  
  // Glitch settings
  glitchEnabled: boolean;
  glitchIntensity: number;   // 0-1
}

export const DEFAULT_DUAL_FIELD_CONFIG: DualFieldConfig = {
  density: 0.5,
  seed: 42,
  structuralRatio: 0.6,
  atmosphericRatio: 0.3,
  accentRatio: 0.1,
  dissolveEnabled: false,
  dissolveDirection: 0.5,
  dissolveEdge: 0.5,
  dissolveWidth: 0.15,
  glitchEnabled: false,
  glitchIntensity: 0.3
};

export interface DualFieldPointCloud {
  // Combined point cloud for rendering
  combined: PointCloud;
  
  // Individual layers (for debugging/analysis)
  structural: PointCloud;
  atmospheric: PointCloud;
  accent: PointCloud;
  
  // Metadata
  config: DualFieldConfig;
  maps: MotifMaps | null;
}

// Point data format: [x, y, weight, seed, layerType]
// layerType: 0 = structural, 1 = atmospheric, 2 = accent
const LAYER_STRUCTURAL = 0;
const LAYER_ATMOSPHERIC = 1;
const LAYER_ACCENT = 2;

export function generateDualFieldPointCloud(
  luminance: Float32Array,
  width: number,
  height: number,
  config: Partial<DualFieldConfig> = {}
): DualFieldPointCloud {
  const cfg = { ...DEFAULT_DUAL_FIELD_CONFIG, ...config };
  const random = seededRandom(cfg.seed);
  
  // Generate motif maps
  const maps = generateMapsFromLuminance(luminance, width, height, cfg.seed);
  
  // Calculate grid size based on density
  const baseGrid = Math.floor(30 + cfg.density * 120);
  const gridSize = Math.min(baseGrid, 150);
  
  // Collect points for each layer
  const structuralPoints: number[] = [];
  const atmosphericPoints: number[] = [];
  const accentPoints: number[] = [];
  
  // Aspect ratio for coordinate mapping
  const aspectRatio = width / height;
  
  for (let gy = 0; gy < gridSize; gy++) {
    for (let gx = 0; gx < gridSize; gx++) {
      // Jittered sampling
      const jx = (gx + random()) / gridSize;
      const jy = (gy + random()) / gridSize;
      
      // Map to image coordinates
      const ix = Math.floor(jx * width);
      const iy = Math.floor(jy * height);
      const imgIdx = iy * width + ix;
      
      // Get map values
      const structural = maps.structural[imgIdx];
      const edge = maps.edge[imgIdx];
      const distance = maps.distance[imgIdx];
      
      // Normalized coordinates (-1 to 1)
      const nx = (jx - 0.5) * 1.8 * Math.min(1, aspectRatio);
      const ny = (jy - 0.5) * 1.8;
      
      // Dissolve factor
      const dissolve = cfg.dissolveEnabled 
        ? getDissolveFactor(nx, cfg.dissolveDirection, cfg.dissolveEdge, cfg.dissolveWidth)
        : 0;
      
      // Check if in protected zone
      const erosionStrength = dissolve;
      const isProtected = isPointProtected(jx, jy, maps.protectedZones, erosionStrength);
      
      // Determine layer assignment based on position and maps
      const layer = determineLayer(jx, jy, structural, edge, distance, dissolve, isProtected, cfg, maps);
      
      // Base weight from structural mask
      let weight = structural;
      
      // Add edge emphasis for accent layer
      if (layer === LAYER_ACCENT) {
        weight = edge * 0.8 + 0.2;
      }
      
      // Atmospheric points can exist outside the motif
      if (layer === LAYER_ATMOSPHERIC) {
        // Weight based on proximity - more near edges
        const proximityWeight = Math.max(0, 1 - Math.abs(distance) * 2);
        weight = proximityWeight * 0.3 + random() * 0.2;
      }
      
      // Apply probability filter based on weight and layer
      const inclusionChance = getInclusionChance(layer, weight, dissolve, isProtected, cfg);
      
      if (random() < inclusionChance) {
        // Add slight position jitter
        const px = nx + (random() - 0.5) * 0.015;
        const py = ny + (random() - 0.5) * 0.015;
        
        const pointData = [px, py, weight, random()];
        
        switch (layer) {
          case LAYER_STRUCTURAL:
            structuralPoints.push(...pointData, LAYER_STRUCTURAL);
            break;
          case LAYER_ATMOSPHERIC:
            atmosphericPoints.push(...pointData, LAYER_ATMOSPHERIC);
            break;
          case LAYER_ACCENT:
            accentPoints.push(...pointData, LAYER_ACCENT);
            break;
        }
      }
    }
  }
  
  // Create point clouds for each layer
  const structural = createLayerPointCloud(structuralPoints, LAYER_STRUCTURAL);
  const atmospheric = createLayerPointCloud(atmosphericPoints, LAYER_ATMOSPHERIC);
  const accent = createLayerPointCloud(accentPoints, LAYER_ACCENT);
  
  // Combine all layers into single buffer
  const combinedPoints = [
    ...structuralPoints,
    ...atmosphericPoints,
    ...accentPoints
  ];
  const combined = createPointCloud(
    new Float32Array(combinedPoints),
    combinedPoints.length / 5
  );
  
  return {
    combined,
    structural,
    atmospheric,
    accent,
    config: cfg,
    maps
  };
}

function createLayerPointCloud(points: number[], layerType: number): PointCloud {
  if (points.length === 0) {
    return createPointCloud(new Float32Array(0), 0);
  }
  
  // Add layer type to each point if not already present
  const stride = 5;
  const adjustedPoints: number[] = [];
  
  for (let i = 0; i < points.length; i += stride) {
    if (i + 3 < points.length) {
      // Check if layer type is already there
      if (i + 4 < points.length) {
        adjustedPoints.push(points[i], points[i+1], points[i+2], points[i+3], points[i+4]);
      } else {
        adjustedPoints.push(points[i], points[i+1], points[i+2], points[i+3], layerType);
      }
    }
  }
  
  return createPointCloud(new Float32Array(adjustedPoints), adjustedPoints.length / 5);
}

function determineLayer(
  _jx: number,
  _jy: number,
  structural: number,
  edge: number,
  distance: number,
  dissolve: number,
  protectedZone: boolean,
  cfg: DualFieldConfig,
  _maps: MotifMaps
): number {
  const random = Math.random(); // This should use seeded random in real implementation
  
  // In dissolving region (non-protected)
  if (dissolve > 0.3 && !protectedZone) {
    // Heavily favor atmospheric in dissolving areas
    if (random < cfg.atmosphericRatio + cfg.accentRatio * 0.5) {
      return LAYER_ATMOSPHERIC;
    }
    return LAYER_ACCENT;
  }
  
  // Strong edge = accent
  if (edge > 0.4 && structural > 0.2) {
    if (random < cfg.accentRatio) {
      return LAYER_ACCENT;
    }
  }
  
  // Inside the motif = structural
  if (structural > 0.3 && distance < 0) {
    // Protected zones always structural
    if (protectedZone) {
      return LAYER_STRUCTURAL;
    }
    if (random < cfg.structuralRatio) {
      return LAYER_STRUCTURAL;
    }
  }
  
  // Near edges = mix of structural and atmospheric
  if (Math.abs(distance) < 0.05) {
    if (random < cfg.structuralRatio * 0.7) {
      return LAYER_STRUCTURAL;
    }
    return LAYER_ATMOSPHERIC;
  }
  
  // Outside motif = atmospheric
  if (random < cfg.atmosphericRatio) {
    return LAYER_ATMOSPHERIC;
  }
  
  return LAYER_STRUCTURAL;
}

function getInclusionChance(
  layer: number,
  weight: number,
  dissolve: number,
  protectedZone: boolean,
  cfg: DualFieldConfig
): number {
  let baseChance = weight * cfg.density + 0.05;
  
  switch (layer) {
    case LAYER_STRUCTURAL:
      // Structural points: high chance inside motif
      if (protectedZone) {
        baseChance = Math.min(1, baseChance * 1.5); // Boost protected
      }
      if (dissolve > 0.5) {
        baseChance *= (1 - dissolve) * 0.5; // Reduce in dissolving area
      }
      break;
      
    case LAYER_ATMOSPHERIC:
      // Atmospheric: moderate chance, increases in dissolve area
      baseChance = baseChance * 0.6 + dissolve * 0.3;
      break;
      
    case LAYER_ACCENT:
      // Accent: sparse but visible
      baseChance = baseChance * 0.4 + dissolve * 0.15;
      break;
  }
  
  return Math.min(1, Math.max(0, baseChance));
}

// Generate glitch offset for a point
export function computeGlitchOffset(
  x: number,
  y: number,
  time: number,
  intensity: number
): { dx: number; dy: number } {
  // Pseudo-random based on position
  const hash = (x: number, y: number) => {
    return Math.sin(x * 127.1 + y * 311.7) * 43758.5453 % 1;
  };
  
  const h = hash(x * 100, y * 100);
  
  // Only apply glitch above certain threshold
  if (h > 0.85) {
    // Scanline shear
    const shearAmount = intensity * 0.1 * Math.sin(time * 10 + y * 50);
    
    // Block displacement
    const blockSize = 0.05;
    const blockX = Math.floor(x / blockSize) * blockSize;
    const displacement = Math.sin(time * 3 + blockX * 20) * intensity * 0.08;
    
    return {
      dx: shearAmount + displacement,
      dy: Math.sin(time * 5 + x * 30) * intensity * 0.03
    };
  }
  
  return { dx: 0, dy: 0 };
}

// Cyclic animation helper - ensures frame 0 == frame N
export function computeCyclicPhase(
  time: number,
  loopDuration: number, // seconds for one full cycle
  frameCount: number    // number of frames in the loop
): { phase: number; frame: number } {
  // Normalize time to 0-1 within loop
  const t = (time % loopDuration) / loopDuration;
  
  // Map to frame index
  const frame = Math.floor(t * frameCount);
  
  // Phase within current frame (for interpolation)
  const frameDuration = loopDuration / frameCount;
  const phase = (time % frameDuration) / frameDuration;
  
  return { phase, frame };
}
