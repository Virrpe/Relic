#version 300 es
precision highp float;

// Point data: x, y, weight, seed, layer, particleType, erosionBias
layout(location = 0) in vec8 aPoint;

uniform float uTime;
uniform float uWind;
uniform float uTurbulence;
uniform float uErosion;
uniform vec2 uErosionDir;
uniform vec2 uResolution;
uniform float uPointSize;
uniform vec4 uTransform; // scaleX, scaleY, offsetX, offsetY

out float vWeight;
out float vSeed;
out float vLayer;
out float vParticleType;

// Simple noise function
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  vec2 pos = aPoint.xy;
  float seed = aPoint.w;
  float layer = aPoint.y;        // layer value (0=atmospheric, 0.5=structural, 1=accent)
  float particleType = aPoint.z; // particle type (0=dust, 0.33=medium, 0.66=chunk, 1=streak)
  float erosionBias = aPoint.w;  // per-particle erosion bias
  
  // Base position with seed offset for variation
  float seedOffset = seed * 1000.0;
  
  // Layer-based size modulation
  float layerSize = 1.0;
  if (layer < 0.25) {
    // Atmospheric - smaller
    layerSize = 0.5 + layer * 0.5;
  } else if (layer > 0.75) {
    // Accent - larger
    layerSize = 1.5 + (layer - 0.75) * 2.0;
  } else {
    // Structural - base
    layerSize = 0.8 + layer * 0.4;
  }
  
  // Particle type-based size modulation
  float typeSize = 1.0;
  if (particleType > 0.5) {
    // Chunky or streak particles are larger
    typeSize = 1.2 + particleType * 0.5;
  } else {
    // Dust/small particles
    typeSize = 0.4 + particleType * 0.8;
  }
  
  // Wind displacement - varies by layer (atmospheric moves more)
  float windPhase = uTime * 0.5 + seedOffset;
  float windStrength = uWind * (0.3 + layer * 0.7);
  float windDisp = sin(windPhase) * windStrength;
  pos.x += windDisp;
  pos.y += cos(windPhase * 0.7) * windStrength * 0.5;
  
  // Turbulence - chaotic displacement (stronger for atmospheric)
  float turbNoise = noise(pos * 3.0 + uTime * 0.3 + seedOffset);
  float turbStrength = uTurbulence * (0.3 + layer * 0.5);
  pos += (turbNoise - 0.5) * turbStrength;
  
  // Directional erosion - uses global direction + per-particle bias
  float erosionDrift = uErosion * uTime * 0.15;
  // Combine global direction with particle bias
  vec2 erosionVector = uErosionDir * (erosionBias + 0.5);
  pos += erosionVector * erosionDrift;
  
  // Add subtle secondary drift for texture
  pos.x += sin(erosionDrift * 4.0 + seedOffset) * uErosion * 0.08;
  
  // Apply fit-to-viewport transform (flip Y for canvas coordinates)
  pos = pos * vec2(uTransform.x, -uTransform.y) + vec2(uTransform.z, -uTransform.w);
  
  // Output
  gl_Position = vec4(pos, 0.0, 1.0);
  gl_PointSize = uPointSize * layerSize * typeSize;
  
  vWeight = aPoint.z;
  vSeed = seed;
  vLayer = layer;
  vParticleType = particleType;
}
