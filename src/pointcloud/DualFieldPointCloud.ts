// DualFieldPointCloud: Generates four point populations for semantic rendering
// - Structural: core motif points that should remain readable (45%)
// - Body/Tone: dirty tonal fill (45%)
// - Accent: sparse focal highlights (7%)
// - Atmosphere: ambient particles mostly outside the motif (3%)

import { createPointCloud, type PointCloud } from './PointCloud';
import { type MotifMaps, generateMapsFromLuminance } from '../source/MotifMaps';

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
  
  // Four-population ratios (should sum to ~1.0)
  // Default skull preset ratios: structural=45%, tone=45%, accent=7%, atmosphere=3%
  structuralRatio: number;    // Core motif points - structure definition
  toneRatio: number;          // Body/tone - dirty tonal fill
  accentRatio: number;        // Sparse focal highlights
  atmosphereRatio: number;    // Ambient particles mostly outside motif
  
  // Dissolve settings
  dissolveEnabled: boolean;
  dissolveDirection: number; // 0-1 (0=left, 1=right)
  dissolveEdge: number;      // 0-1 position of dissolve line
  dissolveWidth: number;     // 0-1 width of transition zone
  
  // Glitch settings
  glitchEnabled: boolean;
  glitchIntensity: number;   // 0-1
}

// Default config with skull preset ratios
export const DEFAULT_DUAL_FIELD_CONFIG: DualFieldConfig = {
  density: 0.5,
  seed: 42,
  structuralRatio: 0.45,    // 45% - structure definition
  toneRatio: 0.45,          // 45% - body/tone fill
  accentRatio: 0.07,        // 7% - sparse focal highlights
  atmosphereRatio: 0.03,    // 3% - minimal atmosphere
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
  tone: PointCloud;
  accent: PointCloud;
  atmosphere: PointCloud;
  
  // Metadata
  config: DualFieldConfig;
  maps: MotifMaps | null;
  
  // Diagnostic info
  diagnostics: PointCloudDiagnostics;
}

export interface PointCloudDiagnostics {
  structuralCount: number;
  toneCount: number;
  accentCount: number;
  atmosphereCount: number;
  structuralAvgSize: number;
  toneAvgSize: number;
  accentAvgSize: number;
  atmosphereAvgSize: number;
  structuralAvgBrightness: number;
  toneAvgBrightness: number;
  accentAvgBrightness: number;
  atmosphereAvgBrightness: number;
}

// Point data format: [x, y, weight, seed, layerType, markType]
// layerType: 0 = structural, 1 = tone, 2 = accent, 3 = atmosphere
// markType: 0 = dust, 1 = grain, 2 = chunk, 3 = shard
const LAYER_STRUCTURAL = 0;
const LAYER_TONE = 1;
const LAYER_ACCENT = 2;
const LAYER_ATMOSPHERIC = 3;

// Overload for backwards compatibility - takes luminance and generates maps internally
export function generateDualFieldPointCloud(
  luminance: Float32Array,
  width: number,
  height: number,
  config: Partial<DualFieldConfig> = {}
): DualFieldPointCloud {
  const maps = generateMapsFromLuminance(luminance, width, height, config.seed || 42);
  return generateDualFieldPointCloudFromMaps(maps, config);
}

