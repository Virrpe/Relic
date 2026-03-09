#version 300 es
precision highp float;

in float vWeight;
in float vSeed;
in float vLayerType;
in vec2 vOriginalPos;

uniform float uBrightness;
uniform float uContrast;
uniform float uPointSize;
uniform float uTime;

// Dissolve uniforms
uniform float uDissolveEnabled;
uniform float uDissolveEdge;
uniform float uDissolveWidth;

// Loop mode
uniform float uLoopDuration;

out vec4 fragColor;

// Hash for pseudo-random
float hash(float n) {
  return fract(sin(n) * 43758.5453123);
}

// Get dissolve factor
float getDissolveFactor(float nx, float edge, float width) {
  float distFromEdge = nx - edge;
  float t = clamp(distFromEdge / width, -1.0, 1.0);
  return 1.0 - (t * t * (3.0 - 2.0 * t)) * 0.5 - 0.5;
}

void main() {
  // Pixel-like point shape - harder edges instead of soft circles
  vec2 coord = gl_PointCoord;
  
  // Quantize to create blocky pixel effect
  // Use 3x3 grid pattern for variation
  vec2 pixelCoord = floor(coord * 3.0) / 3.0;
  
  // Square point shape with slight variation based on layer
  // Different layers get different "pixel" sizes
  float pointSize;
  if (vLayerType < 0.5) {
    // Structural: medium square blocks
    pointSize = 0.85;
  } else if (vLayerType < 1.5) {
    // Body/Tone: smaller gritty grains
    pointSize = 0.7;
  } else if (vLayerType < 2.5) {
    // Accent: tiny sharp pixels
    pointSize = 0.6;
  } else {
    // Atmospheric: medium-small dust
    pointSize = 0.75;
  }
  
  // Hard edge - no soft falloff
  vec2 distFromCenter = abs(pixelCoord - 0.5) * 2.0;
  float maxDist = max(distFromCenter.x, distFromCenter.y);
  
  // Quantized/aliased edge for pixel feel
  if (maxDist > pointSize) discard;
  
  // Sharp alpha - no soft edges
  float alpha = 1.0;
  
  // Add slight shape variation based on seed
  float seedVariation = fract(vSeed * 127.1);
  if (seedVariation > 0.85) {
    // Occasional rectangular shard for accent layers
    if (vLayerType > 0.5 && vLayerType < 2.5) {
      // Elongate slightly
      alpha = distFromCenter.x < pointSize * 1.2 && distFromCenter.y < pointSize * 0.8 ? 1.0 : 0.0;
      if (alpha < 0.5) discard;
    }
  }
  
  // Get cyclic time
  float cyclicTime = mod(uTime, uLoopDuration);
  
  // Layer-based coloring
  // Structural (0): Core motif colors - bone/white tones
  // Body/Tone (1): Dirty tonal mass - warmer darker tones
  // Accent (2): Highlights - brighter, warmer tones
  // Atmospheric (3): Dust/atmosphere - darker, cooler tones
  
  float layerType = vLayerType;
  
  // Base luminance from weight
  float baseLuminance = vWeight;
  
  // Apply contrast
  float contrasted = (baseLuminance - 0.5) * uContrast + 0.5;
  contrasted = clamp(contrasted, 0.0, 1.0);
  
  // Apply brightness
  float finalLuminance = contrasted * uBrightness;
  finalLuminance = clamp(finalLuminance, 0.0, 1.0);
  
  // Color palette - layer dependent (4 layers now)
  vec3 darkColor, midColor, brightColor;
  
  if (layerType < 0.5) {
    // Structural (0) - bone white, driven by structure plate
    darkColor = vec3(0.02, 0.02, 0.05);    // Deep black-blue
    midColor = vec3(0.15, 0.12, 0.1);      // Warm dark gray
    brightColor = vec3(0.75, 0.7, 0.65);  // Bone white
  } else if (layerType < 1.5) {
    // Body/Tone (1) - dirty tonal mass, driven by tone plate
    darkColor = vec3(0.03, 0.025, 0.02);   // Dark brown-black
    midColor = vec3(0.2, 0.15, 0.1);       // Dirty brown
    brightColor = vec3(0.5, 0.4, 0.3);    // Dirty tan
  } else if (layerType < 2.5) {
    // Accent (2) - sparse focal highlights, driven by accent plate
    darkColor = vec3(0.15, 0.08, 0.05);   // Dark rust
    midColor = vec3(0.35, 0.2, 0.12);     // Warm brown
    brightColor = vec3(0.9, 0.75, 0.5);   // Golden highlight
  } else {
    // Atmospheric (3) - dust/atmosphere, driven by atmo plate
    darkColor = vec3(0.01, 0.02, 0.04);    // Very dark blue
    midColor = vec3(0.08, 0.1, 0.12);     // Cool dark gray
    brightColor = vec3(0.35, 0.38, 0.4);  // Dusty gray
  }
  
  vec3 color;
  if (finalLuminance < 0.5) {
    color = mix(darkColor, midColor, finalLuminance * 2.0);
  } else {
    color = mix(midColor, brightColor, (finalLuminance - 0.5) * 2.0);
  }
  
  // Variation based on seed
  float seedVar = hash(vSeed * 100.0) * 0.15;
  color += seedVar;
  
  // Time-based subtle pulse
  float pulse = sin(cyclicTime * 0.5 + vSeed * 10.0) * 0.03 + 1.0;
  color *= pulse;
  
  // Dissolve edge glow
  if (uDissolveEnabled > 0.5) {
    float dissolveFactor = getDissolveFactor(vOriginalPos.x, uDissolveEdge, uDissolveWidth);
    
    // Edge glow effect
    if (dissolveFactor > 0.3 && dissolveFactor < 0.7) {
      float glowIntensity = 1.0 - abs(dissolveFactor - 0.5) * 2.0;
      vec3 glowColor = vec3(0.8, 0.4, 0.2); // Orange-red dissolve edge
      color = mix(color, glowColor, glowIntensity * 0.4);
    }
    
    // Reduce alpha in dissolving areas
    alpha *= 1.0 - dissolveFactor * 0.8;
  }
  
  // Extra fade for atmospheric points (layer 3)
  if (layerType > 2.5) {
    alpha *= 0.6;
  }
  
  fragColor = vec4(color, alpha);
}
