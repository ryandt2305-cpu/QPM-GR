# Sprite Extraction Research - Aries MagicGarden Mod

## Overview
Research on how the Aries MagicGarden mod extracts and displays crop/plant sprite images from the live game that uses Pixi.js for rendering.

**Repository:** https://github.com/Ariedam64/MagicGarden-modMenu

---

## Key Files

### 1. **src/core/sprite.ts** - Core Sprite Extraction Engine
This is the main file that handles all sprite detection, extraction, and rendering.

**Location:** `src/core/sprite.ts`

### 2. **src/ui/menus/debug-data.ts** - Debug Menu UI with Sprite Viewer
Contains the UI implementation for browsing and previewing sprites.

**Location:** `src/ui/menus/debug-data.ts`

### 3. **src/data/sprites.ts** - Tile Reference Mapping
Maps tile indices to crop/plant names.

**Location:** `src/data/sprites.ts`

---

## How It Works

### Step 1: Sprite Detection & Interception

The mod uses **multiple sniffing techniques** to capture sprite URLs as the game loads them:

#### A. Image Element Hooking
```typescript
// Hook into <img> element src property
const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
Object.defineProperty(HTMLImageElement.prototype, "src", {
  set: function (this: HTMLImageElement, v: string) {
    (pageWindow as any).Sprites?.add?.(v, "img");
    return (desc.set as any).call(this, v);
  },
  get: desc.get as any,
  configurable: true,
  enumerable: desc.enumerable!,
});

// Also hook setAttribute for <img setAttribute("src", ...)>
const nativeSetAttr = HTMLImageElement.prototype.setAttribute;
HTMLImageElement.prototype.setAttribute = function (name: any, value: any) {
  if (String(name).toLowerCase() === "src" && typeof value === "string") {
    Sprites.add(value, "img-attr");
  }
  return nativeSetAttr.call(this, name, value);
};
```

#### B. PerformanceObserver for Network Resources
```typescript
if ("PerformanceObserver" in pageWindow) {
  const po = new PerformanceObserver((list) => {
    list.getEntries().forEach((e: PerformanceEntry) => 
      this.add((e as any).name, "po")
    );
  });
  po.observe({ entryTypes: ["resource"] });
}
```

#### C. Worker Fetch Interception
```typescript
// Injected prelude into Web Workers to intercept fetch calls
const workerPrelude = `
  const F = self.fetch;
  if (F) {
    self.fetch = async function(...a) {
      let u = a[0];
      const r = await F.apply(this, a);
      try {
        const ct = (r.headers && r.headers.get && r.headers.get('content-type')) || '';
        if ((u && isImg(u)) || /^image\\//.test(ct)) {
          self.postMessage({ __awc:1, url: u, src:'worker:fetch', ct });
        }
      } catch {}
      return r;
    };
  }
`;
```

#### D. URL Classification
```typescript
function isTilesUrl(u: string): boolean {
  return (
    /\/assets\/tiles\//i.test(u) ||
    /(map|plants|allplants|items|seeds|pets|animations|mutations)\.(png|webp)$/i.test(u)
  );
}

function isUiUrl(u: string): boolean {
  return /\/assets\/ui\//i.test(u);
}
```

---

### Step 2: Loading & Slicing Sprite Sheets

Once URLs are captured, the mod loads and slices them into individual tiles:

#### A. Load Image
```typescript
private async loadImage(url: string): Promise<HTMLImageElement> {
  return await new Promise((res, rej) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = url;
  });
}
```

#### B. Auto-Detect Tile Size
```typescript
private guessSize(url: string, img: HTMLImageElement, forced?: number): number {
  if (forced) return forced;
  // allplants sheets use 512px tiles
  if (this.cfg.ruleAllplants512.test(url)) return 512;
  // Most other sheets use 256px
  if (img.width % 256 === 0 && img.height % 256 === 0) return 256;
  if (img.width % 512 === 0 && img.height % 512 === 0) return 512;
  return 256;
}
```

