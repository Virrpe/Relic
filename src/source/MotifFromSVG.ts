import skullSvg from './motifs/skull.svg?raw';
import mothSvg from './motifs/moth.svg?raw';

export interface MotifData {
  luminance: Float32Array;
  width: number;
  height: number;
}

// Parse SVG and render to canvas to get luminance data
async function svgToLuminance(svgString: string, width: number, height: number): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    // Create an offscreen canvas
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      reject(new Error('Failed to get 2D context'));
      return;
    }
    
    // Fill with black (empty space)
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, width, height);
    
    // Create image from SVG
    const img = new Image();
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(svgBlob);
    
    img.onload = () => {
      // Draw SVG centered and scaled
      const scale = Math.min(width / 100, height / 100) * 0.9;
      const offsetX = (width - 100 * scale) / 2;
      const offsetY = (height - 100 * scale) / 2;
      
      ctx.drawImage(img, offsetX, offsetY, 100 * scale, 100 * scale);
      
      // Get pixel data
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      
      // Convert to luminance
      const luminance = new Float32Array(width * height);
      for (let i = 0; i < width * height; i++) {
        const r = data[i * 4];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];
        // Standard luminance formula
        luminance[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      }
      
      URL.revokeObjectURL(url);
      resolve(luminance);
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load SVG'));
    };
    
    img.src = url;
  });
}

// Resolution for motif generation
const MOTIF_RESOLUTION = 256;

export async function loadSkullMotif(): Promise<MotifData> {
  const luminance = await svgToLuminance(skullSvg, MOTIF_RESOLUTION, MOTIF_RESOLUTION);
  return {
    luminance,
    width: MOTIF_RESOLUTION,
    height: MOTIF_RESOLUTION
  };
}

export async function loadMothMotif(): Promise<MotifData> {
  const luminance = await svgToLuminance(mothSvg, MOTIF_RESOLUTION, MOTIF_RESOLUTION);
  return {
    luminance,
    width: MOTIF_RESOLUTION,
    height: MOTIF_RESOLUTION
  };
}

// Cache for motifs
let skullMotifCache: MotifData | null = null;
let mothMotifCache: MotifData | null = null;

export async function getSkullMotif(): Promise<MotifData> {
  if (!skullMotifCache) {
    skullMotifCache = await loadSkullMotif();
  }
  return skullMotifCache;
}

export async function getMothMotif(): Promise<MotifData> {
  if (!mothMotifCache) {
    mothMotifCache = await loadMothMotif();
  }
  return mothMotifCache;
}
