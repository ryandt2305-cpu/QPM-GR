// sprite-v2/index.ts - Main sprite system initialization
// Optimized for non-blocking initialization with cooperative yielding

import type { SpriteState, SpriteConfig, SpriteService, GetSpriteParams, RenderOptions } from './types';
import { DEFAULT_CFG } from './settings';
import { detectGameVersion, buildAssetsBaseUrl, getRuntimeWindow } from './detector';
import { createPixiHooks, waitForPixi, ensureDocumentReady } from './hooks';
import { getJSON, loadAtlasJsons, isAtlas, getBlob, blobToImage, joinPath, relPath } from './manifest';
import { getCtors } from './utils';
import { buildAtlasTextures, buildItemsFromTextures } from './atlas';
import { processVariantJobs, computeVariantSignature } from './renderer';
import { clearVariantCache, getCacheStats } from './cache';
import * as api from './api';
import { sleep } from '../utils/dom';
import { yieldToBrowser, YieldController, delay } from '../utils/scheduling';

// Global state
let ctx: {
  cfg: SpriteConfig;
  state: SpriteState;
} | null = null;

// CRITICAL: Create hooks at MODULE LOAD TIME, not inside async functions!
// The game calls __PIXI_APP_INIT__ early - we must have hooks ready before that.
const hooks = createPixiHooks();

function createInitialState(): SpriteState {
  return {
    started: false,
    open: false,
    loaded: false,
    version: null,
    base: null,
    ctors: null,
    app: null,
    renderer: null,
    cat: '__all__',
    q: '',
    f: '',
    mutOn: false,
    mutations: [],
    scroll: 0,
    items: [],
    filtered: [],
    cats: new Map(),
    tex: new Map(),
    lru: new Map(),
    cost: 0,
    jobs: [],
    jobMap: new Set(),
    srcCan: new Map(),
    atlasBases: new Set(),
    dbgCount: {},
    sig: '',
    changedAt: 0,
    needsLayout: false,
    overlay: null,
    bg: null,
    grid: null,
    dom: null,
    selCat: null,
    count: null,
    pool: [],
    active: new Map(),
    anim: new Set(),
  };
}

// Warmup progress tracking for UI feedback
export type SpriteWarmupState = { total: number; done: number; completed: boolean; phase: string };
let warmupState: SpriteWarmupState = { total: 0, done: 0, completed: false, phase: 'idle' };
const warmupListeners = new Set<(state: SpriteWarmupState) => void>();

function notifyWarmup(update: Partial<SpriteWarmupState>): void {
  Object.assign(warmupState, update);
  for (const listener of warmupListeners) {
    try {
      listener(warmupState);
    } catch {
      /* ignore listener errors */
    }
  }
}

export function getSpriteWarmupState(): SpriteWarmupState {
  return { ...warmupState };
}

export function onSpriteWarmupProgress(listener: (state: SpriteWarmupState) => void): () => void {
  warmupListeners.add(listener);
  // Emit current state immediately
  try {
    listener(warmupState);
  } catch {
    /* ignore */
  }
  return () => {
    warmupListeners.delete(listener);
  };
}

// Prefetched atlas data for parallel loading
type PrefetchedAtlas = {
  base: string;
  atlasJsons: Record<string, any>;
  blobs: Map<string, Blob>;
};

let prefetchPromise: Promise<PrefetchedAtlas | null> | null = null;

/**
 * Prefetch atlas data in parallel with PIXI initialization.
 * This starts network requests early to reduce total load time.
 */
async function prefetchAtlasData(base: string): Promise<PrefetchedAtlas | null> {
  try {
    notifyWarmup({ phase: 'prefetch-manifest' });
    const manifest = await getJSON(joinPath(base, 'manifest.json'));
    
    notifyWarmup({ phase: 'prefetch-atlas-json' });
    const atlasJsons = await loadAtlasJsons(base, manifest);
    
    const blobs = new Map<string, Blob>();
    const entries = Object.entries(atlasJsons);
    const atlasCount = entries.filter(([, data]) => isAtlas(data)).length;
    
    notifyWarmup({ phase: 'prefetch-images', total: atlasCount, done: 0 });
    
    // Fetch atlas images in parallel with yielding
    let fetched = 0;
    const yieldCtl = new YieldController(3, 16); // Yield every 3 fetches or 16ms
    
    for (const [path, data] of entries) {
      if (!isAtlas(data)) continue;
      
      const imgPath = relPath(path, data.meta.image);
      try {
        const blob = await getBlob(joinPath(base, imgPath));
        blobs.set(imgPath, blob);
        fetched++;
        notifyWarmup({ done: fetched });
      } catch {
        /* ignore individual fetch errors - will be retried in loadTextures */
      }
      
      await yieldCtl.yieldIfNeeded();
    }
    
    return { base, atlasJsons, blobs };
  } catch (error) {
    console.warn('[QPM Sprite-v2] Prefetch failed, will load normally:', error);
    return null;
  }
}

