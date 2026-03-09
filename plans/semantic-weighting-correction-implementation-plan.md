# Semantic Weighting Correction - Implementation Plan

## Overview
This plan implements semantic differentiation between four point populations (structural, body/tone, accent, atmosphere) to fix the "uniform point soup" issue in static skull mode rendering.

---

## Task 1: Extend MotifMaps Interface

**File:** `src/source/MotifMaps.ts`

### Changes:
- Add `tone: Float32Array` - dirty tonal body / density modulation
- Add `accent: Float32Array` - sparse focal highlights
- Add `atmosphere: Float32Array` - atmosphere seed map

### Implementation:
```typescript
export interface MotifMaps {
  structural: Float32Array;
  tone: Float32Array;
  accent: Float32Array;
  atmosphere: Float32Array;
  edge: Float32Array;
  distance: Float32Array;
  protectedZones: ProtectedZone[];
  width: number;
  height: number;
  bounds: Bounds;
}
```

---

## Task 2: Update MotifProcessor for Multi-Plate Support

**File:** `src/source/MotifProcessor.ts`

### Changes:
1. Update `generateMapsFromMotifPack()` to:
   - Use `pack.structure` as structural map
   - Use `pack.tone` as tone map
   - Use `pack.accent` as accent map (or generate from edge if null)
   - Use `pack.atmo` as atmosphere map (or generate default if null)

2. Update `generateMapsFromPreset()` for skull to:
   - Use explicit structure/tone/accent/atmo masks based on the skull geometry
   - Override default luminance-based generation

3. Add helper functions:
   - `generateStructureFromAlpha(alpha)` - extract structure from alpha
   - `generateToneFromAlpha(alpha)` - generate default tone pattern
   - `generateAccentFromEdges(edge, structure)` - accent from edges
   - `generateAtmosphereFromDistance(distance)` - atmosphere from distance

---

## Task 3: Implement Four-Population System in DualFieldPointCloud

**File:** `src/pointcloud/DualFieldPointCloud.ts`

### Changes:

#### 3.1 Update Config Interface
```typescript
export interface DualFieldConfig {
  density: number;
  seed: number;
  
  // Four-population ratios (must sum to ~1.0)
  structuralRatio: number;    // 0.45 for skull
  toneRatio: number;          // 0.45 for skull  
  accentRatio: number;        // 0.07 for skull
  atmosphereRatio: number;    // 0.03 for skull
  
  // Dissolve settings
  dissolveEnabled: boolean;
  dissolveDirection: number;
  dissolveEdge: number;
  dissolveWidth: number;
  
  // Glitch settings
  glitchEnabled: boolean;
  glitchIntensity: number;
}
```

#### 3.2 Update Default Config for Skull
```typescript
export const DEFAULT_DUAL_FIELD_CONFIG: DualFieldConfig = {
  density: 0.5,
  seed: 42,
  structuralRatio: 0.45,
  toneRatio: 0.45,
  accentRatio: 0.07,
  atmosphereRatio: 0.03,
  // ... rest unchanged
};
```

#### 3.3 Implement Weighting Rules

**STRUCTURAL (layer 0):**
- Sample inside alpha only
- Priority = `alpha * (0.15 + 1.8 * structure + 0.35 * accent)`

**BODY/TONE (layer 1):**
- Sample inside alpha only
- Priority = `alpha * (0.08 + 1.4 * tone) * (1.0 - 0.55 * structure)`

**ACCENT (layer 2):**
- Sample sparsely inside alpha
- Priority = `alpha * accent * (0.3 + 0.8 * structure)`

**ATMOSPHERE (layer 3):**
- Sample mostly outside alpha / edge-adjacent
- Priority = `(0.25 * atmo + edgeSpill) * (1.0 - alpha * 0.85)`

#### 3.4 Add Skull Anchor Detection
Add functions to detect and overweight:
- Socket rims (eye sockets)
- Nasal cavity edges
- Brow ridge
- Cheekbone arcs
- Upper teeth row
- Jaw corners

#### 3.5 Update Point Data Format
- Add `markType: number` to point data (0=dust, 1=grain, 2=chunk, 3=shard)

