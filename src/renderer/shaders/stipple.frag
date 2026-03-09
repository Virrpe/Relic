#version 300 es
precision highp float;

in float vWeight;
in float vSeed;

uniform float uBrightness;
uniform float uContrast;
uniform float uPointSize;
uniform float uTime;

// Static mode: 1.0 = bypass time pulse, 0.0 = normal dynamic rendering
uniform float uRenderMode;

out vec4 fragColor;

// Hash for pseudo-random
float hash(float n) {
  return fract(sin(n) * 43758.5453123);
}

void main() {
  // Circular point shape
  vec2 coord = gl_PointCoord - vec2(0.5);
  float dist = length(coord);
  if (dist > 0.5) discard;
  
  // Soft edge
  float alpha = 1.0 - smoothstep(0.3, 0.5, dist);
  
  // Base color - atmospheric dark tones
  // Weight determines luminance (0 = dark, 1 = bright)
  float baseLuminance = vWeight;
  
  // Apply contrast
  float contrasted = (baseLuminance - 0.5) * uContrast + 0.5;
  contrasted = clamp(contrasted, 0.0, 1.0);
  
  // Apply brightness
  float finalLuminance = contrasted * uBrightness;
  finalLuminance = clamp(finalLuminance, 0.0, 1.0);
  
  // Color palette - dark atmospheric tones
  // Low luminance = deep black/blue, high = warm gray/white
  vec3 darkColor = vec3(0.02, 0.02, 0.05);   // Deep blue-black
  vec3 midColor = vec3(0.15, 0.12, 0.1);     // Warm dark gray
  vec3 brightColor = vec3(0.7, 0.65, 0.6);  // Bone white
  
  vec3 color;
  if (finalLuminance < 0.5) {
    color = mix(darkColor, midColor, finalLuminance * 2.0);
  } else {
    color = mix(midColor, brightColor, (finalLuminance - 0.5) * 2.0);
  }
  
  // Slight variation based on seed
  float seedVar = hash(vSeed * 100.0) * 0.1;
  color += seedVar;
  
  // Time-based subtle pulse - disabled in static mode
  float pulse = uRenderMode < 0.5 
    ? sin(uTime * 0.5 + vSeed * 10.0) * 0.02 + 1.0 
    : 1.0;
  color *= pulse;
  
  fragColor = vec4(color, alpha);
}
