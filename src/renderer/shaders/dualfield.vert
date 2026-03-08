#version 300 es
precision highp float;

// Point data: x, y, weight, seed, layerType
// layerType: 0 = structural, 1 = atmospheric, 2 = accent
layout(location = 0) in vec4 aPoint;
layout(location = 1) in float aLayerType;

uniform float uTime;
uniform float uWind;
uniform float uTurbulence;
uniform float uErosion;
uniform vec2 uResolution;
uniform float uPointSize;
uniform vec4 uTransform;

// Dissolve uniforms
uniform float uDissolveEnabled;
uniform float uDissolveDirection; // 0-1 (0=left, 1=right)
uniform float uDissolveEdge;      // 0-1 position
uniform float uDissolveWidth;     // 0-1 width

// Glitch uniforms
uniform float uGlitchEnabled;
uniform float uGlitchIntensity;
uniform float uGlitchTime;

// Loop mode uniforms
uniform float uLoopDuration;
uniform int uFrameCount;

out float vWeight;
out float vSeed;
out float vLayerType;
out vec2 vOriginalPos;

// Hash functions
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float hash1(float n) {
  return fract(sin(n) * 43758.5453123);
}

// Simple noise
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

// Smoothstep helper
float smoothstepfloat(float edge0, float edge1, float x) {
  float t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

// Get dissolve factor for a point
float getDissolveFactor(float nx, float direction, float edge, float width) {
  float distFromEdge;
  if (direction < 0.5) {
    // Dissolve from left to right
    distFromEdge = nx - edge;
  } else {
    // Dissolve from right to left
    distFromEdge = edge - nx;
  }
  
  return 1.0 - smoothstepfloat(-width, width, distFromEdge);
}

// Compute glitch offset
vec2 computeGlitchOffset(vec2 pos, float seed, float time, float intensity) {
  vec2 offset = vec2(0.0);
  
  float h = hash(pos * 100.0 + seed);
  
  // Only apply glitch above certain threshold
  if (h > 0.85 && intensity > 0.0) {
    // Scanline shear
    float shearAmount = intensity * 0.08 * sin(time * 10.0 + pos.y * 50.0);
    
    // Block displacement
    float blockSize = 0.08;
    float blockX = floor(pos.x / blockSize) * blockSize;
    float displacement = sin(time * 3.0 + blockX * 20.0) * intensity * 0.06;
    
    offset.x = shearAmount + displacement;
    offset.y = sin(time * 5.0 + pos.x * 30.0) * intensity * 0.025;
  }
  
  return offset;
}

// Cyclic time for seamless loop
float getCyclicTime(float time, float duration) {
  return mod(time, duration);
}

void main() {
  vec2 pos = aPoint.xy;
  float seed = aPoint.w;
  float layerType = aLayerType;
  
  vWeight = aPoint.z;
  vSeed = seed;
  vLayerType = layerType;
  vOriginalPos = pos;
  
  // Get cyclic time for loop
  float cyclicTime = getCyclicTime(uTime, uLoopDuration);
  
  // Seed offset for variation
  float seedOffset = seed * 1000.0;
  
  // Calculate dissolve factor
  float dissolveFactor = 0.0;
  if (uDissolveEnabled > 0.5) {
    dissolveFactor = getDissolveFactor(pos.x, uDissolveDirection, uDissolveEdge, uDissolveWidth);
  }
  
  // Layer-based behavior
  // Structural (0): Stable, minimal movement
  // Atmospheric (1): More movement, dust-like
  // Accent (2): Slight jitter, decorative
  
  float layerFactor = layerType; // 0, 1, or 2
  
  // Wind - stronger for atmospheric
  float windStrength = uWind * (0.5 + layerFactor * 0.5);
  float windPhase = cyclicTime * 0.5 + seedOffset;
  pos.x += sin(windPhase) * windStrength * 0.25;
  pos.y += cos(windPhase * 0.7) * windStrength * 0.12;
  
  // Turbulence - stronger for atmospheric
  float turbStrength = uTurbulence * (0.3 + layerFactor * 0.7);
  float turbNoise = noise(pos * 3.0 + cyclicTime * 0.3 + seedOffset);
  pos += (turbNoise - 0.5) * turbStrength * 0.35;
  
  // Erosion - stronger for non-structural
  float erosionStrength = uErosion * (0.5 + layerFactor * 0.5);
  float erosionDrift = erosionStrength * cyclicTime * 0.15;
  pos.y += erosionDrift;
  pos.x += sin(erosionDrift * 5.0 + seedOffset) * erosionStrength * 0.08;
  
  // Apply glitch only to dissolving/atmospheric regions
  if (uGlitchEnabled > 0.5 && (layerType > 0.5 || dissolveFactor > 0.3)) {
    vec2 glitchOffset = computeGlitchOffset(pos, seed, cyclicTime, uGlitchIntensity);
    pos += glitchOffset;
  }
  
  // Dissolve effect - push points outward in dissolving areas
  if (dissolveFactor > 0.1) {
    // Convert dissolve to outward displacement
    float dissolveDisp = dissolveFactor * 0.15;
    pos.x += dissolveDisp * (seed - 0.5);
    pos.y += dissolveDisp * (hash1(seed * 7.0) - 0.5) * 0.5;
  }
  
  // Apply fit-to-viewport transform (flip Y for canvas coordinates)
  pos = pos * vec2(uTransform.x, -uTransform.y) + vec2(uTransform.z, -uTransform.w);
  
  // Output
  gl_Position = vec4(pos, 0.0, 1.0);
  gl_PointSize = uPointSize * (0.8 + layerType * 0.3); // Slightly larger for atmospheric/accent
}