async function loadTextures(
  base: string,
  state: SpriteState,
  cfg: SpriteConfig,
  prefetched?: PrefetchedAtlas | null
): Promise<void> {
  // Configuration for non-blocking loading
  const ATLAS_YIELD_DELAY_MS = 16; // ~1 frame at 60fps
  const FRAMES_PER_YIELD = 4; // Yield every N atlases
  const MAX_CHUNK_MS = 12; // Max time before yielding within atlas processing

  const ctors = state.ctors;
  if (!ctors?.Texture || !ctors?.Rectangle) {
    throw new Error('PIXI constructors missing');
  }

  // Use prefetched data if available and matches our base URL
  const usePrefetched = prefetched && prefetched.base === base ? prefetched : null;
  
  notifyWarmup({ phase: 'load-manifest' });
  const manifest = usePrefetched?.atlasJsons 
    ? null // Already have atlas JSONs
    : await getJSON(joinPath(base, 'manifest.json'));
  
  const atlasJsons = usePrefetched?.atlasJsons ?? await loadAtlasJsons(base, manifest!);
  
  const entries = Object.entries(atlasJsons);
  const atlasEntries = entries.filter(([, data]) => isAtlas(data));
  const totalAtlases = atlasEntries.length;
  
  notifyWarmup({ phase: 'load-textures', total: totalAtlases, done: 0 });

  const yieldCtl = new YieldController(FRAMES_PER_YIELD, MAX_CHUNK_MS);
  let processed = 0;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry) continue;
    const [path, data] = entry;
    if (!isAtlas(data)) continue;

    const imgPath = relPath(path, data.meta.image);
    
    // Try to use prefetched blob, otherwise fetch it
    let blob = usePrefetched?.blobs.get(imgPath);
    if (!blob) {
      blob = await getBlob(joinPath(base, imgPath));
    }
    
    const img = await blobToImage(blob);
    const baseTex = ctors.Texture.from(img);

    buildAtlasTextures(data, baseTex, state.tex, state.atlasBases, ctors);

    processed++;
    notifyWarmup({ done: processed });

    // Cooperative yielding - give browser time to render/respond
    await yieldCtl.yieldIfNeeded();
    
    // Small delay between atlases to prevent frame drops on low-end devices
    if (i < entries.length - 1) {
      await delay(ATLAS_YIELD_DELAY_MS);
    }
  }

  notifyWarmup({ phase: 'build-catalog' });
  
  // Yield before building item catalog (can be CPU-intensive)
  await yieldToBrowser();

  const { items, cats } = buildItemsFromTextures(state.tex, { catLevels: 1 });
  
  // Yield after building to let GC run
  await yieldToBrowser();
  
  state.items = items;
  state.filtered = items.slice();
  state.cats = cats;
  state.loaded = true;
  
  notifyWarmup({ phase: 'complete', completed: true });
}

/**
 * Fast PIXI resolution - simplified to match Aries Mod's proven approach.
 * Uses unsafeWindow consistently for Chrome/Firefox compatibility.
 */
type PixiBundle = { app: any; renderer: any; version: string | null };

// Declare unsafeWindow for TypeScript (provided by Tampermonkey in sandbox mode)
declare const unsafeWindow: (Window & typeof globalThis) | undefined;

/**
 * Get the page window context (unsafeWindow for Tampermonkey, or globalThis fallback)
 * Matches Aries Mod's approach exactly for Chrome/Firefox compatibility.
 */
function getRoot(): any {
  // Match Aries Mod's exact pattern: check if variable exists first
  return typeof unsafeWindow !== 'undefined' && unsafeWindow
    ? unsafeWindow
    : globalThis;
}

/**
 * Traverse React fiber tree to find QuinoaEngine and extract PIXI renderer.
 * This is a fallback when hooks and global polling fail.
 */
