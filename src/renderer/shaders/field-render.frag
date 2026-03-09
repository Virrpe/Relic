#version 300 es
precision highp float;

in vec2 vUV;

out vec4 fragColor;

// Field texture samplers
uniform sampler2D uFieldTextures[7];

// Field resolutions
uniform vec2 uFieldResolutions;

// Canvas resolution
uniform vec2 uCanvasResolution;

// Time for effects
uniform float uTime;

// Brightness and contrast
uniform float uBrightness;
uniform float uContrast;

// Debug view selector
uniform int uDebugView;

// Erosion parameters
uniform float uFieldErosionAmount;
uniform float uFieldErosionSeed;

// Phase 3: Pixel/Block stylization
uniform float uFieldPixelSize;      // pixel block size
uniform float uFieldPixelQuantize;  // color quantization
uniform float uFieldBlockDisplace;  // block jitter
uniform float uFieldEdgeBreakup;    // edge fragmentation

// Phase 4: Dissolve parameters
uniform float uFieldDissolveEnabled;
uniform float uFieldDissolveDirection;  // 0=left-right, 0.25=right-left, 0.5=bottom-top, 0.75=top-bottom
uniform float uFieldDissolveEdge;       // 0-1 position
uniform float uFieldDissolveWidth;      // transition width
uniform float uFieldDissolveNoise;       // edge irregularity

// Phase 4: Glitch parameters
uniform float uFieldGlitchEnabled;
uniform float uFieldGlitchIntensity;
uniform float uFieldGlitchBlockSize;
uniform float uFieldGlitchSpeed;

// Field indices
const int FIELD_ALPHA = 0;
const int FIELD_STRUCTURE = 1;
const int FIELD_TONE = 2;
const int FIELD_ACCENT = 3;
const int FIELD_ATMO = 4;
const int FIELD_EDGE = 5;
const int FIELD_EROSION = 6;

// Debug view IDs
const int DEBUG_FINAL = 0;
const int DEBUG_ALPHA = 1;
const int DEBUG_STRUCTURE = 2;
const int DEBUG_TONE = 3;
const int DEBUG_ACCENT = 4;
const int DEBUG_ATMO = 5;
const int DEBUG_EDGE = 6;
const int DEBUG_EROSION = 7;
const int DEBUG_COMPOSITE_STYLIZED = 8;

// Hash function for pseudo-random
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

// Sample a field texture
float sampleField(int fieldIdx, vec2 uv) {
  return texture(uFieldTextures[fieldIdx], uv).r;
}

// Apply glitch displacement
vec2 applyGlitch(vec2 uv) {
  if (uFieldGlitchEnabled < 0.01 || uFieldGlitchIntensity < 0.01) return uv;
  
  // Row-based displacement
  float rowY = floor(uv.y * uFieldGlitchBlockSize) / uFieldGlitchBlockSize;
  float glitchRand = hash(vec2(rowY, uTime * uFieldGlitchSpeed));
  
  if (glitchRand < uFieldGlitchIntensity) {
    float displacement = (hash(vec2(rowY, uTime)) - 0.5) * 0.1 * uFieldGlitchIntensity;
    uv.x += displacement;
  }
  
  // Occasional block duplication
  if (glitchRand > 1.0 - uFieldGlitchIntensity * 0.1) {
    uv.y += (hash(vec2(rowY + 0.5, uTime)) - 0.5) * 0.05;
  }
  
  return uv;
}

// Apply dissolve
float applyDissolve(float value, vec2 uv) {
  if (uFieldDissolveEnabled < 0.5) return value;
  
  // Compute distance from dissolve edge
  float edgeDist;
  if (uFieldDissolveDirection < 0.25) {
    edgeDist = uv.x - uFieldDissolveEdge;  // left-right
  } else if (uFieldDissolveDirection < 0.5) {
    edgeDist = (1.0 - uv.x) - uFieldDissolveEdge;  // right-left
  } else if (uFieldDissolveDirection < 0.75) {
    edgeDist = uv.y - uFieldDissolveEdge;  // bottom-top
  } else {
    edgeDist = (1.0 - uv.y) - uFieldDissolveEdge;  // top-bottom
  }
  
  // Soft edge with noise
  float noise = hash(uv * 50.0 + uTime * 0.1) * uFieldDissolveNoise;
  float dissolveValue = edgeDist + noise * 0.05;
  
  if (dissolveValue < 0.0) return 0.0;
  return value * smoothstep(0.0, uFieldDissolveWidth, dissolveValue);
}

