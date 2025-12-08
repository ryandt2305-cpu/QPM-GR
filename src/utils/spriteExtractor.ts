// src/utils/spriteExtractor.ts - Extract crop/pet sprites from game's Pixi.js renderer
// Access game's texture cache directly instead of intercepting loads

import { log } from './logger';

declare const unsafeWindow: (Window & typeof globalThis) | undefined;

function getRuntimeWindow(): Window & typeof globalThis {
  if (typeof unsafeWindow !== 'undefined' && unsafeWindow) {
    return unsafeWindow;
  }
  return window;
}

function getRuntimeDocument(): Document | null {
  const runtimeWindow = getRuntimeWindow();
  return runtimeWindow.document || null;
}

type SpriteCategory = 'plants' | 'pets' | 'unknown';

interface TrackedSpriteResource {
  url: string;
  sources: Set<string>;
  lastSeen: number;
  category: SpriteCategory;
}

const trackedSpriteResources = new Map<string, TrackedSpriteResource>();
let spriteResourceSnifferStarted = false;
const loadedExternalSpriteUrls = new Set<string>();

const SPRITE_URL_HINTS = [
  /\/assets\/(tiles|plants|allplants|pets|animals|sprites|atlas)\//i,
  /(plants?|crops?|pet|animal|creature|mob|atlas|sheet)\.(png|webp)$/i,
];

const PET_URL_HINT = /(pet|animal|creature|mob)/i;
const PLANT_URL_HINT = /(plant|crop|tile)/i;

const DEFAULT_PLANT_SHEET_URL = 'https://magicgarden.gg/version/19aaa98/assets/tiles/plants.png';
const DEFAULT_TALL_PLANT_SHEET_URL = 'https://magicgarden.gg/version/436ff68/assets/tiles/tallplants.png';
const DEFAULT_PET_SHEET_URL = 'https://magicgarden.gg/version/19aaa98/assets/tiles/pets.png';
const DEFAULT_MUTATION_OVERLAYS_URL = 'https://magicgarden.gg/version/19aaa98/assets/tiles/mutation-overlays.png';

const PET_TILE_MAP: Record<string, number> = {
  bee: 0,
  chicken: 1,
  bunny: 2,
  turtle: 3,
  capybara: 4,
  cow: 5,
  pig: 6,
  butterfly: 7,
  snail: 8,
  worm: 9,
  commonegg: 10,
  uncommonegg: 11,
  rareegg: 12,
  legendaryegg: 13,
  mythicalegg: 14,
  divineegg: 15,
  celestialegg: 16,
  squirrel: 17,
  goat: 18,
  dragonfly: 19,
  turkey: 28,
  peacock: 29,
};

const MUTATION_OVERLAY_TILE_MAP: Record<string, number> = {
  gold: 35,
  rainbow: 44,
};

function normalizeSpriteUrl(url: string): string {
  if (!url) return '';
  const trimmed = url.split('#')[0] || url;
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return trimmed;
  }
  try {
    if (typeof window !== 'undefined') {
      const normalized = new URL(trimmed, window.location.href);
      normalized.hash = '';
      return normalized.href;
    }
  } catch {
    // Ignore parsing issues and fall back to trimmed URL
  }
  return trimmed;
}

function looksLikeSpriteResource(url: string): boolean {
  return SPRITE_URL_HINTS.some(pattern => pattern.test(url));
}

function classifySpriteResource(url: string): SpriteCategory {
  if (PET_URL_HINT.test(url)) return 'pets';
  if (PLANT_URL_HINT.test(url)) return 'plants';
  return 'unknown';
}

function createImageElement(): HTMLImageElement {
  const runtimeWindow = getRuntimeWindow();
  const ImageCtor = runtimeWindow.Image ?? Image;
  return new ImageCtor();
}

function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    try {
      const img = createImageElement();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = (event) => reject(event);
      img.src = url;
    } catch (error) {
      reject(error);
    }
  });
}

function trackSpriteResource(input: string | null | undefined, source: string): void {
  if (typeof window === 'undefined' || !input) return;
  const normalized = normalizeSpriteUrl(String(input));
  if (!normalized || !looksLikeSpriteResource(normalized)) return;

  const existing = trackedSpriteResources.get(normalized);
  const category = classifySpriteResource(normalized);
  if (existing) {
    existing.sources.add(source);
    existing.lastSeen = Date.now();
    if (existing.category === 'unknown' && category !== 'unknown') {
      existing.category = category;
    }
    return;
  }

  trackedSpriteResources.set(normalized, {
    url: normalized,
    sources: new Set([source]),
    lastSeen: Date.now(),
    category,
  });
}