// Main generation function that takes MotifMaps directly
export function generateDualFieldPointCloudFromMaps(
  maps: MotifMaps,
  config: Partial<DualFieldConfig> = {}
): DualFieldPointCloud {
  const cfg = { ...DEFAULT_DUAL_FIELD_CONFIG, ...config };
  const random = seededRandom(cfg.seed);
  
  const { width, height } = maps;
  
  // Calculate grid size based on density
  const baseGrid = Math.floor(30 + cfg.density * 120);
  const gridSize = Math.min(baseGrid, 150);
  
  // Collect points for each population
  const structuralPoints: number[] = [];
  const tonePoints: number[] = [];
  const accentPoints: number[] = [];
  const atmospherePoints: number[] = [];
  
  // Aspect ratio for coordinate mapping
  const aspectRatio = width / height;
  
  // Skull anchor zones - areas that should be overweighted
  const skullAnchors = detectSkullAnchors(maps);
  
  for (let gy = 0; gy < gridSize; gy++) {
    for (let gx = 0; gx < gridSize; gx++) {
      // Jittered sampling
      const jx = (gx + random()) / gridSize;
      const jy = (gy + random()) / gridSize;
      
      // Map to image coordinates
      const ix = Math.floor(jx * width);
      const iy = Math.floor(jy * height);
      const imgIdx = iy * width + ix;
      
      // Get map values from the MotifMaps
      const alpha = maps.structural[imgIdx];
      const tone = maps.tone?.[imgIdx] ?? alpha;
      const accentVal = maps.accent?.[imgIdx] ?? 0;
      const atmo = maps.atmosphere?.[imgIdx] ?? 0;
      const edge = maps.edge[imgIdx];
      const distance = maps.distance[imgIdx];
      
      // Skip if alpha is too low
      if (alpha < 0.05) {
        // Check for atmosphere outside the motif
        if (atmo > 0.1 || edge > 0.2) {
          const atmoPriority = computeAtmospherePriority(atmo, edge, distance, alpha);
          if (random() < atmoPriority * cfg.atmosphereRatio * 0.5) {
            const nx = (jx - 0.5) * 1.8 * Math.min(1, aspectRatio);
            const ny = (jy - 0.5) * 1.8;
            const px = nx + (random() - 0.5) * 0.02;
            const py = ny + (random() - 0.5) * 0.02;
            const weight = atmo * 0.5 + edge * 0.3;
            const markType = selectMarkType(random, LAYER_ATMOSPHERIC);
            atmospherePoints.push(px, py, weight, random(), LAYER_ATMOSPHERIC, markType);
          }
        }
        continue;
      }
      
      // Normalized coordinates (-1 to 1)
      const nx = (jx - 0.5) * 1.8 * Math.min(1, aspectRatio);
      const ny = (jy - 0.5) * 1.8;
      
      // Check if in skull anchor zone
      const anchorBoost = getAnchorBoost(jx, jy, skullAnchors);
      
      // Compute priorities for each population
      const structPriority = computeStructuralPriority(alpha, tone, accentVal, anchorBoost);
      const tonePriority = computeTonePriority(alpha, tone, accentVal);
      const accentPriority = computeAccentPriority(alpha, accentVal, edge, anchorBoost);
      const atmoPriority = computeAtmospherePriority(atmo, edge, distance, alpha);
      
      const rand = random();
      
      // Determine which population to use based on ratios
      const randThreshold = rand * (cfg.structuralRatio + cfg.toneRatio + cfg.accentRatio + cfg.atmosphereRatio);
      
      let layer: number;
      let weight: number;
      let markType: number;
      
      if (randThreshold < cfg.structuralRatio) {
        layer = LAYER_STRUCTURAL;
        weight = structPriority;
        markType = selectMarkType(random, LAYER_STRUCTURAL);
      } else if (randThreshold < cfg.structuralRatio + cfg.toneRatio) {
        layer = LAYER_TONE;
        weight = tonePriority;
        markType = selectMarkType(random, LAYER_TONE);
      } else if (randThreshold < cfg.structuralRatio + cfg.toneRatio + cfg.accentRatio) {
        layer = LAYER_ACCENT;
        weight = accentPriority;
        markType = selectMarkType(random, LAYER_ACCENT);
      } else {
        layer = LAYER_ATMOSPHERIC;
        weight = atmoPriority;
        markType = selectMarkType(random, LAYER_ATMOSPHERIC);
      }
      
      // Apply inclusion chance based on weight
      const inclusionChance = Math.min(1, weight * cfg.density + 0.02);
      
      if (random() < inclusionChance) {
        // Add slight position jitter
        const px = nx + (random() - 0.5) * 0.015;
        const py = ny + (random() - 0.5) * 0.015;
        
        switch (layer) {
          case LAYER_STRUCTURAL:
            structuralPoints.push(px, py, weight, random(), layer, markType);
            break;
          case LAYER_TONE:
            tonePoints.push(px, py, weight, random(), layer, markType);
            break;
          case LAYER_ACCENT:
            accentPoints.push(px, py, weight, random(), layer, markType);
            break;
          case LAYER_ATMOSPHERIC:
            atmospherePoints.push(px, py, weight, random(), layer, markType);
            break;
        }
      }
    }
  }
  
  // Create point clouds for each layer
  const structural = createLayerPointCloud(structuralPoints, 6);
  const tone = createLayerPointCloud(tonePoints, 6);
  const accent = createLayerPointCloud(accentPoints, 6);
  const atmosphere = createLayerPointCloud(atmospherePoints, 6);
  
  // Combine all layers into single buffer
  const combinedPoints = [
    ...structuralPoints,
    ...tonePoints,
    ...accentPoints,
    ...atmospherePoints
  ];
  const combined = createPointCloud(
    new Float32Array(combinedPoints),
    combinedPoints.length / 6
  );
  
  // Compute diagnostics
  const diagnostics = computeDiagnostics(
    structuralPoints, tonePoints, accentPoints, atmospherePoints
  );
  
  return {
    combined,
    structural,
    tone,
    accent,
    atmosphere,
    config: cfg,
    maps,
    diagnostics
  };
}

