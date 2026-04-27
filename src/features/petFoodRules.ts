// src/features/petFoodRules.ts
// Centralized pet food rules management, diet mapping, and inventory helpers

import { storage } from '../utils/storage';
import { normalizeSpeciesKey } from '../utils/helpers';
import { pageWindow } from '../core/pageContext';
import { log } from '../utils/logger';
import { getAllPetDiets, getPetDiet } from '../catalogs/gameCatalogs';

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
  quantity: number | null;
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
  respectRules?: boolean;
  /**
   * Per-pet-item override. When provided, takes precedence over the species-level override.
   * Callers (e.g. instantFeed.ts) should read this from the Pet Teams feed policy.
   */
  itemOverride?: SpeciesOverride;
}

export interface FoodAvailabilityResult {
  selected: FoodSelection | null;
  availableCount: number;
}

export interface FoodInventorySource {
  items?: unknown[];
  favoritedItemIds?: unknown;
}

const STORAGE_KEY = 'quinoa-pet-food-rules';
const PET_FOOD_RULES_EVENT = 'qpm:pet-food-rules-changed';
export const PET_FOOD_RULES_CHANGED_EVENT = PET_FOOD_RULES_EVENT;

const DEFAULT_STATE: PetFoodRulesState = {
  respectRules: false,
  avoidFavorited: true,
  overrides: {},
  updatedAt: Date.now(),
};

const DEFAULT_SAFE_FOODS = ['Carrot', 'Strawberry', 'Blueberry', 'Apple', 'Watermelon', 'Pumpkin'];

interface NormalizedDiet {
  display: string[];
  normalized: string[];
}

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
    .replace(/\b([a-z])/g, (match) => match.toUpperCase())
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

function emitRulesChanged(): void {
  try {
    window.dispatchEvent(new CustomEvent(PET_FOOD_RULES_EVENT, {
      detail: {
        respectRules: rulesState.respectRules,
        avoidFavorited: rulesState.avoidFavorited,
        updatedAt: rulesState.updatedAt,
      },
    }));
  } catch {
    // no-op
  }
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
  emitRulesChanged();
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
  emitRulesChanged();
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
  emitRulesChanged();
}

export function resetPetFoodRules(): void {
  rulesState = { ...DEFAULT_STATE, updatedAt: Date.now() };
  saveState();
  emitRulesChanged();
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

function resolveInventoryQuantity(rawItem: any): number | null {
  if (!rawItem || typeof rawItem !== 'object') {
    return null;
  }

  const candidatePaths: string[][] = [
    ['quantity'],
    ['count'],
    ['amount'],
    ['stackSize'],
    ['item', 'quantity'],
    ['item', 'count'],
    ['item', 'amount'],
  ];

  for (const path of candidatePaths) {
    const value = readNestedValue(rawItem, path);
    if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.floor(value));
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return Math.max(0, Math.floor(parsed));
    }
  }

  return null;
}

function isFeedableProduceItemType(itemType: string | null): boolean {
  if (!itemType) return false;
  const normalized = itemType.trim().toLowerCase();
  return normalized === 'produce' || normalized === 'crop';
}

function coerceFavoritedIds(value: unknown): Set<string> {
  if (!Array.isArray(value)) return new Set<string>();
  return new Set(value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0));
}

