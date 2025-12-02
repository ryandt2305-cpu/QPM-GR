// Lightweight atom bridge for console helpers
// Provides minimal Jotai accessors without the Atom Inspector UI noise.

(function initMiniAtomBridge() {
  const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  if (pageWindow.__miniAtomBridge) {
    return;
  }

  const PATCH_FLAG = '__miniAtomOrigWrite';
  let jotaiStore = null;
  let captureInFlight = false;

  const bridge = {
    getAtomByLabel,
    readAtomValue,
    readInventoryPets,
  };

  Object.defineProperty(pageWindow, '__miniAtomBridge', {
    value: bridge,
    writable: false,
    configurable: false,
  });

  console.log('[mini-atom-bridge] Ready. Use window.__miniAtomBridge.readInventoryPets().');

  async function readInventoryPets() {
    const items = await readAtomValue('myInventoryAtom').catch(async (error) => {
      console.warn('[mini-atom-bridge] myInventoryAtom failed, trying myCropInventoryAtom', error);
      return readAtomValue('myCropInventoryAtom');
    });

    const normalized = normalizeInventory(items);
    return normalized.filter((entry) => entry.itemType === 'Pet' || entry.petSpecies);
  }

  async function readAtomValue(atomOrLabel) {
    const atom = typeof atomOrLabel === 'string' ? getAtomByLabel(atomOrLabel) : atomOrLabel;
    if (!atom) {
      throw new Error(`[mini-atom-bridge] Atom not found: ${atomOrLabel}`);
    }
    const store = await ensureJotaiStore();
    if (!store || store.__polyfill) {
      throw new Error('[mini-atom-bridge] Jotai store unavailable');
    }
    return store.get(atom);
  }

  function getAtomByLabel(label) {
    const cache = getAtomCache();
    if (!cache) return null;
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matcher = new RegExp(`^${escaped}$`);
    for (const atom of cache.values()) {
      if (!atom) continue;
      const atomLabel = String(atom.debugLabel || atom.label || '');
      if (matcher.test(atomLabel)) {
        return atom;
      }
    }
    return null;
  }

  function getAtomCache() {
    const root = pageWindow?.jotaiAtomCache;
    if (!root) return null;
    if (root.cache && typeof root.cache.values === 'function') return root.cache;
    if (typeof root.values === 'function') return root;
    return null;
  }

  async function ensureJotaiStore() {
    if (jotaiStore && !jotaiStore.__polyfill) {
      return jotaiStore;
    }
    if (captureInFlight) {
      const start = Date.now();
      while (captureInFlight && Date.now() - start < 3000) {
        await sleep(60);
      }
      if (jotaiStore && !jotaiStore.__polyfill) return jotaiStore;
    }
    captureInFlight = true;
    try {
      const viaFiber = findStoreViaFiber();
      if (viaFiber) {
        jotaiStore = viaFiber;
        return jotaiStore;
      }
      jotaiStore = await captureViaWriteHook();
      return jotaiStore;
    } finally {
      captureInFlight = false;
    }
  }

  function findStoreViaFiber() {
    const hook = pageWindow?.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (!hook?.renderers?.size) return null;
    for (const [rendererId] of hook.renderers) {
      const roots = hook.getFiberRoots?.(rendererId);
      if (!roots) continue;
      for (const root of roots) {
        const stack = [];
        const seen = new Set();
        const current = root?.current ?? root;
        if (current) stack.push(current);
        while (stack.length) {
          const fiber = stack.pop();
          if (!fiber || seen.has(fiber)) continue;
          seen.add(fiber);
          const value = fiber.pendingProps?.value;
          if (value && typeof value.get === 'function' && typeof value.set === 'function' && typeof value.sub === 'function') {
            return value;
          }
          if (fiber.child) stack.push(fiber.child);
          if (fiber.sibling) stack.push(fiber.sibling);
          if (fiber.alternate) stack.push(fiber.alternate);
        }
      }
    }
    return null;
  }

  async function captureViaWriteHook(timeoutMs = 4000) {
    const cache = getAtomCache();
    if (!cache) {
      return polyfillStore();
    }
    let capturedGet = null;
    let capturedSet = null;
    const patched = [];
    const restore = () => {
      for (const atom of patched) {
        try {
          if (atom[PATCH_FLAG]) {
            atom.write = atom[PATCH_FLAG];
            delete atom[PATCH_FLAG];
          }
        } catch {}
      }
    };

    for (const atom of cache.values()) {
      if (!atom || typeof atom.write !== 'function' || atom[PATCH_FLAG]) continue;
      const original = atom.write;
      atom[PATCH_FLAG] = original;
      atom.write = function patchedWrite(get, set, ...args) {
        if (!capturedSet) {
          capturedGet = get;
          capturedSet = set;
          restore();
        }
        return original.call(this, get, set, ...args);
      };
      patched.push(atom);
    }

    const start = Date.now();
    while (!capturedSet && Date.now() - start < timeoutMs) {
      await sleep(50);
    }

    restore();

    if (!capturedSet || !capturedGet) {
      return polyfillStore();
    }

    return {
      get(atom) {
        return capturedGet(atom);
      },
      set(atom, value) {
        return capturedSet(atom, value);
      },
      sub(atom, cb) {
        let active = true;
        let lastValue;
        const interval = setInterval(() => {
          if (!active) return;
          try {
            const next = capturedGet(atom);
            if (next !== lastValue) {
              lastValue = next;
              cb();
            }
          } catch {}
        }, 120);
        return () => {
          active = false;
          clearInterval(interval);
        };
      },
    };
  }

  function polyfillStore() {
    return {
      __polyfill: true,
      get() {
        throw new Error('[mini-atom-bridge] Store not captured');
      },
      set() {
        throw new Error('[mini-atom-bridge] Store not captured');
      },
      sub() {
        return () => {};
      },
    };
  }

  function normalizeInventory(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw.items)) return raw.items;
    if (Array.isArray(raw.inventory)) return raw.inventory;
    if (typeof raw === 'object') {
      for (const value of Object.values(raw)) {
        if (Array.isArray(value) && value.length && typeof value[0] === 'object') {
          return value;
        }
      }
    }
    return [];
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
})();