function findPixiViaFiber(): PixiBundle | null {
  try {
    const canvas = document.querySelector('canvas');
    if (!canvas) return null;
    
    // Find React fiber root on the canvas or its ancestors
    let element: Element | null = canvas;
    let fiber: any = null;
    
    while (element && !fiber) {
      const keys = Object.keys(element);
      for (const key of keys) {
        if (key.startsWith('__reactFiber$') || key.startsWith('__reactContainer$')) {
          fiber = (element as any)[key];
          break;
        }
      }
      element = element.parentElement;
    }
    
    if (!fiber) return null;
    
    // BFS to find QuinoaEngine in the fiber tree
    const queue: any[] = [fiber];
    const visited = new WeakSet();
    let iterations = 0;
    const maxIterations = 10000;
    
    while (queue.length > 0 && iterations++ < maxIterations) {
      const node = queue.shift();
      if (!node || visited.has(node)) continue;
      visited.add(node);
      
      // Check memoizedState chain for QuinoaEngine
      let state = node.memoizedState;
      let hookDepth = 0;
      while (state && hookDepth++ < 50) {
        const ms = state.memoizedState !== undefined ? state.memoizedState : state;
        
        if (ms && typeof ms === 'object') {
          // Check for QuinoaEngine structure (has canvasSpriteCache with renderer)
          if (ms.canvasSpriteCache?.renderer) {
            return { app: ms.app || null, renderer: ms.canvasSpriteCache.renderer, version: null };
          }
          // Alternative: gameTextureCache
          if (ms.gameTextureCache?.renderer) {
            return { app: ms.app || null, renderer: ms.gameTextureCache.renderer, version: null };
          }
          // Direct PIXI app check (has stage, renderer, ticker)
          if (ms.stage && ms.renderer && ms.ticker) {
            return { app: ms, renderer: ms.renderer, version: null };
          }
          // Direct renderer check
          if (ms.extract && ms.render && (ms.gl || ms.context)) {
            return { app: null, renderer: ms, version: null };
          }
        }
        
        state = state.next;
      }
      
      // Traverse fiber tree
      if (node.child) queue.push(node.child);
      if (node.sibling) queue.push(node.sibling);
      if (node.return && !visited.has(node.return)) queue.push(node.return);
    }
  } catch {
    // Silent failure - will try other detection methods
  }
  
  return null;
}

async function resolvePixiFast(): Promise<PixiBundle> {
  const root = getRoot();
  
  // Check 1: Injected script captured PIXI (critical for Chrome!)
  const checkInjectedCapture = (): PixiBundle | null => {
    const captured = root.__QPM_PIXI_CAPTURED__;
    if (captured?.app && captured?.renderer) {
      return { app: captured.app, renderer: captured.renderer, version: captured.version || null };
    }
    return null;
  };
  
  // Check 2: Global PIXI variables
  const checkGlobals = (): PixiBundle | null => {
    const app = root.__PIXI_APP__ || root.PIXI_APP || root.app || null;
    const renderer = root.__PIXI_RENDERER__ || root.PIXI_RENDERER__ || root.renderer || app?.renderer || null;
    
    if (app && renderer) {
      const version = root.__PIXI_VERSION__ || root.__PIXI__?.VERSION || root.PIXI?.VERSION || null;
      return { app, renderer, version };
    }
    return null;
  };
  
  // Check 3: Aries Mod's sprite service (piggyback if available)
  const checkAriesService = (): PixiBundle | null => {
    const ariesService = root.__MG_SPRITE_SERVICE__;
    if (ariesService?.state?.renderer) {
      return { app: ariesService.state.app || null, renderer: ariesService.state.renderer, version: ariesService.state.version || null };
    }
    return null;
  };
  
  // Check 4: React fiber traversal (direct DOM inspection)
  const checkFiber = (): PixiBundle | null => findPixiViaFiber();
  
  // Combined check - injected capture is most reliable for Chrome
  const check = (): PixiBundle | null => checkInjectedCapture() || checkGlobals() || checkAriesService() || checkFiber();
  
  // Try immediately
  const hit = check();
  if (hit) return hit;

  // Poll for up to 15 seconds with all methods
  const maxMs = 15000;
  const pollStart = performance.now();
  
  while (performance.now() - pollStart < maxMs) {
    await new Promise(r => setTimeout(r, 100));
    const retry = check();
    if (retry) return retry;
  }

  // Final fallback: wait on hooks
  const waited = await waitForPixi(hooks, 5000).catch(() => ({ app: null, renderer: null, version: null }));
  
  if (waited.renderer || waited.app?.renderer) {
    return { app: waited.app, renderer: waited.renderer || waited.app?.renderer, version: waited.version };
  }
  
  throw new Error('PIXI app timeout');
}