// Compute priority for structural population
// priority = alpha * (0.15 + 1.8 * structure + 0.35 * accent)
function computeStructuralPriority(alpha: number, structure: number, accent: number, anchorBoost: number): number {
  if (alpha < 0.1) return 0;
  const base = alpha * (0.15 + 1.8 * structure + 0.35 * accent);
  return Math.min(1, base * (1 + anchorBoost));
}

// Compute priority for tone/body population
// priority = alpha * (0.08 + 1.4 * tone) * (1.0 - 0.55 * structure)
function computeTonePriority(alpha: number, tone: number, structure: number): number {
  if (alpha < 0.1) return 0;
  const base = alpha * (0.08 + 1.4 * tone) * (1.0 - 0.55 * structure);
  return Math.min(1, base);
}

// Compute priority for accent population
// priority = alpha * accent * (0.3 + 0.8 * structure)
function computeAccentPriority(alpha: number, accent: number, edge: number, anchorBoost: number): number {
  if (alpha < 0.15) return 0;
  // Accent is sparse - require significant accent value
  if (accent < 0.1 && edge < 0.3) return 0;
  const accentVal = Math.max(accent, edge * 0.5);
  const base = alpha * accentVal * (0.3 + 0.8 * Math.min(1, alpha));
  return Math.min(1, base * 0.7 * (1 + anchorBoost * 0.5));
}

// Compute priority for atmosphere population
// priority = (0.25 * atmo + edgeSpill) * (1.0 - alpha * 0.85)
function computeAtmospherePriority(atmo: number, edge: number, _distance: number, alpha: number): number {
  const edgeSpill = edge > 0.3 ? edge * 0.5 : 0;
  // Atmosphere is mostly outside the motif
  const outsideFactor = alpha < 0.5 ? 1 - alpha * 0.85 : 0.1;
  const base = (0.25 * atmo + edgeSpill) * outsideFactor;
  return Math.min(1, base * 1.5);
}

// Detect skull anchor zones for structural overweighting
interface SkullAnchor {
  x: number;
  y: number;
  radius: number;
  strength: number;
}

function detectSkullAnchors(maps: MotifMaps): SkullAnchor[] {
  const anchors: SkullAnchor[] = [];
  const { width, height, edge, structural, protectedZones } = maps;
  
  // First, add anchors from protected zones (already defined anatomically)
  for (const zone of protectedZones) {
    anchors.push({
      x: zone.x,
      y: zone.y,
      radius: zone.radius,
      strength: zone.type === 'void' ? 0.3 : 1.0 // voids get lower strength (they're holes)
    });
  }
  
  // Also add explicit anatomical anchors that should always be emphasized
  // These are positions where we WANT strong structure regardless of edge detection
  const anatomicalAnchors = [
    // Brow ridge - horizontal band above eyes (HIGH structure)
    { cx: 0.5, cy: 0.32, r: 0.15, strength: 1.5 },
    // Cheekbone arcs (HIGH structure)
    { cx: 0.28, cy: 0.4, r: 0.08, strength: 1.3 },
    { cx: 0.72, cy: 0.4, r: 0.08, strength: 1.3 },
    // Upper teeth row (HIGH structure)
    { cx: 0.5, cy: 0.22, r: 0.12, strength: 1.4 },
    // Jaw corners (HIGH structure)
    { cx: 0.32, cy: 0.15, r: 0.06, strength: 1.2 },
    { cx: 0.68, cy: 0.15, r: 0.06, strength: 1.2 },
    // Jaw outline (HIGH structure)
    { cx: 0.5, cy: 0.12, r: 0.18, strength: 1.0 },
    // Eye socket rims (edge emphasis)
    { cx: 0.35, cy: 0.45, r: 0.1, strength: 1.2 },
    { cx: 0.65, cy: 0.45, r: 0.1, strength: 1.2 },
    // Nasal cavity edges
    { cx: 0.5, cy: 0.38, r: 0.08, strength: 1.1 },
    // Temple regions
    { cx: 0.2, cy: 0.35, r: 0.08, strength: 0.8 },
    { cx: 0.8, cy: 0.35, r: 0.08, strength: 0.8 },
    // Forehead
    { cx: 0.5, cy: 0.55, r: 0.12, strength: 0.7 },
    // Cranium top edges
    { cx: 0.35, cy: 0.7, r: 0.08, strength: 0.6 },
    { cx: 0.65, cy: 0.7, r: 0.08, strength: 0.6 },
  ];
  
  for (const anchor of anatomicalAnchors) {
    // Check local edge/structure for additional boost
    let localEdge = 0;
    let localStructure = 0;
    
    for (let dy = -Math.floor(anchor.r * height); dy <= Math.floor(anchor.r * height); dy++) {
      for (let dx = -Math.floor(anchor.r * width); dx <= Math.floor(anchor.r * width); dx++) {
        const px = Math.floor(anchor.cx * width + dx);
        const py = Math.floor(anchor.cy * height + dy);
        if (px >= 0 && px < width && py >= 0 && py < height) {
          const idx = py * width + px;
          localEdge = Math.max(localEdge, edge[idx]);
          localStructure = Math.max(localStructure, structural[idx]);
        }
      }
    }
    
    // Combine anatomical priority with detected edge/structure
    const combinedStrength = anchor.strength + localEdge * 0.5 + localStructure * 0.3;
    
    anchors.push({
      x: anchor.cx,
      y: anchor.cy,
      radius: anchor.r,
      strength: combinedStrength
    });
  }
  
  return anchors;
}

