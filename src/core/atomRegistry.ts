// src/core/atomRegistry.ts
// Provides typed helpers for accessing frequently used MagicGarden jotai atoms.

import { getAtomByLabel, readAtomValue as readRawAtomValue, subscribeAtom as subscribeRawAtom } from './jotaiBridge';
import { log } from '../utils/logger';
import type {
  WeatherAtomValue,
  ShopsAtomSnapshot,
  ShopPurchasesAtomSnapshot,
  ShopCategorySnapshot,
} from '../types/gameAtoms';

type AtomPath = string | readonly (string | number)[];

interface AtomDescriptor<TValue> {
  label: string;
  path?: AtomPath;
  transform?: (value: unknown) => TValue;
  fallback?: TValue;
}

type AtomDescriptorMap = {
  weather: AtomDescriptor<WeatherAtomValue>;
  shops: AtomDescriptor<ShopsAtomSnapshot | null>;
  seedShop: AtomDescriptor<ShopCategorySnapshot | null>;
  eggShop: AtomDescriptor<ShopCategorySnapshot | null>;
  toolShop: AtomDescriptor<ShopCategorySnapshot | null>;
  decorShop: AtomDescriptor<ShopCategorySnapshot | null>;
  shopPurchases: AtomDescriptor<ShopPurchasesAtomSnapshot | null>;
};

const ATOM_DESCRIPTORS: AtomDescriptorMap = {
  weather: { label: 'weatherAtom' },
  shops: {
    label: 'shopsAtom',
    transform: (value: unknown) => (value && typeof value === 'object' ? (value as ShopsAtomSnapshot) : null),
  },
  seedShop: { label: 'shopsAtom', path: 'seed' },
  eggShop: { label: 'shopsAtom', path: 'egg' },
  toolShop: { label: 'shopsAtom', path: 'tool' },
  decorShop: { label: 'shopsAtom', path: 'decor' },
  shopPurchases: { label: 'myShopPurchasesAtom' },
};

export type AtomRegistryKey = keyof AtomDescriptorMap;

type AtomValueMap = {
  weather: WeatherAtomValue;
  shops: ShopsAtomSnapshot | null;
  seedShop: ShopCategorySnapshot | null;
  eggShop: ShopCategorySnapshot | null;
  toolShop: ShopCategorySnapshot | null;
  decorShop: ShopCategorySnapshot | null;
  shopPurchases: ShopPurchasesAtomSnapshot | null;
};

type RegistryValue<K extends AtomRegistryKey> = AtomValueMap[K] | null;

const missingAtomLog = new Set<string>();

function toPathArray(path?: AtomPath): Array<string | number> {
  if (!path) return [];
  if (Array.isArray(path)) {
    return path.slice();
  }
  return String(path)
    .split('.')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function getPathValue(root: unknown, path?: AtomPath): unknown {
  if (!path) return root;
  const segments = toPathArray(path);
  let cursor: any = root;
  for (const segment of segments) {
    if (cursor == null) {
      return undefined;
    }
    if (typeof segment === 'number') {
      cursor = Array.isArray(cursor) ? cursor[segment] : undefined;
    } else {
      cursor = (cursor as Record<string, unknown>)[segment];
    }
  }
  return cursor;
}

async function resolveAtom(label: string): Promise<any> {
  const atom = getAtomByLabel(label);
  if (!atom) {
    if (!missingAtomLog.has(label)) {
      log('⚠️ AtomRegistry missing atom', label);
      missingAtomLog.add(label);
    }
    throw new Error(`Atom ${label} not found in jotaiAtomCache`);
  }
  missingAtomLog.delete(label);
  return atom;
}

function buildTransformer<T>(descriptor: AtomDescriptor<T>): (raw: unknown) => T | null {
  return (raw: unknown) => {
    try {
      const base = getPathValue(raw, descriptor.path);
      if (descriptor.transform) {
        return descriptor.transform(base);
      }
      return (base ?? descriptor.fallback ?? null) as T | null;
    } catch (error) {
      log('⚠️ AtomRegistry transform error', descriptor.label, error);
      return (descriptor.fallback ?? null) as T | null;
    }
  };
}

function getDescriptor<K extends AtomRegistryKey>(key: K): AtomDescriptor<AtomValueMap[K]> {
  return ATOM_DESCRIPTORS[key] as AtomDescriptor<AtomValueMap[K]>;
}

export async function readAtomValue<K extends AtomRegistryKey>(key: K): Promise<RegistryValue<K>> {
  const descriptor = getDescriptor(key);
  const atom = await resolveAtom(descriptor.label).catch(() => null);
  if (!atom) {
    const fallback = descriptor.fallback ?? null;
    return (fallback ?? null) as RegistryValue<K>;
  }
  const transformer = buildTransformer(descriptor);
  const raw = await readRawAtomValue(atom).catch((error) => {
    log('⚠️ AtomRegistry read error', descriptor.label, error);
    return null;
  });
  const value = transformer(raw);
  return (value ?? null) as RegistryValue<K>;
}

export async function subscribeAtomValue<K extends AtomRegistryKey>(
  key: K,
  cb: (value: RegistryValue<K>) => void,
): Promise<() => void> {
  const descriptor = getDescriptor(key);
  const atom = await resolveAtom(descriptor.label);
  const transformer = buildTransformer(descriptor);
  const unsubscribe = await subscribeRawAtom(atom, (raw) => {
    const value = transformer(raw);
    cb((value ?? null) as RegistryValue<K>);
  });
  return () => {
    try {
      unsubscribe();
    } catch (error) {
      log('⚠️ AtomRegistry unsubscribe error', descriptor.label, error);
    }
  };
}
