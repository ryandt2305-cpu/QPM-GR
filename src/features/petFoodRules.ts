// src/features/petFoodRules.ts
// Centralized pet food rules management, diet mapping, and inventory helpers

import { storage } from '../utils/storage';
import { normalizeSpeciesKey } from '../utils/helpers';
import { pageWindow } from '../core/pageContext';
import { log } from '../utils/logger';

export interface SpeciesOverride {
  allowed?: string[];
  forbidden?: string[];
  preferred?: string;
}

export interface PetFoodRulesState {
  respectRules: boolean;
  avoidFavorited: boolean;
  overrides: Record<string, SpeciesOverride>;
  updatedAt: number;
}

export interface InventoryItemSnapshot {
  id: string;
  species: string | null;
  itemType: string | null;
  name: string | null;
}

export interface InventorySnapshot {
  items: InventoryItemSnapshot[];
  favoritedIds: Set<string>;
  source: string;
}

export interface FoodSelection {
  item: InventoryItemSnapshot;
  usedFavoriteFallback: boolean;
}

export interface FoodSelectionOptions {
  avoidFavorited?: boolean;
}

const STORAGE_KEY = 'quinoa-pet-food-rules';

const DEFAULT_STATE: PetFoodRulesState = {
  respectRules: false,
  avoidFavorited: true,
  overrides: {},
  updatedAt: Date.now(),
};

const DEFAULT_SAFE_FOODS = ['Carrot', 'Strawberry', 'Blueberry', 'Apple', 'Watermelon', 'Pumpkin'];

const RAW_PET_DIETS: Record<string, string[]> = {
  Worm: ['Carrot', 'Strawberry', 'Aloe', 'Tomato', 'Apple'],
  Snail: ['Blueberry', 'Tomato', 'Corn', 'Daffodil'],
  Bee: ['Strawberry', 'Blueberry', 'Daffodil', 'Lily'],
  Chicken: ['Aloe', 'Corn', 'Watermelon', 'Pumpkin'],
  Bunny: ['Carrot', 'Strawberry', 'Blueberry', 'OrangeTulip', 'Apple'],
  Dragonfly: ['Apple', 'OrangeTulip', 'Echeveria'],
  Pig: ['Watermelon', 'Pumpkin', 'Mushroom', 'Bamboo'],
  Cow: ['Coconut', 'Banana', 'BurrosTail', 'Mushroom'],
  Squirrel: ['Pumpkin', 'Banana', 'Grape'],
  Turtle: ['Watermelon', 'BurrosTail', 'Bamboo', 'Pepper'],
  Goat: ['Pumpkin', 'Coconut', 'Pepper', 'Camellia', 'PassionFruit'],
  Butterfly: ['Daffodil', 'Lily', 'Grape', 'Lemon', 'Sunflower', 'Chrysanthemum'],
  Capybara: ['Lemon', 'PassionFruit', 'DragonFruit', 'Lychee'],
  Peacock: ['Cactus', 'Sunflower', 'Lychee'],
};

interface NormalizedDiet {
  display: string[];
  normalized: string[];
}

const NORMALIZED_PET_DIETS: Record<string, NormalizedDiet> = Object.fromEntries(
  Object.entries(RAW_PET_DIETS).map(([species, foods]) => {
    const normalizedKey = normalizeSpeciesKey(species);
    const normalizedFoods = foods
      .map(food => normalizeSpeciesKey(food))
      .filter(Boolean);
    return [
      normalizedKey,
      {
        display: [...foods],
        normalized: normalizedFoods,
      },
    ];
  }),
);

const DEFAULT_SAFE_NORMALIZED = DEFAULT_SAFE_FOODS.map(food => normalizeSpeciesKey(food));

let rulesState: PetFoodRulesState = loadState();

export interface SpeciesCatalogEntry {
  species: string;
  key: string;
  label: string;
}

export interface DietOptionDescriptor {
  key: string;
  label: string;
}

function formatFriendlyName(raw: string): string {
  return raw
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([a-z])/g, (match) => match.toUpperCase())
    .trim();
}

