// MotifPack: Multi-plate semantic motif pack ingestion system
// Enables structured control over silhouette, structure, tone, accent, and atmosphere layers

import { loadImage as loadImageData } from './ImageIngestion';

// GrayImage: Single grayscale plate
export interface GrayImage {
  width: number;
  height: number;
  data: Float32Array;  // normalized 0..1
  canvas?: HTMLCanvasElement;  // for preview
}

// MotifPack: Collection of semantic plates
export interface MotifPack {
  id: string;
  width: number;
  height: number;
  alpha: GrayImage;           // required - silhouette / occupancy truth
  structure: GrayImage;        // required - structural importance / preservation map
  tone: GrayImage;            // required - dirty tonal body / density modulation
  accent: GrayImage | null;   // optional - sparse focal highlights / glitch anchor zones
  atmo: GrayImage | null;     // optional - atmosphere seed map
  master: GrayImage | null;   // optional - reference only
}

// Plate file input mapping
export interface PlateUploadSlots {
  alpha: File | null;
  structure: File | null;
  tone: File | null;
  accent: File | null;
  atmo: File | null;
  master: File | null;
}

// Diagnostic view modes
export type DiagnosticView = 
  | 'alpha' 
  | 'structure' 
  | 'tone' 
  | 'accent' 
  | 'atmo' 
  | 'alpha-structure' 
  | 'alpha-structure-tone' 
  | 'full';

// Validation result
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  width?: number;
  height?: number;
}

// Load and decode grayscale image file
export async function loadGrayImage(file: File): Promise<GrayImage> {
  const imageData = await loadImageData(file);
  
  // Convert to grayscale (ImageIngestion already does this)
  // Just extract the luminance data
  const gray: GrayImage = {
    width: imageData.width,
    height: imageData.height,
    data: imageData.luminance,
    canvas: imageData.canvas
  };
  
  return gray;
}

// Validate uploaded plates - check dimensions match
export function validatePlates(
  plates: Partial<PlateUploadSlots>
): ValidationResult {
  const errors: string[] = [];
  
  // Required plates
  const required: (keyof PlateUploadSlots)[] = ['alpha', 'structure', 'tone'];
  
  for (const plateType of required) {
    const file = plates[plateType];
    if (!file) {
      errors.push(`${plateType} plate is required`);
    }
  }
  
  if (errors.length > 0) {
    return { valid: false, errors };
  }
  
  // Load images to check dimensions
  // We'll do this asynchronously in loadMotifPack
  return { valid: true, errors: [] };
}

// Load complete MotifPack from uploaded files
export async function loadMotifPack(
  plates: PlateUploadSlots,
  packId: string = `pack-${Date.now()}`
): Promise<MotifPack> {
  // Load all plates in parallel
  const loadPromises: Promise<{ key: string; image: GrayImage }>[] = [];
  
  const plateKeys: (keyof PlateUploadSlots)[] = ['alpha', 'structure', 'tone', 'accent', 'atmo', 'master'];
  
  for (const key of plateKeys) {
    const file = plates[key];
    if (file) {
      loadPromises.push(
        loadGrayImage(file).then(image => ({ key, image }))
      );
    }
  }
  
  const loadedPlates = await Promise.all(loadPromises);
  
  // Extract dimensions from first plate
  const firstPlate = loadedPlates[0];
  const width = firstPlate.image.width;
  const height = firstPlate.image.height;
  
  // Validate all plates have same dimensions
  for (const { key, image } of loadedPlates) {
    if (image.width !== width || image.height !== height) {
      throw new Error(`Plate "${key}" has mismatched dimensions: ${image.width}x${image.height}, expected ${width}x${height}`);
    }
  }
  
  // Build the MotifPack object
  const pack: MotifPack = {
    id: packId,
    width,
    height,
    alpha: null as any,
    structure: null as any,
    tone: null as any,
    accent: null,
    atmo: null,
    master: null
  };
  
  for (const { key, image } of loadedPlates) {
    switch (key) {
      case 'alpha':
        pack.alpha = image;
        break;
      case 'structure':
        pack.structure = image;
        break;
      case 'tone':
        pack.tone = image;
        break;
      case 'accent':
        pack.accent = image;
        break;
      case 'atmo':
        pack.atmo = image;
        break;
      case 'master':
        pack.master = image;
        break;
    }
  }
  
  // Final validation - ensure required plates are present
  if (!pack.alpha || !pack.structure || !pack.tone) {
    throw new Error('Missing required plates (alpha, structure, tone)');
  }
  
  return pack;
}

// Generate preview canvas for a GrayImage
export function createPreviewCanvas(grayImage: GrayImage, maxSize: number = 80): HTMLCanvasElement {
  const { width, height, data } = grayImage;
  
  // Scale down for preview
  const scale = Math.min(1, maxSize / Math.max(width, height));
  const previewWidth = Math.floor(width * scale);
  const previewHeight = Math.floor(height * scale);
  
  const canvas = document.createElement('canvas');
  canvas.width = previewWidth;
  canvas.height = previewHeight;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  
  const imageData = ctx.createImageData(previewWidth, previewHeight);
  const pixels = imageData.data;
  
  for (let y = 0; y < previewHeight; y++) {
    for (let x = 0; x < previewWidth; x++) {
      // Map back to original coordinates
      const srcX = Math.floor(x / scale);
      const srcY = Math.floor(y / scale);
      const srcIdx = srcY * width + srcX;
      const dstIdx = (y * previewWidth + x) * 4;
      
      const value = Math.floor(data[srcIdx] * 255);
      pixels[dstIdx] = value;     // R
      pixels[dstIdx + 1] = value; // G
      pixels[dstIdx + 2] = value; // B
      pixels[dstIdx + 3] = 255;   // A
    }
  }
  
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

// Get diagnostic preview combining multiple plates
export function createDiagnosticPreview(
  pack: MotifPack,
  view: DiagnosticView
): HTMLCanvasElement {
  const { width, height } = pack;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  
  const imageData = ctx.createImageData(width, height);
  const pixels = imageData.data;
  
  // Combine plates based on view mode
  for (let i = 0; i < width * height; i++) {
    let value = 0;
    
    switch (view) {
      case 'alpha':
        value = pack.alpha.data[i];
        break;
      case 'structure':
        value = pack.structure.data[i];
        break;
      case 'tone':
        value = pack.tone.data[i];
        break;
      case 'accent':
        value = pack.accent?.data[i] ?? 0;
        break;
      case 'atmo':
        value = pack.atmo?.data[i] ?? 0;
        break;
      case 'alpha-structure':
        value = (pack.alpha.data[i] + pack.structure.data[i]) / 2;
        break;
      case 'alpha-structure-tone':
        value = (pack.alpha.data[i] + pack.structure.data[i] + pack.tone.data[i]) / 3;
        break;
      case 'full':
        // Weighted combination of all plates
        let total = pack.alpha.data[i] + pack.structure.data[i] + pack.tone.data[i];
        if (pack.accent) total += pack.accent.data[i] * 0.5;
        if (pack.atmo) total += pack.atmo.data[i] * 0.3;
        value = total / 3.5;
        break;
    }
    
    const byteValue = Math.floor(Math.min(1, value) * 255);
    pixels[i * 4] = byteValue;
    pixels[i * 4 + 1] = byteValue;
    pixels[i * 4 + 2] = byteValue;
    pixels[i * 4 + 3] = 255;
  }
  
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

// Create empty plate upload slots
export function createEmptyPlateSlots(): PlateUploadSlots {
  return {
    alpha: null,
    structure: null,
    tone: null,
    accent: null,
    atmo: null,
    master: null
  };
}