async function start(): Promise<SpriteService> {
  // Initialize context
  ctx = {
    cfg: { ...DEFAULT_CFG },
    state: createInitialState(),
  };

  // Note: hooks are created at module load time (see top of file)
  // This ensures we catch PIXI init events even if they happen before start() is called

  if (ctx.state.started) {
    throw new Error('Sprite system already started');
  }

  ctx.state.started = true;
  notifyWarmup({ phase: 'init', total: 0, done: 0, completed: false });

  // Detect version and build base URL early so we can start prefetching
  const version = detectGameVersion();
  const base = buildAssetsBaseUrl(ctx.cfg.origin);
  ctx.state.version = version;
  ctx.state.base = base;

  // Start prefetching atlas data in parallel with PIXI initialization
  // This overlaps network I/O with waiting for the game to initialize PIXI
  if (!prefetchPromise) {
    prefetchPromise = prefetchAtlasData(base);
  }

  notifyWarmup({ phase: 'wait-pixi' });

  // Resolve PIXI using fast direct detection, falling back to hooks
  const { app, renderer: _renderer, version: pixiVersion } = await resolvePixiFast();
  await ensureDocumentReady();
  
  // Brief yield to let the browser catch up after PIXI init
  await yieldToBrowser();

  // Get renderer (prefer explicit renderer, fallback to app.renderer)
  const renderer = _renderer || app?.renderer || app?.render || null;
  if (!renderer) {
    throw new Error('No PIXI renderer found');
  }
  
  // Get PIXI constructors - try global PIXI first, then fall back to extraction
  ctx.state.ctors = getCtors(app, renderer);
  ctx.state.app = app; // May be null if we got renderer through canvasSpriteCache
  ctx.state.renderer = renderer;
  ctx.state.sig = computeVariantSignature(ctx.state).sig;

  // Wait for prefetch to complete (should already be done or nearly done)
  const prefetched = await (prefetchPromise ?? Promise.resolve(null));

  // Load all textures using prefetched data where available
  await loadTextures(ctx.state.base, ctx.state, ctx.cfg, prefetched);

  // Start job processor using ticker if available, otherwise use requestAnimationFrame
  ctx.state.open = true;
  if (app?.ticker?.add) {
    app.ticker.add(() => {
      processVariantJobs(ctx!.state, ctx!.cfg);
    });
  } else {
    // Fallback: use requestAnimationFrame for job processing
    const processLoop = () => {
      if (ctx?.state?.open) {
        processVariantJobs(ctx.state, ctx.cfg);
        requestAnimationFrame(processLoop);
      }
    };
    requestAnimationFrame(processLoop);
  }

  // Helper to render texture to canvas
  const renderTextureToCanvas = (tex: any): HTMLCanvasElement | null => {
    try {
      const spr = new ctx!.state.ctors!.Sprite(tex);
      const canvas = ctx!.state.renderer.extract.canvas(spr, { resolution: 1 });
      spr.destroy?.({ children: true, texture: false, baseTexture: false });
      return canvas;
    } catch (e) {
      return null;
    }
  };

  // Build service
  const service: SpriteService = {
    ready: Promise.resolve(),
    state: ctx.state,
    cfg: ctx.cfg,

    list(category = 'any') {
      return api.listItemsByCategory(ctx!.state, category);
    },

    getBaseSprite(params) {
      return api.getBaseSprite(params, ctx!.state);
    },

    getSpriteWithMutations(params) {
      return api.getSpriteWithMutations(params, ctx!.state, ctx!.cfg);
    },

    buildVariant(mutations) {
      return api.buildVariant(mutations);
    },

    renderToCanvas(arg: GetSpriteParams | any): HTMLCanvasElement | null {
      const tex = arg?.isTexture || arg?.frame ? arg : service.getSpriteWithMutations(arg);
      if (!tex) return null;
      return renderTextureToCanvas(tex);
    },

    async renderToDataURL(arg: GetSpriteParams | any, type = 'image/png', quality?: number): Promise<string | null> {
      const c = service.renderToCanvas(arg);
      if (!c) return null;
      return c.toDataURL(type, quality);
    },

    renderOnCanvas(arg: GetSpriteParams | any, opts: RenderOptions = {}): { wrap: HTMLDivElement; canvas: HTMLCanvasElement } | null {
      const c = service.renderToCanvas(arg);
      if (!c) return null;

      c.style.background = 'transparent';
      c.style.display = 'block';

      let mutW = c.width || c.clientWidth;
      let mutH = c.height || c.clientHeight;
      let baseW = mutW;
      let baseH = mutH;

      if (arg && !arg.isTexture && !arg.frame) {
        const baseTex = service.getBaseSprite(arg);
        if (baseTex) {
          baseW = baseTex?.orig?.width ?? baseTex?._orig?.width ?? baseTex?.frame?.width ?? baseTex?._frame?.width ?? baseTex?.width ?? baseW;
          baseH = baseTex?.orig?.height ?? baseTex?._orig?.height ?? baseTex?.frame?.height ?? baseTex?._frame?.height ?? baseTex?.height ?? baseH;
        }
      }

      const scaleToBase = Math.min(baseW / mutW, baseH / mutH, 1);
      let logicalW = mutW * scaleToBase;
      let logicalH = mutH * scaleToBase;

      const { maxWidth, maxHeight, allowScaleUp } = opts;
      if (maxWidth || maxHeight) {
        const scaleW = maxWidth ? maxWidth / logicalW : 1;
        const scaleH = maxHeight ? maxHeight / logicalH : 1;
        let scale = Math.min(scaleW || 1, scaleH || 1);
        if (!allowScaleUp) scale = Math.min(scale, 1);
        logicalW = Math.floor(logicalW * scale);
        logicalH = Math.floor(logicalH * scale);
      }

      if (logicalW) c.style.width = `${logicalW}px`;
      if (logicalH) c.style.height = `${logicalH}px`;

      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:inline-flex;align-items:flex-start;justify-content:flex-start;padding:0;margin:0;background:transparent;border:none;flex:0 0 auto;';
      wrap.appendChild(c);

      return { wrap, canvas: c };
    },

    clearOverlay(): void {
      const host = document.getElementById('mg-sprite-overlay');
      if (host) host.remove();
    },

    renderAnimToCanvases(params: GetSpriteParams): HTMLCanvasElement[] {
      const item = ctx!.state.items.find((it) => it.key === `sprite/${params.category}/${params.id}` || it.key === params.id);
      if (!item) return [];

      if (item.isAnim && item.frames?.length) {
        const texes = params?.mutations?.length ? [service.getSpriteWithMutations(params)] : item.frames;
        return texes.map((t) => renderTextureToCanvas(t)).filter(Boolean) as HTMLCanvasElement[];
      }

      const t = service.getSpriteWithMutations(params);
      return t ? [renderTextureToCanvas(t)].filter(Boolean) as HTMLCanvasElement[] : [];
    },
  };

  // Expose to global
  const win = getRuntimeWindow();
  (win as any).__MG_SPRITE_STATE__ = ctx.state;
  (win as any).__MG_SPRITE_CFG__ = ctx.cfg;
  (win as any).__MG_SPRITE_SERVICE__ = service;
  (win as any).MG_SPRITE_HELPERS = service;

  // Expose individual functions
  (win as any).getSpriteWithMutations = service.getSpriteWithMutations;
  (win as any).getBaseSprite = service.getBaseSprite;
  (win as any).buildSpriteVariant = service.buildVariant;
  (win as any).listSpritesByCategory = service.list;
  (win as any).renderSpriteToCanvas = service.renderToCanvas;
  (win as any).renderSpriteToDataURL = service.renderToDataURL;

  // Expose catalog API
  (win as any).MGSpriteCatalog = {
    open() {
      ctx!.state.open = true;
    },
    close() {
      ctx!.state.open = false;
    },
    toggle() {
      ctx!.state.open = !ctx!.state.open;
    },
    setCategory(cat: string) {
      ctx!.state.cat = cat || '__all__';
    },
    setFilterText(text: string) {
      ctx!.state.q = String(text || '').trim();
    },
    setSpriteFilter(name: string) {
      ctx!.state.f = name;
      ctx!.state.mutOn = false;
    },
    setMutation(on: boolean, ...muts: string[]) {
      ctx!.state.mutOn = !!on;
      ctx!.state.f = '';
      ctx!.state.mutations = ctx!.state.mutOn ? muts.filter(Boolean).map((name) => name) : [];
    },
    filters() {
      return [];
    },
    categories() {
      return [...ctx!.state.cats.keys()].sort((a, b) => a.localeCompare(b));
    },
    cacheStats() {
      return getCacheStats(ctx!.state);
    },
    clearCache() {
      clearVariantCache(ctx!.state);
    },
    curVariant: () => computeVariantSignature(ctx!.state),
  };

  console.log('[QPM Sprite-v2] Initialized', {
    version: ctx.state.version,
    pixi: pixiVersion,
    textures: ctx.state.tex.size,
    items: ctx.state.items.length,
    categories: ctx.state.cats.size,
  });

  return service;
}

// Export the service initializer
export { start as initSpriteSystem };

// Export types
export type { SpriteService, GetSpriteParams, RenderOptions };