---

## Task 4: Update Shaders for Mark Vocabulary

**Files:** 
- `src/renderer/shaders/dualfield.vert`
- `src/renderer/shaders/dualfield.frag`

### Changes:

#### 4.1 Vertex Shader
- Add `aMarkType` attribute for mark vocabulary
- Pass `vMarkType` to fragment shader
- Keep wind/turbulence disabled in static mode

#### 4.2 Fragment Shader - Blocky/Pixel-like Marks
Replace circular points with blocky shapes:

```glsl
// Mark types:
// 0 = dust - small square dots
// 1 = grain - slightly larger irregular squares  
// 2 = chunk - medium blocky shapes
// 3 = shard - elongated rectangular shards

void main() {
  vec2 coord = gl_PointCoord - vec2(0.5);
  
  float alpha;
  if (vMarkType < 0.5) {
    // Dust - tiny square
    alpha = max(abs(coord.x), abs(coord.y)) < 0.15 ? 1.0 : 0.0;
  } else if (vMarkType < 1.5) {
    // Grain - small square with slight variation
    float d = max(abs(coord.x), abs(coord.y));
    alpha = d < 0.2 + hash(vSeed) * 0.1 ? 1.0 - d * 2.0 : 0.0;
  } else if (vMarkType < 2.5) {
    // Chunk - medium blocky
    float d = max(abs(coord.x), abs(coord.y));
    alpha = d < 0.35 ? 1.0 - d : 0.0;
  } else {
    // Shard - elongated rectangle
    float d1 = abs(coord.x);
    float d2 = abs(coord.y);
    alpha = (d1 < 0.15 && d2 < 0.45) ? 1.0 : 0.0;
  }
  
  if (alpha < 0.01) discard;
}
```

---

## Task 5: Add Diagnostic Views

**File:** `src/source/MotifPack.ts`

### Changes:
Update `DiagnosticView` type:
```typescript
export type DiagnosticView = 
  | 'alpha' 
  | 'structure'
  | 'tone' 
  | 'accent' 
  | 'atmo'
  | 'structure-only'
  | 'tone-only'
  | 'accent-only'
  | 'atmosphere-only'
  | 'structure-tone'
  | 'structure-tone-accent'
  | 'full';
```

---

## Task 6: Add Render Diagnostics Display

**File:** `src/App.svelte`

### Changes:
Add diagnostics panel showing for each visible population:
- Point counts per population
- Average size per population  
- Average brightness per population

Render modes to show:
- Structure only
- Tone/body only
- Accent only
- Atmosphere only
- Structure + body
- Structure + body + accent
- Full composite

---

## Task 7: Static Mode Configuration

**File:** `src/presets/index.ts`

### Changes:
Update skull preset defaults for static mode:
```typescript
{
  id: 'skull',
  name: 'Skull',
  defaultParams: {
    density: 0.6,
    pointSize: 2.5,
    wind: 0.0,          // Disabled in static mode
    turbulence: 0.0,    // Disabled in static mode
    erosion: 0.0,        // Disabled in static mode
    brightness: 1.0,
    contrast: 1.1
  }
}
```

---

## Implementation Order

1. **MotifMaps.ts** - Add new map arrays
2. **MotifProcessor.ts** - Generate maps from pack/presets with tone/accent/atmo
3. **DualFieldPointCloud.ts** - Implement four-population weighting system
4. **dualfield.vert** - Add mark type attribute
5. **dualfield.frag** - Implement blocky mark vocabulary
6. **MotifPack.ts** - Add diagnostic view types
7. **App.svelte** - Add diagnostics panel and render modes
8. **presets/index.ts** - Set static mode parameters for skull

---

## Acceptance Criteria

- [ ] Skull no longer feels like one uniform point soup
- [ ] Structure reads clearly in brow/sockets/nose/teeth/jaw
- [ ] Accent is visibly sparse and focal
- [ ] Atmosphere does not fill skull interior
- [ ] Marks feel more like dirty pixels than soft round particles
- [ ] Four populations render with distinct visual roles
- [ ] Diagnostic views show accurate population statistics