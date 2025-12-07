// src/ui/achievementsWindow.ts
// Achievements window UI (phase 1 stub)

import { formatCoinsAbbreviated } from '../features/valueCalculator';
import { getAchievementDefinitions, getAchievementProgress, subscribeToAchievements, triggerAchievementRecompute, getAchievementSnapshot, type AchievementDefinition, type AchievementRarity } from '../store/achievements';
import { createSpriteElement, getPetSpriteDataUrl, loadTrackedSpriteSheets, spriteExtractor, listTrackedSpriteResources } from '../utils/spriteExtractor';
import { getMutationSpriteDataUrl } from '../utils/petMutationRenderer';
import { log } from '../utils/logger';
type FilterStatus = 'all' | 'in-progress' | 'completed';
type CategoryFilter = 'all' | 'garden' | 'pets' | 'abilities' | 'shop' | 'weather' | 'wealth' | 'collection' | 'streaks' | 'obscure';

type GroupedAchievement = {
  key: string;
  entries: AchievementDefinition[];
};

let debugShowAllBadges = false;
let lastWindowState: AchievementsWindowState | null = null;

// Sprite hydration (lazy apply to reduce upfront work on low-end devices)
const achievementSpriteRegistry = new Map<string, () => string | null>();
const achievementSpriteQueue = new Set<HTMLElement>();
let achievementSpriteCounter = 0;
let achievementSpriteHydrationScheduled = false;
const ACHIEVEMENT_SPRITE_FRAME_BUDGET_MS = 12;
const ACHIEVEMENT_SPRITE_MAX_PER_FRAME = 4;
let achievementSpriteObserver: IntersectionObserver | null = null;
const ACHIEVEMENT_SPRITE_IDLE_WARM_LIMIT = 32;
let achievementSpriteIdleScheduled = false;

const rarityOrder: AchievementRarity[] = ['common', 'uncommon', 'rare', 'legendary', 'mythical', 'divine', 'celestial'];
const rarityRank = rarityOrder.reduce<Record<AchievementRarity, number>>((acc, rarity, idx) => {
  acc[rarity] = idx;
  return acc;
}, {} as Record<AchievementRarity, number>);

const rarityStyles: Record<AchievementRarity, { bg: string; color: string; border?: string; bar: string; accent?: string }> = {
  common: { bg: '#1f2430', color: '#e0e0e0', border: '#2f3644', bar: 'linear-gradient(90deg, #9ea7b8, #c7cfdd)', accent: '#c7cfdd' },
  uncommon: { bg: '#1f3024', color: '#d7f7df', border: '#3a5f44', bar: 'linear-gradient(90deg, #5bbf7a, #8ee0a8)', accent: '#8ee0a8' },
  rare: { bg: '#1f233a', color: '#e6e1ff', border: '#5b5fa8', bar: 'linear-gradient(90deg, #6d7dff, #a48bff)', accent: '#a48bff' },
  legendary: { bg: '#2c210f', color: '#ffecc2', border: '#d9a441', bar: 'linear-gradient(90deg, #ffcc55, #ffdf99)', accent: '#ffcc55' },
  mythical: { bg: '#271a3a', color: '#f2d9ff', border: '#9b6bdf', bar: 'linear-gradient(90deg, #b377ff, #e2c3ff)', accent: '#d3a2ff' },
  divine: { bg: '#301616', color: '#ffe4d7', border: '#d46b4e', bar: 'linear-gradient(90deg, #ff7b4a, #ffc2a1)', accent: '#ff9e7a' },
  celestial: { bg: 'linear-gradient(120deg, #1b1f3a, #1f2f46, #2f1f46)', color: '#f8fbff', border: 'rgba(255,255,255,0.85)', bar: 'linear-gradient(90deg, #ff6ec7, #ffd166, #6ec8ff, #b37bff, #ff6ec7)', accent: '#ffd166' },
};

function formatTargetLabel(target: number): string {
  const abs = Math.abs(target);
  const trim = (value: number) => {
    const rounded = value.toFixed(1);
    return rounded.endsWith('.0') ? rounded.slice(0, -2) : rounded;
  };

  if (abs >= 1e15) return `${trim(abs / 1e15)}Q`;
  if (abs >= 1e12) return `${trim(abs / 1e12)}T`;
  if (abs >= 1e9) return `${trim(abs / 1e9)}B`;
  if (abs >= 1e6) return `${trim(abs / 1e6)}M`;
  if (abs >= 1e3) return `${trim(abs / 1e3)}K`;
  return target.toLocaleString();
}

function ensureAchievementSpriteObserver(): void {
  if (achievementSpriteObserver || typeof window === 'undefined' || !('IntersectionObserver' in window)) return;
  achievementSpriteObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const el = entry.target as HTMLElement;
      achievementSpriteObserver?.unobserve(el);
      queueAchievementSpriteHydration(el);
    }
  }, { rootMargin: '128px 0px 256px 0px' });
}

function queueAchievementSpriteHydration(node: HTMLElement): void {
  achievementSpriteQueue.add(node);
  scheduleAchievementSpriteHydration();
}

function scheduleAchievementSpriteIdleWarmup(): void {
  if (achievementSpriteIdleScheduled) return;
  achievementSpriteIdleScheduled = true;
  const idle = (window as any).requestIdleCallback as ((cb: IdleRequestCallback, opts?: { timeout?: number }) => number) | undefined;
  const runner = () => {
    achievementSpriteIdleScheduled = false;
    warmupAchievementSprites();
  };
  if (typeof idle === 'function') {
    idle(runner, { timeout: 500 });
  } else {
    setTimeout(runner, 32);
  }
}

function scheduleAchievementSpriteHydration(): void {
  if (achievementSpriteHydrationScheduled) return;
  achievementSpriteHydrationScheduled = true;
  const raf = typeof window !== 'undefined' ? window.requestAnimationFrame : null;
  if (typeof raf === 'function') {
    raf(processAchievementSpriteQueue);
  } else {
    setTimeout(processAchievementSpriteQueue, 16);
  }
}

function processAchievementSpriteQueue(): void {
  achievementSpriteHydrationScheduled = false;
  if (!achievementSpriteQueue.size) return;
  const start = performance.now();
  let hydrated = 0;
  for (const node of Array.from(achievementSpriteQueue)) {
    achievementSpriteQueue.delete(node);
    hydrateAchievementSprite(node);
    hydrated += 1;
    if (hydrated >= ACHIEVEMENT_SPRITE_MAX_PER_FRAME || performance.now() - start >= ACHIEVEMENT_SPRITE_FRAME_BUDGET_MS) {
      break;
    }
  }
  if (achievementSpriteQueue.size) {
    scheduleAchievementSpriteHydration();
  }
}

function warmupAchievementSprites(): void {
  if (!achievementSpriteQueue.size) return;
  let warmed = 0;
  const start = performance.now();
  for (const node of Array.from(achievementSpriteQueue)) {
    achievementSpriteQueue.delete(node);
    hydrateAchievementSprite(node);
    warmed += 1;
    if (warmed >= ACHIEVEMENT_SPRITE_IDLE_WARM_LIMIT || performance.now() - start >= ACHIEVEMENT_SPRITE_FRAME_BUDGET_MS * 2) {
      break;
    }
  }
  if (achievementSpriteQueue.size) {
    scheduleAchievementSpriteIdleWarmup();
  }
}

function hydrateAchievementSprite(node: HTMLElement): void {
  const id = node.dataset.achievementSpriteId;
  if (!id) return;
  const resolver = achievementSpriteRegistry.get(id);
  if (!resolver) {
    node.removeAttribute('data-achievement-sprite-id');
    return;
  }
  const url = resolver();
  if (url) {
    node.style.backgroundImage = `url(${url})`;
  }
  node.dataset.achievementSpriteHydrated = '1';
  node.removeAttribute('data-achievement-sprite-id');
  achievementSpriteRegistry.delete(id);
}

function registerAchievementSprite(node: HTMLElement, resolver: () => string | null): void {
  const id = `ach-sprite-${++achievementSpriteCounter}`;
  achievementSpriteRegistry.set(id, resolver);
  node.dataset.achievementSpriteId = id;
  ensureAchievementSpriteObserver();
  const observer = achievementSpriteObserver;
  if (observer) {
    observer.observe(node);
  } else {
    queueAchievementSpriteHydration(node);
  }
  scheduleAchievementSpriteIdleWarmup();
}

