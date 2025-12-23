// src/core/jotaiBridge.ts
import { readSharedGlobal, shareGlobal, pageWindow } from './pageContext';
import { log } from '../utils/logger';

export type JotaiStore = {
  get(atom: unknown): any;
  set(atom: unknown, value: unknown): void | Promise<void>;
  sub(atom: unknown, cb: () => void): () => void | Promise<() => void>;
  __polyfill?: boolean;
};

const STORE_GLOBAL_KEY = '__qpmJotaiStore__';
const CACHE_GLOBAL_KEY = '__qpmJotaiAtomCache__';
const SHARED_STORE_KEYS = [
  '__jotaiStore',
  'jotaiStore',
  '__QPM_SHARED_JOTAI__',
  '__MG_SHARED_JOTAI__',
] as const;

// Keep reference to any discovered cache; avoid pre-populating to let the game own the value.
let liveAtomCache: AtomCacheLike | null = null;

function mirrorStore(store: JotaiStore) {
  shareGlobal(STORE_GLOBAL_KEY, store);
  SHARED_STORE_KEYS.forEach((key) => {
    try {
      (pageWindow as any)[key] = store;
    } catch {}
  });
  try {
    if ((pageWindow as any).AriesMod?.services) {
      (pageWindow as any).AriesMod.services.jotaiStore = store;
    }
  } catch {}
}

function startSharedStorePolling(): void {
  if (sharedStorePoller != null) return;
  // Poll frequently to detect when Aries Mod or game exposes the store
  // This helps avoid conflicts by using an existing store instead of capturing a new one
  sharedStorePoller = window.setInterval(() => {
    try {
      const candidate = getSharedStoreCandidate();
      if (candidate && !candidate.__polyfill) {
        storeRef = candidate;
        mirrorStore(candidate);
        log('[jotaiBridge] Using shared store from another mod/game');
        if (sharedStorePoller != null) {
          clearInterval(sharedStorePoller);
          sharedStorePoller = null;
        }
      }
    } catch {}
  }, 500); // Check more frequently to pick up Aries Mod's store faster
}

let storeRef: JotaiStore | null = null;
let captureInFlight = false;
let lastCaptureError: unknown = null;
let lastCaptureMode: 'fiber' | 'write' | 'polyfill' | null = null;
let sharedStorePoller: number | null = null;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type AtomCacheLike = {
  get: (key: unknown) => unknown;
  values: () => IterableIterator<any>;
};

function mirrorAtomCache(cache: AtomCacheLike): void {
  // Be non-invasive: only mirror if nothing exists yet so we don't fight the game/Aries
  try {
    const current = (pageWindow as any).jotaiAtomCache;
    const currentCache = current && (current as any).cache ? (current as any).cache : current;
    const hasMap = currentCache && typeof (currentCache as any).get === 'function';
    if (hasMap) return;
  } catch {}

  try {
    const shape = cache as AtomCacheLike & { cache?: AtomCacheLike };
    shape.cache = cache;
    (pageWindow as any).jotaiAtomCache = shape;
    if ((pageWindow as any).AriesMod?.services) {
      (pageWindow as any).AriesMod.services.jotaiAtomCache = shape;
    }
  } catch {}
}

function isAtomCacheLike(value: unknown): value is AtomCacheLike {
  return !!value && typeof (value as AtomCacheLike).get === 'function' && typeof (value as AtomCacheLike).values === 'function';
}

// Expose any shared cache if it already exists; otherwise defer to the game.
const existingCache = readSharedGlobal<AtomCacheLike>(CACHE_GLOBAL_KEY);
if (existingCache && isAtomCacheLike(existingCache)) {
  liveAtomCache = existingCache;
}

function getAtomCache(): AtomCacheLike | undefined {
  const cached = readSharedGlobal<AtomCacheLike>(CACHE_GLOBAL_KEY);
  if (cached && isAtomCacheLike(cached)) {
    liveAtomCache = cached;
    mirrorAtomCache(cached);
    return cached;
  }

  const raw = (pageWindow as unknown as Record<string, unknown>).jotaiAtomCache as
    | { cache?: unknown }
    | AtomCacheLike
    | undefined;

  const candidate = raw && 'cache' in raw ? (raw as { cache?: unknown }).cache : raw;
  if (isAtomCacheLike(candidate)) {
    liveAtomCache = candidate as AtomCacheLike;
    mirrorAtomCache(candidate as AtomCacheLike);
    return candidate as AtomCacheLike;
  }
  return undefined;
}

