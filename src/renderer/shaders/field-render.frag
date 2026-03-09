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

// Hash function for pseudo-random
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

// Sample a field texture
float sampleField(int fieldIdx, vec2 uv) {
  return texture(uFieldTextures[fieldIdx], uv).r;
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

// Main composite function
vec4 computeFinal(vec2 uv) {
  // Sample all fields
  float alpha = sampleField(FIELD_ALPHA, uv);
  float structure = sampleField(FIELD_STRUCTURE, uv);
  float tone = sampleField(FIELD_TONE, uv);
  
  // Apply erosion
  float erodedAlpha = applyErosion(alpha, uv);
  
  // Phase 1 composite: alpha * structure * tone
  float value = erodedAlpha * structure * tone;
  
  // Add accent if available
  float accent = sampleField(FIELD_ACCENT, uv);
  value += accent * 0.3;
  
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
  } else {
    // Default to final
    color = computeFinal(uv);
  }
  
  fragColor = color;
}