function hydrateAchievementSpritesWithin(root: ParentNode | null): void {
  if (!root) return;
  ensureAchievementSpriteObserver();
  const observer = achievementSpriteObserver;
  const nodes = root.querySelectorAll<HTMLElement>('[data-achievement-sprite-id]');
  nodes.forEach((node) => {
    if (node.dataset.achievementSpriteHydrated === '1') return;
    if (observer) {
      observer.observe(node);
    } else {
      queueAchievementSpriteHydration(node as HTMLElement);
    }
  });
  scheduleAchievementSpriteIdleWarmup();
}

function describeAchievement(def: AchievementDefinition, options: { hideTarget?: boolean } = {}): string {
  const hideTarget = options.hideTarget ?? false;
  const target = typeof def.target === 'number' ? def.target : undefined;
  const targetLabel = hideTarget ? '???' : target != null ? formatTargetLabel(target) : '—';
  const base = def.id.replace(/-\d+$/u, '');

  const byBase: Record<string, () => string> = {
    'garden:seedling': () => `Plant ${targetLabel} crops.`,
    'garden:harvester': () => `Harvest ${targetLabel} crops.`,
    'garden:watering': () => `Use ${targetLabel} watering cans.`,
    'garden:seed-hoarder': () => `Hold ${targetLabel} seeds of one type.`,
    'pets:hatchling': () => `Hatch ${targetLabel} pets.`,
    'pets:gold': () => `Hatch ${targetLabel} gold pets.`,
    'pets:rainbow': () => `Hatch ${targetLabel} rainbow pets.`,
    'abilities:proc': () => `Trigger ${targetLabel} pet ability procs.`,
    'economy:crop-earner': () => `Sell crops worth ${targetLabel} coins.`,
    'weather:fresh-frozen': () => `Watch it snow ${targetLabel} times.`,
    'weather:early-bird': () => `Sit through ${targetLabel} Dawn moons.`,
    'weather:night-owl': () => `Sit through ${targetLabel} Amber moons.`,
    'collection:produce': () => `Complete ${targetLabel} produce journal entries.`,
    'collection:pets': () => `Complete ${targetLabel} pet journal entries.`,
  };

  if (def.oneTime) return def.description;

  const handler = byBase[base];
  if (handler) return handler();

  return hideTarget ? def.description.replace(/\d[\d,_.]*(?:\s*[A-Za-z]+)?/u, '???') : def.description;
}

function groupAchievements(defs: AchievementDefinition[]): GroupedAchievement[] {
  const order: string[] = [];
  const map = new Map<string, AchievementDefinition[]>();

  defs.forEach((def) => {
    const base = def.id.replace(/-\d+$/u, '');
    if (!map.has(base)) {
      map.set(base, []);
      order.push(base);
    }
    map.get(base)!.push(def);
  });

  return order.map((key) => {
    const entries = (map.get(key) ?? []).slice().sort((a, b) => {
      const rarityDiff = rarityRank[a.rarity] - rarityRank[b.rarity];
      if (rarityDiff !== 0) return rarityDiff;
      const targetA = typeof a.target === 'number' ? a.target : 0;
      const targetB = typeof b.target === 'number' ? b.target : 0;
      return targetA - targetB;
    });
    return { key, entries };
  });
}

export interface AchievementsWindowState {
  root: HTMLElement;
  list: HTMLElement;
  oneTimeList: HTMLElement;
  badgesList: HTMLElement;
  achievementsSection: HTMLElement;
  oneTimeSection: HTMLElement;
  badgesSection: HTMLElement;
  tabButtons: Record<'achievements' | 'badges' | 'onetime', HTMLButtonElement>;
  summary: HTMLElement;
  unsubscribe: (() => void) | null;
  filterStatus: FilterStatus;
  filterCategory: CategoryFilter;
   groupPages: Record<string, number>;
  activeTab: 'achievements' | 'badges' | 'onetime';
}

const SPRITE_SIZE = 28;

const SHEET_URLS: Record<string, string> = {
  items: 'https://magicgarden.gg/version/436ff68/assets/tiles/items.png',
  animations: 'https://magicgarden.gg/version/436ff68/assets/tiles/animations.png',
  seeds: 'https://magicgarden.gg/version/436ff68/assets/tiles/seeds.png',
  plants: 'https://magicgarden.gg/version/436ff68/assets/tiles/plants.png',
  mutations: 'https://magicgarden.gg/version/436ff68/assets/tiles/mutations.png',
  pets: 'https://magicgarden.gg/version/436ff68/assets/tiles/pets.png',
};

const requestedSheets = new Set<string>();
const tileUrlCache = new Map<string, string | null>();
const sheetUrlOverrides = new Map<string, string>();
let primeSheetsPromise: Promise<void> | null = null;

function inferSheetNameFromUrl(url: string): string | null {
  const lowered = url.toLowerCase();
  if (lowered.includes('/tiles/items.png')) return 'items';
  if (lowered.includes('/tiles/animations.png')) return 'animations';
  if (lowered.includes('/tiles/seeds.png')) return 'seeds';
  if (lowered.includes('/tiles/plants.png')) return 'plants';
  if (lowered.includes('/tiles/mutations.png')) return 'mutations';
  if (lowered.includes('/tiles/pets.png')) return 'pets';
  return null;
}

function resolveSheetUrl(sheet: string): string | null {
  const cached = sheetUrlOverrides.get(sheet);
  if (cached) return cached;

  const tracked = listTrackedSpriteResources('all').find((entry) => entry.url.toLowerCase().includes(`/tiles/${sheet}.png`));
  if (tracked) {
    sheetUrlOverrides.set(sheet, tracked.url);
    return tracked.url;
  }

  const url = SHEET_URLS[sheet];
  if (url) {
    sheetUrlOverrides.set(sheet, url);
    return url;
  }
  return null;
}

async function primeAchievementSheets(): Promise<void> {
  if (primeSheetsPromise) return primeSheetsPromise;

  primeSheetsPromise = (async () => {
    try {
      const loaded = await loadTrackedSpriteSheets(6, 'all');
      loaded.forEach((url) => {
        const inferred = inferSheetNameFromUrl(url);
        if (inferred && !sheetUrlOverrides.has(inferred)) {
          sheetUrlOverrides.set(inferred, url);
        }
      });
    } catch (error) {
      log('⚠️ Failed to load tracked sprite sheets for achievements', error);
    }

    Object.entries(SHEET_URLS).forEach(([sheet, url]) => {
      if (!sheetUrlOverrides.has(sheet)) {
        sheetUrlOverrides.set(sheet, url);
      }
      if (!requestedSheets.has(sheet)) {
        requestedSheets.add(sheet);
        void spriteExtractor.loadSheetFromUrl(sheetUrlOverrides.get(sheet) ?? url, sheet).catch(() => requestedSheets.delete(sheet));
      }
    });
  })();

  try {
    await primeSheetsPromise;
  } finally {
    primeSheetsPromise = null;
  }
}

function ensureSheetTile(sheet: string, index: number): HTMLCanvasElement | null {
  const direct = spriteExtractor.getTile(sheet, index);
  if (direct) return direct;
  const url = resolveSheetUrl(sheet);
  if (url && !requestedSheets.has(sheet)) {
    requestedSheets.add(sheet);
    void spriteExtractor.loadSheetFromUrl(url, sheet).catch(() => requestedSheets.delete(sheet));
  }
  return spriteExtractor.getTile(sheet, index);
}

function createTileSpriteElement(sheet: string, index: number, size: number = SPRITE_SIZE): HTMLElement | null {
  const tile = ensureSheetTile(sheet, index);
  if (!tile) return null;
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
  registerAchievementSprite(div, () => getTileDataUrl(sheet, index));
  return div;
}

function getTileDataUrl(sheet: string, index: number): string | null {
  const key = `${sheet}:${index}`;
  if (tileUrlCache.has(key)) return tileUrlCache.get(key) ?? null;
  const tile = ensureSheetTile(sheet, index);
  if (!tile) return null;
  try {
    const url = tile.toDataURL('image/png');
    tileUrlCache.set(key, url);
    return url;
  } catch (error) {
    log('⚠️ Failed to read tile data URL', error);
    return null;
  }
}

function createPetSpriteElement(species: string, options?: { size?: number }): HTMLElement | null {
  const size = options?.size ?? SPRITE_SIZE;
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
  registerAchievementSprite(div, () => getPetSpriteDataUrl(species));
  return div;
}

