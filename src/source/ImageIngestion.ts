import { 
  createPointCloud, 
  type PointCloud,
  type RenderLayer,
  type ParticleType,
  LAYER_VALUES,
  PARTICLE_TYPE_VALUES,
  STRIDE
} from '../pointcloud/PointCloud';

// Seeded random number generator
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

export interface ImageData {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  luminance: Float32Array;
}

// Load and decode image file
export async function loadImage(file: File): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    
    img.onload = () => {
      // Create offscreen canvas
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to get canvas context'));
        return;
      }
      
      // Scale down large images for performance
      const maxDim = 512;
      let w = img.width;
      let h = img.height;
      
      if (w > maxDim || h > maxDim) {
        const scale = maxDim / Math.max(w, h);
        w = Math.floor(w * scale);
        h = Math.floor(h * scale);
      }
      
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);
      
      // Get pixel data
      const imageData = ctx.getImageData(0, 0, w, h);
      const pixels = imageData.data;
      
      // Generate luminance map
      const luminance = new Float32Array(w * h);
      
      for (let i = 0; i < w * h; i++) {
        const r = pixels[i * 4] / 255;
        const g = pixels[i * 4 + 1] / 255;
        const b = pixels[i * 4 + 2] / 255;
        
        // Luminance formula (ITU-R BT.709)
        luminance[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      }
      
      URL.revokeObjectURL(url);
      
      resolve({
        canvas,
        width: w,
        height: h,
        luminance
      });
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    
    img.src = url;
  });
}

// Compute edge-emphasis map using Sobel operator
export function computeEdgeMap(luminance: Float32Array, width: number, height: number): Float32Array {
  const edges = new Float32Array(width * height);
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      
      // Sobel kernels
      const gx = 
        -luminance[(y - 1) * width + (x - 1)] + luminance[(y - 1) * width + (x + 1)] +
        -2 * luminance[y * width + (x - 1)] + 2 * luminance[y * width + (x + 1)] +
        -luminance[(y + 1) * width + (x - 1)] + luminance[(y + 1) * width + (x + 1)];
        
      const gy = 
        -luminance[(y - 1) * width + (x - 1)] - 2 * luminance[(y - 1) * width + x] - luminance[(y - 1) * width + (x + 1)] +
        luminance[(y + 1) * width + (x - 1)] + 2 * luminance[(y + 1) * width + x] + luminance[(y + 1) * width + (x + 1)];
      
      edges[idx] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  
  // Normalize
  let maxEdge = 0;
  for (let i = 0; i < edges.length; i++) {
    if (edges[i] > maxEdge) maxEdge = edges[i];
  }
  
  if (maxEdge > 0) {
    for (let i = 0; i < edges.length; i++) {
      edges[i] /= maxEdge;
    }
  }
  
  return edges;
}

// Configuration for multi-layer generation
export interface LayerConfig {
  layer: RenderLayer;
  particleType: ParticleType;
  densityMultiplier: number;
  sizeMultiplier: number;
  erosionBias: number; // Directional bias: 0 = none, 1 = max
}

// Default layer configurations for tonal-field aesthetic
export const DEFAULT_LAYER_CONFIGS: LayerConfig[] = [
  {
    layer: 'atmospheric',
    particleType: 'dust',
    densityMultiplier: 0.4,
    sizeMultiplier: 0.6,
    erosionBias: 0.3
  },
  {
    layer: 'structural',
    particleType: 'medium',
    densityMultiplier: 0.8,
    sizeMultiplier: 1.0,
    erosionBias: 0.1
  },
  {
    layer: 'accent',
    particleType: 'chunk',
    densityMultiplier: 0.15,
    sizeMultiplier: 1.8,
    erosionBias: 0.0
  }
];

// Compute focal regions based on luminance (high contrast areas are focal)
function computeFocalMap(luminance: Float32Array, width: number, height: number): Float32Array {
  const focal = new Float32Array(width * height);
  
  for (let y = 2; y < height - 2; y++) {
    for (let x = 2; x < width - 2; x++) {
      const idx = y * width + x;
      
      // Local contrast - difference from neighbors
      const localLum = luminance[idx];
      let contrast = 0;
      
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nIdx = (y + dy) * width + (x + dx);
          contrast += Math.abs(localLum - luminance[nIdx]);
        }
      }
      
      focal[idx] = contrast / 20; // Normalize
    }
  }
  
  // Normalize to 0-1
  let maxFocal = 0;
  for (let i = 0; i < focal.length; i++) {
    if (focal[i] > maxFocal) maxFocal = focal[i];
  }
  if (maxFocal > 0) {
    for (let i = 0; i < focal.length; i++) {
      focal[i] /= maxFocal;
    }
  }
  
  return focal;
}

