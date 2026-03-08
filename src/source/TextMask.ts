import { createPointCloud, type PointCloud } from '../pointcloud/PointCloud';

// Seeded random number generator
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

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
    const r = pixels[i * 4];
    const g = pixels[i * 4 + 1];
    const b = pixels[i * 4 + 2];
    
    // Use green channel as simple luminance (white text on black)
    luminance[i] = g / 255;
  }
  
  return {
    canvas,
    width: canvas.width,
    height: canvas.height,
    luminance
  };
}

// Generate point cloud from text
export function generatePointCloudFromText(
  textData: TextData,
  density: number,
  seed: number
): PointCloud {
  const { width, height, luminance } = textData;
  const random = seededRandom(seed);
  
  // Determine grid size based on density
  const baseGrid = Math.floor(30 + density * 100);
  const gridSize = Math.min(baseGrid, 150);
  
  const points: number[] = [];
  const aspectRatio = width / height;
  
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
      
      // Probabilistic inclusion based on weight
      if (weight > 0.1 && random() < weight * density * 0.9 + 0.05) {
        // Map to normalized coordinates (-1 to 1), maintaining aspect ratio
        const px = (jx - 0.5) * 1.8 * Math.min(1, aspectRatio);
        const py = (jy - 0.5) * 1.8;
        
        points.push(px, py, weight, random());
      }
    }
  }
  
  const buffer = new Float32Array(points);
  return createPointCloud(buffer, points.length / 4);
}