function createMutatedPetSpriteElement(species: string, mutation: 'gold' | 'rainbow', size: number = SPRITE_SIZE): HTMLElement | null {
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
  registerAchievementSprite(div, () => getMutationSpriteDataUrl(species, mutation) ?? getPetSpriteDataUrl(species));
  return div;
}

function createLayeredSprite(layers: HTMLElement[], size: number = SPRITE_SIZE): HTMLElement | null {
  if (!layers.length) return null;
  const wrapper = document.createElement('div');
  wrapper.style.cssText = `position: relative; width: ${size}px; height: ${size}px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;`;
  layers.forEach((layer) => {
    layer.style.position = 'absolute';
    layer.style.inset = '0';
    wrapper.appendChild(layer);
  });
  hydrateAchievementSpritesWithin(wrapper);
  return wrapper;
}

type ResolvedSprite = { element: HTMLElement | null; url: string | null };

function createRainbowMaskedTile(sheet: string, index: number, size: number = SPRITE_SIZE): ResolvedSprite {
  const base = createTileSpriteElement(sheet, index, size);
  const baseUrl = getTileDataUrl(sheet, index);
  if (!base || !baseUrl) return { element: base, url: baseUrl };
  const rainbowOverlay = document.createElement('div');
  rainbowOverlay.style.cssText = `position:absolute; inset:0; background: linear-gradient(135deg, #ff1744, #ff9100, #ffea00, #00e676, #2979ff, #d500f9); mask-image: url(${baseUrl}); -webkit-mask-image: url(${baseUrl}); mask-size: contain; -webkit-mask-size: contain; mask-repeat: no-repeat; -webkit-mask-repeat: no-repeat; opacity: 0.9; mix-blend-mode: screen;`;
  const layered = createLayeredSprite([base, rainbowOverlay], size);
  return { element: layered ?? base, url: baseUrl };
}

function createRainbowMaskedFromUrl(baseUrl: string, size: number = SPRITE_SIZE): ResolvedSprite {
  const base = document.createElement('div');
  base.style.cssText = `position:absolute; inset:0; background: url(${baseUrl}) center/contain no-repeat; image-rendering: pixelated;`;
  const rainbowOverlay = document.createElement('div');
  rainbowOverlay.style.cssText = `position:absolute; inset:0; background: linear-gradient(135deg, #ff1744, #ff9100, #ffea00, #00e676, #2979ff, #d500f9); mask-image: url(${baseUrl}); -webkit-mask-image: url(${baseUrl}); mask-size: contain; -webkit-mask-size: contain; mask-repeat: no-repeat; -webkit-mask-repeat: no-repeat; opacity: 0.9; mix-blend-mode: screen;`;
  const layered = createLayeredSprite([base, rainbowOverlay], size);
  return { element: layered, url: baseUrl };
}

function createRainbowPetSprite(species: string, fallbackTileIndex: number): ResolvedSprite {
  const mutated = createMutatedPetSpriteElement(species, 'rainbow', SPRITE_SIZE);
  if (mutated) {
    const url = getMutationSpriteDataUrl(species, 'rainbow') ?? getPetSpriteDataUrl(species);
    return { element: mutated, url: url ?? null };
  }
  return createRainbowMaskedTile('pets', fallbackTileIndex, SPRITE_SIZE);
}

function resolveSprite(def: AchievementDefinition): ResolvedSprite {
  const base = def.id.replace(/-\d+$/u, '');
  const tile = (sheet: string, idx: number) => {
    const url = getTileDataUrl(sheet, idx);
    return { element: createTileSpriteElement(sheet, idx), url } satisfies ResolvedSprite;
  };
  const pet = (species: string, mutation?: 'gold' | 'rainbow') => {
    const url = mutation ? getMutationSpriteDataUrl(species, mutation) ?? getPetSpriteDataUrl(species) : getPetSpriteDataUrl(species);
    const element = mutation ? createMutatedPetSpriteElement(species, mutation, SPRITE_SIZE) : createPetSpriteElement(species, { size: SPRITE_SIZE });
    return { element, url } satisfies ResolvedSprite;
  };

  const specialById: Record<string, () => ResolvedSprite> = {
    'onetime:this-is-only-the-beginning': () => createRainbowPetSprite('worm', 9),
    'onetime:yummy-crop-eater': () => {
      const petLayer = createRainbowPetSprite('worm', 9);
      const cropElement = createTileSpriteElement('plants', 51, Math.round(SPRITE_SIZE * 1.1));
      if (cropElement) {
        cropElement.style.transform = 'translate(8px, 6px)';
        cropElement.style.zIndex = '1';
      }
      const petEl = petLayer.element;
      if (petEl) {
        petEl.style.zIndex = '2';
      }
      const layers = [cropElement, petEl].filter((l): l is HTMLElement => !!l);
      const element = layers.length ? createLayeredSprite(layers, SPRITE_SIZE) : petLayer.element;
      const cropUrl = getTileDataUrl('plants', 51);
      return { element, url: petLayer.url ?? cropUrl };
    },
    'onetime:eating-good': () => tile('pets', 6),
    'onetime:all-i-see-is-money': () => createRainbowMaskedTile('pets', 4, SPRITE_SIZE),
    'onetime:money-cant-buy-happiness': () => {
      const baseUrl = getTileDataUrl('pets', 10) ?? getTileDataUrl('items', 10);
      if (baseUrl) return createRainbowMaskedFromUrl(baseUrl, SPRITE_SIZE);
      return createRainbowMaskedTile('pets', 10, SPRITE_SIZE);
    },
    'onetime:gamblers-fallacy': () => tile('pets', 0),
    'onetime:rich': () => tile('items', 0),
    'onetime:baller-status': () => tile('items', 0),
    'onetime:whos-bill-gates': () => tile('items', 0),
    'onetime:what-is-money': () => tile('items', 0),
    'onetime:what-is-grass': () => tile('items', 0),
    'onetime:god-tier-research': () => tile('animations', 92),
    'onetime:perfect-produce': () => tile('plants', 14),
    'onetime:perfect-symmetry': () => pet('peacock', 'gold'),
    'onetime:mutation-marathon': () => tile('mutations', 3),
    'onetime:all-weathered': () => tile('animations', 19),
    'onetime:triple-hatch': () => {
      const normal = pet('bunny');
      const gold = pet('capybara', 'gold');
      const rainbow = pet('peacock', 'rainbow');
      const layers = [normal.element, gold.element, rainbow.element].filter((el): el is HTMLElement => !!el);
      if (layers.length) {
        layers.forEach((layer, idx) => {
          const offset = (idx - 1) * 6;
          layer.style.transform = `translate(${offset}px, ${Math.abs(offset) / 2}px)`;
          layer.style.opacity = '0.9';
        });
        return { element: createLayeredSprite(layers, SPRITE_SIZE) ?? null, url: normal.url ?? gold.url ?? rainbow.url };
      }
      return tile('items', 1);
    },
    'onetime:These-Exist!?': () => createRainbowMaskedTile('pets', 15, SPRITE_SIZE),
    'onetime:loyal-companion': () => pet('turtle'),
    'onetime:ability-synergy': () => tile('items', 13),
    'onetime:combo-caster': () => tile('animations', 49),
    'onetime:market-maker': () => tile('items', 10),
    'onetime:fire-sale': () => tile('animations', 16),
    'onetime:abilities:crit-crafter': () => tile('mutations', 1),
    'onetime:clutch-hatch': () => tile('items', 7),
  };

  const special = specialById[def.id];
  if (special) return special();

  const mapping: Record<string, () => ResolvedSprite> = {
    'garden:seedling': () => tile('seeds', 2),
    'garden:seed-hoarder': () => tile('seeds', 1),
    'garden:watering': () => tile('items', 8),
    'garden:harvester': () => tile('plants', 14),
    'pets:hatchling': () => pet('bunny'),
    'pets:gold': () => pet('capybara', 'gold'),
    'pets:rainbow': () => pet('peacock', 'rainbow'),
    'economy:crop-earner': () => tile('items', 10),
    'abilities:proc': () => tile('items', 13),
    'abilities:empowered-harvest': () => tile('mutations', 2),
    'garden:mutation-harvester': () => tile('mutations', 0),
    'garden:giant-grower': () => tile('plants', 30),
    'pets:trainer': () => pet('goat'),
    'streaks:diligent-gardener': () => tile('items', 11),
    'collection:produce': () => tile('items', 24),
    'collection:pets': () => tile('items', 25),
    'weather:fresh-frozen': () => tile('animations', 19),
    'weather:early-bird': () => tile('animations', 49),
    'weather:night-owl': () => tile('animations', 39),
  };
  const handler = mapping[base] ?? (def.category === 'weather' ? () => tile('animations', 9) : undefined);
  return handler ? handler() : { element: null, url: null };
}