function formatFoodLabelForSpecies(species: string, normalizedFood: string): string {
  const options = getDietOptionsForSpecies(species);
  const match = options.find(option => option.key === normalizedFood);
  if (match) {
    return match.label;
  }
  return formatFriendlyName(normalizedFood);
}

function loadState(): PetFoodRulesState {
  const stored = storage.get<Partial<PetFoodRulesState>>(STORAGE_KEY, {});
  if (!stored || typeof stored !== 'object') {
    return { ...DEFAULT_STATE };
  }
  return {
    respectRules: typeof stored.respectRules === 'boolean' ? stored.respectRules : DEFAULT_STATE.respectRules,
    avoidFavorited: typeof stored.avoidFavorited === 'boolean' ? stored.avoidFavorited : DEFAULT_STATE.avoidFavorited,
    overrides: typeof stored.overrides === 'object' && stored.overrides
      ? stored.overrides as Record<string, SpeciesOverride>
      : {},
    updatedAt: typeof stored.updatedAt === 'number' ? stored.updatedAt : Date.now(),
  };
}

function saveState(): void {
  storage.set(STORAGE_KEY, rulesState);
}

export function getPetFoodRules(): PetFoodRulesState {
  return {
    respectRules: rulesState.respectRules,
    avoidFavorited: rulesState.avoidFavorited,
    overrides: { ...rulesState.overrides },
    updatedAt: rulesState.updatedAt,
  };
}

export function shouldRespectPetFoodRules(): boolean {
  return rulesState.respectRules;
}

export function setRespectPetFoodRules(enabled: boolean): void {
  if (rulesState.respectRules === enabled) {
    return;
  }
  rulesState = {
    ...rulesState,
    respectRules: enabled,
    updatedAt: Date.now(),
  };
  saveState();
  log(enabled ? '⚖️ Pet food rules enabled' : '⚖️ Pet food rules disabled');
}

export function setAvoidFavoritedFoods(enabled: boolean): void {
  if (rulesState.avoidFavorited === enabled) {
    return;
  }
  rulesState = {
    ...rulesState,
    avoidFavorited: enabled,
    updatedAt: Date.now(),
  };
  saveState();
}

export function updateSpeciesOverride(species: string, override: SpeciesOverride | null): void {
  const key = normalizeSpeciesKey(species);
  if (!key) return;

  const overrides = { ...rulesState.overrides };
  if (!override || (!override.allowed && !override.forbidden && !override.preferred)) {
    delete overrides[key];
  } else {
    const nextOverride: SpeciesOverride = {};
    if (Array.isArray(override.allowed) && override.allowed.length > 0) {
      nextOverride.allowed = override.allowed
        .map(entry => normalizeSpeciesKey(entry))
        .filter((entry): entry is string => !!entry);
      if (nextOverride.allowed.length === 0) {
        delete nextOverride.allowed;
      }
    }
    if (Array.isArray(override.forbidden) && override.forbidden.length > 0) {
      nextOverride.forbidden = override.forbidden
        .map(entry => normalizeSpeciesKey(entry))
        .filter((entry): entry is string => !!entry);
      if (nextOverride.forbidden.length === 0) {
        delete nextOverride.forbidden;
      }
    }
    if (override.preferred) {
      const preferred = normalizeSpeciesKey(override.preferred);
      if (preferred) {
        nextOverride.preferred = preferred;
      }
    }

    if (!nextOverride.allowed && !nextOverride.forbidden && !nextOverride.preferred) {
      delete overrides[key];
    } else {
      overrides[key] = nextOverride;
    }
  }

  rulesState = {
    ...rulesState,
    overrides,
    updatedAt: Date.now(),
  };
  saveState();
}

export function resetPetFoodRules(): void {
  rulesState = { ...DEFAULT_STATE, updatedAt: Date.now() };
  saveState();
}

function ensureInventoryArray(candidate: unknown): any[] | null {
  if (Array.isArray(candidate)) {
    return candidate as any[];
  }
  return null;
}