export function buildFoodInventorySnapshot(
  source: FoodInventorySource | null | undefined,
  excludeItemIds?: Set<string>,
): InventorySnapshot | null {
  if (!source || !Array.isArray(source.items)) return null;

  const items: InventoryItemSnapshot[] = [];
  for (const rawItem of source.items) {
    const id = resolveInventoryItemId(rawItem);
    if (!id) continue;
    if (excludeItemIds && excludeItemIds.has(id)) continue;

    const itemType = resolveInventoryItemType(rawItem);
    if (!isFeedableProduceItemType(itemType)) continue;

    items.push({
      id,
      species: resolveInventorySpecies(rawItem),
      itemType,
      name: resolveInventoryName(rawItem),
      quantity: resolveInventoryQuantity(rawItem),
    });
  }

  return {
    items,
    favoritedIds: coerceFavoritedIds(source.favoritedItemIds),
    source: 'myInventoryAtom',
  };
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
        if (!isFeedableProduceItemType(itemType)) continue;
        const name = resolveInventoryName(rawItem);
        const quantity = resolveInventoryQuantity(rawItem);
        items.push({
          id,
          species: species ?? null,
          itemType: itemType ?? null,
          name: name ?? null,
          quantity,
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
  const toNormalizedDiet = (foods: string[]): NormalizedDiet => {
    const normalized = foods
      .map(food => normalizeSpeciesKey(food))
      .filter((food): food is string => !!food);
    if (normalized.length === 0) {
      return {
        display: [...DEFAULT_SAFE_FOODS],
        normalized: [...DEFAULT_SAFE_NORMALIZED],
      };
    }
    return {
      display: [...foods],
      normalized,
    };
  };

  if (!species) {
    return {
      display: [...DEFAULT_SAFE_FOODS],
      normalized: [...DEFAULT_SAFE_NORMALIZED],
    };
  }

  const runtimeDiet = getPetDiet(species);
  if (runtimeDiet.length > 0) {
    return toNormalizedDiet(runtimeDiet);
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

function mergeOverrides(
  speciesOverride: SpeciesOverride | null,
  itemOverride: SpeciesOverride | undefined,
): SpeciesOverride | null {
  const merged: SpeciesOverride = {};

  if (Array.isArray(speciesOverride?.allowed) && speciesOverride.allowed.length > 0) {
    merged.allowed = [...speciesOverride.allowed];
  }
  if (Array.isArray(speciesOverride?.forbidden) && speciesOverride.forbidden.length > 0) {
    merged.forbidden = [...speciesOverride.forbidden];
  }
  if (typeof speciesOverride?.preferred === 'string' && speciesOverride.preferred.length > 0) {
    merged.preferred = speciesOverride.preferred;
  }

  const hasItemAllowed = !!itemOverride && Object.prototype.hasOwnProperty.call(itemOverride, 'allowed');
  const hasItemForbidden = !!itemOverride && Object.prototype.hasOwnProperty.call(itemOverride, 'forbidden');
  const hasItemPreferred = !!itemOverride && Object.prototype.hasOwnProperty.call(itemOverride, 'preferred');
  if (hasItemAllowed) merged.allowed = Array.isArray(itemOverride!.allowed) ? [...itemOverride!.allowed] : [];
  if (hasItemForbidden) merged.forbidden = Array.isArray(itemOverride!.forbidden) ? [...itemOverride!.forbidden] : [];
  if (hasItemPreferred) {
    if (typeof itemOverride!.preferred === 'string' && itemOverride!.preferred.length > 0) {
      merged.preferred = itemOverride!.preferred;
    } else {
      delete merged.preferred;
    }
  }

  const hasAllowed = Array.isArray(merged.allowed);
  const hasForbidden = Array.isArray(merged.forbidden);
  const hasPreferred = typeof merged.preferred === 'string' && merged.preferred.length > 0;
  return hasAllowed || hasForbidden || hasPreferred ? merged : null;
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
  const runtimeDiets = getAllPetDiets();

  for (const species of Object.keys(runtimeDiets)) {
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
  emitRulesChanged();

  const speciesLabel = formatFriendlyName(species);
  if (hasPreferred && nextOverride.preferred) {
    const foodLabel = formatFoodLabelForSpecies(species, nextOverride.preferred);
    log(`⚖️ Preferred food set for ${speciesLabel}: ${foodLabel}`);
  } else {
    log(`⚖️ Preferred food cleared for ${speciesLabel}`);
  }
}

function sumItemQuantities(items: InventoryItemSnapshot[]): number {
  return items.reduce((sum, item) => sum + (item.quantity != null ? Math.max(0, item.quantity) : 1), 0);
}

function getFoodRulesContext(
  petSpecies: string | null,
  options: FoodSelectionOptions,
): {
  respectRules: boolean;
  avoidFavorited: boolean;
  preferredNormalized: string | null;
  allowedNormalized: Set<string>;
  forbiddenNormalized: Set<string>;
} {
  const respectRules = options.respectRules ?? rulesState.respectRules;
  const avoidFavorited = options.avoidFavorited ?? rulesState.avoidFavorited;

  const allowedNormalized = new Set<string>();
  const forbiddenNormalized = new Set<string>();
  let preferredNormalized: string | null = null;

  if (respectRules) {
    const diet = resolveDiet(petSpecies);
    const override = mergeOverrides(resolveOverride(petSpecies), options.itemOverride);

    diet.normalized.forEach((entry) => allowedNormalized.add(entry));

    preferredNormalized = override?.preferred ? normalizeSpeciesKey(override.preferred) : null;
    if (preferredNormalized) {
      allowedNormalized.add(preferredNormalized);
    }

    if (override?.allowed) {
      for (const entry of override.allowed) {
        const normalized = normalizeSpeciesKey(entry);
        if (normalized) allowedNormalized.add(normalized);
      }
    }

    if (override?.forbidden) {
      for (const entry of override.forbidden) {
        const normalized = normalizeSpeciesKey(entry);
        if (normalized) forbiddenNormalized.add(normalized);
      }
    }

    if (allowedNormalized.size === 0) {
      DEFAULT_SAFE_NORMALIZED.forEach((value) => allowedNormalized.add(value));
    }
  }

  return {
    respectRules,
    avoidFavorited,
    preferredNormalized,
    allowedNormalized,
    forbiddenNormalized,
  };
}

function findMatchingFood(
  snapshot: InventorySnapshot,
  skipFavorited: boolean,
  predicate: (normalized: string, item: InventoryItemSnapshot) => boolean,
): InventoryItemSnapshot | null {
  for (const item of snapshot.items) {
    const normalized = normalizeInventoryFood(item);
    if (!normalized) continue;
    if (skipFavorited && snapshot.favoritedIds.has(item.id)) continue;
    if (!predicate(normalized, item)) continue;
    return item;
  }
  return null;
}

function listMatchingFood(
  snapshot: InventorySnapshot,
  skipFavorited: boolean,
  predicate: (normalized: string, item: InventoryItemSnapshot) => boolean,
): InventoryItemSnapshot[] {
  const result: InventoryItemSnapshot[] = [];
  for (const item of snapshot.items) {
    const normalized = normalizeInventoryFood(item);
    if (!normalized) continue;
    if (skipFavorited && snapshot.favoritedIds.has(item.id)) continue;
    if (!predicate(normalized, item)) continue;
    result.push(item);
  }
  return result;
}

export function evaluateFoodAvailabilityForPet(
  petSpecies: string | null,
  snapshot: InventorySnapshot | null,
  options: FoodSelectionOptions = {},
): FoodAvailabilityResult {
  if (!snapshot || snapshot.items.length === 0) {
    return { selected: null, availableCount: 0 };
  }

  const context = getFoodRulesContext(petSpecies, options);
  const matchPreferred = (normalized: string): boolean => {
    if (!context.preferredNormalized) return false;
    return normalized === context.preferredNormalized;
  };
  const matchAllowed = (normalized: string): boolean => {
    if (!context.respectRules) return true;
    return context.allowedNormalized.has(normalized) && !context.forbiddenNormalized.has(normalized);
  };

  const selectWithFavoritedPolicy = (
    selector: (skipFavorited: boolean) => InventoryItemSnapshot | null,
  ): FoodSelection | null => {
    const primary = selector(true);
    if (primary) {
      return { item: primary, usedFavoriteFallback: false };
    }
    if (!context.avoidFavorited) return null;

    const fallback = selector(false);
    if (!fallback) return null;
    return {
      item: fallback,
      usedFavoriteFallback: snapshot.favoritedIds.has(fallback.id),
    };
  };

  let selected: FoodSelection | null = null;
  if (context.respectRules) {
    selected = selectWithFavoritedPolicy((skipFavorited) => findMatchingFood(snapshot, skipFavorited, (normalized) => matchPreferred(normalized)));
    if (!selected) {
      selected = selectWithFavoritedPolicy((skipFavorited) => findMatchingFood(snapshot, skipFavorited, (normalized) => matchAllowed(normalized)));
    }
  } else {
    selected = selectWithFavoritedPolicy((skipFavorited) => findMatchingFood(snapshot, skipFavorited, () => true));
  }

  if (!selected) {
    return { selected: null, availableCount: 0 };
  }

  const countPredicate = context.respectRules
    ? (context.preferredNormalized ? ((normalized: string) => matchPreferred(normalized) || matchAllowed(normalized)) : matchAllowed)
    : (() => true);
  const skipFavoritedForCount = context.avoidFavorited;
  const countItems = listMatchingFood(snapshot, skipFavoritedForCount, (normalized) => countPredicate(normalized));

  return {
    selected,
    availableCount: sumItemQuantities(countItems),
  };
}

export function selectFoodForPetLegacyCompatibility(
  petSpecies: string | null,
  snapshot: InventorySnapshot | null,
  options: FoodSelectionOptions = {},
): FoodSelection | null {
  // Legacy alias for integrations that still expect this helper path.
  return selectFoodForPet(petSpecies, snapshot, options);
}

export function selectFoodForPet(
  petSpecies: string | null,
  snapshot: InventorySnapshot | null,
  options: FoodSelectionOptions = {},
): FoodSelection | null {
  return evaluateFoodAvailabilityForPet(petSpecies, snapshot, options).selected;
}
