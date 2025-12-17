// sprite-v2/hooks.ts - PIXI.js integration hooks

import type { PixiHooks } from './types';
import { getRuntimeWindow } from './detector';

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

  const root = getRuntimeWindow();

  // Hook into PIXI app initialization
  const prevAppInit = (root as any).__PIXI_APP_INIT__;
  (root as any).__PIXI_APP_INIT__ = function (a: any, v: string) {
    if (!APP) {
      APP = a;
      PIXI_VER = v;
      appResolver?.(a);
    }

    // Call original hook if it exists
    if (typeof prevAppInit === 'function') {
      try {
        prevAppInit.call(this, a, v);
      } catch (e) {
        // Ignore errors from previous hooks
      }
    }
  };

  // Hook into PIXI renderer initialization
  const prevRendererInit = (root as any).__PIXI_RENDERER_INIT__;
  (root as any).__PIXI_RENDERER_INIT__ = function (r: any, v: string) {
    if (!RDR) {
      RDR = r;
      PIXI_VER = v;
      rdrResolver?.(r);
    }

    // Call original hook if it exists
    if (typeof prevRendererInit === 'function') {
      try {
        prevRendererInit.call(this, r, v);
      } catch (e) {
        // Ignore errors from previous hooks
      }
    }
  };

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
