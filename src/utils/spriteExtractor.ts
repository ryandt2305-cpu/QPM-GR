// src/utils/spriteExtractor.ts - Extract crop/pet sprites from game's Pixi.js renderer
// Access game's texture cache directly instead of intercepting loads

import { log } from './logger';

interface SpriteSheet {
  url: string;
  image: HTMLImageElement;
  tileSize: number; // 256 or 512
  tilesPerRow: number;
  tilesPerColumn: number;
  loaded: boolean;
}

interface SpriteTile {
  canvas: HTMLCanvasElement;
  sheet: string;
  index: number;
}

class SpriteExtractor {
  private sheets = new Map<string, SpriteSheet>();
  private tiles = new Map<string, SpriteTile>();
  private initialized = false;
  private scanInterval: number | null = null;

  /**
   * Initialize sprite extraction by scanning Pixi texture cache
   * Waits for game to fully load before starting
   */
  init(): void {
    if (this.initialized) return;
    this.initialized = true;

    log('🖼️ Initializing sprite extractor (waiting for game)...');

    // Wait for Pixi to be available before starting
    this.waitForPixi();
  }

  /**
   * Wait for game to load and find sprite sheet URL
   */
  private async waitForPixi(): Promise<void> {
    log('🔍 Looking for game sprite sheets...');
    
    // Wait for canvas to appear
    const waitForCanvas = async () => {
      for (let i = 0; i < 60; i++) {
        const canvas = document.querySelector('canvas');
        if (canvas) return canvas;
        await new Promise(r => setTimeout(r, 500));
      }
      return null;
    };

    const canvas = await waitForCanvas();
    if (!canvas) {
      log('⚠️ Canvas not found');
      return;
    }

    // Wait for game to load assets
    await new Promise(r => setTimeout(r, 3000));
    
    // Find plants.png sprite sheet from network resources
    let plantsUrl: string | null = null;
    
    if (performance && performance.getEntriesByType) {
      const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      const plantsResource = resources.find(r => r.name.includes('/assets/tiles/plants.png'));
      if (plantsResource) {
        plantsUrl = plantsResource.name;
      }
    }
    
    if (!plantsUrl) {
      // Fallback: construct URL from base
      plantsUrl = 'https://magicgarden.gg/version/19aaa98/assets/tiles/plants.png';
      log('  Using default plants.png URL');
    }
    
    log(`✅ Found plants sprite sheet: ${plantsUrl}`);
    
    // Load the sprite sheet
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      log(`✅ Loaded plants.png (${img.width}x${img.height})`);
      this.processSheet('plants', img);
    };
    img.onerror = () => {
      log('⚠️ Failed to load plants.png');
    };
    img.src = plantsUrl;
  }

  /**
   * Scan Pixi.js texture cache for sprite sheets
   */
  private scanPixiTextures(): void {
    try {
      // Access Pixi from global scope (game loads it)
      const PIXI = (window as any).PIXI;
      if (!PIXI || !PIXI.utils || !PIXI.utils.TextureCache) {
        log('⚠️ Pixi TextureCache not found yet, will retry...');
        return;
      }

      const textureCache = PIXI.utils.TextureCache;
      let newTexturesFound = 0;

      for (const key in textureCache) {
        if (!textureCache.hasOwnProperty(key)) continue;
        
        const texture = textureCache[key];
        if (!texture || !texture.baseTexture || !texture.baseTexture.resource) continue;

        const source = texture.baseTexture.resource.source;
        if (!(source instanceof HTMLImageElement) && !(source instanceof HTMLCanvasElement)) continue;

        // Check if this looks like a plant/crop sprite sheet
        const keyLower = key.toLowerCase();
        if (!keyLower.includes('plant') && !keyLower.includes('crop') && !keyLower.includes('prod-plants')) continue;

        // Get image element
        let img: HTMLImageElement;
        if (source instanceof HTMLCanvasElement) {
          // Convert canvas to image
          img = new Image();
          img.src = source.toDataURL();
        } else {
          img = source;
        }

        // Check if already processed
        const sheetName = this.getSheetNameFromKey(key);
        if (this.sheets.has(sheetName)) continue;

        // Process this sheet
        if (img.complete && img.naturalWidth > 0) {
          this.processSheet(key, img);
          newTexturesFound++;
        } else {
          img.addEventListener('load', () => this.processSheet(key, img), { once: true });
        }
      }

      if (newTexturesFound > 0) {
        log(`🖼️ Found ${newTexturesFound} new sprite sheets in Pixi cache`);
      }
    } catch (error) {
      log('⚠️ Error scanning Pixi textures:', error);
    }
  }

  /**
   * Get sheet name from Pixi texture key
   */
  private getSheetNameFromKey(key: string): string {
    // Extract meaningful name from Pixi texture key
    // Examples: "prod-plants-v2" or "assets/plants.png"
    const lower = key.toLowerCase();
    if (lower.includes('prod-plants')) return 'prod-plants';
    if (lower.includes('plant')) return 'plants';
    if (lower.includes('crop')) return 'crops';
    return key.split('/').pop()?.split('.')[0] || 'unknown';
  }

  /**
   * Process a sprite sheet and slice it into tiles
   */
  private processSheet(key: string, img: HTMLImageElement): void {
    if (img.naturalWidth === 0 || img.naturalHeight === 0) return;

    // Detect tile size (256px or 512px)
    const tileSize = img.naturalWidth >= 4096 ? 512 : 256;
    const tilesPerRow = Math.floor(img.naturalWidth / tileSize);
    const tilesPerColumn = Math.floor(img.naturalHeight / tileSize);

    const sheetName = this.getSheetNameFromKey(key);

    log(`🖼️ Processing sprite sheet: ${sheetName} (${tilesPerRow}x${tilesPerColumn} tiles @ ${tileSize}px) from ${key}`);

    this.sheets.set(sheetName, {
      url: key,
      image: img,
      tileSize,
      tilesPerRow,
      tilesPerColumn,
      loaded: true,
    });

    // Pre-slice tiles for common indices (0-100) for performance
    for (let i = 0; i < Math.min(100, tilesPerRow * tilesPerColumn); i++) {
      this.getTile(sheetName, i);
    }
  }

  /**
   * Get a specific tile from a sheet
   */
  getTile(sheetName: string, index: number): HTMLCanvasElement | null {
    const key = `${sheetName}-${index}`;

    // Return cached tile
    if (this.tiles.has(key)) {
      return this.tiles.get(key)!.canvas;
    }

    const sheet = this.sheets.get(sheetName);
    if (!sheet || !sheet.loaded) return null;

    // Calculate tile position in sheet
    const row = Math.floor(index / sheet.tilesPerRow);
    const col = index % sheet.tilesPerRow;

    if (row >= sheet.tilesPerColumn) return null;

    // Create canvas and extract tile
    const canvas = document.createElement('canvas');
    canvas.width = sheet.tileSize;
    canvas.height = sheet.tileSize;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return null;

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      sheet.image,
      col * sheet.tileSize,
      row * sheet.tileSize,
      sheet.tileSize,
      sheet.tileSize,
      0,
      0,
      sheet.tileSize,
      sheet.tileSize
    );

    // Check if tile is blank (all transparent or all white)
    const imageData = ctx.getImageData(0, 0, sheet.tileSize, sheet.tileSize);
    const data = imageData.data;
    let hasPixels = false;
    for (let i = 3; i < data.length; i += 4) {
      const alpha = data[i];
      const r = data[i - 3];
      const g = data[i - 2];
      const b = data[i - 1];
      if (alpha !== undefined && r !== undefined && g !== undefined && b !== undefined) {
        if (alpha > 0 && (r !== 255 || g !== 255 || b !== 255)) {
          hasPixels = true;
          break;
        }
      }
    }

    if (!hasPixels) return null;

    // Cache tile
    this.tiles.set(key, { canvas, sheet: sheetName, index });
    return canvas;
  }

  /**
   * Get crop sprite by species name
   */
  getCropSprite(species: string): HTMLCanvasElement | null {
    // Try common plant sheet names
    const sheetNames = ['plants', 'allplants', 'plant', 'crops', 'prod-plants', 'prod-plants-v2'];
    
    // Species to index mapping (will need to be expanded based on game data)
    const speciesIndex = this.getCropSpriteIndex(species.toLowerCase());
    if (speciesIndex === null) return null;

    for (const sheetName of sheetNames) {
      const tile = this.getTile(sheetName, speciesIndex);
      if (tile) return tile;
    }

    return null;
  }

  /**
   * Map crop species to sprite index
   * Based on actual game's plants.png sprite sheet (10x6 grid = 60 tiles, 256px each)
   * Verified mapping from in-game sprite sheet
   */
  private getCropSpriteIndex(species: string): number | null {
    const mapping: Record<string, number> = {
      // Row 1 (10-19)
      'daffodil': 10,
      'tulip': 11,
      'orangetulip': 11, // Orange Tulip variant
      'sunflower': 12,
      'lily': 13,
      'starweaver': 14,
      'chrysanthemum': 15,
      'aloe': 16,
      'cactus': 18,
      'bamboo': 19,
      
      // Row 2 (20-29)
      'blueberry': 20,
      'banana': 21,
      'strawberry': 22,
      'grape': 24,
      'watermelon': 25,
      'lemon': 26,
      'apple': 27,
      
      // Row 3 (30-39)
      'pepper': 30,
      'tomato': 31,
      'carrot': 33,
      'pumpkin': 34,
      'corn': 35,
      'fava bean': 36,
      'favabean': 36, // alias
      'cacao': 37,
      'cacaobean': 37, // alias
      'lychee': 39,
      
      // Row 4 (40-49)
      'coconut': 40,
      'passion fruit': 42,
      'passionfruit': 42, // alias
      'dragon fruit': 43,
      'dragonfruit': 43, // alias
      'mushroom': 45,
      'burro\'s tail': 46,
      'burrostail': 46, // alias
      'echeveria': 48,
      'delphinium': 49,
      
      // Row 5 (50-59)
      'dawnbinder': 50,
      'dawncelestial': 50, // alias
      'moonbinder': 51,
      'mooncelestial': 51, // alias
      'camellia': 57,
      'squash': 59,
    };

    const index = mapping[species];
    if (index === undefined) {
      log(`⚠️ Unknown crop species: "${species}"`);
      return null;
    }

    return index;
  }

  /**
   * Get all available sheets
   */
  getSheets(): string[] {
    return Array.from(this.sheets.keys());
  }

  /**
   * Check if sprites are loaded
   */
  isReady(): boolean {
    return this.sheets.size > 0;
  }
}

// Global singleton instance
export const spriteExtractor = new SpriteExtractor();

/**
 * Get crop sprite as data URL for use in CSS background-image
 */
export function getCropSpriteDataUrl(species: string): string | null {
  const canvas = spriteExtractor.getCropSprite(species);
  if (!canvas) return null;

  try {
    return canvas.toDataURL('image/png');
  } catch (e) {
    log(`⚠️ Failed to convert sprite to data URL for ${species}`, e);
    return null;
  }
}

/**
 * Create a sprite element for rendering in UI
 */
export function createSpriteElement(species: string, size: number = 24): HTMLElement | null {
  const canvas = spriteExtractor.getCropSprite(species);
  if (!canvas) return null;

  const div = document.createElement('div');
  div.style.cssText = `
    width: ${size}px;
    height: ${size}px;
    background-size: contain;
    background-repeat: no-repeat;
    background-position: center;
    flex-shrink: 0;
    image-rendering: pixelated;
    image-rendering: -moz-crisp-edges;
    image-rendering: crisp-edges;
  `;

  try {
    div.style.backgroundImage = `url(${canvas.toDataURL('image/png')})`;
  } catch (e) {
    log(`⚠️ Failed to create sprite element for ${species}`, e);
    return null;
  }

  return div;
}