function readNestedValue(node: unknown, path: string[]): unknown {
  let current: unknown = node;
  for (const segment of path) {
    if (!current || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function tryExtractInventory(node: unknown): { items: any[]; favoritedItemIds: string[] } | null {
  if (!node || typeof node !== 'object') {
    return null;
  }

  const candidatePaths: string[][] = [
    ['items'],
    ['inventory', 'items'],
    ['inventory'],
    ['data', 'inventory', 'items'],
    ['data', 'inventory'],
    [],
  ];

  for (const path of candidatePaths) {
    const target = path.length === 0 ? node : readNestedValue(node, path);
    const items = ensureInventoryArray(target);
    if (items) {
      const favoritedCandidate = readNestedValue(node, ['favoritedItemIds']);
      const favorited = Array.isArray(favoritedCandidate)
        ? favoritedCandidate.filter((value): value is string => typeof value === 'string')
        : [];
      return { items, favoritedItemIds: favorited };
    }
  }

  return null;
}

function resolveInventoryItemId(rawItem: any): string | null {
  if (!rawItem || typeof rawItem !== 'object') {
    return null;
  }

  const candidatePaths: string[][] = [
    ['id'],
    ['itemId'],
    ['item', 'id'],
    ['data', 'id'],
    ['crop', 'id'],
    ['product', 'id'],
  ];

  for (const path of candidatePaths) {
    const value = readNestedValue(rawItem, path);
    if (typeof value === 'string' && value) {
      return value;
    }
    if (typeof value === 'number') {
      return String(value);
    }
  }

  return null;
}

function resolveInventorySpecies(rawItem: any): string | null {
  if (!rawItem || typeof rawItem !== 'object') {
    return null;
  }

  const candidatePaths: string[][] = [
    ['species'],
    ['item', 'species'],
    ['plant', 'species'],
    ['data', 'species'],
    ['crop', 'species'],
    ['product', 'species'],
  ];

  for (const path of candidatePaths) {
    const value = readNestedValue(rawItem, path);
    if (typeof value === 'string' && value) {
      return value;
    }
  }

  return null;
}

function resolveInventoryName(rawItem: any): string | null {
  const candidatePaths: string[][] = [
    ['name'],
    ['item', 'name'],
    ['data', 'name'],
    ['crop', 'name'],
    ['product', 'name'],
  ];

  for (const path of candidatePaths) {
    const value = readNestedValue(rawItem, path);
    if (typeof value === 'string' && value) {
      return value;
    }
  }

  const species = resolveInventorySpecies(rawItem);
  if (species) {
    return species;
  }

  const itemType = readNestedValue(rawItem, ['itemType']);
  if (typeof itemType === 'string' && itemType) {
    return itemType;
  }

  return null;
}

function resolveInventoryItemType(rawItem: any): string | null {
  const value = readNestedValue(rawItem, ['itemType']);
  if (typeof value === 'string' && value) {
    return value;
  }
  return null;
}

export function readInventorySnapshot(): InventorySnapshot | null {
  try {
    const global: Record<string, unknown> = pageWindow as unknown as Record<string, unknown>;
    const candidateSources: Array<{ node: unknown; source: string }> = [
      { node: (global.page as any)?.myData?.inventory, source: 'page.myData.inventory' },
      { node: (global.myData as any)?.inventory, source: 'myData.inventory' },
      { node: (global.inventory as any), source: 'window.inventory' },
    ];

    for (const candidate of candidateSources) {
      if (!candidate.node) continue;
      const extracted = tryExtractInventory(candidate.node);
      if (!extracted) continue;

      const items: InventoryItemSnapshot[] = [];
      for (const rawItem of extracted.items) {
        const id = resolveInventoryItemId(rawItem);
        if (!id) continue;
        const species = resolveInventorySpecies(rawItem);
        const itemType = resolveInventoryItemType(rawItem);
        const name = resolveInventoryName(rawItem);
        items.push({
          id,
          species: species ?? null,
          itemType: itemType ?? null,
          name: name ?? null,
        });
      }

      return {
        items,
        favoritedIds: new Set(extracted.favoritedItemIds),
        source: candidate.source,
      };
    }
  } catch (error) {
    log('⚠️ Unable to read inventory snapshot', error);
  }

  return null;
}

function resolveDiet(species: string | null): NormalizedDiet {
  if (!species) {
    return {
      display: [...DEFAULT_SAFE_FOODS],
      normalized: [...DEFAULT_SAFE_NORMALIZED],
    };
  }

  const key = normalizeSpeciesKey(species);
  const diet = key ? NORMALIZED_PET_DIETS[key] : undefined;
  if (diet) {
    return diet;
  }

  return {
    display: [...DEFAULT_SAFE_FOODS],
    normalized: [...DEFAULT_SAFE_NORMALIZED],
  };
}

function resolveOverride(species: string | null): SpeciesOverride | null {
  if (!species) return null;
  const key = normalizeSpeciesKey(species);
  if (!key) return null;
  return rulesState.overrides[key] || null;
}

function normalizeInventoryFood(item: InventoryItemSnapshot): string | null {
  const candidates = [item.species, item.itemType, item.name];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || candidate.length === 0) {
      continue;
    }
    const normalized = normalizeSpeciesKey(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

export function getPetSpeciesCatalog(): SpeciesCatalogEntry[] {
  const entries = new Map<string, SpeciesCatalogEntry>();

  for (const species of Object.keys(RAW_PET_DIETS)) {
    const key = normalizeSpeciesKey(species);
    if (!key) continue;
    entries.set(key, {
      species,
      key,
      label: formatFriendlyName(species),
    });
  }

  for (const key of Object.keys(rulesState.overrides)) {
    if (entries.has(key)) continue;
    entries.set(key, {
      species: key,
      key,
      label: formatFriendlyName(key),
    });
  }

  return Array.from(entries.values()).sort((a, b) => a.label.localeCompare(b.label));
}

export function getDietOptionsForSpecies(species: string): DietOptionDescriptor[] {
  const diet = resolveDiet(species);
  const options: DietOptionDescriptor[] = [];
  const seen = new Set<string>();

  for (const food of diet.display) {
    const normalized = normalizeSpeciesKey(food);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    options.push({
      key: normalized,
      label: formatFriendlyName(food),
    });
  }

  if (options.length === 0) {
    for (const fallback of DEFAULT_SAFE_FOODS) {
      const normalized = normalizeSpeciesKey(fallback);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      options.push({ key: normalized, label: formatFriendlyName(fallback) });
    }
  }

  return options;
}

export function getSpeciesPreferredFood(species: string): string | null {
  const override = resolveOverride(species);
  if (override?.preferred) {
    return override.preferred;
  }
  return null;
}

export function setSpeciesPreferredFood(species: string, foodKey: string | null): void {
  const speciesKey = normalizeSpeciesKey(species);
  if (!speciesKey) return;

  const overrides = { ...rulesState.overrides };
  const existing = overrides[speciesKey];

  const nextOverride: SpeciesOverride = {};
  if (existing?.allowed && existing.allowed.length > 0) {
    nextOverride.allowed = [...existing.allowed];
  }
  if (existing?.forbidden && existing.forbidden.length > 0) {
    nextOverride.forbidden = [...existing.forbidden];
  }

  if (foodKey && foodKey.trim()) {
    const normalizedFood = normalizeSpeciesKey(foodKey);
    if (normalizedFood) {
      nextOverride.preferred = normalizedFood;
    }
  }

  const hasPreferred = typeof nextOverride.preferred === 'string' && nextOverride.preferred.length > 0;
  const hasAllowed = Array.isArray(nextOverride.allowed) && nextOverride.allowed.length > 0;
  const hasForbidden = Array.isArray(nextOverride.forbidden) && nextOverride.forbidden.length > 0;

  if (!hasPreferred) {
    delete nextOverride.preferred;
  }
  if (!hasAllowed) {
    delete nextOverride.allowed;
  }
  if (!hasForbidden) {
    delete nextOverride.forbidden;
  }

  if (hasPreferred || hasAllowed || hasForbidden) {
    overrides[speciesKey] = nextOverride;
  } else {
    delete overrides[speciesKey];
  }

  rulesState = {
    ...rulesState,
    overrides,
    updatedAt: Date.now(),
  };
  saveState();

  const speciesLabel = formatFriendlyName(species);
  if (hasPreferred && nextOverride.preferred) {
    const foodLabel = formatFoodLabelForSpecies(species, nextOverride.preferred);
    log(`⚖️ Preferred food set for ${speciesLabel}: ${foodLabel}`);
  } else {
    log(`⚖️ Preferred food cleared for ${speciesLabel}`);
  }
}

export function selectFoodForPet(
  petSpecies: string | null,
  snapshot: InventorySnapshot | null,
  options: FoodSelectionOptions = {},
): FoodSelection | null {
  if (!snapshot || snapshot.items.length === 0) {
    return null;
  }

  const diet = resolveDiet(petSpecies);
  const override = resolveOverride(petSpecies);

  const allowedNormalized = new Set<string>(diet.normalized);

  const preferredNormalized = override?.preferred
    ? normalizeSpeciesKey(override.preferred)
    : null;
  if (preferredNormalized) {
    allowedNormalized.add(preferredNormalized);
  }

  if (override?.allowed) {
    for (const entry of override.allowed) {
      const normalized = normalizeSpeciesKey(entry);
      if (normalized) {
        allowedNormalized.add(normalized);
      }
    }
  }

  const forbiddenNormalized = new Set<string>();
  if (override?.forbidden) {
    for (const entry of override.forbidden) {
      const normalized = normalizeSpeciesKey(entry);
      if (normalized) {
        forbiddenNormalized.add(normalized);
      }
    }
  }

  if (allowedNormalized.size === 0) {
    DEFAULT_SAFE_NORMALIZED.forEach(value => allowedNormalized.add(value));
  }

  const avoidFavorited = options.avoidFavorited ?? rulesState.avoidFavorited;
  const matchItem = (
    skipFavorited: boolean,
    predicate: (normalized: string, item: InventoryItemSnapshot) => boolean,
  ): InventoryItemSnapshot | null => {
    for (const item of snapshot.items) {
      const normalized = normalizeInventoryFood(item);
      if (!normalized) continue;
      if (skipFavorited && snapshot.favoritedIds.has(item.id)) continue;
      if (!predicate(normalized, item)) continue;
      return item;
    }
    return null;
  };

  const selectPreferred = (skipFavorited: boolean): InventoryItemSnapshot | null => {
    if (!preferredNormalized) return null;
    return matchItem(skipFavorited, normalized => normalized === preferredNormalized);
  };

  const selectAllowed = (skipFavorited: boolean): InventoryItemSnapshot | null => {
    return matchItem(skipFavorited, normalized => allowedNormalized.has(normalized) && !forbiddenNormalized.has(normalized));
  };

  const preferredPrimary = selectPreferred(true);
  if (preferredPrimary) {
    return {
      item: preferredPrimary,
      usedFavoriteFallback: false,
    };
  }

  if (avoidFavorited) {
    const preferredFallback = selectPreferred(false);
    if (preferredFallback) {
      return {
        item: preferredFallback,
        usedFavoriteFallback: snapshot.favoritedIds.has(preferredFallback.id),
      };
    }
  }

  const allowedPrimary = selectAllowed(true);
  if (allowedPrimary) {
    return {
      item: allowedPrimary,
      usedFavoriteFallback: false,
    };
  }

  if (avoidFavorited) {
    const allowedFallback = selectAllowed(false);
    if (allowedFallback) {
      return {
        item: allowedFallback,
        usedFavoriteFallback: snapshot.favoritedIds.has(allowedFallback.id),
      };
    }
  }

  return null;
}
