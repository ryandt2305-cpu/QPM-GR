// sprite-v2/index.ts - Main sprite system initialization

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

// Global state
let ctx: {
  cfg: SpriteConfig;
  state: SpriteState;
} | null = null;

let hooks: ReturnType<typeof createPixiHooks> | null = null;

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

async function loadTextures(base: string, state: SpriteState, cfg: SpriteConfig): Promise<void> {
  const manifest = await getJSON(joinPath(base, 'manifest.json'));
  const atlasJsons = await loadAtlasJsons(base, manifest);

  const ctors = state.ctors;
  if (!ctors?.Texture || !ctors?.Rectangle) {
    throw new Error('PIXI constructors missing');
  }

  for (const [path, data] of Object.entries(atlasJsons)) {
    if (!isAtlas(data)) continue;

    const imgPath = relPath(path, data.meta.image);
    const img = await blobToImage(await getBlob(joinPath(base, imgPath)));
    const baseTex = ctors.Texture.from(img);

    buildAtlasTextures(data, baseTex, state.tex, state.atlasBases, ctors);
  }

  const { items, cats } = buildItemsFromTextures(state.tex, { catLevels: 1 });
  state.items = items;
  state.filtered = items.slice();
  state.cats = cats;
  state.loaded = true;
}

async function start(): Promise<SpriteService> {
  // Initialize context
  ctx = {
    cfg: { ...DEFAULT_CFG },
    state: createInitialState(),
  };

  hooks = createPixiHooks();

  if (ctx.state.started) {
    throw new Error('Sprite system already started');
  }

  ctx.state.started = true;

  // Wait for PIXI
  const { app, renderer: _renderer, version: pixiVersion } = await waitForPixi(hooks);
  await ensureDocumentReady();

  ctx.state.ctors = getCtors(app);
  const renderer = _renderer || app?.renderer || app?.render || null;
  ctx.state.app = app;
  ctx.state.renderer = renderer;

  // Detect version and build base URL
  ctx.state.version = detectGameVersion();
  ctx.state.base = buildAssetsBaseUrl(ctx.cfg.origin);
  ctx.state.sig = computeVariantSignature(ctx.state).sig;

  // Load all textures
  await loadTextures(ctx.state.base, ctx.state, ctx.cfg);

  // Start job processor
  ctx.state.open = true;
  app.ticker?.add?.(() => {
    processVariantJobs(ctx!.state, ctx!.cfg);
  });

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
