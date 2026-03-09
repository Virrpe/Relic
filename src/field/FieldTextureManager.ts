// FieldTextureManager: Manages GPU texture storage for field-based rendering
// Ingests MotifPack plates and uploads them as WebGL2 textures

import type { MotifPack, GrayImage } from '../source/MotifPack';

// Field indices matching shader expectations
export const FIELD_INDICES = {
  ALPHA: 0,      // alpha (occupancy)
  STRUCTURE: 1,  // structure
  TONE: 2,       // tone
  ACCENT: 3,     // accent
  ATMO: 4,       // atmo
  EDGE: 5,       // edge/distance field
  EROSION: 6     // erosion mask
} as const;

// Maximum field texture resolution
export const MAX_FIELD_SIZE = 1024;
export const MAX_SOURCE_SIZE = 2048;

// Field metadata
export interface FieldMetadata {
  resolution: [number, number];
  bounds: [number, number, number, number]; // [minX, minY, maxX, maxY]
  fieldType: number;
}

// Field textures container
export interface FieldTextures {
  alpha: WebGLTexture | null;
  structure: WebGLTexture | null;
  tone: WebGLTexture | null;
  accent: WebGLTexture | null;
  atmo: WebGLTexture | null;
  edge: WebGLTexture | null;
  erosion: WebGLTexture | null;
}

// Key type for field slots
type FieldSlot = keyof FieldTextures;

export class FieldTextureManager {
  private gl: WebGL2RenderingContext;
  private textures: FieldTextures = {
    alpha: null,
    structure: null,
    tone: null,
    accent: null,
    atmo: null,
    edge: null,
    erosion: null
  };
  