function getSharedStoreCandidate(): JotaiStore | null {
  // 1) Aries Mod might expose under services - CHECK FIRST to avoid conflicts
  const ariesSvc = (pageWindow as any)?.AriesMod?.services;
  const ariesStore = ariesSvc?.jotaiStore;
  if (
    ariesStore &&
    typeof ariesStore.get === 'function' &&
    typeof ariesStore.set === 'function' &&
    typeof ariesStore.sub === 'function'
  ) {
    return ariesStore as JotaiStore;
  }

  // 2) Already shared by us or another tool
  const shared = readSharedGlobal<JotaiStore>(STORE_GLOBAL_KEY);
  if (shared && typeof shared.get === 'function' && typeof shared.set === 'function') return shared;

  // 3) Common global slots other tools may use (Aries/MGTools-like)
  for (const key of SHARED_STORE_KEYS) {
    const candidate = (pageWindow as any)[key];
    if (
      candidate &&
      typeof candidate.get === 'function' &&
      typeof candidate.set === 'function' &&
      typeof candidate.sub === 'function'
    ) {
      return candidate as JotaiStore;
    }
  }

  return null;
}

async function waitForAtomCache(timeoutMs = 5000): Promise<AtomCacheLike | undefined> {
  const start = Date.now();
  let cache = getAtomCache();

  while (!cache && Date.now() - start < timeoutMs) {
    await wait(50);
    cache = getAtomCache();
  }

  if (cache) {
    liveAtomCache = cache;
    mirrorAtomCache(cache);
  }

  return cache;
}

type FiberNode = {
  pendingProps?: { value?: unknown } & Record<string, unknown>;
  child?: FiberNode | null;
  sibling?: FiberNode | null;
  alternate?: FiberNode | null;
};

type ReactDevToolsHook = {
  renderers?: Map<number, unknown>;
  getFiberRoots?: (rendererId: number) => Set<FiberNode> | undefined;
};

function findStoreViaFiber(): JotaiStore | null {
  const hook: ReactDevToolsHook | undefined = (pageWindow as unknown as Record<string, unknown>)[
    '__REACT_DEVTOOLS_GLOBAL_HOOK__'
  ] as ReactDevToolsHook | undefined;
  if (!hook?.renderers?.size) return null;

  for (const [rendererId] of hook.renderers) {
    const roots = hook.getFiberRoots?.(rendererId);
    if (!roots) continue;

    for (const root of roots) {
      const seen = new Set<FiberNode>();
      const stack: Array<FiberNode | null | undefined> = [];

      const fiberRoot = (root as { current?: FiberNode }).current ?? (root as FiberNode | null | undefined);
      if (fiberRoot) {
        stack.push(fiberRoot);
      }

      while (stack.length) {
        const fiber = stack.pop();
        if (!fiber || seen.has(fiber)) continue;
        seen.add(fiber);

        const value = fiber.pendingProps?.value as unknown;
        if (
          value &&
          typeof value === 'object' &&
          typeof (value as JotaiStore).get === 'function' &&
          typeof (value as JotaiStore).set === 'function' &&
          typeof (value as JotaiStore).sub === 'function'
        ) {
          lastCaptureMode = 'fiber';
          return value as JotaiStore;
        }

        if (fiber.child) stack.push(fiber.child);
        if (fiber.sibling) stack.push(fiber.sibling);
        if (fiber.alternate) stack.push(fiber.alternate);
      }
    }
  }
  return null;
}