// Apply erosion threshold
float applyErosion(float value, vec2 uv) {
  if (uFieldErosionAmount < 0.01) return value;
  
  float erosionMask = sampleField(FIELD_EROSION, uv);
  float erosionThreshold = uFieldErosionAmount;
  
  // Below threshold: dissolve with noise pattern
  if (value < erosionThreshold) {
    float noise = hash(uv * 100.0 + uFieldErosionSeed);
    return value < erosionThreshold * noise ? 0.0 : value;
  }
  
  // Near threshold: gradual recession
  float edgeFade = smoothstep(erosionThreshold, erosionThreshold + 0.1, value);
  return value * edgeFade;
}

// Pixelate coordinates
vec2 pixelate(vec2 coord, float size) {
  return floor(coord / size) * size;
}

// Quantize color to levels
float quantize(float value, float levels) {
  return floor(value * levels) / levels;
}

// Apply pixel stylization
float applyPixelStylization(float value, vec2 uv) {
  if (uFieldPixelSize < 1.5) return value;
  
  // Pixelation
  vec2 blockUV = pixelate(uv, uFieldPixelSize / uCanvasResolution.y * 100.0);
  
  // Block displacement jitter
  if (uFieldBlockDisplace > 0.0) {
    float jitter = (hash(blockUV * 100.0) - 0.5) * uFieldBlockDisplace * 0.02;
    blockUV += jitter;
  }
  
  // Re-sample at block center
  vec2 sampleUV = blockUV + (uFieldPixelSize / uCanvasResolution.y * 50.0);
  float blockValue = texture(uFieldTextures[0], sampleUV).r;
  
  // Color quantization
  if (uFieldPixelQuantize > 0.5) {
    blockValue = quantize(blockValue, 8.0);
  }
  
  // Edge breakup - noise-based hole patterns
  if (uFieldEdgeBreakup > 0.0) {
    float noise = hash(blockUV * 1000.0);
    if (noise < uFieldEdgeBreakup * 0.3 && blockValue > 0.1) {
      blockValue = 0.0;
    }
  }
  
  return blockValue;
}

// Main composite function
vec4 computeFinal(vec2 uv) {
  // Apply glitch first
  vec2 glitchUV = applyGlitch(uv);
  
  // Sample all fields
  float alpha = sampleField(FIELD_ALPHA, glitchUV);
  float structure = sampleField(FIELD_STRUCTURE, glitchUV);
  float tone = sampleField(FIELD_TONE, glitchUV);
  
  // Apply erosion
  float erodedAlpha = applyErosion(alpha, glitchUV);
  
  // Phase 1 composite: alpha * structure * tone
  float value = erodedAlpha * structure * tone;
  
  // Add accent if available
  float accent = sampleField(FIELD_ACCENT, glitchUV);
  value += accent * 0.3;
  
  // Apply dissolve
  value = applyDissolve(value, glitchUV);
  
  // Apply pixel stylization
  value = applyPixelStylization(value, uv);
  
  // Apply brightness/contrast
  value = (value - 0.5) * uContrast + 0.5;
  value *= uBrightness;
  value = clamp(value, 0.0, 1.0);
  
  // Return grayscale color
  return vec4(vec3(value), 1.0);
}

void main() {
  vec2 uv = vUV;
  
  // For now, output based on debug view
  vec4 color;
  
  if (uDebugView == DEBUG_FINAL) {
    color = computeFinal(uv);
  } else if (uDebugView == DEBUG_ALPHA) {
    float alpha = sampleField(FIELD_ALPHA, uv);
    color = vec4(vec3(alpha), 1.0);
  } else if (uDebugView == DEBUG_STRUCTURE) {
    float structure = sampleField(FIELD_STRUCTURE, uv);
    color = vec4(vec3(structure), 1.0);
  } else if (uDebugView == DEBUG_TONE) {
    float tone = sampleField(FIELD_TONE, uv);
    color = vec4(vec3(tone), 1.0);
  } else if (uDebugView == DEBUG_ACCENT) {
    float accent = sampleField(FIELD_ACCENT, uv);
    color = vec4(vec3(accent), 1.0);
  } else if (uDebugView == DEBUG_ATMO) {
    float atmo = sampleField(FIELD_ATMO, uv);
    color = vec4(vec3(atmo), 1.0);
  } else if (uDebugView == DEBUG_EDGE) {
    float edge = sampleField(FIELD_EDGE, uv);
    color = vec4(vec3(edge), 1.0);
  } else if (uDebugView == DEBUG_EROSION) {
    float erosion = sampleField(FIELD_EROSION, uv);
    color = vec4(vec3(erosion), 1.0);
  } else if (uDebugView == DEBUG_COMPOSITE_STYLIZED) {
    // Composite with pixel/glitch effects
    color = computeFinal(uv);
  } else {
    // Default to final
    color = computeFinal(uv);
  }
  
  fragColor = color;
}