function getTrackedSpriteResources(category: SpriteCategory | 'all' = 'all'): Array<{url: string; sources: string[]; lastSeen: number; category: SpriteCategory}> {
  const items = Array.from(trackedSpriteResources.values());
  const filtered = category === 'all' ? items : items.filter(item => item.category === category);
  return filtered
    .sort((a, b) => b.lastSeen - a.lastSeen)
    .map(item => ({
      url: item.url,
      sources: Array.from(item.sources),
      lastSeen: item.lastSeen,
      category: item.category,
    }));
}

function startSpriteResourceSniffer(): void {
  if (spriteResourceSnifferStarted) {
    return;
  }

  const runtimeWindow = getRuntimeWindow();
  const runtimeDocument = getRuntimeDocument();
  if (!runtimeWindow || !runtimeDocument) {
    return;
  }

  spriteResourceSnifferStarted = true;

  const perf = runtimeWindow.performance ?? performance;
  if (perf && typeof perf.getEntriesByType === 'function') {
    try {
      const entries = perf.getEntriesByType('resource') as PerformanceResourceTiming[];
      entries.forEach(entry => trackSpriteResource(entry.name, 'perf.initial'));
    } catch (error) {
      log('⚠️ Failed to read initial performance entries for sprite sniffing', error);
    }
  }

  const PerfObserverCtor = runtimeWindow.PerformanceObserver ?? PerformanceObserver;
  if (typeof PerfObserverCtor !== 'undefined') {
    try {
      const observer = new PerfObserverCtor((list: PerformanceObserverEntryList) => {
        list.getEntries().forEach(entry => {
          const name = (entry as PerformanceResourceTiming).name;
          if (name) {
            trackSpriteResource(name, 'perf.observer');
          }
        });
      });
      observer.observe({ entryTypes: ['resource'] });
    } catch (error) {
      log('⚠️ Failed to start sprite PerformanceObserver', error);
    }
  }

  const ImageCtor = runtimeWindow.HTMLImageElement ?? HTMLImageElement;
  if (ImageCtor) {
    try {
      const descriptor = Object.getOwnPropertyDescriptor(ImageCtor.prototype, 'src');
      if (descriptor && typeof descriptor.set === 'function') {
        const originalSetter = descriptor.set;
        const newDescriptor: PropertyDescriptor = {
          configurable: descriptor.configurable ?? true,
          enumerable: descriptor.enumerable ?? false,
        };
        if (descriptor.get) {
          newDescriptor.get = descriptor.get.bind(ImageCtor.prototype);
        }
        newDescriptor.set = function setSpriteSrc(this: HTMLImageElement, value: string): void {
          if (typeof value === 'string') {
            trackSpriteResource(value, 'img.src');
          }
          return originalSetter.call(this, value);
        };
        Object.defineProperty(ImageCtor.prototype, 'src', newDescriptor);
      }
    } catch (error) {
      log('⚠️ Failed to hook HTMLImageElement.src for sprite sniffing', error);
    }
  }

  if (ImageCtor) {
    try {
      const nativeSetAttribute = ImageCtor.prototype.setAttribute;
      ImageCtor.prototype.setAttribute = function patchedSetAttribute(name: string, value: string): void {
        if (typeof name === 'string' && name.toLowerCase() === 'src' && typeof value === 'string') {
          trackSpriteResource(value, 'img.setAttribute');
        }
        return nativeSetAttribute.call(this, name, value);
      };
    } catch (error) {
      log('⚠️ Failed to hook HTMLImageElement.setAttribute for sprite sniffing', error);
    }
  }
}

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
  private tallComposites = new Map<string, HTMLCanvasElement>();
  private initialized = false;
  private scanInterval: number | null = null;

  /**
   * Initialize sprite extraction by scanning Pixi texture cache
   * Waits for game to fully load before starting
   */
  init(): void {
    if (this.initialized) return;
    this.initialized = true;

    startSpriteResourceSniffer();
    log('🖼️ Initializing sprite extractor (waiting for game)...');

    // Wait for Pixi to be available before starting
    this.waitForPixi();
  }

  /**
   * Wait for game to load and find sprite sheet URL
   */
  private async waitForPixi(): Promise<void> {
    log('dY"? Looking for game sprite sheets...');
    
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
      log('�s��,? Canvas not found');
      return;
    }

    // Wait for game to load assets
    await new Promise(r => setTimeout(r, 3000));
    
    // Find plants, tall plants, pets, and mutation overlay sheets from network resources
    let plantsUrl: string | null = null;
    let tallPlantsUrl: string | null = null;
    let petsUrl: string | null = null;
    let mutationOverlayUrl: string | null = null;
    
    const runtimeWindow = getRuntimeWindow();
    const perf = runtimeWindow.performance ?? performance;
    if (perf && typeof perf.getEntriesByType === 'function') {
      const resources = perf.getEntriesByType('resource') as PerformanceResourceTiming[];
      const plantsResource = resources.find(r => r.name.includes('/assets/tiles/plants.png'));
      if (plantsResource) {
        plantsUrl = plantsResource.name;
      }
      const tallPlantsResource = resources.find(r => r.name.toLowerCase().includes('/assets/tiles/tallplants.png'));
      if (tallPlantsResource) {
        tallPlantsUrl = tallPlantsResource.name;
      }
      const petsResource = resources.find(r => r.name.toLowerCase().includes('/assets/tiles/pets.png'));
      if (petsResource) {
        petsUrl = petsResource.name;
      }
      const mutationResource = resources.find(r => r.name.toLowerCase().includes('/assets/tiles/mutation-overlays.png'));
      if (mutationResource) {
        mutationOverlayUrl = mutationResource.name;
      }
    }
    
    if (!plantsUrl) {
      // Fallback: construct URL from base
      plantsUrl = DEFAULT_PLANT_SHEET_URL;
      log('  Using default plants.png URL');
    }
    if (!tallPlantsUrl && plantsUrl) {
      const candidate = plantsUrl.replace(/plants\.png(?:\?.*)?$/i, 'tallplants.png');
      if (candidate !== plantsUrl) {
        tallPlantsUrl = candidate;
      }
    }
    if (!tallPlantsUrl) {
      tallPlantsUrl = DEFAULT_TALL_PLANT_SHEET_URL;
      log('  Using default tallplants.png URL');
    }
    if (!petsUrl) {
      petsUrl = DEFAULT_PET_SHEET_URL;
      log('  Using default pets.png URL');
    }
    if (!mutationOverlayUrl) {
      mutationOverlayUrl = DEFAULT_MUTATION_OVERLAYS_URL;
      log('  Using default mutation-overlays.png URL');
    }
    
    log(`�o. Found plants sprite sheet: ${plantsUrl}`);
    
    try {
      const img = await loadImageElement(plantsUrl);
      log(`�o. Loaded plants.png (${img.width}x${img.height})`);
      this.processSheet('plants', img);
    } catch (error) {
      log('�s��,? Failed to load plants.png', error);
    }

    try {
      const tallImg = await loadImageElement(tallPlantsUrl);
      log(`�o. Loaded tallplants.png (${tallImg.width}x${tallImg.height})`);
      this.processSheet('tallplants', tallImg);
    } catch (error) {
      log('⚠️ Failed to load tallplants.png', error);
    }

    try {
      const petImg = await loadImageElement(petsUrl);
      log(`�o. Loaded pets.png (${petImg.width}x${petImg.height})`);
      this.processSheet('pets', petImg);
    } catch (error) {
      log('�s��,? Failed to load pets.png', error);
    }

    try {
      const overlayImg = await loadImageElement(mutationOverlayUrl);
      log(`�o. Loaded mutation-overlays.png (${overlayImg.width}x${overlayImg.height})`);
      this.processSheet('mutation-overlays', overlayImg);
    } catch (error) {
      log('�s��,? Failed to load mutation-overlays.png', error);
    }
  }

  /**
   * Scan Pixi.js texture cache for sprite sheets
   */
  private scanPixiTextures(): void {
    try {
      // Access Pixi from global scope (game loads it)
      const runtimeWindow = getRuntimeWindow();
      const PIXI = (runtimeWindow as any).PIXI;
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

        const ImageCtor = runtimeWindow.HTMLImageElement ?? HTMLImageElement;
        const CanvasCtor = runtimeWindow.HTMLCanvasElement ?? HTMLCanvasElement;
        const isImage = ImageCtor ? source instanceof ImageCtor : source instanceof HTMLImageElement;
        const isCanvas = CanvasCtor ? source instanceof CanvasCtor : source instanceof HTMLCanvasElement;
        if (!isImage && !isCanvas) continue;

        // Check if this looks like a plant or pet sprite sheet
        const keyLower = key.toLowerCase();
        const looksLikePlant = keyLower.includes('plant') || keyLower.includes('crop') || keyLower.includes('prod-plants');
        const looksLikePet = keyLower.includes('pet') || keyLower.includes('animal') || keyLower.includes('creature') || keyLower.includes('mob');
        if (!looksLikePlant && !looksLikePet) continue;

        // Check if already processed
        const sheetName = this.getSheetNameFromKey(key);
        if (this.sheets.has(sheetName)) continue;

        // Process this sheet
        this.ingestTextureSource(key, source as HTMLImageElement | HTMLCanvasElement);
        newTexturesFound++;
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
    if (lower.includes('tallplant')) return 'tallplants';
    if (lower.includes('prod-plants')) return 'prod-plants';
    if (lower.includes('plant')) return 'plants';
    if (lower.includes('crop')) return 'crops';
    if (lower.includes('pet') || lower.includes('animal') || lower.includes('creature') || lower.includes('mob')) {
      return 'pets';
    }
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

  ingestTextureSource(key: string, source: HTMLImageElement | HTMLCanvasElement): void {
    const sheetName = this.getSheetNameFromKey(key);
    if (this.sheets.has(sheetName)) {
      return;
    }

    const isCanvasLike = Boolean(
      source && typeof (source as HTMLCanvasElement).toDataURL === 'function' && typeof (source as HTMLCanvasElement).getContext === 'function'
    );

    if (isCanvasLike) {
      try {
        const img = createImageElement();
        img.src = (source as HTMLCanvasElement).toDataURL();
        if (img.complete && img.naturalWidth > 0) {
          this.processSheet(key, img);
        } else {
          img.addEventListener('load', () => this.processSheet(key, img), { once: true });
        }
      } catch (error) {
        log('⚠️ Failed to clone canvas sprite sheet', error);
      }
      return;
    }

    const isImageLike = Boolean(source && typeof (source as HTMLImageElement).naturalWidth === 'number');
    if (isImageLike) {
      const img = source as HTMLImageElement;
      if (img.complete && img.naturalWidth > 0) {
        this.processSheet(key, img);
      } else {
        img.addEventListener('load', () => this.processSheet(key, img), { once: true });
      }
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
    const tallSheetNames = ['tallplants'];
    const tallTiles: Record<string, number[]> = {
      bamboo: [0, 1, 12, 13],
      cactus: [24, 25, 36, 37],
    };
    
    // Species to index mapping (will need to be expanded based on game data)
    const speciesIndex = this.getCropSpriteIndex(species.toLowerCase());
    if (speciesIndex === null) return null;

    const tallIndices = tallTiles[species.toLowerCase()];
    if (Array.isArray(tallIndices)) {
      for (const sheetName of tallSheetNames) {
        const tile = this.getTallComposite(sheetName, tallIndices);
        if (tile) return tile;
      }
    }

    for (const sheetName of sheetNames) {
      const tile = this.getTile(sheetName, speciesIndex);
      if (tile) return tile;
    }

    return null;
  }

  private getTallComposite(sheetName: string, indices: number[]): HTMLCanvasElement | null {
    const key = `${sheetName}-${indices.join('-')}`;
    if (this.tallComposites.has(key)) {
      return this.tallComposites.get(key)!;
    }

    const sheet = this.sheets.get(sheetName);
    if (!sheet || !sheet.loaded) return null;

    const tiles = indices.map(index => this.getTile(sheetName, index));
    if (tiles.some(tile => !tile)) return null;

    const canvas = document.createElement('canvas');
    canvas.width = sheet.tileSize * 2;
    canvas.height = sheet.tileSize * 2;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;

    // Indices are ordered [top-left, top-right, bottom-left, bottom-right]
    ctx.drawImage(tiles[0]!, 0, 0);
    ctx.drawImage(tiles[1]!, sheet.tileSize, 0);
    ctx.drawImage(tiles[2]!, 0, sheet.tileSize);
    ctx.drawImage(tiles[3]!, sheet.tileSize, sheet.tileSize);

    this.tallComposites.set(key, canvas);
    return canvas;
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
      'fava bean pod': 36, // alias
      'favabeanpod': 36, // alias
      'cacao': 37,
      'cacao bean': 37, // alias
      'cacao fruit': 37, // alias
      'cacaofruit': 37, // alias
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
   * Get pet sprite by species name
   */
  getPetSprite(species: string): HTMLCanvasElement | null {
    const sheetNames = ['pets', 'animals', 'creatures', 'mobs'];
    const index = this.getPetSpriteIndex(species);
    if (index === null) return null;

    for (const sheetName of sheetNames) {
      const tile = this.getTile(sheetName, index);
      if (tile) return tile;
    }

    // Try any other processed sheet that looks like pets
    for (const sheetName of this.getSheets()) {
      if (sheetName.toLowerCase().includes('pet') || sheetName.toLowerCase().includes('animal')) {
        const tile = this.getTile(sheetName, index);
        if (tile) return tile;
      }
    }

    return null;
  }

  private getPetSpriteIndex(rawSpecies: string): number | null {
    if (!rawSpecies) return null;
    const normalized = rawSpecies.toLowerCase().replace(/[^a-z]/g, '');
    const index = PET_TILE_MAP[normalized];
    if (typeof index !== 'number') {
      log(`�s��,? Unknown pet species for sprite: "${rawSpecies}"`);
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

  getSheetSummaries(): Array<{ name: string; url: string; tileSize: number; tilesPerRow: number; tilesPerColumn: number }> {
    return Array.from(this.sheets.entries()).map(([name, sheet]) => ({
      name,
      url: sheet.url,
      tileSize: sheet.tileSize,
      tilesPerRow: sheet.tilesPerRow,
      tilesPerColumn: sheet.tilesPerColumn,
    }));
  }

  /**
   * Get mutation overlay tile
   */
  getMutationOverlay(mutation: string): HTMLCanvasElement | null {
    const key = mutation.toLowerCase();
    const index = MUTATION_OVERLAY_TILE_MAP[key];
    if (typeof index !== 'number') return null;
    return this.getTile('mutation-overlays', index);
  }

  async loadSheetFromUrl(url: string, alias?: string): Promise<boolean> {
    try {
      const normalizedUrl = normalizeSpriteUrl(url);
      const img = await loadImageElement(normalizedUrl);
      this.processSheet(alias ?? normalizedUrl, img);
      return true;
    } catch (error) {
      log(`⚠️ Failed to load sprite sheet from ${url}`, error);
      return false;
    }
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

function isLikelyPetSheet(summary: { name: string; url: string }): boolean {
  const value = `${summary.name} ${summary.url}`.toLowerCase();
  return value.includes('pet') || value.includes('animal') || value.includes('creature') || value.includes('mob');
}

function logExtractedPetSheets(): void {
  const summaries = spriteExtractor
    .getSheetSummaries()
    .filter(isLikelyPetSheet);

  if (!summaries.length) {
    log('❌ No processed pet sprite sheets yet. Move pets into view to force loads, then rerun.');
    return;
  }

  log('\n🐾 Extracted pet sprite sheets:');
  summaries.forEach((summary, idx) => {
    log(`   ${idx + 1}. ${summary.name} (${summary.tilesPerRow}x${summary.tilesPerColumn} tiles @ ${summary.tileSize}px)`);
    log(`      source: ${summary.url}`);
  });
}

export async function loadTrackedSpriteSheets(
  maxSheets = 3,
  category: SpriteCategory | 'all' = 'pets',
): Promise<string[]> {
  const tracked = getTrackedSpriteResources(category);
  const loaded: string[] = [];

  for (const entry of tracked) {
    if (!entry.url || loadedExternalSpriteUrls.has(entry.url)) {
      continue;
    }
    const success = await spriteExtractor.loadSheetFromUrl(entry.url);
    if (success) {
      loadedExternalSpriteUrls.add(entry.url);
      loaded.push(entry.url);
    }
    if (loaded.length >= maxSheets) {
      break;
    }
  }

  return loaded;
}

export function listTrackedSpriteResources(category: SpriteCategory | 'all' = 'all'):
  Array<{ url: string; sources: string[]; lastSeen: number; category: SpriteCategory }>
{
  return getTrackedSpriteResources(category);
}

/**
 * Get crop sprite as data URL for use in CSS background-image
 */
const PET_SPRITE_URL_CACHE = new Map<string, string>();
const CROP_SPRITE_URL_CACHE = new Map<string, string>();
const MUTATION_OVERLAY_CACHE = new Map<string, string>();
const CACHE_LIMIT = 256; // Keep memory bounded while avoiding repeated toDataURL churn

function setBoundedCache(cache: Map<string, string>, key: string, value: string): void {
  if (!cache.has(key) && cache.size >= CACHE_LIMIT) {
    const firstKey = cache.keys().next().value as string | undefined;
    if (firstKey) cache.delete(firstKey);
  }
  cache.set(key, value);
}

export function getCropSpriteDataUrl(species: string): string | null {
  const normalized = species.toLowerCase();
  const cached = CROP_SPRITE_URL_CACHE.get(normalized);
  if (cached) return cached;

  const canvas = spriteExtractor.getCropSprite(normalized);
  if (!canvas) return null;

  try {
    const url = canvas.toDataURL('image/png');
    setBoundedCache(CROP_SPRITE_URL_CACHE, normalized, url);
    return url;
  } catch (e) {
    log(`⚠️ Failed to convert sprite to data URL for ${normalized}`, e);
    return null;
  }
}

/**
 * Create a sprite element for rendering in UI
 */
/**
 * Get pet sprite as data URL for use in CSS background-image
 */
export function getPetSpriteDataUrl(species: string): string | null {
  const normalized = species.toLowerCase();
  const cached = PET_SPRITE_URL_CACHE.get(normalized);
  if (cached) return cached;

  const canvas = spriteExtractor.getPetSprite(normalized);
  if (!canvas) return null;

  try {
    const url = canvas.toDataURL('image/png');
    setBoundedCache(PET_SPRITE_URL_CACHE, normalized, url);
    return url;
  } catch (e) {
    log(`⚠️ Failed to convert pet sprite to data URL for ${normalized}`, e);
    return null;
  }
}

export function getPetSpriteCanvas(species: string): HTMLCanvasElement | null {
  return spriteExtractor.getPetSprite(species);
}

/**
 * Get mutation overlay sprite as data URL
 */
export function getMutationOverlayDataUrl(mutation: string): string | null {
  const normalized = mutation.toLowerCase();
  const cached = MUTATION_OVERLAY_CACHE.get(normalized);
  if (cached) return cached;

  const canvas = spriteExtractor.getMutationOverlay(normalized);
  if (!canvas) return null;
  try {
    const url = canvas.toDataURL('image/png');
    setBoundedCache(MUTATION_OVERLAY_CACHE, normalized, url);
    return url;
  } catch (e) {
    log(`⚠️ Failed to convert mutation overlay for ${normalized}`, e);
    return null;
  }
}

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

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

async function waitForPixiTextureCacheReady(timeoutMs: number = 20000): Promise<{ PIXI: any; textureCache: Record<string, any> } | null> {
  const start = Date.now();
  let notified = false;

  while (Date.now() - start < timeoutMs) {
    const runtimeWindow = getRuntimeWindow();
    const PIXI = (runtimeWindow as any)?.PIXI;
    const textureCache = PIXI?.utils?.TextureCache;
    if (textureCache && Object.keys(textureCache).length > 0) {
      return { PIXI, textureCache };
    }

    if (!notified) {
      log('⏳ Waiting for Pixi texture cache to be ready before scanning pet sprites...');
      notified = true;
    }

    await delay(500);
  }

  return null;
}

/**
 * Render an on-screen grid of a sprite sheet (useful for manual mapping)
 */
export function renderSpriteGridOverlay(sheetName = 'pets', maxTiles = 80): void {
  const container = document.createElement('div');
  container.style.cssText = `
    position: fixed;
    inset: 40px auto auto 40px;
    max-height: 80vh;
    max-width: 80vw;
    overflow: auto;
    padding: 16px;
    background: rgba(0, 0, 0, 0.9);
    border: 1px solid #444;
    border-radius: 10px;
    z-index: 999999;
    box-shadow: 0 12px 30px rgba(0,0,0,0.45);
  `;

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;';
  header.innerHTML = `
    <div style="font-weight:700;color:#fff;">Sprite Grid: ${sheetName}</div>
    <button style="background:#222;color:#fff;border:1px solid #555;border-radius:6px;padding:4px 8px;cursor:pointer;">Close</button>
  `;
  header.querySelector('button')?.addEventListener('click', () => container.remove());
  container.appendChild(header);

  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:10px;';

  let tilesRendered = 0;
  for (let i = 0; i < maxTiles; i++) {
    const tile = spriteExtractor.getTile(sheetName, i);
    if (!tile) continue;
    tilesRendered++;
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'background:#111;border:1px solid #333;border-radius:8px;padding:6px;text-align:center;';

    const label = document.createElement('div');
    label.textContent = `#${i}`;
    label.style.cssText = 'color:#999;font-size:11px;margin-bottom:4px;font-family:monospace;';

    const img = new Image();
    img.src = tile.toDataURL('image/png');
    img.style.cssText = 'width:64px;height:64px;image-rendering:pixelated;margin:auto;display:block;';

    wrapper.appendChild(label);
    wrapper.appendChild(img);
    grid.appendChild(wrapper);
  }

  if (tilesRendered === 0) {
    const empty = document.createElement('div');
    empty.textContent = 'No tiles available for this sheet yet.';
    empty.style.cssText = 'color:#ccc;font-size:13px;';
    container.appendChild(empty);
  } else {
    container.appendChild(grid);
  }

  document.body.appendChild(container);
}

export function renderAllSpriteSheetsOverlay(maxTilesPerSheet = 80): void {
  const sheetNames = spriteExtractor.getSheets();
  if (!sheetNames.length) {
    log('⚠️ No sprite sheets recorded yet. Open your garden or hutch first.');
    return;
  }
  sheetNames.forEach(name => renderSpriteGridOverlay(name, maxTilesPerSheet));
}

/**
 * Scan Pixi texture cache for pet sprite sheets
 * Console command: window.inspectPetSprites()
 */
export async function inspectPetSprites(): Promise<void> {
  log('🔍 Scanning Pixi texture cache for pet sprite sheets...');
  
  try {
    const pixiResult = await waitForPixiTextureCacheReady();
    if (!pixiResult) {
      log('⚠️ Pixi TextureCache never became available. Make sure you are in-game and pets have been rendered.');
      const sniffed = getTrackedSpriteResources('pets');
      if (sniffed.length > 0) {
        log('\n🐾 Sprite resource sniffing still found pet-like URLs:');
        sniffed.forEach((entry, idx) => {
          log(`   ${idx + 1}. ${entry.url}`);
          log(`      sources: ${entry.sources.join(', ') || 'unknown'} | last seen: ${new Date(entry.lastSeen).toLocaleTimeString()}`);
        });
      } else {
        log('❌ No pet sprite URLs recorded yet. Move a pet into view to force the game to load their textures.');
      }

      const loaded = await loadTrackedSpriteSheets(5);
      if (loaded.length > 0) {
        log(`\n✅ Loaded ${loaded.length} pet sprite sheet${loaded.length === 1 ? '' : 's'} directly from tracked URLs.`);
        logExtractedPetSheets();
      } else if (sniffed.length > 0) {
        log('⚠️ Unable to fetch the tracked pet sprite sheets automatically. Open your Pet Hutch or inventory so the game loads them, then rerun inspect.');
      }
      return;
    }

    const { textureCache } = pixiResult;
    const runtimeWindow = getRuntimeWindow();
    const ImageCtor = runtimeWindow.HTMLImageElement ?? HTMLImageElement;
    const CanvasCtor = runtimeWindow.HTMLCanvasElement ?? HTMLCanvasElement;
    const petSheets: Array<{key: string, width: number, height: number, url: string}> = [];

    log('\n📦 Scanning all textures...');
    let totalTextures = 0;
    
    for (const key in textureCache) {
      if (!Object.prototype.hasOwnProperty.call(textureCache, key)) continue;
      totalTextures++;
      
      const texture = textureCache[key];
      if (!texture || !texture.baseTexture || !texture.baseTexture.resource) continue;

      const source = texture.baseTexture.resource.source;
      const isImage = ImageCtor ? source instanceof ImageCtor : Boolean(source?.naturalWidth);
      const isCanvas = CanvasCtor ? source instanceof CanvasCtor : Boolean(source?.toDataURL);
      if (!isImage && !isCanvas) continue;

      if (isImage && (source as HTMLImageElement).src) {
        trackSpriteResource((source as HTMLImageElement).src, 'pixi.cache');
      }

      const keyLower = key.toLowerCase();
      
      // Look for pet-related textures
      if (keyLower.includes('pet') || 
          keyLower.includes('animal') || 
          keyLower.includes('creature') ||
          keyLower.includes('mob')) {
        const width = isImage ? (source as HTMLImageElement).naturalWidth : (source as HTMLCanvasElement).width;
        const height = isImage ? (source as HTMLImageElement).naturalHeight : (source as HTMLCanvasElement).height;
        const url = isImage ? (source as HTMLImageElement).src : 'canvas';
        petSheets.push({ key, width, height, url });

        // Ingest into sprite extractor so other features can reuse it
        spriteExtractor.ingestTextureSource(key, source as HTMLImageElement | HTMLCanvasElement);
      }
    }

    log(`\n✅ Scanned ${totalTextures} total textures`);
    log(`\n🐾 Found ${petSheets.length} potential pet sprite sheets:\n`);
    
    if (petSheets.length === 0) {
      log('❌ No pet sprite sheets found in Pixi cache.');
      log('   Try looking for generic sprite sheets with "atlas" or "sprites" in the name:');
      
      // Show any atlas/sprite sheets
      const atlasSheets: Array<{key: string, width: number, height: number}> = [];
      for (const key in textureCache) {
        if (!Object.prototype.hasOwnProperty.call(textureCache, key)) continue;
        const texture = textureCache[key];
        if (!texture || !texture.baseTexture || !texture.baseTexture.resource) continue;
        const source = texture.baseTexture.resource.source;
        if (!(source instanceof HTMLImageElement) && !(source instanceof HTMLCanvasElement)) continue;
        
        const keyLower = key.toLowerCase();
        if (keyLower.includes('atlas') || keyLower.includes('sprites') || keyLower.includes('sheet')) {
          const width = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
          const height = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
          atlasSheets.push({ key, width, height });
        }
      }
      
      if (atlasSheets.length > 0) {
        log('\n📋 Atlas/sprite sheets found:');
        atlasSheets.forEach((sheet, i) => {
          log(`   ${i + 1}. "${sheet.key}" (${sheet.width}x${sheet.height})`);
        });
      }

      const sniffed = getTrackedSpriteResources('pets');
      if (sniffed.length > 0) {
        log('\n📡 Sprite sniffing hints (pet candidates):');
        sniffed.forEach((entry, idx) => {
          log(`   ${idx + 1}. ${entry.url}`);
          log(`      sources: ${entry.sources.join(', ') || 'unknown'} | last seen: ${new Date(entry.lastSeen).toLocaleTimeString()}`);
        });
      }
    } else {
      petSheets.forEach((sheet, i) => {
        log(`${i + 1}. "${sheet.key}"`);
        log(`   Size: ${sheet.width}x${sheet.height}`);
        log(`   URL: ${sheet.url}`);
        log(`   Tiles (256px): ${Math.floor(sheet.width / 256)}x${Math.floor(sheet.height / 256)} = ${Math.floor(sheet.width / 256) * Math.floor(sheet.height / 256)} tiles`);
        log(`   Tiles (512px): ${Math.floor(sheet.width / 512)}x${Math.floor(sheet.height / 512)} = ${Math.floor(sheet.width / 512) * Math.floor(sheet.height / 512)} tiles`);
        log('');
      });
      const sniffed = getTrackedSpriteResources('pets');
      if (sniffed.length > 0) {
        log('\n📡 Sprite sniffing hints (pet candidates):');
        sniffed.forEach((entry, idx) => {
          log(`   ${idx + 1}. ${entry.url}`);
          log(`      sources: ${entry.sources.join(', ') || 'unknown'} | last seen: ${new Date(entry.lastSeen).toLocaleTimeString()}`);
        });
      }
    }

    log('\n💡 To extract a specific sprite sheet, note the key name above.');
    log('   Example: if you see a sheet with pets, tell me which one!');
    
  } catch (error) {
    log('❌ Error scanning for pet sprites:', error);
  }
}

      logExtractedPetSheets();

// Note: inspectPetSprites is exported to window in main.ts initialize()
