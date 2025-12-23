// sprite-v2/hooks.ts - PIXI.js integration hooks
// Modeled after Arie's Mod sprite system for maximum compatibility

import type { PixiHooks } from './types';

/**
 * Get the correct window context for userscript globals.
 * In Tampermonkey/Greasemonkey, unsafeWindow provides access to the page's window.
 */
function getRoot(): any {
  return (globalThis as any).unsafeWindow || globalThis;
}

/**
 * Waits for a promise with timeout
 */
async function waitWithTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  const t0 = performance.now();
  const sleep = (ms: number) => new Promise<null>((resolve) => setTimeout(() => resolve(null), ms));

  while (performance.now() - t0 < ms) {
    const result = await Promise.race([p, sleep(50)]);
    if (result !== null) return result;
  }

  throw new Error(`${label} timeout`);
}

/**
 * Creates hooks to intercept PIXI initialization.
 * The game calls __PIXI_APP_INIT__ and __PIXI_RENDERER_INIT__ when PIXI is ready.
 * We need to hook into these to get access to PIXI constructors and renderer.
 * 
 * CRITICAL: This function must be called at MODULE LOAD TIME, not inside async functions.
 * The game may initialize PIXI before any async code runs.
 */
export function createPixiHooks(): PixiHooks {
  let appResolver: ((app: any) => void) | undefined;
  let rdrResolver: ((renderer: any) => void) | undefined;

  const appReady = new Promise<any>((resolve) => {
    appResolver = resolve;
  });

  const rendererReady = new Promise<any>((resolve) => {
    rdrResolver = resolve;
  });

  let APP: any = null;
  let RDR: any = null;
  let PIXI_VER: string | null = null;

  const root = getRoot();

  // Helper to hook into a global function
  const hook = (name: string, cb: (...args: any[]) => void) => {
    const prev = root[name];
    root[name] = function () {
      try {
        cb.apply(this, arguments as any);
      } finally {
        if (typeof prev === 'function') {
          try {
            prev.apply(this, arguments as any);
          } catch {
            /* ignore */
          }
        }
      }
    };
  };

  // Hook into PIXI initialization events
  hook('__PIXI_APP_INIT__', (a: any, v: any) => {
    if (!APP) {
      APP = a;
      PIXI_VER = v;
      appResolver?.(a);
      console.log('[Sprite Hooks] Captured PIXI app via hook');
    }
  });

  hook('__PIXI_RENDERER_INIT__', (r: any, v: any) => {
    if (!RDR) {
      RDR = r;
      PIXI_VER = v;
      rdrResolver?.(r);
    }
  });

  // Fallback: Try to detect already-initialized PIXI (in case we loaded after game init)
  const tryResolveExisting = () => {
    if (!APP) {
      // Check multiple possible locations for the PIXI app
      const maybeApp = root.__PIXI_APP__ || root.PIXI_APP || root.app;
      if (maybeApp) {
        APP = maybeApp;
        appResolver?.(APP);
        console.log('[Sprite Hooks] Found existing PIXI app');
      }
    }
    if (!RDR) {
      // Check multiple possible locations for the renderer
      const maybeRdr = root.__PIXI_RENDERER__ || root.PIXI_RENDERER__ || root.renderer || (APP as any)?.renderer;
      if (maybeRdr) {
        RDR = maybeRdr;
        rdrResolver?.(RDR);
      }
    }
    if (APP && !PIXI_VER) {
      PIXI_VER = root.__PIXI__?.VERSION || root.PIXI?.VERSION || '8.x';
    }
  };

  // Try immediately
  tryResolveExisting();

  // Poll for a while in case PIXI is created shortly after we load
  let fallbackPolls = 0;
  const fallbackInterval = setInterval(() => {
    if (APP && RDR) {
      clearInterval(fallbackInterval);
      return;
    }
    tryResolveExisting();
    fallbackPolls += 1;
    if (fallbackPolls >= 100) { // 10 seconds at 100ms intervals
      clearInterval(fallbackInterval);
    }
  }, 100);

  return {
    get app() {
      return APP;
    },
    get renderer() {
      return RDR;
    },
    get pixiVersion() {
      return PIXI_VER;
    },
    appReady,
    rendererReady,
  };
}

/**
 * Waits for PIXI to be initialized and returns the app and renderer
 */
export async function waitForPixi(
  handles: PixiHooks,
  timeoutMs = 15000
): Promise<{ app: any; renderer: any; version: string | null }> {
  const app = await waitWithTimeout(handles.appReady, timeoutMs, 'PIXI app');
  const renderer = await waitWithTimeout(handles.rendererReady, timeoutMs, 'PIXI renderer');

  return { app, renderer, version: handles.pixiVersion };
}

/**
 * Ensures the document is ready before proceeding
 */
export function ensureDocumentReady(): Promise<void> {
  if (document.readyState !== 'loading') {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const onReady = () => {
      document.removeEventListener('DOMContentLoaded', onReady);
      resolve();
    };
    document.addEventListener('DOMContentLoaded', onReady);
  });
}