function pickSprite(def: AchievementDefinition): HTMLElement | null {
  const el = resolveSprite(def).element;
  if (el) {
    hydrateAchievementSpritesWithin(el);
  }
  return el;
}

function createMaskedOverlay(baseUrl: string, overlayUrl: string, size: number): HTMLElement {
  const layer = document.createElement('div');
  layer.style.cssText = `position:absolute; inset:0; background: url(${overlayUrl}) center/contain no-repeat; mask-image: url(${baseUrl}); -webkit-mask-image: url(${baseUrl}); mask-size: contain; -webkit-mask-size: contain; mask-repeat: no-repeat; -webkit-mask-repeat: no-repeat;`;
  return layer;
}

function buildBadgeSprite(def: AchievementDefinition, rarity: AchievementRarity, size: number = 52): HTMLElement {
  const { element, url } = resolveSprite(def);
  const wrapper = document.createElement('div');
  wrapper.style.cssText = `position: relative; width: ${size}px; height: ${size}px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;`;

  if (element) {
    element.style.width = `${size}px`;
    element.style.height = `${size}px`;
    wrapper.appendChild(element);
    hydrateAchievementSpritesWithin(wrapper);
  } else if (url) {
    const base = document.createElement('div');
    base.style.cssText = `position:absolute; inset:0; background: url(${url}) center/contain no-repeat; image-rendering: pixelated;`;
    wrapper.appendChild(base);
  } else {
    const fallback = document.createElement('div');
    fallback.textContent = def.icon ?? '★';
    const gradient = rarity === 'celestial'
      ? 'linear-gradient(135deg, #ff1744, #ff9100, #ffea00, #00e676, #2979ff, #d500f9)'
      : 'rgba(255,255,255,0.06)';
    const color = rarity === 'celestial' ? 'transparent' : '#fff';
    fallback.style.cssText = `
      position: absolute;
      inset: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: ${Math.max(14, Math.round(size * 0.6))}px;
      color: ${color};
      background: ${gradient};
      border-radius: 10px;
      ${rarity === 'celestial' ? 'background-clip: text; -webkit-background-clip: text; text-shadow: 0 0 6px rgba(0,0,0,0.35);' : ''}
    `;
    wrapper.appendChild(fallback);
  }

  const baseUrl = url ?? null;
  const isGoldPetAchievement = def.id.startsWith('pets:gold');
  const rarityIndex = rarityRank[rarity];
  if (baseUrl && rarityIndex >= rarityRank['legendary'] && !isGoldPetAchievement) {
    const shine = document.createElement('div');
    const shineBg = rarity === 'celestial'
      ? 'linear-gradient(135deg, #ff6ec7, #ffd166, #6ec8ff, #b37bff)'
      : rarityStyles[rarity].bar;
    const shineOpacity = rarity === 'legendary' ? 0.5 : rarity === 'mythical' ? 0.5 : rarity === 'divine' ? 0.6 : rarity === 'celestial' ? 0.8 : 0.65;
    shine.style.cssText = `position:absolute; inset:0; background:${shineBg}; mask-image: url(${baseUrl}); -webkit-mask-image: url(${baseUrl}); mask-size: contain; -webkit-mask-size: contain; mask-repeat: no-repeat; -webkit-mask-repeat: no-repeat; opacity: ${shineOpacity}; mix-blend-mode: screen;`;
    wrapper.appendChild(shine);
  }

  if (baseUrl && rarity === 'celestial') {
    const rainbow = document.createElement('div');
    rainbow.style.cssText = `
      position:absolute;
      inset:0;
      background: linear-gradient(135deg, #ff1744, #ff9100, #ffea00, #00e676, #2979ff, #d500f9);
      mask-image: url(${baseUrl});
      -webkit-mask-image: url(${baseUrl});
      mask-size: contain;
      -webkit-mask-size: contain;
      mask-repeat: no-repeat;
      -webkit-mask-repeat: no-repeat;
      opacity: 0.92;
      mix-blend-mode: screen;
      filter: saturate(1.05);
    `;
    wrapper.appendChild(rainbow);
  }

  return wrapper;
}

function createTierPanel(def: AchievementDefinition, progress: Map<string, any>, index: number): HTMLElement {
  const tier = document.createElement('div');
  tier.dataset.tierIndex = String(index);
  const rarityStyle = rarityStyles[def.rarity];
  const celestialOverlay = def.rarity === 'celestial'
    ? 'linear-gradient(180deg, rgba(0,0,0,0.28), rgba(0,0,0,0.28)), '
    : '';
  tier.style.cssText = 'padding: 12px; border-radius: 12px; display: flex; flex-direction: column; gap: 10px; scroll-snap-align: start;';
  tier.style.background = `${celestialOverlay}${rarityStyle.bg}`;
  tier.style.border = `1px solid ${rarityStyle.border ?? 'rgba(143,130,255,0.25)'}`;
  tier.style.boxShadow = '0 8px 18px rgba(0,0,0,0.35)';

  const prog = progress.get(def.id);
  const current = prog?.current ?? 0;
  const target = prog?.target ?? (typeof def.target === 'number' ? def.target : 0);
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  const completed = !!prog?.completedAt;
  const ineligible = !!prog?.ineligible;
  const prereqId = def.hiddenTargetUntil;
  const prereqCompleted = prereqId ? !!progress.get(prereqId)?.completedAt : true;
  const hideTarget = !completed && prereqId != null && !prereqCompleted;

  const desc = document.createElement('div');
  desc.style.cssText = `color: ${def.rarity === 'celestial' ? '#f4f7ff' : '#d6e1ec'}; font-size: 12px; line-height: 1.45;`;
  desc.textContent = describeAchievement(def, { hideTarget });

  const barWrap = document.createElement('div');
  barWrap.style.cssText = 'background: rgba(255,255,255,0.08); border-radius: 12px; height: 12px; overflow: hidden;';

  const bar = document.createElement('div');
  bar.style.cssText = `height: 100%; width: ${pct}%; background: ${rarityStyle.bar}; transition: width 0.3s;`;
  barWrap.appendChild(bar);

  const meta = document.createElement('div');
  meta.style.cssText = `display: flex; justify-content: space-between; color: ${def.rarity === 'celestial' ? '#e4ebff' : '#b0bec5'}; font-size: 11px; font-weight: 700; letter-spacing: 0.01em;`;
  meta.textContent = ineligible
    ? 'N/A (ineligible)'
    : completed
      ? 'Completed'
      : hideTarget
        ? 'Progress hidden until the previous tier is complete'
        : `${current.toLocaleString()} / ${target.toLocaleString()}`;

  tier.append(desc, barWrap, meta);
  return tier;
}

