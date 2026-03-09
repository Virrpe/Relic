#version 300 es
precision highp float;

in float vWeight;
in float vSeed;
in float vLayerType;

uniform float uBrightness;
uniform float uContrast;
uniform float uPointSize;
uniform float uTime;

out vec4 fragColor;

// Hash for pseudo-random
float hash(float n) {
  return fract(sin(n) * 43758.5453123);
}

void main() {
  // Pixel-like point shape - harder edges instead of soft circles
  vec2 coord = gl_PointCoord;
  
  // Quantize to create blocky pixel effect
  vec2 pixelCoord = floor(coord * 3.0) / 3.0;
  
  // Different sizes per layer
  float pointSize;
  if (vLayerType < 0.5) {
    // Structural (0): tiny for detail
    pointSize = 0.25;
  } else if (vLayerType < 1.5) {
    // Body/Tone (1): tiny gritty grains
    pointSize = 0.2;
  } else if (vLayerType < 2.5) {
    // Accent (2): tiny sharp pixels
    pointSize = 0.15;
  } else {
    // Atmospheric (3): tiny dust
    pointSize = 0.2;
  }
  
  // Hard edge - no soft falloff
  vec2 distFromCenter = abs(pixelCoord - 0.5) * 2.0;
  float maxDist = max(distFromCenter.x, distFromCenter.y);
  
  if (maxDist > pointSize) discard;
  
  // Sharp alpha
  float alpha = 1.0;
  
  // Layer-based coloring
  vec3 darkColor, midColor, brightColor;
  
  if (vLayerType < 0.5) {
    // Structural (0) - bone white, driven by structure plate
    darkColor = vec3(0.02, 0.02, 0.05);
    midColor = vec3(0.15, 0.12, 0.1);
    brightColor = vec3(0.75, 0.7, 0.65);
  } else if (vLayerType < 1.5) {
    // Body/Tone (1) - dirty tonal mass
    darkColor = vec3(0.03, 0.025, 0.02);
    midColor = vec3(0.2, 0.15, 0.1);
    brightColor = vec3(0.5, 0.4, 0.3);
  } else if (vLayerType < 2.5) {
    // Accent (2) - sparse focal highlights
    darkColor = vec3(0.15, 0.08, 0.05);
    midColor = vec3(0.35, 0.2, 0.12);
    brightColor = vec3(0.9, 0.75, 0.5);
  } else {
    // Atmospheric (3) - dust/atmosphere
    darkColor = vec3(0.01, 0.02, 0.04);
    midColor = vec3(0.08, 0.1, 0.12);
    brightColor = vec3(0.35, 0.38, 0.4);
  }
  
  // Base color - weight determines luminance
  float baseLuminance = vWeight;
  
  // Apply contrast
  float contrasted = (baseLuminance - 0.5) * uContrast + 0.5;
  contrasted = clamp(contrasted, 0.0, 1.0);
  
  // Apply brightness
  float finalLuminance = contrasted * uBrightness;
  finalLuminance = clamp(finalLuminance, 0.0, 1.0);
  
  // Apply color palette based on luminance
  vec3 color;
  if (finalLuminance < 0.5) {
    color = mix(darkColor, midColor, finalLuminance * 2.0);
  } else {
    color = mix(midColor, brightColor, (finalLuminance - 0.5) * 2.0);
  }
  
  // Slight variation based on seed
  float seedVar = hash(vSeed * 100.0) * 0.1;
  color += seedVar;
  
  // Time-based subtle pulse
  float pulse = sin(uTime * 0.5 + vSeed * 10.0) * 0.02 + 1.0;
  color *= pulse;
  
  // Extra fade for atmospheric points
  if (vLayerType > 2.5) {
    alpha *= 0.6;
  }
  
  fragColor = vec4(color, alpha);
}