// Generate point cloud from image with multi-layer approach
export function generatePointCloudFromImage(
  imageData: ImageData,
  density: number,
  seed: number,
  useEdges: boolean = true,
  layerConfigs: LayerConfig[] = DEFAULT_LAYER_CONFIGS
): PointCloud {
  const { width, height, luminance } = imageData;
  const random = seededRandom(seed);
  
  // Compute edge and focal maps
  const edges = useEdges ? computeEdgeMap(luminance, width, height) : null;
  const focalMap = computeFocalMap(luminance, width, height);
  
  // Determine base grid size based on density
  const baseGrid = Math.floor(30 + density * 100);
  const gridSize = Math.min(baseGrid, 150);
  
  const points: number[] = [];
  const aspectRatio = width / height;
  
  // Pre-compute layer and type values
  const layerValues = layerConfigs.map(c => LAYER_VALUES[c.layer]);
  const typeValues = layerConfigs.map(c => PARTICLE_TYPE_VALUES[c.particleType]);
  
  for (let gy = 0; gy < gridSize; gy++) {
    for (let gx = 0; gx < gridSize; gx++) {
      // Jittered sampling
      const jx = (gx + random()) / gridSize;
      const jy = (gy + random()) / gridSize;
      
      // Map to image coordinates
      const ix = Math.floor(jx * width);
      const iy = Math.floor(jy * height);
      const imgIdx = iy * width + ix;
      
      // Get luminance weight
      let weight = luminance[imgIdx] || 0;
      
      // Add edge emphasis
      if (edges && edges[imgIdx] > 0.3) {
        weight = Math.min(1, weight + edges[imgIdx] * 0.5);
      }
      
      // Skip low-weight areas early
      if (weight < 0.05) continue;
      
      const isFocal = focalMap[imgIdx] > 0.3;
      
      // Generate particles for each layer based on config
      for (let layerIdx = 0; layerIdx < layerConfigs.length; layerIdx++) {
        const config = layerConfigs[layerIdx];
        const layerDensity = density * config.densityMultiplier;
        
        // Atmospheric layer: more sparse, scattered everywhere including voids
        if (config.layer === 'atmospheric') {
          // Atmospheric particles appear in both filled and empty areas
          if (random() < layerDensity * 0.3 + 0.02) {
            const px = (jx - 0.5) * 1.8 * Math.min(1, aspectRatio);
            const py = (jy - 0.5) * 1.8;
            const particleWeight = weight * 0.3 + random() * 0.1;
            
            points.push(
              px, py, 
              particleWeight, 
              random(),
              layerValues[layerIdx],
              typeValues[layerIdx],
              config.erosionBias
            );
          }
        }
        // Structural layer: forms the main shape
        else if (config.layer === 'structural') {
          if (random() < weight * layerDensity * 0.8 + 0.05) {
            const px = (jx - 0.5) * 1.8 * Math.min(1, aspectRatio);
            const py = (jy - 0.5) * 1.8;
            
            points.push(
              px, py, 
              weight, 
              random(),
              layerValues[layerIdx],
              typeValues[layerIdx],
              config.erosionBias
            );
          }
        }
        // Accent layer: focal points, chunky particles in high-contrast areas
        else if (config.layer === 'accent') {
          if (isFocal && random() < weight * layerDensity * 0.5) {
            const px = (jx - 0.5) * 1.8 * Math.min(1, aspectRatio);
            const py = (jy - 0.5) * 1.8;
            
            // Occasional streak particles in accent areas
            const useStreak = random() > 0.7;
            
            points.push(
              px, py, 
              Math.min(1, weight * 1.5), 
              random(),
              layerValues[layerIdx],
              useStreak ? PARTICLE_TYPE_VALUES['streak'] : typeValues[layerIdx],
              0
            );
          }
        }
      }
    }
  }
  
  const buffer = new Float32Array(points);
  return createPointCloud(buffer, points.length / STRIDE);
}