function createGroupCard(group: GroupedAchievement, progress: Map<string, any>, state: AchievementsWindowState): HTMLElement {
  const card = document.createElement('div');
  const catColors: Record<CategoryFilter, string> = {
    all: '#8f82ff',
    garden: '#7cb342',
    pets: '#64b5f6',
    abilities: '#ba68c8',
    shop: '#4dd0e1',
    weather: '#90caf9',
    wealth: '#ffca28',
    collection: '#ff8a65',
    streaks: '#f06292',
    obscure: '#b0bec5',
  };
  const category = group.entries[0]?.category as CategoryFilter | undefined;
  const catColor = (category && catColors[category]) || '#8f82ff';
  card.style.cssText = `
    background: #0f1624;
    border: 1px solid rgba(255,255,255,0.05);
    border-radius: 14px;
    padding: 14px;
    box-shadow: 0 10px 28px rgba(0,0,0,0.35);
    display: flex;
    flex-direction: column;
    gap: 12px;
    position: relative;
    overflow: hidden;
  `;
  const accent = document.createElement('div');
  accent.style.cssText = `position:absolute; inset:0; background: linear-gradient(135deg, ${catColor}22, transparent); pointer-events:none;`; 
  card.appendChild(accent);

  const header = document.createElement('div');
  header.style.cssText = 'display: grid; grid-template-columns: auto 1fr auto; gap: 10px; align-items: center; position: relative; z-index: 1;';

  const title = document.createElement('div');
  title.style.cssText = 'font-weight: 800; color: #fff; display: inline-flex; align-items: center; gap: 8px; letter-spacing: 0.01em; filter: drop-shadow(0 2px 6px rgba(0,0,0,0.35));';

  const rarityChip = document.createElement('span');
  rarityChip.style.cssText = 'font-size: 11px; padding: 4px 8px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.12); box-shadow: 0 2px 8px rgba(0,0,0,0.25);';

  const controlsRow = document.createElement('div');
  controlsRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; padding: 6px 8px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.07); border-radius: 10px; position: relative; z-index: 1;';

  const pager = document.createElement('span');
  pager.style.cssText = 'font-size: 11px; color: #cfd8dc; font-weight: 700;';

  const nav = document.createElement('div');
  nav.style.cssText = 'display: flex; gap: 6px; align-items: center;';

  const catChip = document.createElement('span');
  catChip.textContent = category ?? 'misc';
  catChip.style.cssText = `font-size: 11px; padding: 4px 8px; border-radius: 999px; background: ${catColor}22; color: #e3f2fd; border: 1px solid ${catColor}44;`;

  const titleText = document.createElement('span');
  titleText.textContent = group.entries[0]?.title ?? 'Achievement';
  const applyTitleColor = (entry: AchievementDefinition | undefined) => {
    if (!entry) return;
    const style = rarityStyles[entry.rarity];
    titleText.style.color = style.accent ?? style.color;
  };
  applyTitleColor(group.entries[0]);

  const firstEntry = group.entries[0];
  const sprite = firstEntry ? pickSprite(firstEntry) : null;
  if (sprite) {
    title.prepend(sprite);
  }
  title.append(titleText);

  header.append(title, rarityChip);

  const makeNavButton = (label: string) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = 'border: 1px solid rgba(143,130,255,0.5); background: rgba(255,255,255,0.05); color: #e0e0e0; border-radius: 8px; padding: 4px 8px; cursor: pointer; font-weight: 700;';
    return btn;
  };

  const prevBtn = makeNavButton('< Previous');
  const nextBtn = makeNavButton('Next >');

  nav.append(prevBtn, nextBtn);

  controlsRow.append(catChip, pager, nav);

  const tiersWrap = document.createElement('div');
  tiersWrap.style.cssText = 'position: relative; max-height: 220px; overflow: hidden; padding-right: 4px;';
  tiersWrap.style.overscrollBehavior = 'contain';

  if (!group.entries.length) {
    const empty = document.createElement('div');
    empty.style.cssText = 'color: #cfd8dc; font-size: 12px;';
    empty.textContent = 'No achievement data available.';
    card.append(header, controlsRow, empty);
    return card;
  }

  const panels = group.entries.map((entry, idx) => {
    const panel = createTierPanel(entry, progress, idx);
    panel.style.position = 'absolute';
    panel.style.inset = '0';
    panel.style.margin = '0';
    panel.style.transition = 'opacity 0.15s ease';
    panel.style.opacity = '0';
    panel.style.pointerEvents = 'none';
    tiersWrap.appendChild(panel);
    return panel;
  });

  const clampIndex = (idx: number) => Math.min(Math.max(idx, 0), panels.length - 1);

  const applyRarityChip = (def: AchievementDefinition) => {
    const style = rarityStyles[def.rarity];
    rarityChip.textContent = def.rarity.toUpperCase();
    rarityChip.style.background = style.bg;
    rarityChip.style.color = style.color;
    rarityChip.style.border = `1px solid ${style.border ?? 'rgba(255,255,255,0.12)'}`;
  };

  const setPanelActive = (activeIndex: number) => {
    panels.forEach((panel, idx) => {
      const active = idx === activeIndex;
      panel.style.opacity = active ? '1' : '0';
      panel.style.pointerEvents = active ? 'auto' : 'none';
      panel.style.position = active ? 'relative' : 'absolute';
      panel.style.boxShadow = active ? '0 6px 18px rgba(126,0,252,0.25)' : 'none';
    });
  };

  const savedIndex = state.groupPages[group.key];
  const initialIndex = Number.isInteger(savedIndex)
    ? clampIndex(savedIndex as number)
    : (() => {
        const firstIncomplete = group.entries.findIndex((entry) => !progress.get(entry.id)?.completedAt);
        const fallback = firstIncomplete === -1 ? group.entries.length - 1 : firstIncomplete;
        return clampIndex(fallback);
      })();
  state.groupPages[group.key] = initialIndex;
  let activeIndex = initialIndex;

  const syncHeader = () => {
    const def = group.entries[activeIndex]!;
    titleText.textContent = def.title;
    applyTitleColor(def);
    applyRarityChip(def);
    pager.textContent = `Tier ${activeIndex + 1} / ${group.entries.length}`;
    prevBtn.disabled = activeIndex === 0;
    nextBtn.disabled = activeIndex === group.entries.length - 1;
    prevBtn.style.opacity = prevBtn.disabled ? '0.5' : '1';
    nextBtn.style.opacity = nextBtn.disabled ? '0.5' : '1';
  };

  const setActive = (nextIndex: number) => {
    const clamped = clampIndex(nextIndex);
    if (clamped === activeIndex) return;
    activeIndex = clamped;
    state.groupPages[group.key] = clamped;
    syncHeader();
    setPanelActive(clamped);
  };

  panels.forEach((panel, idx) => {
    panel.addEventListener('click', () => setActive(idx));
  });

  tiersWrap.addEventListener('wheel', (event) => {
    event.preventDefault();
    const delta = event.deltaY;
    if (delta > 5) {
      setActive(activeIndex + 1);
    } else if (delta < -5) {
      setActive(activeIndex - 1);
    }
  }, { passive: false });

  prevBtn.addEventListener('click', () => setActive(activeIndex - 1));
  nextBtn.addEventListener('click', () => setActive(activeIndex + 1));

  setPanelActive(activeIndex);
  syncHeader();

  header.append(title, rarityChip);
  card.append(header, controlsRow, tiersWrap);
  // Ensure initial tier is visible after render
  setTimeout(() => setPanelActive(activeIndex), 0);
  return card;
}

function renderSummary(state: AchievementsWindowState): void {
  const progress = getAchievementProgress();
  const defs = getAchievementDefinitions();
  const total = defs.length;
  const completed = Array.from(progress.values()).filter((p) => p.completedAt).length;

  const snapshot = getAchievementSnapshot();
  const inv = snapshot?.inventoryCount ?? 0;
  const invValue = snapshot?.inventoryValue;
  const coinsHint = snapshot?.cropEarnings
    ?? snapshot?.stats?.shop?.totalSpentCoins
    ?? (snapshot as any)?.shop?.totalSpentCoins
    ?? (snapshot as any)?.shop?.coinsSpent
    ?? 0;

  state.summary.innerHTML = `
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px;">
      <div style="background: linear-gradient(135deg, #7e00fc, #a463ff); border-radius: 12px; padding: 12px; color: #fff; box-shadow: 0 12px 28px rgba(0,0,0,0.4);">
        <div style="font-size: 26px; font-weight: 900;">${completed}/${total}</div>
        <div style="font-size: 12px; opacity: 0.9;">Completed</div>
      </div>
      <div style="background: rgba(255,255,255,0.06); border: 1px solid rgba(143,130,255,0.25); border-radius: 12px; padding: 12px; color: #fff;">
        <div style="font-size: 14px; font-weight: 700;">Inventory Items</div>
        <div style="color: #ffecb3; font-weight: 800; font-size: 18px;">${inv.toLocaleString()}</div>
        <div style="color: #b0bec5; font-weight: 700; font-size: 12px; margin-top: 2px;">Value: ${invValue != null ? formatCoinsAbbreviated(invValue) : '—'}</div>
      </div>
      <div style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,202,40,0.35); border-radius: 12px; padding: 12px; color: #fff;">
        <div style="font-size: 14px; font-weight: 700;">Crop Value Sold</div>
        <div style="color: #ffd54f; font-weight: 800; font-size: 18px;">${formatCoinsAbbreviated(coinsHint)}</div>
      </div>
    </div>
  `;
}

