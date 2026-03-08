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

// Text-specific layer configs (sparser than motif mode)
export interface TextLayerConfig {
  layer: RenderLayer;
  particleType: ParticleType;
  densityMultiplier: number;
  sizeMultiplier: number;
  erosionBias: number;
}

export const TEXT_LAYER_CONFIGS: TextLayerConfig[] = [
  {
    layer: 'atmospheric',
    particleType: 'dust',
    densityMultiplier: 0.3,
    sizeMultiplier: 0.4,
    erosionBias: 0.35
  },
  {
    layer: 'structural',
    particleType: 'medium',
    densityMultiplier: 0.7,
    sizeMultiplier: 0.9,
    erosionBias: 0.1
  },
  {
    layer: 'accent',
    particleType: 'chunk',
    densityMultiplier: 0.1,
    sizeMultiplier: 1.5,
    erosionBias: 0.0
  }
];

export interface TextData {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  luminance: Float32Array;
}

// Render text to offscreen canvas
export function renderText(text: string, fontSize: number = 64): TextData {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }
  
  // Measure text
  ctx.font = `bold ${fontSize}px Georgia, serif`;
  const metrics = ctx.measureText(text);
  const textWidth = metrics.width;
  const textHeight = fontSize * 1.2;
  
  // Set canvas size with padding
  const padding = 20;
  canvas.width = Math.ceil(textWidth + padding * 2);
  canvas.height = Math.ceil(textHeight + padding * 2);
  
  // Clear and draw text
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  ctx.font = `bold ${fontSize}px Georgia, serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, padding, canvas.height / 2);
  
  // Get pixel data
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;
  
  // Generate luminance map (binary: text = 1, background = 0)
  const luminance = new Float32Array(canvas.width * canvas.height);
  
  for (let i = 0; i < canvas.width * canvas.height; i++) {
    // Use green channel as simple luminance (white text on black background)
    luminance[i] = pixels[i * 4 + 1] / 255;
  }
  
  return {
    canvas,
    width: canvas.width,
    height: canvas.height,
    luminance
  };
}

// Generate point cloud from text with multi-layer approach
export function generatePointCloudFromText(
  textData: TextData,
  density: number,
  seed: number,
  layerConfigs: TextLayerConfig[] = TEXT_LAYER_CONFIGS
): PointCloud {
  const { width, height, luminance } = textData;
  const random = seededRandom(seed);
  
  // Determine grid size based on density (text = sparser than motif)
  const baseGrid = Math.floor(25 + density * 80);
  const gridSize = Math.min(baseGrid, 120);
  
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
      
      // Get weight (text pixels = high weight)
      let weight = luminance[imgIdx] || 0;
      
      // Skip empty areas for structural/accent
      if (weight < 0.1) continue;
      
      // Map to normalized coordinates (-1 to 1), maintaining aspect ratio
      const px = (jx - 0.5) * 1.8 * Math.min(1, aspectRatio);
      const py = (jy - 0.5) * 1.8;
      
      // Generate particles for each layer
      for (let layerIdx = 0; layerIdx < layerConfigs.length; layerIdx++) {
        const config = layerConfigs[layerIdx];
        const layerDensity = density * config.densityMultiplier;
        
        // Atmospheric: appears even outside text (creates ambient feel)
        if (config.layer === 'atmospheric') {
          // Atmospheric particles everywhere
          if (random() < layerDensity * 0.2 + 0.02) {
            const particleWeight = (weight * 0.3 + random() * 0.1) * 0.5;
            
            points.push(
              px + (random() - 0.5) * 0.08,
              py + (random() - 0.5) * 0.08,
              Math.max(0, particleWeight),
              random(),
              layerValues[layerIdx],
              typeValues[layerIdx],
              config.erosionBias
            );
          }
        }
        // Structural: forms the text
        else if (config.layer === 'structural') {
          if (random() < weight * layerDensity * 0.9 + 0.05) {
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
        // Accent: edges and details
        else if (config.layer === 'accent') {
          // Only at edges (where weight is moderate)
          if (weight > 0.2 && weight < 0.8 && random() < weight * layerDensity * 0.4) {
            points.push(
              px, py,
              Math.min(1, weight * 1.4),
              random(),
              layerValues[layerIdx],
              typeValues[layerIdx],
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