async function captureViaWriteOnce(timeoutMs = 5000): Promise<JotaiStore> {
  const cache = await waitForAtomCache(timeoutMs);
  if (!cache) {
    throw new Error('jotaiAtomCache.cache not available');
  }

  let capturedGet: ((atom: unknown) => unknown) | null = null;
  let capturedSet: ((atom: unknown, value: unknown) => void | Promise<void>) | null = null;

  type PatchedAtom = {
    write?: (get: any, set: any, ...args: any[]) => unknown;
    __origWrite?: (get: any, set: any, ...args: any[]) => unknown;
  } & Record<string, unknown>;

  const patchedAtoms: PatchedAtom[] = [];

  const restorePatchedAtoms = () => {
    for (const atom of patchedAtoms) {
      try {
        if (atom.__origWrite) {
          atom.write = atom.__origWrite;
          delete atom.__origWrite;
        }
      } catch {}
    }
  };

  let alreadyPatched = false;

  for (const atom of cache.values()) {
    if (!atom || typeof (atom as PatchedAtom).write !== 'function') continue;
    const candidate = atom as PatchedAtom;
    if (candidate.__origWrite) {
      alreadyPatched = true;
      continue;
    }

    const original = candidate.write!.bind(candidate);
    candidate.__origWrite = candidate.write!;
    candidate.write = function patchedWrite(get: any, set: any, ...args: any[]) {
      if (!capturedSet) {
        capturedGet = get;
        capturedSet = set;
        restorePatchedAtoms();
      }
      return original(get, set, ...args);
    };
    patchedAtoms.push(candidate);
  }

  // If another script already patched writes, avoid double-patching to reduce conflicts
  if (alreadyPatched && !patchedAtoms.length) {
    // Another mod (Aries/MGTools) likely patched writes; wait a bit to see if they expose the store
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const shared = getSharedStoreCandidate();
      if (shared) {
        lastCaptureMode = 'write';
        return shared;
      }
      await wait(50);
    }

    lastCaptureMode = 'polyfill';
    log('[jotaiBridge] jotai writes already patched by another mod; skipping capture hook');
    return {
      get() {
        throw new Error('Jotai store unavailable (already patched by another mod)');
      },
      set() {
        throw new Error('Jotai store unavailable (already patched by another mod)');
      },
      sub() {
        return () => {};
      },
      __polyfill: true,
    };
  }

  try {
    const deadline = Date.now() + timeoutMs;
    while (!capturedSet && Date.now() < deadline) {
      await wait(50);
    }
  } finally {
    restorePatchedAtoms();
  }

  if (!capturedSet || !capturedGet) {
    lastCaptureMode = 'polyfill';
    log('[jotaiBridge] Unable to capture Jotai store via write hook, using polyfill');
    return {
      get() {
        throw new Error('Jotai store unavailable (polyfill)');
      },
      set() {
        throw new Error('Jotai store unavailable (polyfill)');
      },
      sub() {
        return () => {};
      },
      __polyfill: true,
    };
  }

  lastCaptureMode = 'write';
  return {
    get(atom: unknown) {
      return capturedGet!(atom);
    },
    async set(atom: unknown, value: unknown) {
      await capturedSet!(atom, value);
    },
    sub(atom: unknown, cb: () => void) {
      let lastValue: unknown;
      const interval = setInterval(() => {
        try {
          const current = capturedGet!(atom);
          if (current !== lastValue) {
            lastValue = current;
            cb();
          }
        } catch {}
      }, 100);
      return () => clearInterval(interval);
    },
  };
}

export async function ensureJotaiStore(): Promise<JotaiStore> {
  if (storeRef && !storeRef.__polyfill) {
    return storeRef;
  }

  // Try to reuse any store already exposed by us or another mod
  let sharedCandidate = getSharedStoreCandidate();
  if (sharedCandidate && !sharedCandidate.__polyfill) {
    storeRef = sharedCandidate;
    mirrorStore(storeRef);
    log('[jotaiBridge] Using shared store from another mod');
    return storeRef;
  }
  
  // If Aries Mod is present but store not ready yet, wait a bit for it
  const ariesPresent = !!(pageWindow as any)?.AriesMod;
  if (ariesPresent && !sharedCandidate) {
    log('[jotaiBridge] Aries Mod detected, waiting for shared store...');
    const waitForAries = async (maxWait: number) => {
      const start = Date.now();
      while (Date.now() - start < maxWait) {
        await wait(100);
        const candidate = getSharedStoreCandidate();
        if (candidate && !candidate.__polyfill) {
          return candidate;
        }
      }
      return null;
    };
    const ariesStore = await waitForAries(3000); // Wait up to 3 seconds for Aries
    if (ariesStore) {
      storeRef = ariesStore;
      mirrorStore(storeRef);
      log('[jotaiBridge] Using Aries Mod store');
      return storeRef;
    }
    log('[jotaiBridge] Aries Mod store not available, proceeding with capture');
  }
  
  // Re-check in case it became available
  sharedCandidate = getSharedStoreCandidate();
  if (sharedCandidate && !sharedCandidate.__polyfill) {
    storeRef = sharedCandidate;
    mirrorStore(storeRef);
    return storeRef;
  }
  if (sharedCandidate && sharedCandidate.__polyfill) {
    storeRef = sharedCandidate;
    mirrorStore(storeRef);
    startSharedStorePolling();
  }

  const sharedStore = readSharedGlobal<JotaiStore>(STORE_GLOBAL_KEY);
  if (sharedStore && (!sharedStore.__polyfill || !storeRef)) {
    storeRef = sharedStore;
    if (!storeRef.__polyfill) {
      return storeRef;
    }
  }

  if (captureInFlight) {
    const maxWait = 6000;
    const start = Date.now();
    while (captureInFlight && Date.now() - start < maxWait) {
      await wait(50);
    }
    if (storeRef && !storeRef.__polyfill) {
      return storeRef;
    }
  }

  captureInFlight = true;
  try {
    const viaFiber = findStoreViaFiber();
    if (viaFiber) {
      storeRef = viaFiber;
      mirrorStore(storeRef);
      return storeRef;
    }

    const viaWrite = await captureViaWriteOnce();
    storeRef = viaWrite;
    mirrorStore(storeRef);
    if (storeRef.__polyfill) {
      startSharedStorePolling();
    }
    return storeRef;
  } catch (error) {
    lastCaptureError = error;
    throw error;
  } finally {
    captureInFlight = false;
  }
}

