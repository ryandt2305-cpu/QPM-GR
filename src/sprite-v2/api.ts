// sprite-v2/api.ts - Public API for sprite retrieval

import type { GetSpriteParams, SpriteState, SpriteConfig, SpriteCategory, SpriteItem } from './types';
import { normalizeKey, baseNameOf } from './utils';
import { buildVariantFromMutations, renderMutatedTexture } from './renderer';
import { cacheGet, cacheSet } from './cache';

const categoryAlias: Record<string, string[]> = {
  plant: ['plant'],
  tallplant: ['tallplant'],
  crop: ['crop'],
  decor: ['decor'],
  item: ['item'],
  pet: ['pet'],
  seed: ['seed'],
  mutation: ['mutation'],
  'mutation-overlay': ['mutation-overlay'],
  any: [],
};

function keyCategoryOf(key: string): string {
  const parts = key.split('/').filter(Boolean);
  if (parts[0] === 'sprite' || parts[0] === 'sprites') return parts[1] ?? '';
  return parts[0] ?? '';
}

function matchesCategory(keyCat: string, requested: SpriteCategory): boolean {
  if (requested === 'any') return true;
  const aliases = categoryAlias[requested] || [];
  return aliases.some((a) => normalizeKey(keyCat) === normalizeKey(a));
}

function findItem(state: SpriteState, category: SpriteCategory, id: string): SpriteItem | null {
  const normId = normalizeKey(id);

  for (const it of state.items) {
    const keyCat = keyCategoryOf(it.key);
    if (!matchesCategory(keyCat, category)) continue;

    const base = normalizeKey(baseNameOf(it.key));
    if (base === normId) return it;
  }

  return null;
}

export function listItemsByCategory(state: SpriteState, category: SpriteCategory = 'any'): SpriteItem[] {
  return state.items.filter((it) => matchesCategory(keyCategoryOf(it.key), category));
}

export function buildVariant(mutations: string[]) {
  return buildVariantFromMutations(mutations);
}

export function getSpriteWithMutations(params: GetSpriteParams, state: SpriteState, cfg: SpriteConfig): any {
  const it = findItem(state, params.category, params.id);
  if (!it) return null;

  const tex = it.isAnim ? it.frames?.[0] : it.first;
  if (!tex) return null;

  const V = buildVariantFromMutations(params.mutations || []);

  // Check cache first to avoid re-rendering
  const cacheKey = `${it.key}|${V.sig}`;
  const cached = cacheGet(state, cacheKey);
  if (cached) {
    return cached.isAnim ? (cached.frames?.[0] ?? null) : (cached.tex ?? null);
  }

  // Not cached - render it
  const rendered = renderMutatedTexture(tex, it.key, V, state, cfg);

  // Cache the result for future requests
  if (rendered) {
    cacheSet(state, cfg, cacheKey, {
      isAnim: false,
      tex: rendered
    });
  }

  return rendered;
}

export function getBaseSprite(params: GetSpriteParams, state: SpriteState): any {
  const it = findItem(state, params.category, params.id);
  if (!it) return null;

  return it.isAnim ? it.frames?.[0] ?? null : it.first;
}