#### C. Slice Sprite Sheet into Individual Tiles
```typescript
private async sliceOne(url: string, opts: { 
  mode: SpriteMode; 
  includeBlanks: boolean; 
  forceSize?: 256 | 512 
}): Promise<TileInfo[]> {
  const img = await this.loadImage(url);
  const size = this.guessSize(url, img, opts.forceSize);
  const cols = Math.floor(img.width / size);
  const rows = Math.floor(img.height / size);
  const base = fileBase(url);

  const can = document.createElement("canvas");
  can.width = size;
  can.height = size;
  const ctx = can.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = false;

  const list: TileInfo[] = [];
  let idx = 0;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      ctx.clearRect(0, 0, size, size);
      // Extract tile from sheet
      ctx.drawImage(img, col * size, row * size, size, size, 0, 0, size, size);

      // Check if tile is blank/black (skip empty tiles)
      let blank = false;
      try {
        const data = ctx.getImageData(0, 0, size, size);
        blank = this.isBlankOrBlack(data);
      } catch {
        blank = false;
      }
      if (!opts.includeBlanks && blank) { 
        idx++; 
        continue; 
      }

      // Store as ImageBitmap, Canvas, or DataURL
      if (opts.mode === "bitmap") {
        const bmp = await createImageBitmap(can);
        list.push({ sheet: base, url, index: idx, col, row, size, data: bmp });
      } else if (opts.mode === "canvas") {
        const clone = document.createElement("canvas");
        clone.width = size;
        clone.height = size;
        clone.getContext("2d")!.drawImage(can, 0, 0);
        list.push({ sheet: base, url, index: idx, col, row, size, data: clone });
      }
      idx++;
    }
  }
  return list;
}
```

---

### Step 3: Getting a Specific Crop Sprite

#### Method 1: By Sheet Name + Index
```typescript
// Get a specific tile from a sprite sheet
public async getTile(
  sheetBase: string,    // e.g., "plants" or "allplants"
  index: number,        // tile index (0-based)
  mode: SpriteMode = "bitmap"
): Promise<TileInfo | null> {
  const url = [...this.tiles].find(u => fileBase(u) === sheetBase);
  if (!url) return null;
  
  const map = await this.loadTiles({ 
    mode, 
    onlySheets: new RegExp(sheetBase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\.(png|webp)$", "i") 
  });
  
  const tiles = map.get(sheetBase) || [];
  const tile = tiles.find(t => t.index === index);

  return tile ?? null;
}
```

#### Method 2: Load All Tiles from Category
```typescript
// Load all plant sprites
public async loadTiles(options: LoadTilesOptions = {}): Promise<Map<string, TileInfo<any>[]>> {
  const { mode = "bitmap", includeBlanks = false, forceSize, onlySheets } = options;
  
  const out = new Map<string, TileInfo<any>[]>();
  const list = onlySheets 
    ? [...this.tiles].filter(u => onlySheets.test(u)) 
    : [...this.tiles];

  for (const u of list) {
    const base = fileBase(u);
    const tiles = await this.sliceOne(u, { mode, includeBlanks, forceSize });
    out.set(base, tiles);
  }
  return out;
}

// Get plant tiles specifically
public listPlants(): string[] {
  const urls = new Set(this.listTilesByCategory(/plants/i));
  for (const url of this.listAllPlants()) urls.add(url);
  return [...urls];
}
```

---

### Step 4: Rendering Sprites in UI

#### A. Create Canvas from Tile
```typescript
private tileToCanvas(tile: TileInfo<ImageBitmap | HTMLCanvasElement | string>): HTMLCanvasElement {
  const src = tile.data as any;
  let w = tile.size, h = tile.size;

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;

  if (src instanceof HTMLCanvasElement) {
    w = src.width; h = src.height;
    out.width = w; out.height = h;
    ctx.drawImage(src, 0, 0);
  } else if (typeof ImageBitmap !== "undefined" && src instanceof ImageBitmap) {
    w = src.width; h = src.height;
    out.width = w; out.height = h;
    ctx.drawImage(src, 0, 0);
  }
  return out;
}
```

