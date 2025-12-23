// sprite-v2/hooks.ts - PIXI.js integration hooks
// Uses DOM script injection for Chrome compatibility

import type { PixiHooks } from './types';

// Declare unsafeWindow for TypeScript (provided by Tampermonkey in sandbox mode)
declare const unsafeWindow: (Window & typeof globalThis) | undefined;

/**
 * Get the page window context (unsafeWindow for Tampermonkey, or globalThis fallback)
 */
function getRoot(): any {
  return typeof unsafeWindow !== 'undefined' && unsafeWindow
    ? unsafeWindow
    : globalThis;
}

/**
 * Inject hooks directly into the page context via DOM script injection.
 * This is critical for Chrome where unsafeWindow doesn't give access to the same
 * window object that PIXI DevTools uses.
 * 
 * The injected script sets window.__QPM_PIXI_CAPTURED__ when PIXI is detected.
 */
function injectPageContextHooks(): void {
  // Only inject once
  const root = getRoot();
  if (root.__QPM_HOOKS_INJECTED__) return;
  root.__QPM_HOOKS_INJECTED__ = true;

  // Create the script content that will run in the page context
  const scriptContent = `
(function() {
  if (window.__QPM_PIXI_HOOKS_ACTIVE__) return;
  window.__QPM_PIXI_HOOKS_ACTIVE__ = true;
  
  // Storage for captured PIXI objects
  window.__QPM_PIXI_CAPTURED__ = { app: null, renderer: null, version: null };
  
  // Hook into a global function, preserving any previous hook
  function hook(name, cb) {
    var prev = window[name];
    window[name] = function() {
      try { cb.apply(this, arguments); }
      finally { if (typeof prev === 'function') try { prev.apply(this, arguments); } catch(e) {} }
    };
  }
  
  // Hook PIXI initialization
  hook('__PIXI_APP_INIT__', function(app, version) {
    if (app && !window.__QPM_PIXI_CAPTURED__.app) {
      window.__QPM_PIXI_CAPTURED__.app = app;
      window.__QPM_PIXI_CAPTURED__.version = version;
      if (app.renderer) window.__QPM_PIXI_CAPTURED__.renderer = app.renderer;
    }
  });
  
  hook('__PIXI_RENDERER_INIT__', function(renderer, version) {
    if (renderer && !window.__QPM_PIXI_CAPTURED__.renderer) {
      window.__QPM_PIXI_CAPTURED__.renderer = renderer;
      window.__QPM_PIXI_CAPTURED__.version = version;
    }
  });
  
  // Poll for already-existing PIXI globals
  function checkExisting() {
    if (window.__QPM_PIXI_CAPTURED__.app && window.__QPM_PIXI_CAPTURED__.renderer) return;
    var maybeApp = window.__PIXI_APP__ || window.PIXI_APP || window.app;
    if (maybeApp && maybeApp.renderer && !window.__QPM_PIXI_CAPTURED__.app) {
      window.__QPM_PIXI_CAPTURED__.app = maybeApp;
      window.__QPM_PIXI_CAPTURED__.renderer = maybeApp.renderer;
    }
    var maybeRdr = window.__PIXI_RENDERER__ || window.PIXI_RENDERER__;
    if (maybeRdr && !window.__QPM_PIXI_CAPTURED__.renderer) {
      window.__QPM_PIXI_CAPTURED__.renderer = maybeRdr;
    }
  }
  
  checkExisting();
  var pollCount = 0;
  var pollInterval = setInterval(function() {
    checkExisting();
    if (++pollCount >= 100 || (window.__QPM_PIXI_CAPTURED__.app && window.__QPM_PIXI_CAPTURED__.renderer)) {
      clearInterval(pollInterval);
    }
  }, 100);
})();
`;

  try {
    const script = document.createElement('script');
    script.textContent = scriptContent;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  } catch {
    // Silent failure - will fall back to other detection methods
  }
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
 * Uses both userscript hooks AND injected page context hooks for Chrome compatibility.
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
  
  // Inject hooks into page context for Chrome compatibility
  injectPageContextHooks();

  // Hook into a global function on unsafeWindow (works on Firefox)
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

  // Set up hooks on unsafeWindow (works on Firefox)
  hook('__PIXI_APP_INIT__', (a: any, v: any) => {
    if (!APP) {
      APP = a;
      PIXI_VER = v;
      appResolver?.(a);
    }
  });

  hook('__PIXI_RENDERER_INIT__', (r: any, v: any) => {
    if (!RDR) {
      RDR = r;
      PIXI_VER = v;
      rdrResolver?.(r);
    }
  });

  // Try to find PIXI from multiple sources
  const tryResolveExisting = () => {
    if (APP && RDR) return;
    
    // Source 1: Check injected script's captured data (Chrome)
    const captured = root.__QPM_PIXI_CAPTURED__;
    if (captured) {
      if (!APP && captured.app) {
        APP = captured.app;
        PIXI_VER = captured.version;
        appResolver?.(APP);
      }
      if (!RDR && captured.renderer) {
        RDR = captured.renderer;
        PIXI_VER = captured.version;
        rdrResolver?.(RDR);
      }
    }
    
    // Source 2: Check global variables on unsafeWindow
    if (!APP) {
      const maybeApp = root.__PIXI_APP__ || root.PIXI_APP || root.app;
      if (maybeApp?.renderer) {
        APP = maybeApp;
        appResolver?.(APP);
      }
    }
    if (!RDR) {
      const maybeRdr = root.__PIXI_RENDERER__ || root.PIXI_RENDERER__ || root.renderer || APP?.renderer;
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

  // Poll for captured PIXI (especially important for Chrome)
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