  private metadata: Map<FieldSlot, FieldMetadata> = new Map();
  private isLoaded = false;
  private width = 0;
  private height = 0;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
  }

  // Load MotifPack data into GPU textures
  loadMotifPack(pack: MotifPack): void {
    this.unload();
    
    // Determine target resolution (cap at MAX_FIELD_SIZE)
    this.width = Math.min(pack.width, MAX_FIELD_SIZE);
    this.height = Math.min(pack.height, MAX_FIELD_SIZE);
    
    // Upload required plates
    this.uploadPlate(pack.alpha, 'alpha');
    this.uploadPlate(pack.structure, 'structure');
    this.uploadPlate(pack.tone, 'tone');
    
    // Upload optional plates
    if (pack.accent) {
      this.uploadPlate(pack.accent, 'accent');
    }
    if (pack.atmo) {
      this.uploadPlate(pack.atmo, 'atmo');
    }
    
    // Compute derived fields
    this.computeEdgeField();
    this.computeErosionMask();
    
    this.isLoaded = true;
  }

  // Generate fallback fields from structural map
  loadFromStructuralMap(luminance: Float32Array, srcWidth: number, srcHeight: number): void {
    this.unload();
    
    // Cap resolution
    this.width = Math.min(srcWidth, MAX_FIELD_SIZE);
    this.height = Math.min(srcHeight, MAX_FIELD_SIZE);
    
    // Resample if needed
    const data = this.resampleData(
      luminance,
      srcWidth,
      srcHeight,
      this.width,
      this.height
    );
    
    // Create GrayImage-like objects from raw data
    const grayImage: GrayImage = {
      width: this.width,
      height: this.height,
      data: data
    };
    
    // For fallback, use structural map as alpha, structure, and tone
    this.uploadPlate(grayImage, 'alpha');
    this.uploadPlate(grayImage, 'structure');
    this.uploadPlate(grayImage, 'tone');
    
    // Compute derived fields
    this.computeEdgeField();
    this.computeErosionMask();
    
    this.isLoaded = true;
  }

  // Upload a plate to GPU texture
  private uploadPlate(grayImage: GrayImage, slot: FieldSlot): void {
    const gl = this.gl;
    
    // Resample if needed
    const data = this.resampleData(
      grayImage.data,
      grayImage.width,
      grayImage.height,
      this.width,
      this.height
    );
    
    // Create texture
    const texture = gl.createTexture();
    if (!texture) {
      throw new Error(`Failed to create texture for ${slot}`);
    }
    
    gl.bindTexture(gl.TEXTURE_2D, texture);
    
    // Upload as RED channel (grayscale)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R32F,
      this.width,
      this.height,
      0,
      gl.RED,
      gl.FLOAT,
      data
    );
    
    // Set texture filtering
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    
    this.textures[slot] = texture;
    
    // Store metadata
    this.metadata.set(slot, {
      resolution: [this.width, this.height],
      bounds: [0, 0, 1, 1],
      fieldType: FIELD_INDICES[slot.toUpperCase() as keyof typeof FIELD_INDICES] as number
    });
  }

  // Compute edge/distance field from alpha
  private computeEdgeField(): void {
    const gl = this.gl;
    const data = this.getTextureData(this.textures.alpha);
    if (!data) return;
    
    // Simple edge detection using Sobel-like operator
    const edgeData = new Float32Array(this.width * this.height);
    
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const idx = y * this.width + x;
        
        // Get neighbors
        const left = x > 0 ? data[idx - 1] : data[idx];
        const right = x < this.width - 1 ? data[idx + 1] : data[idx];
        const top = y > 0 ? data[idx - this.width] : data[idx];
        const bottom = y < this.height - 1 ? data[idx + this.width] : data[idx];
        
        // Sobel operator
        const gx = (right - left) * 0.5;
        const gy = (bottom - top) * 0.5;
        const edge = Math.sqrt(gx * gx + gy * gy);
        
        // Store edge intensity
        edgeData[idx] = Math.min(edge * 4.0, 1.0);
      }
    }
    
    // Upload edge texture
    const texture = gl.createTexture();
    if (!texture) return;
    
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R32F,
      this.width,
      this.height,
      0,
      gl.RED,
      gl.FLOAT,
      edgeData
    );
    
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    
    this.textures.edge = texture;
    
    this.metadata.set('edge', {
      resolution: [this.width, this.height],
      bounds: [0, 0, 1, 1],
      fieldType: FIELD_INDICES.EDGE as number
    });
  }

  // Compute erosion mask from alpha (radial gradient from edges)
  private computeErosionMask(): void {
    const gl = this.gl;
    const alphaData = this.getTextureData(this.textures.alpha);
    if (!alphaData) return;
    
    const erosionData = new Float32Array(this.width * this.height);
    
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const idx = y * this.width + x;
        
        // Normalized coordinates
        const nx = x / this.width;
        const ny = y / this.height;
        
        // Distance from edges (radial)
        const distFromLeft = nx;
        const distFromRight = 1.0 - nx;
        const distFromTop = ny;
        const distFromBottom = 1.0 - ny;
        
        // Minimum distance from any edge
        const edgeDist = Math.min(
          distFromLeft,
          distFromRight,
          distFromTop,
          distFromBottom
        );
        
        // Factor in alpha value (areas with alpha erode last)
        const alpha = alphaData[idx];
        
        // Erosion mask: closer to edges = more erosion
        erosionData[idx] = 1.0 - edgeDist * (1.0 - alpha * 0.5);
      }
    }
    
    // Upload erosion texture
    const texture = gl.createTexture();
    if (!texture) return;
    
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R32F,
      this.width,
      this.height,
      0,
      gl.RED,
      gl.FLOAT,
      erosionData
    );
    
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    
    this.textures.erosion = texture;
    
    this.metadata.set('erosion', {
      resolution: [this.width, this.height],
      bounds: [0, 0, 1, 1],
      fieldType: FIELD_INDICES.EROSION as number
    });
  }

  // Resample data to target resolution using bilinear interpolation
  private resampleData(
    srcData: Float32Array,
    srcWidth: number,
    srcHeight: number,
    dstWidth: number,
    dstHeight: number
  ): Float32Array {
    if (srcWidth === dstWidth && srcHeight === dstHeight) {
      return srcData;
    }
    
    const dstData = new Float32Array(dstWidth * dstHeight);
    
    for (let dy = 0; dy < dstHeight; dy++) {
      for (let dx = 0; dx < dstWidth; dx++) {
        // Source coordinates
        const sx = (dx / dstWidth) * (srcWidth - 1);
        const sy = (dy / dstHeight) * (srcHeight - 1);
        
        // Integer indices
        const sx0 = Math.floor(sx);
        const sy0 = Math.floor(sy);
        const sx1 = Math.min(sx0 + 1, srcWidth - 1);
        const sy1 = Math.min(sy0 + 1, srcHeight - 1);
        
        // Fractional parts
        const fx = sx - sx0;
        const fy = sy - sy0;
        
        // Bilinear interpolation
        const v00 = srcData[sy0 * srcWidth + sx0];
        const v10 = srcData[sy0 * srcWidth + sx1];
        const v01 = srcData[sy1 * srcWidth + sx0];
        const v11 = srcData[sy1 * srcWidth + sx1];
        
        const v0 = v00 * (1 - fx) + v10 * fx;
        const v1 = v01 * (1 - fx) + v11 * fx;
        
        dstData[dy * dstWidth + dx] = v0 * (1 - fy) + v1 * fy;
      }
    }
    
    return dstData;
  }

  // Get texture data for computation (reads back from GPU)
  // Using a framebuffer to read back texture data
  private getTextureData(texture: WebGLTexture | null): Float32Array | null {
    if (!texture) return null;
    
    const gl = this.gl;
    const data = new Float32Array(this.width * this.height);
    
    // Create framebuffer
    const fb = gl.createFramebuffer();
    if (!fb) return null;
    
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    
    // Read pixels
    gl.readPixels(0, 0, this.width, this.height, gl.RED, gl.FLOAT, data);
    
    // Cleanup
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fb);
    
    return data;
  }

  // Bind all textures to texture units
  bindTextures(unitStart: number = 0): void {
    const gl = this.gl;
    
    const slots: FieldSlot[] = [
      'alpha', 'structure', 'tone', 'accent', 'atmo', 'edge', 'erosion'
    ];
    
    slots.forEach((slot, index) => {
      const texture = this.textures[slot];
      if (texture) {
        gl.activeTexture(gl.TEXTURE0 + unitStart + index);
        gl.bindTexture(gl.TEXTURE_2D, texture);
      }
    });
  }

  // Get texture by field index
  getTexture(index: number): WebGLTexture | null {
    const slots: FieldSlot[] = [
      'alpha', 'structure', 'tone', 'accent', 'atmo', 'edge', 'erosion'
    ];
    return this.textures[slots[index]] ?? null;
  }

  // Get field resolution
  getResolution(): [number, number] {
    return [this.width, this.height];
  }

  // Check if data is loaded
  isReady(): boolean {
    return this.isLoaded;
  }

  // Get metadata for a field
  getMetadata(slot: FieldSlot): FieldMetadata | undefined {
    return this.metadata.get(slot);
  }

  // Clean up textures
  unload(): void {
    const gl = this.gl;
    
    Object.values(this.textures).forEach(texture => {
      if (texture) {
        gl.deleteTexture(texture);
      }
    });
    
    this.textures = {
      alpha: null,
      structure: null,
      tone: null,
      accent: null,
      atmo: null,
      edge: null,
      erosion: null
    };
    
    this.metadata.clear();
    this.isLoaded = false;
    this.width = 0;
    this.height = 0;
  }

  // Destroy manager
  destroy(): void {
    this.unload();
  }
}
