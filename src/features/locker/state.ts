// src/features/locker/state.ts
// Persisted config for the Locker.

import { storage } from '../../utils/storage';
import type { LockerConfig, CustomRule } from './types';

const STORAGE_KEY = 'qpm.locker.config.v1';

const DEFAULT_CONFIG: LockerConfig = {
  enabled: false,
  inventoryReserve: { enabled: false, minFreeSlots: 5 },
  hatchLock: false,
  eggLocks: {},
  plantLocks: {},
  mutationLocks: {},
  harvestLock: false,
  decorPickupLock: false,
  decorLocks: {},
  sellAllCropsLock: false,
  cropSellLocks: {},
  customRules: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function toNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(min, Math.min(max, Math.round(value)));
  }
  return fallback;
}

function sanitizeCustomRules(raw: unknown): CustomRule[] {
  if (!Array.isArray(raw)) return [];
  const out: CustomRule[] = [];
  for (const entry of raw) {
    if (!isRecord(entry) || typeof entry.species !== 'string' || entry.species.length === 0) continue;

    // New shape: mutations: string[]
    if (Array.isArray(entry.mutations)) {
      const muts = entry.mutations.filter((m): m is string => typeof m === 'string' && m.length > 0);
      if (muts.length > 0) out.push({ species: entry.species, mutations: muts });
      continue;
    }
    // Backward compat: old shape had mutation: string (single)
    if (typeof entry.mutation === 'string' && entry.mutation.length > 0) {
      out.push({ species: entry.species, mutations: [entry.mutation] });
    }
  }
  return out;
}

function sanitizeBooleanMap(raw: unknown): Record<string, boolean> {
  if (!isRecord(raw)) return {};
  const out: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key.length > 0 && typeof value === 'boolean') {
      out[key] = value;
    }
  }
  return out;
}

function sanitizeConfig(raw: unknown): LockerConfig {
  if (!isRecord(raw)) return { ...DEFAULT_CONFIG };

  const reserve = isRecord(raw.inventoryReserve) ? raw.inventoryReserve : {};

  // Backward compat: harvestLock was { enabled: boolean }
  let harvestLock = DEFAULT_CONFIG.harvestLock;
  if (typeof raw.harvestLock === 'boolean') {
    harvestLock = raw.harvestLock;
  } else if (isRecord(raw.harvestLock) && typeof raw.harvestLock.enabled === 'boolean') {
    harvestLock = raw.harvestLock.enabled;
  }

  return {
    enabled: toBoolean(raw.enabled, DEFAULT_CONFIG.enabled),
    inventoryReserve: {
      enabled: toBoolean(reserve.enabled, DEFAULT_CONFIG.inventoryReserve.enabled),
      minFreeSlots: toNumber(reserve.minFreeSlots, DEFAULT_CONFIG.inventoryReserve.minFreeSlots, 0, 50),
    },
    hatchLock: toBoolean(raw.hatchLock, DEFAULT_CONFIG.hatchLock),
    eggLocks: sanitizeBooleanMap(raw.eggLocks),
    plantLocks: sanitizeBooleanMap(raw.plantLocks),
    mutationLocks: sanitizeBooleanMap(raw.mutationLocks),
    harvestLock,
    decorPickupLock: toBoolean(raw.decorPickupLock, DEFAULT_CONFIG.decorPickupLock),
    decorLocks: sanitizeBooleanMap(raw.decorLocks),
    sellAllCropsLock: toBoolean(raw.sellAllCropsLock, DEFAULT_CONFIG.sellAllCropsLock),
    cropSellLocks: sanitizeBooleanMap(raw.cropSellLocks),
    customRules: sanitizeCustomRules(raw.customRules),
  };
}

let config: LockerConfig = sanitizeConfig(storage.get<unknown>(STORAGE_KEY, null));

function persist(): void {
  storage.set(STORAGE_KEY, config);
}

export function getLockerConfig(): LockerConfig {
  return {
    ...config,
    inventoryReserve: { ...config.inventoryReserve },
    eggLocks: { ...config.eggLocks },
    plantLocks: { ...config.plantLocks },
    mutationLocks: { ...config.mutationLocks },
    decorLocks: { ...config.decorLocks },
    cropSellLocks: { ...config.cropSellLocks },
    customRules: config.customRules.map(r => ({ ...r })),
  };
}

export function updateLockerConfig(partial: Partial<LockerConfig>): LockerConfig {
  const merged = { ...config, ...partial };
  config = sanitizeConfig(merged);
  persist();
  return getLockerConfig();
}

export function resetLockerConfig(): LockerConfig {
  config = { ...DEFAULT_CONFIG };
  persist();
  return getLockerConfig();
}