// Get anchor boost factor at a position
function getAnchorBoost(jx: number, jy: number, anchors: SkullAnchor[]): number {
  let maxBoost = 0;
  for (const anchor of anchors) {
    const dx = jx - anchor.x;
    const dy = jy - anchor.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < anchor.radius) {
      // Strong falloff for precise anchoring
      const factor = Math.pow(1 - dist / anchor.radius, 0.5);
      maxBoost = Math.max(maxBoost, factor * anchor.strength);
    }
  }
  return Math.min(1.5, maxBoost); // Max 150% boost for strong emphasis
}

// Select mark type based on layer and random
function selectMarkType(rand: () => number, layer: number): number {
  const r = rand();
  
  switch (layer) {
    case LAYER_STRUCTURAL:
      // Structural: mix of grain and chunk
      if (r < 0.3) return 0; // dust
      if (r < 0.7) return 1; // grain
      return 2; // chunk
      
    case LAYER_TONE:
      // Tone: mostly dust and grain
      if (r < 0.5) return 0; // dust
      if (r < 0.9) return 1; // grain
      return 2; // chunk
      
    case LAYER_ACCENT:
      // Accent: chunk and shard for focal points
      if (r < 0.4) return 2; // chunk
      return 3; // shard
      
    case LAYER_ATMOSPHERIC:
      // Atmosphere: fine dust
      if (r < 0.8) return 0; // dust
      return 1; // grain
      
    default:
      return 1; // grain
  }
}

// Compute diagnostics from point arrays
function computeDiagnostics(
  structural: number[],
  tone: number[],
  accent: number[],
  atmosphere: number[]
): PointCloudDiagnostics {
  const stride = 6;
  
  const computeStats = (points: number[]) => {
    if (points.length === 0) {
      return { count: 0, avgSize: 0, avgBrightness: 0 };
    }
    let totalWeight = 0;
    let totalBrightness = 0;
    const count = points.length / stride;
    
    for (let i = 0; i < points.length; i += stride) {
      totalWeight += points[i + 2]; // weight
      totalBrightness += points[i + 2];
    }
    
    return {
      count,
      avgSize: count > 0 ? 1.0 : 0, // Size is uniform in generation
      avgBrightness: count > 0 ? totalBrightness / count : 0
    };
  };
  
  const structStats = computeStats(structural);
  const toneStats = computeStats(tone);
  const accentStats = computeStats(accent);
  const atmoStats = computeStats(atmosphere);
  
  return {
    structuralCount: structStats.count,
    toneCount: toneStats.count,
    accentCount: accentStats.count,
    atmosphereCount: atmoStats.count,
    structuralAvgSize: structStats.avgSize,
    toneAvgSize: toneStats.avgSize,
    accentAvgSize: accentStats.avgSize,
    atmosphereAvgSize: atmoStats.avgSize,
    structuralAvgBrightness: structStats.avgBrightness,
    toneAvgBrightness: toneStats.avgBrightness,
    accentAvgBrightness: accentStats.avgBrightness,
    atmosphereAvgBrightness: atmoStats.avgBrightness
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

// Backwards compatibility - redirect to new implementation
export function determineLayer(
  _jx: number,
  _jy: number,
  _structural: number,
  _edge: number,
  _distance: number,
  _dissolve: number,
  _protectedZone: boolean,
  _cfg: DualFieldConfig,
  _maps: MotifMaps
): number {
  // Legacy function - returns structural by default
  return LAYER_STRUCTURAL;
}

// Backwards compatibility - old getInclusionChance had different signature
export function getInclusionChance(
  _layer: number,
  _weight: number,
  _dissolve: number,
  _protectedZone: boolean,
  _cfg: DualFieldConfig
): number {
  // Legacy function - returns default chance
  return 0.5;
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