function renderBadges(state: AchievementsWindowState, defsOverride?: AchievementDefinition[]): void {
  const progress = getAchievementProgress();
  const defs = defsOverride ?? getAchievementDefinitions();

  const filteredDefs = defs
    .map((def) => ({ def, prog: progress.get(def.id) }))
    .filter(({ def }) => state.filterCategory === 'all' || def.category === state.filterCategory)
    .filter(({ def, prog }) => {
      if (debugShowAllBadges) return true;
      const completed = !!prog?.completedAt && !prog?.ineligible;
      const target = typeof def.target === 'number' ? def.target : prog?.target ?? 0;
      const current = prog?.current ?? 0;
      const inProgress = !completed && target > 0 && current > 0 && current < target;
      if (state.filterStatus === 'completed') return completed;
      if (state.filterStatus === 'in-progress') return inProgress;
      return completed || inProgress;
    });

  const totalBadgeScope = defs.filter((def) => state.filterCategory === 'all' || def.category === state.filterCategory);

  const completedDefs = debugShowAllBadges
    ? filteredDefs.map(({ def }) => ({ def, prog: progress.get(def.id) ?? { current: def.target ?? 1, target: def.target ?? 1, completedAt: Date.now() } }))
    : filteredDefs;

  const badgeOrder = [...rarityOrder].reverse();
  const byRarity = new Map<AchievementRarity, Array<{ def: AchievementDefinition; prog: any }>>();
  badgeOrder.forEach((rarity) => byRarity.set(rarity, []));
  completedDefs.forEach((entry) => {
    const bucket = byRarity.get(entry.def.rarity);
    if (bucket) bucket.push(entry);
  });

  badgeOrder.forEach((rarity) => {
    const bucket = byRarity.get(rarity);
    bucket?.sort((a, b) => {
      const timeA = a.prog?.completedAt ? new Date(a.prog.completedAt).getTime() : 0;
      const timeB = b.prog?.completedAt ? new Date(b.prog.completedAt).getTime() : 0;
      return timeB - timeA;
    });
  });

  state.badgesList.innerHTML = '';

  // Completion indicator: earned/total for current filter scope
  const completedCount = totalBadgeScope.filter((def) => {
    const prog = progress.get(def.id);
    return !!prog?.completedAt && !prog?.ineligible;
  }).length;
  const totalCount = totalBadgeScope.length;
  const counter = document.createElement('div');
  counter.style.cssText = 'margin-bottom: 10px; font-weight: 800; color: #fff; letter-spacing: 0.01em; display: flex; align-items: center; gap: 8px;';
  const pill = document.createElement('div');
  pill.textContent = `${completedCount}/${totalCount} badges earned`;
  pill.style.cssText = 'padding: 6px 10px; border-radius: 999px; background: linear-gradient(135deg, rgba(143,130,255,0.18), rgba(255,255,255,0.08)); border: 1px solid rgba(255,255,255,0.18); font-size: 12px;';
  counter.appendChild(pill);
  state.badgesList.appendChild(counter);

  const badgeStyles: Record<AchievementRarity, { bg: string; border: string; glow: string; text: string }> = {
    common: { bg: 'linear-gradient(135deg, #1f2430, #252b3a)', border: '1px solid rgba(255,255,255,0.08)', glow: '0 8px 20px rgba(0,0,0,0.35)', text: '#e0e0e0' },
    uncommon: { bg: 'linear-gradient(135deg, #1f3024, #24382a)', border: '1px solid rgba(120,200,140,0.55)', glow: '0 8px 22px rgba(0,255,120,0.15)', text: '#d7f7df' },
    rare: { bg: 'linear-gradient(135deg, #1f233a, #2c3160)', border: '1px solid rgba(160,140,255,0.65)', glow: '0 10px 26px rgba(160,140,255,0.25)', text: '#e6e1ff' },
    legendary: { bg: 'linear-gradient(135deg, #2c210f, #3a2a12)', border: '1px solid rgba(255,215,0,0.7)', glow: '0 12px 28px rgba(255,215,0,0.25)', text: '#ffecc2' },
    mythical: { bg: 'linear-gradient(135deg, #271a3a, #36254d)', border: '1px solid rgba(214,139,255,0.75)', glow: '0 14px 30px rgba(214,139,255,0.35)', text: '#f2d9ff' },
    divine: { bg: 'linear-gradient(135deg, #301616, #3f1c1c)', border: '1px solid rgba(255,180,150,0.85)', glow: '0 16px 32px rgba(255,180,150,0.35)', text: '#ffe4d7' },
    celestial: { bg: 'linear-gradient(135deg, #291f46, #1f2f46, #2f1f46)', border: '1px solid rgba(255,255,255,0.85)', glow: '0 18px 36px rgba(255,255,255,0.4)', text: '#f8fbff' },
  };

  const rainbowBar = 'linear-gradient(90deg, #ff6ec7, #ffd166, #6ec8ff, #b37bff, #ff6ec7)';

  const formatCompact = (value: number) => formatTargetLabel(value);

  const buildCard = ({ def, prog }: { def: AchievementDefinition; prog: any }) => {
    const style = badgeStyles[def.rarity];
    const card = document.createElement('div');
    card.style.cssText = `
      background: ${style.bg};
      border: ${style.border};
      border-radius: 12px;
      padding: 10px;
      display: flex;
      gap: 10px;
      align-items: center;
      box-shadow: ${style.glow};
    `;

    const sprite = buildBadgeSprite(def, def.rarity, 56);
    card.appendChild(sprite);

    const meta = document.createElement('div');
    meta.style.cssText = 'display: flex; flex-direction: column; gap: 6px; flex: 1; min-width: 0;';

    const title = document.createElement('div');
    title.textContent = def.title;
    title.style.cssText = `font-weight: 800; color: ${style.text}; font-size: 14px;`;

    const completedAt = prog?.completedAt ? new Date(prog.completedAt).toLocaleString() : '—';
    const dateRow = document.createElement('div');
    dateRow.style.cssText = 'font-size: 11px; color: rgba(255,255,255,0.7);';
    dateRow.textContent = `Completed: ${completedAt}`;

    const description = document.createElement('div');
    description.textContent = describeAchievement(def, { hideTarget: false });
    description.style.cssText = 'font-size: 11px; color: rgba(255,255,255,0.78); line-height: 1.4;';

    const valueRow = document.createElement('div');
    const current = Math.min(prog?.current ?? 0, typeof def.target === 'number' ? def.target : prog?.current ?? 0);
    const target = typeof def.target === 'number' ? def.target : prog?.target ?? current;
    const valueText = `${formatCompact(current)} / ${formatCompact(target)}`;
    valueRow.style.cssText = `font-size: 12px; color: ${style.text}; font-weight: 700;`;
    valueRow.textContent = valueText;

    const barWrap = document.createElement('div');
    barWrap.style.cssText = 'background: rgba(255,255,255,0.12); border-radius: 999px; height: 8px; overflow: hidden;';
    const bar = document.createElement('div');
    const barBg = def.rarity === 'celestial' ? rainbowBar : rarityStyles[def.rarity].bar;
    bar.style.cssText = `height: 100%; width: 100%; background: ${barBg};`;
    barWrap.appendChild(bar);

    meta.append(title, description, dateRow, valueRow, barWrap);
    card.append(meta);

    return card;
  };

  badgeOrder.forEach((rarity) => {
    const col = document.createElement('div');
    col.style.cssText = 'display: flex; flex-direction: column; gap: 10px; padding: 8px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; min-height: 120px;';

    const header = document.createElement('div');
    header.textContent = rarity.charAt(0).toUpperCase() + rarity.slice(1);
    header.style.cssText = 'font-weight: 800; color: #fff; font-size: 13px; letter-spacing: 0.02em;';
    col.appendChild(header);

    const entries = byRarity.get(rarity) ?? [];
    if (!entries.length && !debugShowAllBadges) {
      return;
    }

    if (!entries.length && debugShowAllBadges) {
      const placeholder = document.createElement('div');
      placeholder.style.cssText = 'color: #90a4ae; font-size: 11px; padding: 8px; border: 1px dashed rgba(255,255,255,0.08); border-radius: 10px;';
      placeholder.textContent = 'Preview only';
      col.appendChild(placeholder);
    } else {
      entries.forEach((entry) => col.appendChild(buildCard(entry)));
    }

    state.badgesList.appendChild(col);
  });

  if (!completedDefs.length) {
    const empty = document.createElement('div');
    empty.style.cssText = 'grid-column: 1 / -1; color: #cfd8dc; font-size: 12px; padding: 12px; text-align: center; border: 1px dashed rgba(255,255,255,0.12); border-radius: 10px;';
    empty.textContent = 'Earn achievements to unlock badges!';
    state.badgesList.appendChild(empty);
  }
}