export function getCapturedInfo() {
  return {
    mode: lastCaptureMode,
    error: lastCaptureError,
    hasStore: !!storeRef && !storeRef.__polyfill,
  };
}

export function getCachedStore(): JotaiStore | null {
  return storeRef;
}

export function findAtomsByLabel(regex: RegExp): any[] {
  const cache = getAtomCache();
  if (!cache) return [];

  const matches: any[] = [];
  for (const atom of cache.values()) {
    if (!atom) continue;
    const label = String((atom as Record<string, unknown>).debugLabel ?? (atom as Record<string, unknown>).label ?? '');
    if (regex.test(label)) {
      matches.push(atom);
    }
  }
  return matches;
}

export function getAtomByLabel(label: string): any | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^${escaped}$`);
  return findAtomsByLabel(regex)[0] ?? null;
}

export async function readAtomValue<T = unknown>(atom: any): Promise<T> {
  const cache = getAtomCache();
  try {
    const store = await ensureJotaiStore();
    if (!store.__polyfill) {
      return store.get(atom) as T;
    }
  } catch (error) {
    lastCaptureError = error;
  }

  // Fallback: read directly from atom cache (non-invasive, like MGTools)
  if (cache) {
    try {
      const state = (cache as any).get ? (cache as any).get(atom) : undefined;
      if (state && Object.prototype.hasOwnProperty.call(state, 'v')) {
        return (state as any).v as T;
      }
    } catch {}
  }

  throw new Error('Jotai store unavailable and cache fallback failed');
}

export async function writeAtomValue(atom: any, value: unknown): Promise<void> {
  const store = await ensureJotaiStore();
  await store.set(atom, value);
}

export async function subscribeAtom<T = unknown>(atom: any, cb: (value: T) => void): Promise<() => void> {
  const cache = getAtomCache();
  const store = await ensureJotaiStore();

  let disposed = false;
  const invoke = () => {
    if (disposed) return;
    try {
      const next = store.__polyfill ? undefined : (store.get(atom) as T);
      if (next !== undefined) {
        cb(next);
        return;
      }
    } catch (error) {
      log('[jotaiBridge] Failed reading atom value during subscription', error);
    }

    if (cache) {
      try {
        const state = (cache as any).get ? (cache as any).get(atom) : undefined;
        if (state && Object.prototype.hasOwnProperty.call(state, 'v')) {
          cb((state as any).v as T);
        }
      } catch (error) {
        log('[jotaiBridge] Failed reading atom cache during subscription', error);
      }
    }
  };

  let unsubscribe: (() => void) | undefined;
  if (!store.__polyfill) {
    try {
      const maybeUnsub = store.sub(atom, invoke);
      unsubscribe = typeof maybeUnsub === 'function' ? maybeUnsub : await maybeUnsub;
    } catch (error) {
      log('[jotaiBridge] Failed subscribing to atom', error);
      unsubscribe = undefined;
    }
  } else if (cache) {
    let last: unknown;
    const interval = setInterval(() => {
      if (disposed) {
        clearInterval(interval);
        return;
      }
      try {
        const state = (cache as any).get ? (cache as any).get(atom) : undefined;
        const next = state && Object.prototype.hasOwnProperty.call(state, 'v') ? (state as any).v : undefined;
        if (next !== last) {
          last = next;
          if (next !== undefined) {
            cb(next as T);
          }
        }
      } catch {}
    }, 250);
    unsubscribe = () => clearInterval(interval);
  }

  invoke();

  return () => {
    disposed = true;
    try {
      unsubscribe?.();
    } catch {}
  };
}

export function isPolyfillStore(): boolean {
  return !!storeRef?.__polyfill;
}
