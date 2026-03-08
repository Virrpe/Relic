#version 300 es
precision highp float;

in float vWeight;
in float vSeed;
in float vLayer;
in float vParticleType;

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
  vec2 coord = gl_PointCoord - vec2(0.5);
  float dist = length(coord);
  
  // Streak particles are elongated
  float aspectRatio = 1.0;
  if (vParticleType > 0.8) {
    // Streaks are elongated in one direction
    aspectRatio = 2.5;
    coord.y *= aspectRatio;
    dist = length(coord);
  }
  
  if (dist > 0.5) discard;
  
  // Soft edge - varies by particle type
  float alpha = 1.0 - smoothstep(0.2, 0.5, dist);
  
  // Atmospheric layer: more transparent, ghostly
  if (vLayer < 0.25) {
    alpha *= 0.4 + vLayer * 0.8;
  }
  // Accent layer: more solid
  else if (vLayer > 0.75) {
    alpha *= 0.9;
  }
  // Structural: base opacity
  else {
    alpha *= 0.7;
  }
  
  // Dust particles are more transparent
  if (vParticleType < 0.2) {
    alpha *= 0.5;
  }
  
  // Base color - atmospheric dark tones
  float baseLuminance = vWeight;
  
  // Apply contrast
  float contrasted = (baseLuminance - 0.5) * uContrast + 0.5;
  contrasted = clamp(contrasted, 0.0, 1.0);
  
  // Apply brightness
  float finalLuminance = contrasted * uBrightness;
  finalLuminance = clamp(finalLuminance, 0.0, 1.0);
  
  // Color palette - dark atmospheric tones with layer influence
  // Atmospheric layer: cooler, more blue
  // Structural layer: warm gray
  // Accent layer: warmer, more bone-like
  
  vec3 atmosphericColor = vec3(0.03, 0.03, 0.08);  // Deep blue-black
  vec3 structuralColor = vec3(0.12, 0.1, 0.08);     // Warm dark brown
  vec3 accentColor = vec3(0.6, 0.55, 0.5);          // Bone white
  
  vec3 darkColor = vec3(0.02, 0.02, 0.04);   // Deep shadow
  vec3 midColor = vec3(0.15, 0.12, 0.1);     // Warm gray
  vec3 brightColor = vec3(0.75, 0.7, 0.65);   // Light bone
  
  // Mix colors based on layer
  vec3 layerBase;
  if (vLayer < 0.25) {
    layerBase = mix(atmosphericColor, darkColor, finalLuminance);
  } else if (vLayer > 0.75) {
    layerBase = mix(midColor, brightColor, finalLuminance);
  } else {
    layerBase = mix(darkColor, midColor, finalLuminance);
  }
  
  vec3 color;
  if (finalLuminance < 0.5) {
    color = mix(darkColor, midColor, finalLuminance * 2.0);
  } else {
    color = mix(midColor, brightColor, (finalLuminance - 0.5) * 2.0);
  }
  
  // Apply layer tint
  color = mix(color, layerBase, 0.3);
  
  // Slight variation based on seed and layer
  float seedVar = hash(vSeed * 100.0 + vLayer * 50.0) * 0.15;
  color += seedVar;
  
  // Atmospheric particles have slight color variation
  if (vLayer < 0.25) {
    color.b += 0.02; // Slight blue tint
  }
  
  // Time-based subtle pulse (very subtle)
  float pulse = sin(uTime * 0.5 + vSeed * 10.0) * 0.03 + 1.0;
  color *= pulse;
  
  // Add slight flicker to dust particles
  if (vParticleType < 0.2) {
    float flicker = hash(vSeed * 1000.0 + floor(uTime * 3.0)) * 0.2 + 0.8;
    alpha *= flicker;
  }
  
  fragColor = vec4(color, alpha);
}
