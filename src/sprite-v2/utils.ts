// sprite-v2/utils.ts - PIXI utility functions

import type { PixiConstructors } from './types';
import { getRuntimeWindow } from './detector';

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

/**
 * Extracts PIXI constructors from the app or global PIXI object
 */
export function getCtors(app: any): PixiConstructors {
  const win = getRuntimeWindow();
  const P = (win as any).PIXI;

  // Try to get constructors from global PIXI object
  if (P?.Texture && P?.Sprite && P?.Container && P?.Rectangle) {
    return {
      Container: P.Container,
      Sprite: P.Sprite,
      Texture: P.Texture,
      Rectangle: P.Rectangle,
      Text: P.Text || null,
    };
  }

  // Fallback: extract constructors from stage
  const stage = app?.stage;
  const anySpr = findAny(stage, (x) => {
    return x?.texture?.frame && x?.constructor && x?.texture?.constructor && x?.texture?.frame?.constructor;
  });

  if (!anySpr) {
    throw new Error('No Sprite found - cannot extract PIXI constructors');
  }

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
