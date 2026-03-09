#version 300 es
precision highp float;

// Point data: x, y, weight, seed, layerType (5 floats)
layout(location = 0) in vec4 aPoint;
layout(location = 1) in float aLayerType;

uniform float uTime;
uniform float uWind;
uniform float uTurbulence;
uniform float uErosion;
uniform vec2 uResolution;
uniform float uPointSize;
uniform vec4 uTransform; // scaleX, scaleY, offsetX, offsetY

out float vWeight;
out float vSeed;
out float vLayerType;

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
  
  // Base position with seed offset for variation
  float seedOffset = seed * 1000.0;
  
  // Wind displacement - flows right over time (stronger effect)
  float windPhase = uTime * 0.5 + seedOffset;
  float windDisp = sin(windPhase) * uWind * 0.3;
  pos.x += windDisp;
  pos.y += cos(windPhase * 0.7) * uWind * 0.15;
  
  // Turbulence - chaotic displacement (stronger effect)
  float turbNoise = noise(pos * 3.0 + uTime * 0.3 + seedOffset);
  pos += (turbNoise - 0.5) * uTurbulence * 0.4;
  
  // Erosion - directional drift (upward, stronger effect)
  float erosionDrift = uErosion * uTime * 0.2;
  pos.y += erosionDrift;
  pos.x += sin(erosionDrift * 5.0 + seedOffset) * uErosion * 0.1;
  
  // Apply fit-to-viewport transform (flip Y for canvas coordinates)
  pos = pos * vec2(uTransform.x, -uTransform.y) + vec2(uTransform.z, -uTransform.w);
  
  // Output
  gl_Position = vec4(pos, 0.0, 1.0);
  gl_PointSize = uPointSize;
  
  vWeight = aPoint.z;
  vSeed = seed;
  vLayerType = aLayerType;
}