function renderOneTime(state: AchievementsWindowState, defsOverride?: AchievementDefinition[]): void {
  const progress = getAchievementProgress();
  const defs = (defsOverride ?? getAchievementDefinitions()).filter((def) => def.oneTime);
  state.oneTimeList.innerHTML = '';

  const buckets = new Map<AchievementRarity, Array<{ def: AchievementDefinition; prog: any }>>();
  rarityOrder.forEach((r) => buckets.set(r, []));
  defs.forEach((def) => {
    const prog = progress.get(def.id);
    const completed = !!prog?.completedAt;
    const inProgress = !completed;
    const statusPass = state.filterStatus === 'all'
      ? true
      : state.filterStatus === 'completed'
        ? completed
        : inProgress;
    const categoryPass = state.filterCategory === 'all' || def.category === state.filterCategory;
    if (!statusPass || !categoryPass) return;

    const bucket = buckets.get(def.rarity);
    if (bucket) bucket.push({ def, prog });
  });

  const buildOneTimeCard = ({ def, prog }: { def: AchievementDefinition; prog: any }) => {
    const style = rarityStyles[def.rarity];
    const card = document.createElement('div');
    card.style.cssText = `
      background: ${style.bg};
      border: 1px solid ${style.border ?? 'rgba(255,255,255,0.12)'};
      border-radius: 12px;
      padding: 10px;
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 10px;
      align-items: center;
      box-shadow: 0 10px 26px rgba(0,0,0,0.35);
    `;

    const sprite = buildBadgeSprite(def, def.rarity, 48);
    card.appendChild(sprite);

    const meta = document.createElement('div');
    meta.style.cssText = 'display: flex; flex-direction: column; gap: 6px; min-width: 0;';

    const title = document.createElement('div');
    title.textContent = def.title;
    title.style.cssText = `font-weight: 800; color: ${style.accent ?? style.color}; font-size: 14px;`;

    const desc = document.createElement('div');
    desc.textContent = describeAchievement(def, { hideTarget: false });
    desc.style.cssText = 'font-size: 12px; color: #cfd8dc; line-height: 1.4;';

    const status = document.createElement('div');
    const done = !!prog?.completedAt;
    status.textContent = done ? `Completed: ${new Date(prog.completedAt).toLocaleString()}` : 'Not yet earned';
    status.style.cssText = `font-size: 11px; color: ${done ? '#b0f4c6' : '#ffcdd2'}; font-weight: 700;`;

    meta.append(title, desc, status);
    card.append(meta);
    return card;
  };

  rarityOrder.forEach((rarity) => {
    const entries = buckets.get(rarity) ?? [];
    if (!entries.length) return;
    const col = document.createElement('div');
    col.style.cssText = 'display: flex; flex-direction: column; gap: 10px; padding: 8px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px;';

    const header = document.createElement('div');
    header.textContent = rarity.charAt(0).toUpperCase() + rarity.slice(1);
    header.style.cssText = 'font-weight: 800; color: #fff; font-size: 13px; letter-spacing: 0.02em;';
    col.appendChild(header);

    entries.forEach((entry) => col.appendChild(buildOneTimeCard(entry)));
    state.oneTimeList.appendChild(col);
  });

  if (!state.oneTimeList.childElementCount) {
    const empty = document.createElement('div');
    empty.style.cssText = 'grid-column: 1 / -1; color: #cfd8dc; font-size: 12px; padding: 12px; text-align: center; border: 1px dashed rgba(255,255,255,0.12); border-radius: 10px;';
    empty.textContent = defs.length ? 'No one-time achievements match this filter.' : 'No one-time achievements found yet.';
    state.oneTimeList.appendChild(empty);
  }
}

