// sprite-v2/utils.ts - PIXI utility functions
// Simplified to match Aries Mod's approach for Chrome/Firefox compatibility

import type { PixiConstructors } from './types';

/**
 * Finds any node in a PIXI display tree matching a predicate
 */
export function findAny(root: any, pred: (node: any) => boolean, lim = 25000): any {
  const stack = [root];
  const seen = new Set();
  let n = 0;

  while (stack.length && n++ < lim) {
    const node = stack.pop();
    if (!node || seen.has(node)) continue;
    seen.add(node);

    if (pred(node)) return node;

    const children = node.children;
    if (Array.isArray(children)) {
      for (let i = children.length - 1; i >= 0; i -= 1) {
        stack.push(children[i]);
      }
    }
  }

  return null;
}

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
 * Extracts PIXI constructors from the app, renderer, or global PIXI object.
 * Uses unsafeWindow consistently for Chrome/Firefox compatibility.
 */
export function getCtors(app: any, renderer?: any): PixiConstructors {
  const root = getRoot();
  const P = root.PIXI || root.__PIXI__;

  // Method 1: Try to get constructors from global PIXI object (most reliable)
  if (P?.Texture && P?.Sprite && P?.Container && P?.Rectangle) {
    return {
      Container: P.Container,
      Sprite: P.Sprite,
      Texture: P.Texture,
      Rectangle: P.Rectangle,
      Text: P.Text || null,
    };
  }

  // Method 2: Try to extract from app.stage if app is available
  if (app?.stage) {
    const stage = app.stage;
    const anySpr = findAny(stage, (x) => {
      return x?.texture?.frame && x?.constructor && x?.texture?.constructor && x?.texture?.frame?.constructor;
    });

    if (anySpr) {
      const anyTxt = findAny(
        stage,
        (x) => (typeof x?.text === 'string' || typeof x?.text === 'number') && x?.style
      );

      return {
        Container: stage.constructor,
        Sprite: anySpr.constructor,
        Texture: anySpr.texture.constructor,
        Rectangle: anySpr.texture.frame.constructor,
        Text: anyTxt?.constructor || null,
      };
    }
  }

  throw new Error('No PIXI constructors found - cannot extract from app or globals');
}

/**
 * Gets the base texture from a texture (handles different PIXI versions)
 */
export function baseTexOf(tex: any): any {
  return (
    tex?.baseTexture ??
    tex?.source?.baseTexture ??
    tex?.source ??
    tex?._baseTexture ??
    null
  );
}

/**
 * Remembers base textures to prevent garbage collection
 */
export function rememberBaseTex(tex: any, atlasBases: Set<any>): void {
  const base = baseTexOf(tex);
  if (base) atlasBases.add(base);
}

/**
 * Normalizes a key for comparison (lowercase, alphanumeric only)
 */
export function normalizeKey(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Gets the base name from a sprite key (last component)
 */
export function baseNameOf(key: string): string {
  const parts = String(key || '').split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

/**
 * Checks if a key represents a tall plant
 */
export function isTallKey(k: string): boolean {
  return /tallplant/i.test(k);
}