#### B. Display in HTML
From `src/ui/menus/debug-data.ts`:
```typescript
// Create a tile display element
const cell = document.createElement("div");
cell.className = "dd-sprite-tile";

// Add the canvas
const canvas = tileToCanvasCopy(tile); // converts TileInfo to HTMLCanvasElement
if (canvas) {
  canvas.classList.add("dd-sprite-variant__canvas");
  cell.appendChild(canvas);
}

// Add metadata
const meta = document.createElement("div");
meta.className = "dd-sprite-tile__meta";
meta.textContent = `#${tile.index} · col ${tile.col} · row ${tile.row}`;
cell.appendChild(meta);

// Add to grid
grid.appendChild(cell);
```

#### C. CSS Styling for Pixel-Perfect Rendering
```css
.dd-sprite-tile canvas {
  width: 100%;
  height: auto;
  image-rendering: pixelated;  /* Critical for crisp pixel art */
  background: #05080c;
  border-radius: 8px;
}

.dd-sprite-variant__canvas {
  width: 100%;
  height: auto;
  image-rendering: pixelated;
  background: #05080c;
  border-radius: 8px;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.08);
}
```

---

### Step 5: Special Effects (Gold/Rainbow)

#### Gold Effect
```typescript
public effectGold(
  tile: TileInfo<ImageBitmap | HTMLCanvasElement | string>,
  opts?: { alpha?: number; color?: string }
): HTMLCanvasElement {
  const srcCan = this.tileToCanvas(tile);
  const w = srcCan.width, h = srcCan.height;

  const out = document.createElement("canvas");
  out.width = w; out.height = h;
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;

  // Draw base sprite
  ctx.drawImage(srcCan, 0, 0);

  // Apply gold tint
  const alpha = opts?.alpha ?? 0.7;
  const color = opts?.color ?? "rgb(255, 215, 0)";

  ctx.save();
  ctx.globalCompositeOperation = "source-atop";
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  return out;
}
```

#### Rainbow Effect
```typescript
public effectRainbow(
  tile: TileInfo<ImageBitmap | HTMLCanvasElement | string>,
  opts?: { angle?: number; colors?: string[] }
): HTMLCanvasElement {
  const srcCan = this.tileToCanvas(tile);
  const w = srcCan.width, h = srcCan.height;

  const out = document.createElement("canvas");
  out.width = w; out.height = h;
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;

  // Draw base sprite
  ctx.drawImage(srcCan, 0, 0);

  // Create rainbow gradient
  const angle = opts?.angle ?? 130;
  const colors = opts?.colors ?? 
    ["#FF1744","#FF9100","#FFEA00","#00E676","#2979FF","#D500F9"];

  // Temporary canvas for gradient
  const tmp = document.createElement("canvas");
  tmp.width = w; tmp.height = h;
  const tctx = tmp.getContext("2d")!;
  tctx.imageSmoothingEnabled = false;

  // Create angled linear gradient
  const size = w;
  const rad = (angle - 90) * Math.PI / 180;
  const cx = w / 2, cy = h / 2;
  const x1 = cx - Math.cos(rad) * (size / 2);
  const y1 = cy - Math.sin(rad) * (size / 2);
  const x2 = cx + Math.cos(rad) * (size / 2);
  const y2 = cy + Math.sin(rad) * (size / 2);

  const grad = tctx.createLinearGradient(x1, y1, x2, y2);
  colors.forEach((c, i) => grad.addColorStop(i / (colors.length - 1), c));
  
  tctx.fillStyle = grad;
  tctx.fillRect(0, 0, w, h);

  // Mask gradient to sprite shape
  tctx.globalCompositeOperation = "destination-in";
  tctx.drawImage(srcCan, 0, 0);

  // Apply using 'color' blend mode
  ctx.save();
  ctx.globalCompositeOperation = "color" as GlobalCompositeOperation;
  ctx.drawImage(tmp, 0, 0);
  ctx.restore();

  return out;
}
```

---

## Mapping Crop Names to Tile Indices

The mod uses hardcoded mappings in `src/data/sprites.ts`:

```typescript
export function findTileRefMatch(sheet: string, index: number): TileRefMatch | null {
  const normalized = normalizeSheet(sheet);
  
  // Try to find matching sheet type
  for (const matcher of matchers) {
    if (!matcher.test(normalized)) continue;
    const entries = matcher.entries.get(index);
    if (entries?.length) {
      return {
        sheetId: matcher.id,
        sheetLabel: matcher.label,
        entries: [...entries], // Contains displayName like "Sunflower", "Bamboo", etc.
      };
    }
  }
  return null;
}
```

The actual mappings are in `src/data/hardcoded-data.clean.ts` with structures like:
```typescript
export const tileRefsPlants: Record<string, number> = {
  sunflower: 42,    // example - actual indices from game
  bamboo: 17,
  // ... etc
};
```

---

## Usage Example for Your Project

### Initialize Sprites System
```typescript
import { Sprites, initSprites } from './core/sprite';