export function createAchievementsWindow(): AchievementsWindowState {
  void primeAchievementSheets();

  const root = document.createElement('div');
  root.dataset.achievementsRoot = 'true';
  root.style.cssText = 'display: flex; flex-direction: column; gap: 12px; width: 100%; min-width: min(1100px, 100%); max-width: 100%;';

  const defsCache = getAchievementDefinitions();
  const standardDefs = defsCache.filter((def) => !def.oneTime);
  const oneTimeDefs = defsCache.filter((def) => def.oneTime);

  const tabs = document.createElement('div');
  tabs.style.cssText = 'display: inline-flex; gap: 8px; background: rgba(255,255,255,0.04); padding: 6px; border-radius: 12px; align-self: flex-start; border: 1px solid rgba(255,255,255,0.08);';

  const tabButtons: Record<'achievements' | 'badges' | 'onetime', HTMLButtonElement> = {
    achievements: document.createElement('button'),
    badges: document.createElement('button'),
    onetime: document.createElement('button'),
  };
  (Object.entries(tabButtons) as Array<[keyof typeof tabButtons, HTMLButtonElement]>).forEach(([key, btn]) => {
    btn.type = 'button';
    btn.textContent = key === 'achievements'
      ? 'Achievements'
      : key === 'badges'
        ? 'Badges'
        : 'One-time';
    btn.style.cssText = 'border: none; padding: 8px 14px; border-radius: 10px; background: transparent; color: #e0e0e0; cursor: pointer; font-weight: 700;';
    tabs.appendChild(btn);
  });

  const summary = document.createElement('div');
  const controls = document.createElement('div');
  controls.style.cssText = 'display: flex; gap: 8px; flex-wrap: wrap; align-items: center;';

  const list = document.createElement('div');
  list.style.cssText = 'display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); align-items: stretch;';
  const achievementsSection = document.createElement('div');
  achievementsSection.style.cssText = 'display: flex; flex-direction: column; gap: 12px;';
  achievementsSection.append(summary, controls, list);

  const oneTimeList = document.createElement('div');
  oneTimeList.style.cssText = 'display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); align-items: stretch;';
  const oneTimeSection = document.createElement('div');
  oneTimeSection.style.cssText = 'display: none; flex-direction: column; gap: 12px;';
  const oneTimeControls = document.createElement('div');
  oneTimeControls.style.cssText = 'display: flex; gap: 8px; flex-wrap: wrap; align-items: center;';
  const oneTimeLabel = document.createElement('div');
  oneTimeLabel.style.cssText = 'color: #cfd8dc; font-size: 12px; opacity: 0.9;';
  oneTimeLabel.textContent = 'Unique achievements that can only be earned once.';
  oneTimeSection.append(oneTimeControls, oneTimeLabel, oneTimeList);

  const badgesList = document.createElement('div');
  badgesList.style.cssText = 'display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); align-items: start; width: 100%;';
  const badgesSection = document.createElement('div');
  badgesSection.style.cssText = 'display: none; flex-direction: column; gap: 12px;';
  const badgesControls = document.createElement('div');
  badgesControls.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:center;';
  const refreshBadgesBtn = document.createElement('button');
  refreshBadgesBtn.type = 'button';
  refreshBadgesBtn.textContent = 'Refresh badges';
  refreshBadgesBtn.style.cssText = 'border: 1px solid rgba(143,130,255,0.4); background: rgba(255,255,255,0.06); color: #e0e0e0; border-radius: 8px; padding: 6px 10px; font-weight: 700; cursor: pointer;';
  refreshBadgesBtn.addEventListener('click', () => {
    try { triggerAchievementRecompute(); } catch {}
    renderBadges(state, defsCache);
  });

  const disablePreviewBtn = document.createElement('button');
  disablePreviewBtn.type = 'button';
  disablePreviewBtn.textContent = 'Hide previewed badges';
  disablePreviewBtn.style.cssText = 'border: 1px solid rgba(255,99,132,0.5); background: rgba(255,255,255,0.05); color: #ffcdd2; border-radius: 8px; padding: 6px 10px; font-weight: 700; cursor: pointer;';
  disablePreviewBtn.addEventListener('click', () => {
    try { toggleBadgePreview(false); } catch { debugShowAllBadges = false; }
      renderBadges(state, defsCache);
  });

  badgesControls.append(refreshBadgesBtn);
  badgesSection.append(badgesControls, badgesList);

  root.append(tabs, achievementsSection, oneTimeSection, badgesSection);

  const state: AchievementsWindowState = {
    root,
    list,
    oneTimeList,
    badgesList,
    achievementsSection,
    oneTimeSection,
    badgesSection,
    tabButtons,
    summary,
    unsubscribe: null,
    filterStatus: 'in-progress',
    filterCategory: 'all',
    groupPages: {},
    activeTab: 'achievements',
  };

  // Always start with previews disabled so previously toggled sessions don't leak through.
  debugShowAllBadges = false;

  // Defaults per tab: Achievements -> in-progress, Badges -> completed, One-time -> all
  const defaultAchievementStatus: FilterStatus = 'in-progress';
  const defaultBadgesStatus: FilterStatus = 'completed';
  const defaultOneTimeStatus: FilterStatus = 'all';

  lastWindowState = state;

  const syncTabs = () => {
    (Object.entries(tabButtons) as Array<[keyof typeof tabButtons, HTMLButtonElement]>).forEach(([key, btn]) => {
      const active = state.activeTab === key;
      btn.style.background = active ? 'linear-gradient(90deg, #7e00fc, #a463ff)' : 'transparent';
      btn.style.color = active ? '#fff' : '#e0e0e0';
      btn.style.boxShadow = active ? '0 6px 14px rgba(126,0,252,0.35)' : 'none';
    });
    achievementsSection.style.display = state.activeTab === 'achievements' ? 'flex' : 'none';
    oneTimeSection.style.display = state.activeTab === 'onetime' ? 'flex' : 'none';
    badgesSection.style.display = state.activeTab === 'badges' ? 'flex' : 'none';
  };
  tabButtons.achievements.addEventListener('click', () => { state.activeTab = 'achievements'; state.filterStatus = defaultAchievementStatus; syncStatusButtons(); syncTabs(); render(); });
  tabButtons.badges.addEventListener('click', () => { state.activeTab = 'badges'; state.filterStatus = defaultBadgesStatus; syncStatusButtons(); syncTabs(); renderBadges(state, defsCache); });
  tabButtons.onetime.addEventListener('click', () => { state.activeTab = 'onetime'; state.filterStatus = defaultOneTimeStatus; syncStatusButtons(); syncTabs(); renderOneTime(state, oneTimeDefs); });
  syncTabs();

  const statusButtons: Array<{ key: FilterStatus; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'in-progress', label: 'In Progress' },
    { key: 'completed', label: 'Completed' },
  ];

  const statusGroup = document.createElement('div');
  statusGroup.style.cssText = 'display: inline-flex; gap: 6px; background: rgba(255,255,255,0.04); padding: 6px; border-radius: 999px; border: 1px solid rgba(143,130,255,0.25);';
  const statusBtnRefs: Array<{ key: FilterStatus; btn: HTMLButtonElement }> = [];
  const syncStatusButtons = () => {
    statusBtnRefs.forEach(({ key, btn }) => {
      const active = state.filterStatus === key;
      btn.style.background = active ? 'linear-gradient(90deg, #7e00fc, #a463ff)' : 'transparent';
      btn.style.color = active ? '#fff' : '#e0e0e0';
      btn.style.boxShadow = active ? '0 6px 14px rgba(126,0,252,0.35)' : 'none';
    });
  };
  statusButtons.forEach(({ key, label }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.style.cssText = 'border: none; padding: 6px 12px; border-radius: 999px; background: transparent; color: #e0e0e0; cursor: pointer; font-weight: 600;';
    btn.addEventListener('click', () => {
      state.filterStatus = key;
      syncStatusButtons();
      render();
      renderOneTime(state, oneTimeDefs);
      renderBadges(state, defsCache);
    });
    statusBtnRefs.push({ key, btn });
    statusGroup.appendChild(btn);
  });
  syncStatusButtons();

  const oneTimeStatusGroup = document.createElement('div');
  oneTimeStatusGroup.style.cssText = 'display: inline-flex; gap: 6px; background: rgba(255,255,255,0.04); padding: 6px; border-radius: 999px; border: 1px solid rgba(143,130,255,0.25);';
  statusButtons.forEach(({ key, label }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.style.cssText = 'border: none; padding: 6px 12px; border-radius: 999px; background: transparent; color: #e0e0e0; cursor: pointer; font-weight: 600;';
    btn.addEventListener('click', () => {
      state.filterStatus = key;
      syncStatusButtons();
      render();
      renderOneTime(state, oneTimeDefs);
    });
    statusBtnRefs.push({ key, btn });
    oneTimeStatusGroup.appendChild(btn);
  });
  syncStatusButtons();

  const categorySelect = document.createElement('select');
  categorySelect.style.cssText = 'padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.18); background: linear-gradient(135deg, #0b1020, #141a2a); color: #f5f7ff; box-shadow: inset 0 1px 0 rgba(255,255,255,0.06);';
  const categories: Array<{ key: CategoryFilter; label: string }> = [
    { key: 'all', label: 'All Categories' },
    { key: 'garden', label: 'Garden' },
    { key: 'pets', label: 'Pets' },
    { key: 'abilities', label: 'Abilities' },
    { key: 'shop', label: 'Shop' },
    { key: 'weather', label: 'Weather' },
    { key: 'wealth', label: 'Wealth' },
    { key: 'collection', label: 'Collection' },
    { key: 'streaks', label: 'Streaks' },
    { key: 'obscure', label: 'Obscure' },
  ];
  categories.forEach(({ key, label }) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = label;
    opt.style.background = '#0b1020';
    opt.style.color = '#f5f7ff';
    categorySelect.appendChild(opt);
  });
  categorySelect.addEventListener('change', () => {
    state.filterCategory = categorySelect.value as CategoryFilter;
    render();
    renderOneTime(state, oneTimeDefs);
    renderBadges(state, defsCache);
  });

  controls.append(statusGroup, categorySelect);
  oneTimeControls.append(oneTimeStatusGroup);

  const render = () => {
    const defs = standardDefs;
    const progress = getAchievementProgress();
    syncStatusButtons();
    renderSummary(state);
    list.innerHTML = '';

    const grouped = groupAchievements(defs);

    const filtered = grouped
      .map((group) => {
        const category = group.entries[0]?.category as CategoryFilter | undefined;
        if (state.filterCategory !== 'all' && category !== state.filterCategory) {
          return null;
        }

        const filteredEntries = group.entries.filter((entry, idx) => {
          const prog = progress.get(entry.id);
          const completed = !!prog?.completedAt;
          const prev = group.entries[idx - 1];
          const prevCompleted = !prev || !!progress.get(prev.id)?.completedAt;
          const inProgressEligible = !completed && (prevCompleted || entry.rarity === 'common');

          if (state.filterStatus === 'completed') return completed;
          if (state.filterStatus === 'in-progress') return inProgressEligible;
          return true;
        });

        if (!filteredEntries.length) return null;
        return { key: group.key, entries: filteredEntries } as GroupedAchievement;
      })
      .filter((g): g is GroupedAchievement => Boolean(g));

    filtered.forEach((group) => list.appendChild(createGroupCard(group, progress, state)));
  };

  state.unsubscribe = subscribeToAchievements(() => {
    render();
    if (state.activeTab === 'onetime') {
      renderOneTime(state, oneTimeDefs);
    }
    if (state.activeTab === 'badges') {
      renderBadges(state, defsCache);
    }
    hydrateAchievementSpritesWithin(state.root);
  });
  // Kick an explicit recompute to ensure snapshot freshness when window opens
  try { triggerAchievementRecompute(); } catch (error) { log('⚠️ Achievements recompute failed', error); }

  render();
  renderOneTime(state, oneTimeDefs);
  hydrateAchievementSpritesWithin(state.root);
  return state;
}

export function toggleBadgePreview(force?: boolean): boolean {
  debugShowAllBadges = force ?? !debugShowAllBadges;
  log(`🧪 Badge preview ${debugShowAllBadges ? 'ENABLED (visual only)' : 'DISABLED (earned only)'}`);
  if (lastWindowState) {
    renderBadges(lastWindowState);
  }
  return debugShowAllBadges;
}

if (typeof window !== 'undefined') {
  (window as any).toggleBadgePreview = toggleBadgePreview;
}

export function showAchievementsWindow(state: AchievementsWindowState): void {
  state.root.style.display = '';
}

export function hideAchievementsWindow(state: AchievementsWindowState): void {
  state.root.style.display = 'none';
}

export function destroyAchievementsWindow(state: AchievementsWindowState): void {
  state.unsubscribe?.();
}
