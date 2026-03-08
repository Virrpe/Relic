import { createPointCloud, type PointCloud } from '../pointcloud/PointCloud';

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

// Generate point cloud from image
export function generatePointCloudFromImage(
  imageData: ImageData,
  density: number,
  seed: number,
  useEdges: boolean = true
): PointCloud {
  const { width, height, luminance } = imageData;
  const random = seededRandom(seed);
  
  // Compute edge map for emphasis
  const edges = useEdges ? computeEdgeMap(luminance, width, height) : null;
  
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
      
      // Get luminance weight
      let weight = luminance[imgIdx] || 0;
      
      // Add edge emphasis
      if (edges && edges[imgIdx] > 0.3) {
        weight = Math.min(1, weight + edges[imgIdx] * 0.5);
      }
      
      // Probabilistic inclusion based on weight and density
      if (weight > 0.05 && random() < weight * density * 0.8 + 0.05) {
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