// Initialize with callbacks
initSprites({
  config: {
    skipAlphaBelow: 1,
    blackBelow: 8,
    tolerance: 0.005,
  },
  onAsset: (url, kind) => {
    console.log(`Detected ${kind} asset:`, url);
    // Optionally trigger UI updates
    window.dispatchEvent(new CustomEvent('mg:sprite-detected'));
  }
});
```

### Get a Specific Crop Sprite
```typescript
// Method 1: By sheet + index (if you know the index)
const sunflowerTile = await Sprites.getTile("plants", 42, "canvas");
if (sunflowerTile) {
  const canvas = sunflowerTile.data as HTMLCanvasElement;
  document.body.appendChild(canvas);
}

// Method 2: Load all plants and find by name
const plantsMap = await Sprites.loadTiles({ 
  mode: "canvas",
  onlySheets: /plants/i 
});

const plantTiles = plantsMap.get("plants") || [];
// Use findTileRefMatch to map indices to names
for (const tile of plantTiles) {
  const match = findTileRefMatch(tile.sheet, tile.index);
  if (match?.entries.some(e => e.displayName === "Sunflower")) {
    const canvas = tile.data as HTMLCanvasElement;
    document.body.appendChild(canvas);
    break;
  }
}
```

### Render with Effects
```typescript
const tile = await Sprites.getTile("plants", 42, "canvas");
if (tile) {
  // Normal
  const normalCanvas = tile.data as HTMLCanvasElement;
  
  // Gold variant
  const goldCanvas = Sprites.effectGold(tile);
  
  // Rainbow variant
  const rainbowCanvas = Sprites.effectRainbow(tile);
  
  // Add to DOM with pixel-perfect rendering
  normalCanvas.style.imageRendering = "pixelated";
  goldCanvas.style.imageRendering = "pixelated";
  rainbowCanvas.style.imageRendering = "pixelated";
  
  document.body.append(normalCanvas, goldCanvas, rainbowCanvas);
}
```

---

## Key Takeaways

1. **No direct Pixi.js access needed** - The mod intercepts sprite URLs before Pixi loads them
2. **Multiple interception points** - Image elements, fetch calls, PerformanceObserver, Workers
3. **Auto sprite sheet slicing** - Automatically detects 256px vs 512px tiles and slices them
4. **Canvas-based rendering** - Uses HTML5 Canvas for pixel-perfect sprite display
5. **Caching system** - Caches loaded sprites in three formats (ImageBitmap, Canvas, DataURL)
6. **Effects via Canvas API** - Gold and rainbow effects using composite operations
7. **Critical CSS** - `image-rendering: pixelated` for crisp pixel art display

---

## Files to Study Further

1. **src/core/sprite.ts** - Complete sprite extraction engine (~700 lines)
2. **src/ui/menus/debug-data.ts** - Sprite viewer UI implementation (lines 1200-1800)
3. **src/data/sprites.ts** - Tile reference mapping system
4. **src/data/hardcoded-data.clean.ts** - Actual crop name to index mappings

---

## Integration Notes

To integrate into your QPM-GR project:

1. Copy `src/core/sprite.ts` to your `src/core/` directory
2. Copy the sprite utility functions (effectGold, effectRainbow, tileToCanvas)
3. Initialize on startup: `initSprites()` 
4. Access sprites via: `await Sprites.getTile("plants", index, "canvas")`
5. Use the CSS `image-rendering: pixelated` for display
6. Optionally implement tile name mapping from `src/data/sprites.ts`

The system is designed to work in Tampermonkey userscripts and doesn't require any bundler configuration changes.
