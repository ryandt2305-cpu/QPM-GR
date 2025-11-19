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

let storeRef: JotaiStore | null = null;
let captureInFlight = false;
let lastCaptureError: unknown = null;
let lastCaptureMode: 'fiber' | 'write' | 'polyfill' | null = null;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type AtomCacheLike = {
  get: (key: unknown) => unknown;
  values: () => IterableIterator<any>;
};

function isAtomCacheLike(value: unknown): value is AtomCacheLike {
  return !!value && typeof (value as AtomCacheLike).get === 'function' && typeof (value as AtomCacheLike).values === 'function';
}

function getAtomCache(): AtomCacheLike | undefined {
  const cached = readSharedGlobal<AtomCacheLike>(CACHE_GLOBAL_KEY);
  if (cached && isAtomCacheLike(cached)) return cached;

  const raw = (pageWindow as unknown as Record<string, unknown>).jotaiAtomCache as
    | { cache?: unknown }
    | AtomCacheLike
    | undefined;

  const candidate = raw && 'cache' in raw ? (raw as { cache?: unknown }).cache : raw;
  if (isAtomCacheLike(candidate)) {
    shareGlobal(CACHE_GLOBAL_KEY, candidate as AtomCacheLike);
    return candidate as AtomCacheLike;
  }
  return undefined;
}

async function waitForAtomCache(timeoutMs = 5000): Promise<AtomCacheLike | undefined> {
  const start = Date.now();
  let cache = getAtomCache();

  while (!cache && Date.now() - start < timeoutMs) {
    await wait(50);
    cache = getAtomCache();
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

  for (const atom of cache.values()) {
    if (!atom || typeof (atom as PatchedAtom).write !== 'function') continue;
    const candidate = atom as PatchedAtom;
    if (candidate.__origWrite) continue;

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
    log('⚠️ Unable to capture Jotai store via write hook, using polyfill');
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
      shareGlobal(STORE_GLOBAL_KEY, storeRef);
      return storeRef;
    }

    const viaWrite = await captureViaWriteOnce();
    storeRef = viaWrite;
    shareGlobal(STORE_GLOBAL_KEY, storeRef);
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
  const store = await ensureJotaiStore();
  return store.get(atom) as T;
}

export async function writeAtomValue(atom: any, value: unknown): Promise<void> {
  const store = await ensureJotaiStore();
  await store.set(atom, value);
}

export async function subscribeAtom<T = unknown>(atom: any, cb: (value: T) => void): Promise<() => void> {
  const store = await ensureJotaiStore();

  let disposed = false;
  const invoke = () => {
    if (disposed) return;
    try {
      const next = store.get(atom) as T;
      cb(next);
    } catch (error) {
      log('⚠️ Failed reading atom value during subscription', error);
    }
  };

  let unsubscribe: (() => void) | undefined;
  try {
    const maybeUnsub = store.sub(atom, invoke);
    unsubscribe = typeof maybeUnsub === 'function' ? maybeUnsub : await maybeUnsub;
  } catch (error) {
    log('⚠️ Failed subscribing to atom', error);
    unsubscribe = undefined;
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
