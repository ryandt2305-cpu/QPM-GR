// ==UserScript==
// @name         Magic Garden Atom Inspector
// @namespace    https://github.com/ryand/mgmods
// @version      0.1.0
// @description  Proof-of-concept overlay that reads MagicGarden Jotai atoms (inventory, pet hutch, shop stock) without opening in-game panels.
// @author       GitHub Copilot
// @match        https://magiccircle.gg/r/*
// @match        https://magicgarden.gg/r/*
// @match        https://starweaver.org/r/*
// @grant        unsafeWindow
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  const SCRIPT_NAME = 'MG Atom Inspector';
  const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  const MAX_STORE_CAPTURE_TIME_MS = 12000;

  const SYNTHETIC_ATOMS = {
    GardenSlotsSig: {
      source: 'myDataAtom:garden.tileObjects',
      derive(value) {
        if (!value || typeof value !== 'object') return null;
        const signatures = {};
        for (const [key, slot] of Object.entries(value)) {
          signatures[key] = computeGardenSlotSignature(slot);
        }
        return signatures;
      },
    },
  };

  const SECTION_CONFIG = [
    // Core Inventories & Pets
    { key: 'inventory', title: 'Inventory', atom: 'myInventoryAtom', prop: 'inventory', renderer: renderInventory, defaultOpen: true },
    { key: 'hutch', title: 'Pet Hutch', atom: 'myPetHutchPetItemsAtom', prop: 'hutch', renderer: renderHutch },
    { key: 'petInfos', title: 'Active Pets', atom: 'myPetInfosAtom', prop: 'petInfos', renderer: renderPetInfos },
    { key: 'petSlots', title: 'Pet Slots', atom: 'myPetSlotInfosAtom', prop: 'petSlots', renderer: renderPetSlots },
    { key: 'petSellPrice', title: 'Total Pet Sell Price', atom: 'totalPetSellPriceAtom', prop: 'totalPetSellPrice', renderer: renderSimpleValue },
    { key: 'expandedPetSlot', title: 'Expanded Pet Slot ID', atom: 'expandedPetSlotIdAtom', prop: 'expandedPetSlotId', renderer: renderSimpleValue },
    { key: 'numHutchItems', title: 'Pet Hutch Item Count', atom: 'myNumPetHutchItemsAtom', prop: 'numHutchItems', renderer: renderSimpleValue },

    // Inventory extensions
    { key: 'cropInventory', title: 'Crop Inventory', atom: 'myCropInventoryAtom', prop: 'cropInventory', renderer: renderGenericInventory },
    { key: 'seedInventory', title: 'Seed Inventory', atom: 'mySeedInventoryAtom', prop: 'seedInventory', renderer: renderGenericInventory },
    { key: 'toolInventory', title: 'Tool Inventory', atom: 'myToolInventoryAtom', prop: 'toolInventory', renderer: renderGenericInventory },
    { key: 'eggInventory', title: 'Egg Inventory', atom: 'myEggInventoryAtom', prop: 'eggInventory', renderer: renderGenericInventory },
    { key: 'decorInventory', title: 'Decor Inventory', atom: 'myDecorInventoryAtom', prop: 'decorInventory', renderer: renderGenericInventory },
    { key: 'inventoryCapacity', title: 'Inventory Capacity Flags', atom: 'isMyInventoryAtMaxLengthAtom', prop: 'inventoryCapacity', renderer: renderSimpleValue },
    { key: 'favoriteIds', title: 'Favorite Item IDs', atom: 'myInventoryAtom:favoritedItemIds', prop: 'favoriteIds', renderer: renderStringArray },
    { key: 'validatedSelectedIndex', title: 'Validated Selected Index', atom: 'myValidatedSelectedItemIndexAtom', prop: 'validatedSelectedIndex', renderer: renderSimpleValue },
    { key: 'possiblyInvalidSelectedIndex', title: 'Possibly Invalid Selected Index', atom: 'myPossiblyNoLongerValidSelectedItemIndexAtom', prop: 'possiblyInvalidSelectedIndex', renderer: renderSimpleValue },
    { key: 'selectedItemName', title: 'Selected Item Name', atom: 'mySelectedItemNameAtom', prop: 'selectedItemName', renderer: renderSimpleValue },

    // Garden / Map state
    { key: 'gardenObject', title: 'Current Garden Object', atom: 'myCurrentGardenObjectAtom', prop: 'currentGardenObject', renderer: renderGardenObject },
    { key: 'gardenTileObjects', title: 'Garden Tile Objects', atom: 'myDataAtom:garden.tileObjects', prop: 'gardenTileObjects', renderer: renderObjectSummary, options: { defaultLimit: 24 } },
    { key: 'myOwnGardenObject', title: 'My Own Garden Object', atom: 'myOwnCurrentGardenObjectAtom', prop: 'myOwnGardenObject', renderer: renderGardenObject },
    { key: 'myOwnGardenObjectType', title: 'My Garden Object Type', atom: 'myOwnCurrentGardenObjectAtom:objectType', prop: 'myOwnGardenObjectType', renderer: renderSimpleValue },
    { key: 'myOwnDirtTileIndex', title: 'My Dirt Tile Index', atom: 'myOwnCurrentDirtTileIndexAtom', prop: 'myOwnDirtTileIndex', renderer: renderSimpleValue },
    { key: 'stateAtom', title: 'State Atom', atom: 'stateAtom', prop: 'stateAtom', renderer: renderJsonPreview, options: { defaultLimit: 1800 } },
    { key: 'stateChildData', title: 'State Child Data', atom: 'stateAtom:child.data', prop: 'stateChildData', renderer: renderObjectSummary, options: { defaultLimit: 24 } },
    { key: 'gardenSlotsSig', title: 'Garden Slots Signature', atom: 'GardenSlotsSig', prop: 'gardenSlotsSig', renderer: renderObjectSummary, options: { defaultLimit: 12 } },

    // Growth timers
    { key: 'growSlotOrder', title: 'Grow Slot Order', atom: 'myCurrentSortedGrowSlotIndicesAtom', prop: 'growSlotOrder', renderer: renderNumberArray },
    { key: 'currentGrowSlotIndex', title: 'Current Grow Slot Index', atom: 'myCurrentGrowSlotIndexAtom', prop: 'currentGrowSlotIndex', renderer: renderSimpleValue },
    { key: 'growSlotMature', title: 'Current Slot Mature?', atom: 'isCurrentGrowSlotMatureAtom', prop: 'growSlotMature', renderer: renderSimpleValue },
    { key: 'totalCropSellPrice', title: 'Total Crop Sell Price', atom: 'totalCropSellPriceAtom', prop: 'totalCropSellPrice', renderer: renderSimpleValue },

    // Player / Session
    { key: 'player', title: 'Player', atom: 'playerAtom', prop: 'player', renderer: renderPlayer },
    { key: 'playerId', title: 'Player ID', atom: 'playerAtom:id', prop: 'playerId', renderer: renderSimpleValue },
    { key: 'numPlayers', title: 'Number of Players', atom: 'numPlayersAtom', prop: 'numPlayers', renderer: renderSimpleValue },
    { key: 'weather', title: 'Weather', atom: 'weatherAtom', prop: 'weather', renderer: renderWeather },
    { key: 'activeModal', title: 'Active Modal', atom: 'activeModalAtom', prop: 'activeModal', renderer: renderActiveModal },
    { key: 'avatarAnimation', title: 'Avatar Animation', atom: 'avatarTriggerAnimationAtom', prop: 'avatarAnimation', renderer: renderSimpleValue },
    { key: 'myData', title: 'My Data Snapshot', atom: 'myDataAtom', prop: 'myData', renderer: renderMyData },

    // Shops / Rooms
    { key: 'shops', title: 'Shop Stock', atom: 'shopsAtom', prop: 'shops', renderer: renderShops, defaultOpen: true },
    { key: 'purchases', title: 'Shop Purchases', atom: 'myShopPurchasesAtom', prop: 'purchases', renderer: renderShopPurchases },
    { key: 'stateShops', title: 'State Shops', atom: 'stateAtom:child.data.shops', prop: 'stateShops', renderer: renderObjectSummary, options: { defaultLimit: 20 } },
  ];

  const observed = {
    storeMethod: 'pending',
    storePolyfill: false,
    lastError: null,
    panelMessage: 'Initializing…'
  };

  const observedSeen = {};
  const missingAtoms = {};

  for (const section of SECTION_CONFIG) {
    if (!(section.prop in observed)) {
      observed[section.prop] = null;
    }
    observedSeen[section.prop] = false;
    missingAtoms[section.prop] = false;
  }

  const uiState = createUiState();

  const ui = createPanel();
  ui.element.addEventListener('click', handlePanelClick, false);
  ui.element.addEventListener('toggle', handlePanelToggle, true);
  render();

  bootstrap().catch((err) => {
    console.error(`[${SCRIPT_NAME}] bootstrap failed`, err);
    observed.lastError = String(err?.message ?? err);
    observed.panelMessage = 'Bootstrap error';
    render();
  });

  async function bootstrap() {
    await waitForDom();
    ui.setStatus('Waiting for atom cache…');
    const cache = await waitFor(() => getAtomCache(), MAX_STORE_CAPTURE_TIME_MS);
    if (!cache) {
      observed.panelMessage = 'jotaiAtomCache missing (game not ready yet?)';
      render();
      return;
    }

    ui.setStatus('Capturing store…');
    const { store, via } = await captureStoreWithRetry();
    if (!store || store.__polyfill) {
      observed.storeMethod = store?.__polyfill ? 'polyfill' : 'unknown';
      observed.storePolyfill = !!store?.__polyfill;
      observed.panelMessage = 'Failed to capture live store';
      render();
      return;
    }

    observed.storeMethod = via;
    observed.panelMessage = 'Live store captured';
    render();
    ui.setStatus('Subscribing to atoms…');

    const unsubscribers = [];
    for (const section of SECTION_CONFIG) {
      const unsub = await subscribeAtom(section.atom, (value) => {
        observed[section.prop] = value;
        observedSeen[section.prop] = true;
        render();
      });
      if (typeof unsub === 'function') {
        unsubscribers.push(unsub);
      } else {
        missingAtoms[section.prop] = true;
        render();
      }
    }

    ui.setStatus('Watching atoms');

    const teardown = () => {
      for (const unsub of unsubscribers) {
        try { if (typeof unsub === 'function') unsub(); } catch {}
      }
    };
    window.addEventListener('beforeunload', teardown);
  }

  /* -------------------------------------------------------------------------- */
  /* Bridge to game Jotai store                                                 */
  /* -------------------------------------------------------------------------- */

  function parsePath(path) {
    if (!path) return [];
    return String(path).split('.').filter(Boolean);
  }

  function getPathValue(root, segments) {
    let current = root;
    for (const segment of segments) {
      if (current == null) return undefined;
      current = current[segment];
    }
    return current;
  }

  function computeGardenSlotSignature(slot) {
    if (!slot || typeof slot !== 'object') return '∅';
    const type = slot.objectType ?? slot.type ?? '';
    const species = slot.species ?? slot.seedSpecies ?? slot.plantSpecies ?? slot.eggId ?? slot.decorId ?? '';
    const planted = slot.plantedAt ?? slot.startTime ?? 0;
    const matured = slot.maturedAt ?? slot.endTime ?? 0;
    return [type, species, planted, matured].join('|');
  }

  const AtomBridge = (() => {
    let store = null;
    let captureInProgress = false;
    let lastMethod = null;

    function getAtomCache() {
      return pageWindow?.jotaiAtomCache?.cache;
    }

    function findStoreViaFiber() {
      const hook = pageWindow?.__REACT_DEVTOOLS_GLOBAL_HOOK__;
      if (!hook || !hook.renderers?.size) return null;

      for (const [rendererId] of hook.renderers) {
        const roots = hook.getFiberRoots?.(rendererId);
        if (!roots) continue;
        for (const root of roots) {
          const seen = new Set();
          const stack = [root.current];
          while (stack.length) {
            const node = stack.pop();
            if (!node || seen.has(node)) continue;
            seen.add(node);
            const value = node?.pendingProps?.value;
            if (value && typeof value.get === 'function' && typeof value.set === 'function' && typeof value.sub === 'function') {
              lastMethod = 'fiber';
              return value;
            }
            if (node.child) stack.push(node.child);
            if (node.sibling) stack.push(node.sibling);
            if (node.alternate) stack.push(node.alternate);
          }
        }
      }
      return null;
    }

    async function captureViaWriteOnce(timeoutMs = 5000) {
      const cache = getAtomCache();
      if (!cache) throw new Error('jotaiAtomCache.cache not found');

      let capturedGet = null;
      let capturedSet = null;
      const patched = [];

      const restorePatched = () => {
        for (const atom of patched) {
          try {
            if (atom.__mgOrigWrite) {
              atom.write = atom.__mgOrigWrite;
              delete atom.__mgOrigWrite;
            }
          } catch {}
        }
      };

      for (const atom of cache.values()) {
        if (!atom || typeof atom.write !== 'function' || atom.__mgOrigWrite) continue;
        const original = atom.write;
        atom.__mgOrigWrite = original;
        atom.write = function patchedWrite(get, set, ...args) {
          if (!capturedSet) {
            capturedGet = get;
            capturedSet = set;
            restorePatched();
          }
          return original.call(this, get, set, ...args);
        };
        patched.push(atom);
      }

      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const startedAt = Date.now();

      try {
        pageWindow?.dispatchEvent?.(new pageWindow.Event('visibilitychange'));
      } catch {}

      while (!capturedSet && Date.now() - startedAt < timeoutMs) {
        await wait(50);
      }

      if (!capturedSet) {
        restorePatched();
        lastMethod = 'polyfill';
        console.warn(`[${SCRIPT_NAME}] captureViaWriteOnce timed out`);
        return {
          get() { throw new Error('Store not captured'); },
          set() { throw new Error('Store not captured'); },
          sub() { return () => {}; },
          __polyfill: true,
        };
      }

      lastMethod = 'write';
      return {
        get(atom) {
          return capturedGet(atom);
        },
        set(atom, value) {
          return capturedSet(atom, value);
        },
        sub(atom, cb) {
          let lastValue;
          let active = true;
          const tick = async () => {
            if (!active) return;
            let next;
            try {
              next = capturedGet(atom);
            } catch {
              return;
            }
            if (next !== lastValue) {
              lastValue = next;
              try { cb(); } catch {}
            }
          };
          const intervalId = setInterval(tick, 120);
          tick();
          return () => {
            active = false;
            clearInterval(intervalId);
          };
        },
      };
    }

    async function ensureStoreInternal() {
      if (store && !store.__polyfill) return store;
      if (captureInProgress) {
        const start = Date.now();
        while (captureInProgress && Date.now() - start < 6000) {
          await sleep(50);
        }
        return store;
      }

      captureInProgress = true;
      try {
        const fiberStore = findStoreViaFiber();
        if (fiberStore) {
          store = fiberStore;
          return store;
        }
        const fallback = await captureViaWriteOnce();
        store = fallback;
        return store;
      } finally {
        captureInProgress = false;
      }
    }

    async function ensureStore() {
      return ensureStoreInternal();
    }

    function getAtomByLabel(label) {
      const cache = getAtomCache();
      if (!cache) return null;
      const matcher = new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
      for (const atom of cache.values()) {
        const atomLabel = atom?.debugLabel || atom?.label || '';
        if (matcher.test(String(atomLabel))) return atom;
      }
      return null;
    }

    async function getValue(atom) {
      const s = await ensureStore();
      if (!s || s.__polyfill) throw new Error('Store not captured');
      return s.get(atom);
    }

    async function subscribe(atom, handler) {
      const s = await ensureStore();
      if (!s || s.__polyfill) throw new Error('Store not captured');
      const unsubscribe = await s.sub(atom, async () => {
        try {
          const next = s.get(atom);
          handler(next);
        } catch (err) {
          console.warn(`[${SCRIPT_NAME}] subscribe handler error`, err);
        }
      });
      try {
        handler(await s.get(atom));
      } catch (err) {
        console.warn(`[${SCRIPT_NAME}] initial get failed`, err);
      }
      return unsubscribe;
    }

    return {
      ensureStore,
      getAtomByLabel,
      getValue,
      subscribe,
      getLastMethod: () => lastMethod,
      getAtomCache,
    };
  })();

  async function captureStoreWithRetry() {
    const start = Date.now();
    let store = null;
    while (Date.now() - start < MAX_STORE_CAPTURE_TIME_MS) {
      store = await AtomBridge.ensureStore();
      if (store && !store.__polyfill) {
        return { store, via: AtomBridge.getLastMethod() || 'unknown' };
      }
      await sleep(150);
    }
    return { store, via: AtomBridge.getLastMethod() || 'timeout' };
  }

  async function subscribeAtom(label, callback) {
    const direct = await subscribeDirect(label, callback);
    if (direct) return direct;

    const derived = await subscribeDerived(label, callback);
    if (derived) return derived;

    console.warn(`[${SCRIPT_NAME}] atom not found: ${label}`);
    return null;
  }

  async function subscribeDirect(label, callback) {
    const atom = AtomBridge.getAtomByLabel(label);
    if (!atom) return null;
    return AtomBridge.subscribe(atom, (value) => callback(value));
  }

  async function subscribeDerived(label, callback) {
    const colonIndex = label.indexOf(':');
    if (colonIndex !== -1) {
      const baseLabel = label.slice(0, colonIndex);
      const path = parsePath(label.slice(colonIndex + 1));
      const baseUnsub = await subscribeDirect(baseLabel, (value) => {
        callback(getPathValue(value, path));
      });
      if (baseUnsub) return baseUnsub;
    }

    const synthetic = SYNTHETIC_ATOMS[label];
    if (synthetic) {
      const syntheticUnsub = await subscribeAtom(synthetic.source, (value) => {
        callback(synthetic.derive(value));
      });
      if (syntheticUnsub) return syntheticUnsub;
    }

    return null;
  }

  function getAtomCache() {
    return AtomBridge.getAtomCache?.();
  }

  /* -------------------------------------------------------------------------- */
  /* UI helpers                                                                 */
  /* -------------------------------------------------------------------------- */

  function createPanel() {
    const panel = document.createElement('div');
    panel.id = 'mg-atom-inspector-panel';
    panel.style.position = 'fixed';
    panel.style.top = '96px';
    panel.style.right = '24px';
    panel.style.width = '320px';
    panel.style.maxHeight = '480px';
    panel.style.overflow = 'auto';
    panel.style.background = 'rgba(18, 20, 26, 0.88)';
    panel.style.color = '#f5f5f5';
    panel.style.fontFamily = '"Segoe UI", sans-serif';
    panel.style.fontSize = '12px';
    panel.style.border = '1px solid rgba(255,255,255,0.16)';
    panel.style.borderRadius = '10px';
    panel.style.padding = '10px 12px';
    panel.style.zIndex = '999999';
    panel.style.backdropFilter = 'blur(8px)';
    panel.style.boxShadow = '0 12px 28px rgba(0, 0, 0, 0.45)';

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.gap = '8px';
    header.style.marginBottom = '6px';

    const title = document.createElement('strong');
    title.textContent = SCRIPT_NAME;
    title.style.fontSize = '13px';

    const status = document.createElement('span');
    status.textContent = 'Loading…';
    status.style.fontSize = '11px';
    status.style.opacity = '0.75';
    status.style.flex = '1';
    status.style.textAlign = 'right';

    header.appendChild(title);
    header.appendChild(status);

    const content = document.createElement('div');
  content.style.whiteSpace = 'normal';
    content.style.lineHeight = '1.5';

    panel.appendChild(header);
    panel.appendChild(content);
    document.body.appendChild(panel);

    makeDraggable(panel, header);

    return {
      element: panel,
      content,
      setStatus(msg) {
        status.textContent = msg;
      },
    };
  }

  function makeDraggable(panel, handle) {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let originX = 0;
    let originY = 0;

    const onMouseMove = (event) => {
      if (!dragging) return;
      event.preventDefault();
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      const nextX = originX + dx;
      const nextY = originY + dy;
      panel.style.left = `${Math.max(12, Math.min(window.innerWidth - panel.offsetWidth - 12, nextX))}px`;
      panel.style.top = `${Math.max(12, Math.min(window.innerHeight - panel.offsetHeight - 12, nextY))}px`;
      panel.style.right = 'auto';
    };

    const onMouseUp = () => {
      if (!dragging) return;
      dragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    handle.style.cursor = 'grab';
    handle.addEventListener('mousedown', (event) => {
      if (event.button !== 0) return;
      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      const rect = panel.getBoundingClientRect();
      originX = rect.left;
      originY = rect.top;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  function render() {
    if (!ui?.content) return;
    const parts = [];

    const statusLine = observed.panelMessage || 'Idle';
    parts.push(`<div style="margin-bottom:8px;">${escapeHtml(statusLine)}</div>`);

    const metaPieces = [];
    if (observed.storeMethod && observed.storeMethod !== 'pending') {
      const mode = observed.storePolyfill ? `${observed.storeMethod} (fallback)` : observed.storeMethod;
      metaPieces.push(`store via ${mode}`);
    }
    if (observed.inventory) metaPieces.push('inventory ✓');
    if (observed.hutch) metaPieces.push('hutch ✓');
    if (observed.shops) metaPieces.push('shops ✓');
    if (metaPieces.length) {
      parts.push(`<div style="opacity:0.7;margin-bottom:8px;">${escapeHtml(metaPieces.join(' • '))}</div>`);
    }

    if (observed.lastError) {
      parts.push(`<div style="color:#ff9a9a;margin-bottom:8px;">Error: ${escapeHtml(observed.lastError)}</div>`);
    }

    for (const section of SECTION_CONFIG) {
      parts.push(renderSection(section));
    }

    ui.content.innerHTML = parts.join('');
  }

  function buildViewAllLink(sectionKey, label = 'view all') {
    if (!sectionKey) return '';
    return `<a href="#" data-action="toggle-view-all" data-section="${escapeAttr(sectionKey)}">${escapeHtml(label)}</a>`;
  }

  function createUiState() {
    const expanded = {};
    const viewAll = {};
    for (const section of SECTION_CONFIG) {
      expanded[section.key] = !!section.defaultOpen;
      viewAll[section.key] = false;
    }
    return { expanded, viewAll };
  }

  function handlePanelClick(event) {
    const target = event.target && typeof event.target.closest === 'function'
      ? event.target.closest('[data-action]')
      : null;
    if (!target) return;
    const action = target.getAttribute('data-action');
    if (action === 'toggle-view-all') {
      event.preventDefault();
      const key = target.getAttribute('data-section');
      if (!key) return;
      uiState.viewAll[key] = !uiState.viewAll[key];
      render();
    }
  }

  function handlePanelToggle(event) {
    const details = event.target;
    if (!details || typeof details !== 'object') return;
    if (!('tagName' in details)) return;
    if (String(details.tagName).toLowerCase() !== 'details') return;
    const key = details.getAttribute('data-section-key');
    if (!key) return;
    uiState.expanded[key] = !!details.open;
  }

  function renderSection(section) {
    const key = section.key;
    const title = section.title;
    const value = observed[section.prop];
    const ctx = {
      viewAll: !!uiState.viewAll[key],
      sectionKey: key,
      section,
      observed,
      seen: !!observedSeen[section.prop],
      missing: !!missingAtoms[section.prop],
    };
    const renderer = section.renderer || renderJsonPreview;
    const bodyHtml = ctx.missing
      ? '<div style="color:#ffb3b3;">Atom not found in jotaiAtomCache.</div>'
      : (renderer(value, ctx, section.options) || '—');
    const openAttr = uiState.expanded[key] ? ' open' : '';
    return `<details data-section-key="${escapeAttr(key)}"${openAttr} style="margin-bottom:10px;">
  <summary style="cursor:pointer;font-weight:600;outline:none;">${escapeHtml(title)}</summary>
  <div style="margin-top:6px;">${bodyHtml}</div>
</details>`;
  }

  function renderInventory(raw, ctx = {}) {
    if (!raw) return 'No data (atom not seen yet).';
    const items = normalizeItemArray(raw?.items ?? raw);
    const favorites = extractFavoriteIds(raw);
    if (!items.length) {
      return 'Empty.';
    }

    const defaultLimit = 14;
    const limit = ctx.viewAll ? items.length : defaultLimit;
    const typeCounts = Array.from(countBy(items, inferItemType).entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([type, count]) => `${escapeHtml(String(type))}×${count}`)
      .join(', ');

    const rows = items
      .slice(0, limit)
      .map((item) => `• ${describeItem(item, favorites)}`)
      .join('<br>');

    let footer = '';
    if (!ctx.viewAll && items.length > limit) {
      footer = `<div style="opacity:0.6;">+${items.length - limit} more — ${buildViewAllLink(ctx.sectionKey)}</div>`;
    } else if (ctx.viewAll && items.length > defaultLimit) {
      footer = `<div style="opacity:0.6;">${buildViewAllLink(ctx.sectionKey, 'show less')}</div>`;
    }

    const summary = typeCounts ? `<div style="opacity:0.7;">${typeCounts}</div>` : '';

    return `${summary}<div>${rows}</div>${footer}`;
  }

  function renderHutch(raw, ctx = {}) {
    if (!raw) return 'No data (atom not seen yet).';
    const items = normalizeItemArray(raw);
    if (!items.length) {
      return 'Empty.';
    }

    const defaultLimit = 12;
    const limit = ctx.viewAll ? items.length : defaultLimit;
    const rows = items
      .slice(0, limit)
      .map((item) => `• ${describeItem(item)}`)
      .join('<br>');

    let footer = '';
    if (!ctx.viewAll && items.length > limit) {
      footer = `<div style="opacity:0.6;">+${items.length - limit} more — ${buildViewAllLink(ctx.sectionKey)}</div>`;
    } else if (ctx.viewAll && items.length > defaultLimit) {
      footer = `<div style="opacity:0.6;">${buildViewAllLink(ctx.sectionKey, 'show less')}</div>`;
    }

    return `<div style="opacity:0.7;">${items.length} entries</div><div>${rows}</div>${footer}`;
  }

  function renderGenericInventory(raw, ctx = {}, options = {}) {
    if (!raw) return 'No data (atom not seen yet).';
    const items = normalizeItemArray(raw);
    if (!items.length) return 'Empty.';
    const defaultLimit = Number.isFinite(options.defaultLimit) ? Number(options.defaultLimit) : 16;
    const limit = ctx.viewAll ? items.length : defaultLimit;
    const rows = items
      .slice(0, limit)
      .map((item) => `• ${describeItem(item)}`)
      .join('<br>');

    let footer = '';
    if (!ctx.viewAll && items.length > limit) {
      footer = `<div style="opacity:0.6;">+${items.length - limit} more — ${buildViewAllLink(ctx.sectionKey)}</div>`;
    } else if (ctx.viewAll && items.length > defaultLimit) {
      footer = `<div style="opacity:0.6;">${buildViewAllLink(ctx.sectionKey, 'show less')}</div>`;
    }

    return `<div style="opacity:0.7;">${items.length} entries</div><div>${rows}</div>${footer}`;
  }

  function renderSimpleValue(value, ctx = {}, options = {}) {
    if (!ctx?.seen) return 'No data (atom not seen yet).';
    if (value == null) {
      if (options.showNullAs === 'empty') return 'Empty.';
      return 'null';
    }
    if (typeof value === 'object') {
      return renderObjectSummary(value, ctx, options);
    }
    return escapeHtml(String(value));
  }

  function renderArrayPreview(raw, ctx = {}, options = {}) {
    if (!ctx?.seen) return 'No data (atom not seen yet).';
    const items = Array.isArray(raw) ? raw : [];
    if (!items.length) return 'Empty.';
    const defaultLimit = Number.isFinite(options.defaultLimit) ? Number(options.defaultLimit) : 16;
    const limit = ctx.viewAll ? items.length : defaultLimit;
    const formatItem = typeof options.formatItem === 'function'
      ? options.formatItem
      : (item) => String(item);
    const rows = items
      .slice(0, limit)
      .map((item, index) => `• ${escapeHtml(formatItem(item, index, items))}`)
      .join('<br>');

    let footer = '';
    if (!ctx.viewAll && items.length > limit) {
      footer = `<div style="opacity:0.6;">+${items.length - limit} more — ${buildViewAllLink(ctx.sectionKey)}</div>`;
    } else if (ctx.viewAll && items.length > defaultLimit) {
      footer = `<div style="opacity:0.6;">${buildViewAllLink(ctx.sectionKey, 'show less')}</div>`;
    }

    const header = options.skipHeader ? '' : `<div style="opacity:0.7;">${items.length} entries</div>`;
    return `${header}<div>${rows}</div>${footer}`;
  }

  function renderNumberArray(raw, ctx = {}, options = {}) {
    return renderArrayPreview(raw, ctx, { ...options, defaultLimit: options.defaultLimit ?? 20 });
  }

  function renderStringArray(raw, ctx = {}, options = {}) {
    return renderArrayPreview(raw, ctx, { ...options, defaultLimit: options.defaultLimit ?? 20 });
  }

  function renderPetInfos(raw, ctx = {}) {
    if (!ctx?.seen) return 'No data (atom not seen yet).';
    const entries = Array.isArray(raw) ? raw : [];
    if (!entries.length) return 'Empty.';
    const defaultLimit = 10;
    const limit = ctx.viewAll ? entries.length : defaultLimit;
    const rows = entries
      .slice(0, limit)
      .map((info) => `• ${describePetInfo(info)}`)
      .join('<br>');

    let footer = '';
    if (!ctx.viewAll && entries.length > limit) {
      footer = `<div style="opacity:0.6;">+${entries.length - limit} more — ${buildViewAllLink(ctx.sectionKey)}</div>`;
    } else if (ctx.viewAll && entries.length > defaultLimit) {
      footer = `<div style="opacity:0.6;">${buildViewAllLink(ctx.sectionKey, 'show less')}</div>`;
    }

    return `<div style="opacity:0.7;">${entries.length} pets</div><div>${rows}</div>${footer}`;
  }

  function renderPetSlots(raw, ctx = {}) {
    if (!ctx?.seen) return 'No data (atom not seen yet).';
    const entries = Array.isArray(raw) ? raw : [];
    if (!entries.length) return 'Empty.';
    const defaultLimit = 10;
    const limit = ctx.viewAll ? entries.length : defaultLimit;
    const rows = entries
      .slice(0, limit)
      .map((info) => `• ${describePetSlotInfo(info)}`)
      .join('<br>');

    let footer = '';
    if (!ctx.viewAll && entries.length > limit) {
      footer = `<div style="opacity:0.6;">+${entries.length - limit} more — ${buildViewAllLink(ctx.sectionKey)}</div>`;
    } else if (ctx.viewAll && entries.length > defaultLimit) {
      footer = `<div style="opacity:0.6;">${buildViewAllLink(ctx.sectionKey, 'show less')}</div>`;
    }

    return `<div style="opacity:0.7;">${entries.length} slots</div><div>${rows}</div>${footer}`;
  }

  function renderShopPurchases(raw, ctx = {}) {
    if (!ctx?.seen) return 'No data (atom not seen yet).';
    if (!raw) return 'No purchase data';
    const categories = [
      { key: 'seed', label: 'Seeds' },
      { key: 'egg', label: 'Eggs' },
      { key: 'tool', label: 'Tools' },
      { key: 'decor', label: 'Decor' },
    ];

    const lines = [];
    const defaultLimit = 12;
    const viewAll = !!ctx.viewAll;
    let hasMore = false;

    for (const { key, label } of categories) {
      const purchases = raw?.[key]?.purchases;
      const entries = purchases instanceof Map
        ? Array.from(purchases.entries())
        : purchases && typeof purchases === 'object'
          ? Object.entries(purchases)
          : [];
      if (!entries.length) {
        lines.push(`<div style="margin-bottom:4px;"><span style="font-weight:600;">${escapeHtml(label)}:</span> <span style="opacity:0.6;">none</span></div>`);
        continue;
      }
      const total = entries.reduce((sum, [, count]) => sum + (Number(count) || 0), 0);
      const sorted = entries.sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0));
      const limit = viewAll ? sorted.length : defaultLimit;
      const rows = sorted
        .slice(0, limit)
        .map(([id, count]) => `${escapeHtml(String(id))} × ${Number(count) || 0}`)
        .join(', ');
      if (!viewAll && sorted.length > limit) {
        hasMore = true;
      }
      lines.push(`<div style="margin-bottom:4px;"><span style="font-weight:600;">${escapeHtml(label)}:</span> total ${total}${rows ? ` • ${rows}` : ''}${!viewAll && sorted.length > limit ? ` • +${sorted.length - limit} more` : ''}</div>`);
    }

    if (!viewAll && hasMore) {
      lines.push(`<div style="opacity:0.6;">${buildViewAllLink(ctx.sectionKey)}</div>`);
    } else if (viewAll && hasMore) {
      lines.push(`<div style="opacity:0.6;">${buildViewAllLink(ctx.sectionKey, 'show less')}</div>`);
    }

    return lines.join('');
  }

  function renderWeather(raw, ctx = {}) {
    if (!ctx?.seen) return 'No data (atom not seen yet).';
    if (raw == null) return 'Unknown weather';
    if (typeof raw === 'object') {
      return renderObjectSummary(raw, ctx, { defaultLimit: 6 });
    }
    return escapeHtml(String(raw));
  }

  function renderGardenObject(raw, ctx = {}) {
    if (!ctx?.seen) return 'No data (atom not seen yet).';
    if (!raw) return 'None active.';
    if (typeof raw !== 'object') return escapeHtml(String(raw));
    return renderObjectSummary(raw, ctx, { defaultLimit: 10 });
  }

  function renderActiveModal(raw, ctx = {}) {
    if (!ctx?.seen) return 'No data (atom not seen yet).';
    if (!raw) return 'No modal open';
    return escapeHtml(String(raw));
  }

  function renderPlayer(raw, ctx = {}) {
    if (!ctx?.seen) return 'No data (atom not seen yet).';
    if (!raw) return 'No player data';
    const highlights = [];
    const name = raw.displayName || raw.username || raw.name;
    if (name) highlights.push(`Name: ${escapeHtml(String(name))}`);
    if (Number.isFinite(Number(raw.coins))) highlights.push(`Coins: ${formatNumber(raw.coins)}`);
    if (Number.isFinite(Number(raw.level))) highlights.push(`Level: ${Number(raw.level)}`);
    const summary = renderObjectSummary(raw, ctx, { defaultLimit: 12, skipHeader: true });
    return `${highlights.length ? `<div>${highlights.join(' • ')}</div>` : ''}${summary}`;
  }

  function renderMyData(raw, ctx = {}) {
    if (!ctx?.seen) return 'No data (atom not seen yet).';
    if (!raw) return 'Empty.';
    return renderObjectSummary(raw, ctx, { defaultLimit: 14 });
  }

  function renderJsonPreview(value, ctx = {}, options = {}) {
    if (!ctx?.seen) return 'No data (atom not seen yet).';
    if (value == null) return 'null';
    if (typeof value !== 'object') return escapeHtml(String(value));
    const limit = Number.isFinite(options.defaultLimit) ? Number(options.defaultLimit) : 1400;
    try {
      const replacer = (_key, val) => (typeof val === 'bigint' ? val.toString() : val);
      let json = JSON.stringify(value, replacer, 2);
      let truncated = false;
      if (!ctx.viewAll && json.length > limit) {
        json = `${json.slice(0, limit)}…`;
        truncated = true;
      }
      let footer = '';
      if (truncated) {
        footer = `<div style="opacity:0.6;margin-top:4px;">${buildViewAllLink(ctx.sectionKey)}</div>`;
      } else if (ctx.viewAll && json.length > limit) {
        footer = `<div style="opacity:0.6;margin-top:4px;">${buildViewAllLink(ctx.sectionKey, 'show less')}</div>`;
      }
      return `<pre style="white-space:pre-wrap;font-family:monospace;font-size:11px;margin:0;">${escapeHtml(json)}</pre>${footer}`;
    } catch (err) {
      console.warn(`[${SCRIPT_NAME}] JSON preview failed`, err);
      return escapeHtml(String(err?.message || err || 'Unable to stringify value.'));
    }
  }

  function renderObjectSummary(value, ctx = {}, options = {}) {
    if (!ctx?.seen) return 'No data (atom not seen yet).';
    if (!value || typeof value !== 'object') return escapeHtml(String(value));
    const entries = Array.isArray(value)
      ? value.map((entry, index) => [index, entry])
      : Object.entries(value);
    if (!entries.length) return 'Empty.';
    const defaultLimit = Number.isFinite(options.defaultLimit) ? Number(options.defaultLimit) : 12;
    const limit = ctx.viewAll ? entries.length : defaultLimit;
    const rows = entries
      .slice(0, limit)
      .map(([key, val]) => `• ${escapeHtml(String(key))}: ${escapeHtml(formatPreviewValue(val))}`)
      .join('<br>');

    let footer = '';
    if (!ctx.viewAll && entries.length > limit) {
      footer = `<div style="opacity:0.6;margin-top:4px;">+${entries.length - limit} more — ${buildViewAllLink(ctx.sectionKey)}</div>`;
    } else if (ctx.viewAll && entries.length > defaultLimit) {
      footer = `<div style="opacity:0.6;margin-top:4px;">${buildViewAllLink(ctx.sectionKey, 'show less')}</div>`;
    }

    return `${options.skipHeader ? '' : `<div style="opacity:0.7;">${entries.length} entries</div>`}<div>${rows}</div>${footer}`;
  }

  function formatPreviewValue(value, depth = 0) {
    if (value == null) return 'null';
    const type = typeof value;
    if (type === 'string' || type === 'number' || type === 'boolean') {
      return String(value);
    }
    if (Array.isArray(value)) {
      if (depth >= 1) {
        return `Array(${value.length})`;
      }
      const items = value.slice(0, 3).map((entry) => formatPreviewValue(entry, depth + 1));
      return `Array(${value.length}) [${items.join(', ')}${value.length > 3 ? ', …' : ''}]`;
    }
    if (type === 'object') {
      const keys = Object.keys(value);
      if (!keys.length) return '{}';
      if (depth >= 1) {
        return `{${keys.slice(0, 3).join(', ')}${keys.length > 3 ? ', …' : ''}}`;
      }
      const pairs = keys.slice(0, 3).map((key) => `${key}: ${formatPreviewValue(value[key], depth + 1)}`);
      return `{ ${pairs.join(', ')}${keys.length > 3 ? ', …' : ''} }`;
    }
    return String(value);
  }

  function normalizeItemArray(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw.items)) return raw.items;
    if (Array.isArray(raw.inventory)) return raw.inventory;
    if (Array.isArray(raw.list)) return raw.list;
    if (Array.isArray(raw.data?.items)) return raw.data.items;
    if (raw instanceof Map) return Array.from(raw.values());
    if (typeof raw === 'object') {
      const candidate = Object.values(raw).find((value) => Array.isArray(value) && value.length && typeof value[0] === 'object');
      if (candidate) return candidate;
    }
    return [];
  }

  function extractFavoriteIds(raw) {
    const favorites = new Set();
    const list = Array.isArray(raw?.favoritedItemIds)
      ? raw.favoritedItemIds
      : Array.isArray(raw?.favorites)
        ? raw.favorites
        : Array.isArray(raw?.favoriteIds)
          ? raw.favoriteIds
          : null;
    if (Array.isArray(list)) {
      for (const id of list) favorites.add(String(id));
    }
    return favorites;
  }

  function renderShops(raw, ctx = {}) {
    if (!raw) return 'No data (atom not seen yet).';
    const config = [
      { key: 'seed', label: 'Seeds', id: (item) => item?.species, type: 'Seed' },
      { key: 'egg', label: 'Eggs', id: (item) => item?.eggId ?? item?.id, type: 'Egg' },
      { key: 'tool', label: 'Tools', id: (item) => item?.toolId ?? item?.id, type: 'Tool' },
      { key: 'decor', label: 'Decor', id: (item) => item?.decorId ?? item?.id, type: 'Decor' },
    ];

    const lines = [];
    const viewAll = !!ctx.viewAll;
    const purchases = ctx.observed?.purchases;
    const defaultLimit = 8;
    let linkInjected = false;

    for (const { key, label, id: getId, type } of config) {
      const sec = raw?.[key];
      const inventory = Array.isArray(sec?.inventory) ? sec.inventory : [];
      const restock = formatSeconds(sec?.secondsUntilRestock);
      const available = [];
      for (const item of inventory) {
        const rawId = getId(item);
        const line = describeShopItemDetailed(item, type, rawId, purchases);
        if (line) available.push(line);
      }
      const limit = viewAll ? available.length : defaultLimit;
      const body = available.length
        ? available.slice(0, limit).join('<br>')
        : '<span style="opacity:0.6;">Sold out</span>';
      let footer = '';
      if (!viewAll && available.length > limit && !linkInjected) {
        footer = `<div style="opacity:0.6;">+${available.length - limit} more — ${buildViewAllLink(ctx.sectionKey)}</div>`;
        linkInjected = true;
      } else if (!viewAll && available.length > limit) {
        footer = `<div style="opacity:0.6;">+${available.length - limit} more</div>`;
      } else if (viewAll && available.length > defaultLimit && !linkInjected) {
        footer = `<div style="opacity:0.6;">${buildViewAllLink(ctx.sectionKey, 'show less')}</div>`;
        linkInjected = true;
      }
      const header = `${label.toUpperCase()} — in stock: ${available.length}${restock ? ` | restock in ${restock}` : ''}`;
      lines.push(`<div style="margin-bottom:6px;"><div style="font-weight:600;">${escapeHtml(header)}</div><div style="margin-left:6px;">${body}${footer}</div></div>`);
    }
    return lines.join('');
  }

  function describeShopItemDetailed(item, type, rawId, purchases) {
    if (!item || typeof item !== 'object') return null;

    const label = item.name || item.displayName || item.species || item.petSpecies || item.toolId || item.decorId || item.eggId || item.id || 'Item';
    const price = item.price ?? item.cost ?? item.amount ?? null;
    const initialStock = extractInitialStockValue(item);
    const canSpawn = item.canSpawnHere !== false;
    const purchased = getPurchaseCount(type, rawId, purchases);
    const remaining = computeRemaining(initialStock, purchased, canSpawn);

    if (!canSpawn) return null;
    if (remaining != null && remaining <= 0) return null;

    const pieces = [label];
    if (price != null && Number.isFinite(Number(price))) {
      pieces.push(`${Number(price)}c`);
    }

    if (remaining != null) {
      if (initialStock != null) {
        pieces.push(`${remaining}/${initialStock} left`);
      } else {
        pieces.push(`${remaining} left`);
      }
    } else if (initialStock != null) {
      pieces.push(`${initialStock} stock`);
    }

    if (purchased) {
      pieces.push(`bought ${purchased}`);
    }

    return pieces.map((part) => escapeHtml(part)).join(' • ');
  }

  function describeItem(item, favoritesSet = new Set()) {
    if (!item || typeof item !== 'object') return escapeHtml(String(item));
    const parts = [];
    const type = inferItemType(item);
    const id = String(item.id ?? item.itemId ?? item.petId ?? '');
    const name = item.name || item.displayName || item.species || item.petSpecies || item.toolId || item.decorId || item.eggId || item.itemType || 'Item';
    const qty = item.quantity ?? item.count ?? item.amount ?? item.stackSize;
    const favorited = favoritesSet.has(id);
    parts.push(`${type}: ${name}`);
    if (Number.isFinite(qty)) parts.push(`x${qty}`);
    if (item.hunger != null) parts.push(`hunger ${(Number(item.hunger) * 100).toFixed(0)}%`);
    if (item.mutations?.length) parts.push(`mut ${item.mutations.join(',')}`);
    if (favorited) parts.push('★');
    return escapeHtml(parts.join(' | '));
  }

  function describePetInfo(entry) {
    const pet = entry?.slot ?? entry ?? {};
    const parts = [];
    const species = pet.petSpecies || pet.species || 'Pet';
    const name = pet.name ? `“${pet.name}”` : pet.displayName ? `“${pet.displayName}”` : '';
    parts.push(species);
    if (name) parts.push(name);
    if (Number.isFinite(Number(pet.hunger))) {
      parts.push(`hunger ${formatPercent(pet.hunger)}`);
    }
    if (Number.isFinite(Number(pet.xp))) {
      parts.push(`xp ${Math.round(Number(pet.xp))}`);
    }
    if (Array.isArray(pet.mutations) && pet.mutations.length) {
      parts.push(`mut ${pet.mutations.join(',')}`);
    }
    return escapeHtml(parts.join(' | '));
  }

  function describePetSlotInfo(entry) {
    const slot = entry?.slot ?? entry ?? {};
    const parts = [];
    const id = slot.id ? `#${slot.id}` : null;
    const species = slot.petSpecies || slot.species || 'Slot';
    const status = entry?.status || slot.status;
    parts.push(species);
    if (slot.name) parts.push(`“${slot.name}”`);
    if (id) parts.push(id);
    if (status) parts.push(String(status));
    if (Number.isFinite(Number(slot.hunger))) parts.push(`hunger ${formatPercent(slot.hunger)}`);
    if (Number.isFinite(Number(slot.xp))) parts.push(`xp ${Math.round(Number(slot.xp))}`);
    return escapeHtml(parts.join(' | '));
  }

  function countBy(items, fn) {
    const map = new Map();
    for (const item of items) {
      const key = fn(item) || 'Unknown';
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }

  function extractInitialStockValue(item) {
    const initial = item?.initialStock ?? item?.stock ?? item?.quantity ?? null;
    if (!Number.isFinite(Number(initial))) return item?.initialStock === 0 ? 0 : null;
    return Number(initial);
  }

  function getPurchaseCount(type, rawId, purchases) {
    if (!rawId || !purchases) return 0;
    const section =
      type === 'Seed' ? purchases?.seed :
      type === 'Egg' ? purchases?.egg :
      type === 'Tool' ? purchases?.tool :
      purchases?.decor;
    const bucket = section?.purchases;
    if (!bucket || typeof bucket !== 'object') return 0;
    const value = bucket[String(rawId)] ?? bucket[Number(rawId)] ?? 0;
    return Number.isFinite(Number(value)) ? Number(value) : 0;
  }

  function computeRemaining(initialStock, purchased, canSpawn) {
    if (initialStock == null) {
      return canSpawn === false ? 0 : null;
    }
    const bought = Number.isFinite(Number(purchased)) ? Number(purchased) : 0;
    const remaining = Math.max(0, initialStock - bought);
    if (canSpawn === false) return 0;
    return remaining;
  }

  function inferItemType(item) {
    if (!item || typeof item !== 'object') return 'Unknown';
    return (
      item.itemType ||
      item.type ||
      (item.petSpecies ? 'Pet' : null) ||
      (item.species ? 'Seed' : null) ||
      (item.toolId ? 'Tool' : null) ||
      (item.decorId ? 'Decor' : null) ||
      (item.eggId ? 'Egg' : null) ||
      'Unknown'
    );
  }

  function formatSeconds(value) {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds <= 0) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const parts = [];
    if (h) parts.push(`${h}h`);
    if (m || h) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
  }

  function formatNumber(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return String(value);
    try {
      return num.toLocaleString();
    } catch {
      return String(num);
    }
  }

  function formatPercent(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '–';
    const percent = Math.round(num * 100);
    return `${percent}%`;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escapeAttr(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /* -------------------------------------------------------------------------- */
  /* Timing helpers                                                             */
  /* -------------------------------------------------------------------------- */

  async function waitForDom() {
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      return;
    }
    await new Promise((resolve) => {
      window.addEventListener('DOMContentLoaded', resolve, { once: true });
    });
  }

  async function waitFor(predicate, timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const result = predicate();
        if (result) return result;
      } catch {}
      await sleep(80);
    }
    return null;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
})();
