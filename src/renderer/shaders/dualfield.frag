#version 300 es
precision highp float;

in float vWeight;
in float vSeed;
in float vLayerType;
in float vMarkType;
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
  // Blocky/pixel-like mark shapes instead of soft circles
  vec2 coord = gl_PointCoord - vec2(0.5);
  
  // Mark types: 0=dust, 1=grain, 2=chunk, 3=shard
  float markType = vMarkType;
  float alpha = 0.0;
  
  if (markType < 0.5) {
    // Dust - tiny square pixel
    float d = max(abs(coord.x), abs(coord.y));
    alpha = d < 0.18 ? 1.0 : 0.0;
  } else if (markType < 1.5) {
    // Grain - small square with slight variation
    float d = max(abs(coord.x), abs(coord.y));
    alpha = d < 0.22 ? 1.0 - d * 1.5 : 0.0;
  } else if (markType < 2.5) {
    // Chunk - medium blocky square
    float d = max(abs(coord.x), abs(coord.y));
    alpha = d < 0.35 ? 1.0 - d * 0.8 : 0.0;
  } else {
    // Shard - elongated rectangle
    float d1 = abs(coord.x);
    float d2 = abs(coord.y);
    alpha = (d1 < 0.12 && d2 < 0.45) ? 1.0 : 0.0;
  }
  
  if (alpha < 0.01) discard;
  
  // Get cyclic time
  float cyclicTime = mod(uTime, uLoopDuration);
  
  // Layer-based coloring
  // Structural (0): Core motif - bone/white tones
  // Tone (1): Body fill - mid-tones, slightly darker
  // Accent (2): Highlights - brighter, warmer tones
  // Atmosphere (3): Dust - darker, cooler, sparse
  
  float layerType = vLayerType;
  
  // Base luminance from weight
  float baseLuminance = vWeight;
  
  // Apply contrast
  float contrasted = (baseLuminance - 0.5) * uContrast + 0.5;
  contrasted = clamp(contrasted, 0.0, 1.0);
  
  // Apply brightness
  float finalLuminance = contrasted * uBrightness;
  finalLuminance = clamp(finalLuminance, 0.0, 1.0);
  
  // Color palette - layer dependent
  vec3 darkColor, midColor, brightColor;
  
  if (layerType < 0.5) {
    // Structural (0) - bone white
    darkColor = vec3(0.02, 0.02, 0.05);    // Deep black-blue
    midColor = vec3(0.15, 0.12, 0.1);      // Warm dark gray
    brightColor = vec3(0.75, 0.7, 0.65);  // Bone white
  } else if (layerType < 1.5) {
    // Tone (1) - mid-tone body fill
    darkColor = vec3(0.03, 0.03, 0.05);    // Dark gray
    midColor = vec3(0.12, 0.11, 0.1);     // Medium gray
    brightColor = vec3(0.45, 0.42, 0.4);   // Light gray fill
  } else if (layerType < 2.5) {
    // Accent (2) - warm highlights
    darkColor = vec3(0.15, 0.08, 0.05);   // Dark rust
    midColor = vec3(0.35, 0.2, 0.12);     // Warm brown
    brightColor = vec3(0.9, 0.75, 0.5);   // Golden highlight
  } else {
    // Atmosphere (3) - cool dust tones
    darkColor = vec3(0.01, 0.02, 0.04);    // Very dark blue
    midColor = vec3(0.06, 0.08, 0.1);      // Cool dark gray
    brightColor = vec3(0.25, 0.28, 0.32);  // Dusty gray
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
  
  // Extra fade for atmosphere points
  if (layerType > 2.5) {
    alpha *= 0.6;
  }
  
  fragColor = vec4(color, alpha);
}
