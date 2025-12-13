// src/features/cropTypeLocking.ts
import { onAdded, addStyle, isVisible } from '../utils/dom';
import { log } from '../utils/logger';
import { normalizeSpeciesKey } from '../utils/helpers';
import { getKnownPlantKeys } from '../utils/plantScales';
import { storage } from '../utils/storage';
import { readUserSlotsInventorySnapshot } from '../store/userSlots';
import { pageWindow } from '../core/pageContext';

export interface CropItem {
  id: string;
  species?: string;
  itemType?: string;
  scale?: number;
  mutations?: string[];
  element?: Element;
}

export interface CropTypeLockConfig {
  enabled: boolean;
  syncModeEnabled: boolean;
  lockedTypes: Record<string, boolean>;
  managedFavoriteIds: Record<string, string[]>;
  baselineFavoriteIds: Record<string, string[]>;
}

// Target actual inventory modal, not shop
const INVENTORY_PANEL_SELECTOR = 'section.chakra-modal__content[role="dialog"]';
const INVENTORY_GRID_SELECTOR = '.McFlex.css-zo8r2v'; // NEW - Graphics engine 2025-12-13
const INVENTORY_ITEM_SELECTOR = 'div.css-79elbk'; // NEW - Graphics engine 2025-12-13
const FAVORITE_BUTTON_SELECTOR = 'button[aria-label*="avorite"]';
const CROP_LOCK_STYLE_ID = 'qpm-crop-lock-styles';

// Use the items container, NOT the filter buttons grid
const USER_INVENTORY_SELECTOR = '.McFlex.css-zo8r2v'; // NEW - Graphics engine 2025-12-13

const DEBUG_INVENTORY_LOGS = false;
const dbg = (...args: unknown[]): void => {
  if (!DEBUG_INVENTORY_LOGS) return;
  console.log(...args);
};

const INVENTORY_ID_ATTRS = [
  'data-tm-inventory-id',
  'data-inventory-id',
  'data-item-id',
  'data-itemid',
  'data-itemId',
  'data-item-uuid',
  'data-itemuuid',
  'data-item-guid',
  'data-uuid',
  'data-guid',
  'data-entity-id',
  'data-entityid',
  'data-record-id',
  'data-recordid',
  'data-row-id',
  'data-rowid',
  'data-tm-item-id',
  'data-tm-itemid',
  'data-id',
];

const REACT_FIBER_KEY_PREFIX = '__reactFiber$';
const REACT_PROPS_KEY_PREFIX = '__reactProps$';
const MAX_REACT_FIBER_TRAVERSAL_DEPTH = 6;

function isPlausibleInventoryId(value: string): boolean {
  if (!value) {
    return false;
  }

  if (value.length < 6) {
    return false;
  }

  if (/^\d+$/.test(value) && value.length < 10) {
    return false;
  }

  return true;
}

const LOCK_CONFIG_KEY = 'quinoa:crop-lock-config';

const KNOWN_CROP_KEYS = new Set(getKnownPlantKeys());

interface CropInventoryState {
  item: CropItem;
  element: HTMLElement;
  itemId: string;
  isFavorited: boolean;
}

interface InventoryContext {
  items: any[];
  favoritedIds: Set<string>;
  source: string;
}

interface SpeciesQueueEntry {
  id: string;
  isFavorited: boolean;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function findStringValueByPredicate(
  node: unknown,
  predicate: (key: string, value: unknown) => boolean,
  depth = 4,
  visited: WeakSet<object> = new WeakSet<object>()
): string | null {
  if (!node || typeof node !== 'object' || depth < 0) {
    return null;
  }

  if (visited.has(node as object)) {
    return null;
  }
  visited.add(node as object);

  const record = node as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) {
    if (predicate(key, value)) {
      if (typeof value === 'string' && value) {
        return value;
      }
      if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
      }
    }

    if (value && typeof value === 'object') {
      const nested = findStringValueByPredicate(value, predicate, depth - 1, visited);
      if (nested) {
        return nested;
      }
    }
  }

  return null;
}

function toInventoryArray(candidate: unknown): any[] | null {
  if (!Array.isArray(candidate)) {
    return null;
  }
  return candidate as any[];
}

function extractInventoryItems(node: unknown): any[] {
  if (!node || typeof node !== 'object') {
    return [];
  }

  const record = node as Record<string, unknown>;
  const candidatePaths: string[][] = [
    ['items'],
    ['inventory', 'items'],
    ['inventory'],
    ['data', 'inventory', 'items'],
    ['data', 'inventory'],
    []
  ];

  for (const path of candidatePaths) {
    const candidate = path.length === 0 ? node : readNestedValue(record, path);
    const array = toInventoryArray(candidate);
    if (array) {
      return array;
    }
  }

  return [];
}

function readPageInventory(): { items: any[]; favoritedItemIds: string[]; source: string } | null {
  try {
    const maybePage = pageWindow as unknown as { myData?: { inventory?: unknown } };
    const inventoryNode = maybePage?.myData?.inventory;
    if (!inventoryNode) {
      return null;
    }

    const items = extractInventoryItems(inventoryNode);
    const favoritedCandidate = readNestedValue(inventoryNode, ['favoritedItemIds']);
    const favoritedItemIds = Array.isArray(favoritedCandidate)
      ? favoritedCandidate.filter((value): value is string => typeof value === 'string')
      : [];

    return {
      items,
      favoritedItemIds,
      source: 'page.myData.inventory'
    };
  } catch (error) {
    log('⚠️ Unable to read inventory from page window', error);
    return null;
  }
}

function resolveInventoryItemId(rawItem: any): string | null {
  const candidatePaths: string[][] = [
    ['id'],
    ['itemId'],
    ['itemID'],
    ['inventoryID'],
    ['inventoryId'],
    ['uuid'],
    ['item', 'id'],
    ['item', 'itemId'],
    ['item', 'itemID'],
    ['item', 'inventoryId'],
    ['item', 'inventoryID'],
    ['item', 'uuid'],
    ['plant', 'id'],
    ['data', 'id']
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

  const fallback = findStringValueByPredicate(
    rawItem,
    (key) => /(?:inventory|item).*id$/i.test(key) || /^(?:id|uuid|guid)$/i.test(key),
    5
  );
  if (fallback) {
    return fallback;
  }

  return null;
}

function resolveInventorySpecies(rawItem: any): string | null {
  const candidatePaths: string[][] = [
    ['species'],
    ['item', 'species'],
    ['plant', 'species'],
    ['data', 'species'],
    ['crop', 'species'],
    ['product', 'species'],
    ['product', 'name'],
    ['product', 'displayName'],
    ['item', 'name'],
    ['item', 'displayName'],
    ['data', 'name'],
    ['data', 'displayName'],
    ['product', 'productName'],
    ['item', 'productName']
  ];

  for (const path of candidatePaths) {
    const value = readNestedValue(rawItem, path);
    if (typeof value === 'string' && value) {
      return value;
    }
  }

  const fallback = findStringValueByPredicate(
    rawItem,
    (key, value) => {
      const lower = key.toLowerCase();
      if (/(species|productname|productlabel|cropname|displayname)$/.test(lower)) {
        return true;
      }
      if (lower.endsWith('name') && typeof value === 'string') {
        const normalized = normalizeSpeciesKey(value as string);
        return !!normalized;
      }
      return false;
    },
    4
  );
  if (fallback) {
    return fallback;
  }

  return null;
}

function captureSpeciesQueues(context: InventoryContext): Map<string, SpeciesQueueEntry[]> {
  const queues = new Map<string, SpeciesQueueEntry[]>();

  for (const rawItem of context.items) {
    const itemId = resolveInventoryItemId(rawItem);
    if (!itemId) {
      continue;
    }

    const speciesName = resolveInventorySpecies(rawItem);
    if (!speciesName) {
      continue;
    }

    const speciesKey = normalizeSpeciesKey(speciesName);
    if (!speciesKey) {
      continue;
    }

    const entry: SpeciesQueueEntry = {
      id: itemId,
      isFavorited: context.favoritedIds.has(itemId)
    };

    const bucket = queues.get(speciesKey);
    if (bucket) {
      bucket.push(entry);
    } else {
      queues.set(speciesKey, [entry]);
    }
  }

  return queues;
}

async function captureInventoryContext(): Promise<InventoryContext | null> {
  const pageInventory = readPageInventory();

  if (pageInventory && pageInventory.items.length > 0) {
    return {
      items: [...pageInventory.items],
      favoritedIds: new Set(pageInventory.favoritedItemIds),
      source: pageInventory.source
    };
  }

  const snapshot = await readUserSlotsInventorySnapshot();
  if (snapshot && snapshot.items.length > 0) {
    return {
      items: [...snapshot.items],
      favoritedIds: new Set(snapshot.favoritedItemIds ?? []),
      source: snapshot.source
    };
  }

  if (pageInventory) {
    return {
      items: [...pageInventory.items],
      favoritedIds: new Set(pageInventory.favoritedItemIds),
      source: pageInventory.source
    };
  }

  if (snapshot) {
    return {
      items: [...snapshot.items],
      favoritedIds: new Set(snapshot.favoritedItemIds ?? []),
      source: snapshot.source
    };
  }

  return null;
}

function collectInventoryStates(items: CropItem[], context: InventoryContext | null): CropInventoryState[] {
  const favoritedSet = context?.favoritedIds ?? null;
  const queues = context ? captureSpeciesQueues(context) : null;
  const missingSpecies: Record<string, number> = {};
  const states: CropInventoryState[] = [];

  for (const item of items) {
    const element = item.element as HTMLElement | null;
    if (!element) {
      continue;
    }

    const normalizedSpecies = normalizeSpeciesKey(item.species || 'unknown') ?? 'unknown';
    const queue = queues?.get(normalizedSpecies) ?? null;

    let itemId = readInventoryId(element);
    let isFavorited = itemId && favoritedSet ? favoritedSet.has(itemId) : !!(item.element && isInventoryItemFavorited(item.element));

    if (!itemId && queue && queue.length > 0) {
      const fallback = queue.shift()!;
      itemId = fallback.id;
      isFavorited = fallback.isFavorited;
    } else if (itemId && queue) {
      const index = queue.findIndex((entry) => entry.id === itemId);
      if (index >= 0) {
        queue.splice(index, 1);
      }
    }

    if (!itemId) {
      missingSpecies[normalizedSpecies] = (missingSpecies[normalizedSpecies] ?? 0) + 1;
      continue;
    }

    const stateFavorited = favoritedSet ? favoritedSet.has(itemId) : isFavorited;
    states.push({ item, element, itemId, isFavorited: stateFavorited });
  }

  const missingKeys = Object.keys(missingSpecies);
  if (missingKeys.length > 0) {
    log('⚠️ Missing inventory ids for some crop items', { missing: missingSpecies });
  }

  return states;
}

function sendFavoriteToggle(itemId: string): boolean {
  try {
    const maybeConnection = (pageWindow as unknown as { MagicCircle_RoomConnection?: { sendMessage?: (payload: unknown) => void } }).MagicCircle_RoomConnection;
    if (maybeConnection && typeof maybeConnection.sendMessage === 'function') {
      maybeConnection.sendMessage({ scopePath: ['Room', 'Quinoa'], type: 'ToggleFavoriteItem', itemId });
      return true;
    }
  } catch (error) {
    log('⚠️ Failed to send favorite toggle via MagicCircle_RoomConnection', error);
  }

  return false;
}

async function waitForFavoriteState(itemIds: string[], shouldBeFavorited: boolean, timeoutMs = 2200, pollMs = 140): Promise<boolean> {
  if (itemIds.length === 0) {
    return true;
  }

  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const context = await captureInventoryContext();
    const favoritedSet = context?.favoritedIds ?? null;
    if (favoritedSet) {
      const stateMatches = shouldBeFavorited
        ? itemIds.every((id) => favoritedSet.has(id))
        : itemIds.every((id) => !favoritedSet.has(id));

      if (stateMatches) {
        return true;
      }
    }

    await delay(pollMs);
  }

  return false;
}

let config: CropTypeLockConfig = {
  enabled: true,
  syncModeEnabled: true,
  lockedTypes: {},
  managedFavoriteIds: {},
  baselineFavoriteIds: {}
};

let installed = false;
let currentLockButtons: Map<string, HTMLElement> = new Map();

export function startCropTypeLocking(): void {
  if (installed) return;
  installed = true;
  
  config = storage.get(LOCK_CONFIG_KEY, config);
  if (typeof config.syncModeEnabled !== 'boolean') {
    config.syncModeEnabled = true;
  }
  if (!config.managedFavoriteIds) {
    config.managedFavoriteIds = {};
  }
  if (!config.baselineFavoriteIds) {
    config.baselineFavoriteIds = {};
  }
  
  ensureStyles();
  
  log('🌾 Crop type locking system starting...');
  
  // Simple direct MutationObserver for the grid
  const obs = new MutationObserver(() => {
    const grid = document.querySelector(USER_INVENTORY_SELECTOR);
    if (grid && !grid.hasAttribute('data-crop-lock-processed')) {
      grid.setAttribute('data-crop-lock-processed', 'true');
      log('🔍 Inventory grid found via direct observer!');
      
      // The grid IS the items container, find the modal parent and pass the grid directly
      let parent = grid.parentElement;
      let modalParent: HTMLElement | null = null;
      
      while (parent && parent !== document.body) {
        if (parent.getAttribute('role') === 'dialog' || 
            parent.classList.contains('chakra-modal__content') ||
            parent.tagName === 'SECTION') {
          modalParent = parent as HTMLElement;
          log('✅ Found parent modal');
          break;
        }
        parent = parent.parentElement;
      }
      
      if (modalParent) {
        setTimeout(() => enhanceInventoryPanel(modalParent!), 300);
      } else {
        log('⚠️ Could not find modal parent, processing grid directly');
        setTimeout(() => {
          const items = Array.from(grid.querySelectorAll(INVENTORY_ITEM_SELECTOR));
          if (items.length > 0) {
            processInventoryItems(items, grid as HTMLElement);
          }
        }, 300);
      }
    }
  });
  
  obs.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  // Also check immediately in case it's already open
  setTimeout(() => {
    log('🔍 Checking for existing inventory on startup...');
    const existingGrid = document.querySelector(USER_INVENTORY_SELECTOR);
    if (existingGrid && !existingGrid.hasAttribute('data-crop-lock-processed')) {
      existingGrid.setAttribute('data-crop-lock-processed', 'true');
      log('✅ Found existing inventory grid!');
      
      let parent = existingGrid.parentElement;
      while (parent && parent !== document.body) {
        if (parent.getAttribute('role') === 'dialog' || 
            parent.classList.contains('chakra-modal__content')) {
          log('✅ Found parent modal on startup, calling enhanceInventoryPanel');
          enhanceInventoryPanel(parent as HTMLElement);
          break;
        }
        parent = parent.parentElement;
      }
    } else {
      log('⏳ No inventory open yet');
    }
  }, 1000);
  
  // Watch for inventory panel opens
  onAdded(INVENTORY_PANEL_SELECTOR, (panel) => {
    dbg('🔍 Panel detected with selector:', INVENTORY_PANEL_SELECTOR);
    dbg('Panel element:', panel);
    dbg('Panel classes:', panel.className);
    dbg('Panel role:', panel.getAttribute('role'));
    dbg('Panel text preview:', panel.textContent?.substring(0, 100));
    
    if (isVisible(panel)) {
      // Check if this is actually an inventory panel, not a shop
      const isInventory = isInventoryPanel(panel);
      dbg('Is inventory panel?', isInventory);
      
      if (isInventory) {
        log('🎒 Inventory panel detected, adding crop lock buttons...');
        setTimeout(() => enhanceInventoryPanel(panel as HTMLElement), 500);
      } else {
        log('🛒 Shop panel detected, ignoring for crop locking');
      }
    } else {
      dbg('Panel not visible, skipping');
    }
  });
  
  // Watch for user's specific inventory structure
  onAdded(USER_INVENTORY_SELECTOR, (grid) => {
    dbg('🔍 User inventory grid detected:', grid);
    dbg('Grid classes:', grid.className);
    // Look for the parent container of this grid
    let parent = grid.parentElement;
    while (parent) {
      if (parent.getAttribute('role') === 'dialog' || 
          parent.classList.contains('chakra-modal__content') ||
          parent.hasAttribute('aria-modal')) {
        dbg('🎒 Found inventory modal for user grid:', parent);
        setTimeout(() => enhanceInventoryPanel(parent as HTMLElement), 200);
        break;
      }
      parent = parent.parentElement;
    }
  });
  
  // Also watch for any modal that appears (broader detection)
  onAdded('[role="dialog"]', (dialog) => {
    // Check if this could be an inventory
    const text = dialog.textContent?.toLowerCase() || '';
    if (text.includes('inventory') || text.includes('my items') || text.includes('backpack')) {
      dbg('🎒 This dialog might be inventory! Trying to enhance...');
      setTimeout(() => enhanceInventoryPanel(dialog as HTMLElement), 100);
    }
  });
  
  // Watch for any chakra modal
  onAdded('.chakra-modal__content', (modal) => {
    // Check if this could be an inventory
    const text = modal.textContent?.toLowerCase() || '';
    if (text.includes('inventory') || text.includes('my items') || text.includes('backpack')) {
      dbg('🎒 This chakra modal might be inventory! Trying to enhance...');
      setTimeout(() => enhanceInventoryPanel(modal as HTMLElement), 100);
    }
  });
  
  // Watch for ANY element with "inventory" in text content
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node as Element;
          const text = element.textContent?.toLowerCase() || '';
          if (text.includes('inventory') || text.includes('my items')) {
            // Try to find a parent modal or dialog
            let parent = element.parentElement;
            while (parent) {
              if (parent.getAttribute('role') === 'dialog' || 
                  parent.classList.contains('chakra-modal__content') ||
                  parent.hasAttribute('aria-modal')) {
                dbg('🎒 Found parent modal for inventory element:', parent);
                setTimeout(() => enhanceInventoryPanel(parent as HTMLElement), 100);
                break;
              }
              parent = parent.parentElement;
            }
          }
        }
      });
    });
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Watch for modal/dialog closures to clean up sidebar
  const removalObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.removedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node as Element;
          // If a modal/dialog is removed, remove the sidebar
          if (element.getAttribute('role') === 'dialog' || 
              element.classList?.contains('chakra-modal__content') ||
              element.hasAttribute?.('aria-modal')) {
            const sidebar = document.getElementById('quinoa-crop-lock-sidebar');
            if (sidebar) {
              sidebar.remove();
              log('🗑️ Removed crop lock sidebar (inventory closed)');
            }
          }
        }
      });
    });
  });

  removalObserver.observe(document.body, {
    childList: true,
    subtree: true
  });

  log('✅ Crop type locking system started');
}

function isInventoryPanel(panel: Element): boolean {
  const text = panel.textContent || '';
  const lowerText = text.toLowerCase();
  
  // Check for inventory-specific indicators
  if (lowerText.includes('inventory') || 
      lowerText.includes('my items') ||
      panel.querySelector('[data-testid*="inventory"]')) {
    return true;
  }
  
  // Check if it's a shop by looking for shop indicators
  if (lowerText.includes('shop') ||
      lowerText.includes('buy') ||
      lowerText.includes('purchase') ||
      lowerText.includes('seeds in') ||
      lowerText.includes('restocked') ||
      lowerText.includes('new seeds') ||
      panel.querySelector('[data-testid*="shop"]') ||
      panel.classList.contains('css-1ubz3lw')) { // The shop selector
    return false;
  }
  
  // If we can't determine, check if it has actual inventory items vs shop items
  const hasInventoryItems = panel.querySelector('.chakra-stack > div[role="button"]');
  const hasShopItems = panel.querySelector('div[data-tm-shop-index]');
  
  if (hasShopItems && !hasInventoryItems) {
    return false; // This is a shop
  }
  
  return true; // Default to inventory
}

function ensureStyles(): void {
  if (document.getElementById(CROP_LOCK_STYLE_ID)) return;
  
  addStyle(`
    .qpm-crop-lock-button {
      position: absolute;
      top: 2px;
      right: 2px;
      width: 20px;
      height: 20px;
      border: none;
      border-radius: 4px;
      background: rgba(0, 0, 0, 0.7);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      z-index: 10;
      transition: all 0.2s;
      backdrop-filter: blur(2px);
    }
    
    .qpm-crop-lock-button:hover {
      background: rgba(0, 0, 0, 0.9);
      transform: scale(1.1);
    }
    
    .qpm-crop-lock-button.locked {
      background: rgba(255, 193, 7, 0.9);
      color: #000;
    }
    
    .qpm-crop-lock-button.unlocked {
      background: rgba(108, 117, 125, 0.7);
      color: #fff;
    }
    
    .qpm-crop-lock-button.unlocked:hover {
      background: rgba(108, 117, 125, 0.9);
    }
    
    .qpm-inventory-item-wrapper {
      position: relative;
    }

    /* Hide default favorite button when our lock button is active */
    .qpm-inventory-item-wrapper button[aria-label*="avorite"] {
      display: none;
    }

    /* Mutation tags */
    .qpm-mutation-tags {
      position: absolute;
      top: 2px;
      left: 2px;
      display: flex;
      gap: 2px;
      z-index: 10;
      pointer-events: none;
    }

    .qpm-mutation-tag {
      width: 14px;
      height: 14px;
      border-radius: 3px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: -0.5px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
      border: 1px solid rgba(0, 0, 0, 0.2);
    }
  `).id = CROP_LOCK_STYLE_ID;
}

function injectCropLockStyles(): void {
  if (document.getElementById(CROP_LOCK_STYLE_ID)) return;
  
  const style = document.createElement('style');
  style.textContent = `
    .qpm-crop-lock-button {
      position: absolute;
      top: 4px;
      right: 4px;
      width: 20px;
      height: 20px;
      border: none;
      border-radius: 50%;
      cursor: pointer;
      font-size: 10px;
      font-weight: bold;
      z-index: 1000;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .qpm-crop-lock-button:hover {
      background: rgba(0, 0, 0, 0.9);
      transform: scale(1.1);
    }
    
    .qpm-crop-lock-button.locked {
      background: rgba(255, 193, 7, 0.9);
      color: #000;
    }
    
    .qpm-crop-lock-button.unlocked {
      background: rgba(108, 117, 125, 0.7);
      color: #fff;
    }
    
    .qpm-crop-lock-button.unlocked:hover {
      background: rgba(108, 117, 125, 0.9);
    }
    
    .qpm-inventory-item-wrapper {
      position: relative;
    }

    /* Hide default favorite button when our lock button is active */
    .qpm-inventory-item-wrapper button[aria-label*="avorite"] {
      display: none;
    }

    /* Mutation tags */
    .qpm-mutation-tags {
      position: absolute;
      top: 2px;
      left: 2px;
      display: flex;
      gap: 2px;
      z-index: 10;
      pointer-events: none;
    }

    .qpm-mutation-tag {
      width: 14px;
      height: 14px;
      border-radius: 3px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: -0.5px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
      border: 1px solid rgba(0, 0, 0, 0.2);
    }
  `;
  style.id = CROP_LOCK_STYLE_ID;
  document.head.appendChild(style);
}

function enhanceInventoryPanel(panel: HTMLElement): void {
  log('🎯 enhanceInventoryPanel called');
  
  // Find the items container using the correct selector
  const itemsContainer = panel.querySelector(INVENTORY_GRID_SELECTOR) as HTMLElement;
  
  if (!itemsContainer) {
    log(`❌ Could not find items container (${INVENTORY_GRID_SELECTOR})`);
    return;
  }
  
  log('✅ Found items container');
  
  // Get all items using the data-tm-inventory-base-index attribute
  const items = Array.from(itemsContainer.querySelectorAll(INVENTORY_ITEM_SELECTOR));
  
  log(`✅ Found ${items.length} inventory items`);
  
  if (items.length === 0) {
    log('❌ No inventory items found');
    return;
  }
  
  processInventoryItems(items, panel);
}

function processInventoryItems(items: Element[], panel: HTMLElement): void {
  const cropsByType = new Map<string, CropItem[]>();
  
  log(`🔍 Processing ${items.length} inventory items...`);
  
  // Group items by crop type
  for (const item of items) {
    const cropData = extractCropData(item);
    if (!cropData) continue;
    
    const speciesKey = normalizeSpeciesKey(cropData.species || 'unknown');
    if (!cropsByType.has(speciesKey)) {
      cropsByType.set(speciesKey, []);
    }
    cropsByType.get(speciesKey)!.push({ ...cropData, element: item });
  }
  
  log(`🌾 Found ${cropsByType.size} different crop types`);
  
  if (cropsByType.size === 0) {
    log('❌ No crop types found - sidebar will not be created');
    return;
  }
  
  // Create the crop lock sidebar
  createCropLockSidebar(panel, cropsByType);
}

function cleanInventoryLabel(label: string): string {
  return label
    .replace(/\s*\+\s?\d+$/, '')
    .replace(/\s*\([^)]+\)$/, '')
    .replace(/\s*(produce|crop|fruit|vegetable|berry)$/i, '')
    .trim();
}

function extractCropData(itemElement: Element): CropItem | null {
  try {
    // Try multiple name selectors - prioritize the actual name element
    const nameSelectors = [
      'p.chakra-text.css-1k5d5up',  // NEW - primary for new graphics engine
      'p.chakra-text.css-1d354tw',  // NEW - for crops with mutations/stats
      'p.chakra-text.css-8xfasz', // The actual item name from your HTML
      '.McFlex.css-1gd1uup p.chakra-text', // Name in the flex container
      'p.chakra-text.css-rbbzu5',
      '.chakra-text',
      '[data-testid="item-name"]',
      'p'
    ];

    let nameElement: Element | null = null;
    let itemName: string | null = null;

    for (const selector of nameSelectors) {
      nameElement = itemElement.querySelector(selector);
      if (nameElement) {
        itemName = nameElement.textContent?.trim();
        if (itemName && itemName.length > 0) break;
      }
    }

    if (!itemName) {
      log('❌ No item name found');
      return null;
    }

    // NEW - Exclude pets (have "STR XX" text)
    const allText = itemElement.textContent || '';
    if (/\bSTR\s+\d+/i.test(allText)) {
      return null; // This is a pet, not a crop
    }

    // NEW - Only accept crops (have "X.X kg" weight text)
    const hasWeight = /\d+\.?\d*\s*kg/i.test(allText);
    if (!hasWeight) {
      return null; // Not a crop
    }

    // STRICT: Only accept items that are confirmed crops (harvested produce)
    const cleanedLabel = cleanInventoryLabel(itemName);
    const isCrop = isLikelyCrop(cleanedLabel);

    if (!isCrop) {
      return null;
    }

    // Extract species from name
    const species = extractSpeciesFromName(cleanedLabel) || cleanedLabel;

    return {
      id: `crop-${Date.now()}-${Math.random()}`,
      species,
      itemType: 'Crop',
      element: itemElement
    };
  } catch (error) {
    log('❌ Error extracting crop data:', error);
    return null;
  }
}

function isLikelyCrop(itemName: string): boolean {
  if (!itemName) return false;

  const lowerName = itemName.toLowerCase().trim();

  const plantIndicators = /(\bplant\b|\btree\b|\bsapling\b|\bsprout\b|\bshrub\b)/;
  if (plantIndicators.test(lowerName)) {
    return false;
  }

  const excludeKeywords = [
    'seed',
    'spore',
    'cutting',
    'pod',
    'kernel',
    'pit',
    'shovel',
    'pot',
    'watering can',
    'tool',
    'fertilizer',
    'egg',
    'decor',
    'furniture',
    'planter',
    'pedestal',
    'bench',
    'arch',
  ];

  for (const keyword of excludeKeywords) {
    if (lowerName.includes(keyword)) {
      return false;
    }
  }

  const normalized = normalizeSpeciesKey(itemName);
  if (normalized && KNOWN_CROP_KEYS.has(normalized)) {
    return true;
  }

  // Fallback: handle simple plural forms (e.g., "mangoes")
  if (normalized.endsWith('s')) {
    const singular = normalized.replace(/s$/, '');
    if (KNOWN_CROP_KEYS.has(singular)) {
      return true;
    }
  }

  return false;
}

function extractSpeciesFromName(itemName: string): string | null {
  const cleaned = cleanInventoryLabel(itemName);
  if (!cleaned) return null;

  return cleaned
    .split(/\s+/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function readInventoryId(element: Element | null | undefined): string | null {
  if (!element) {
    return null;
  }

  const candidateSelectors = [
    '[data-tm-inventory-id]',
    '[data-inventory-id]',
    '[data-item-id]',
    '[data-itemid]',
    '[data-item-uuid]',
    '[data-uuid]',
    '[data-guid]',
    '[data-entity-id]',
    '[data-record-id]',
    '[data-row-id]'
  ];

  const searchNodes: Element[] = [];
  let current: Element | null = element;
  for (let depth = 0; current && depth < 5; depth++) {
    searchNodes.push(current);
    current = current.parentElement;
  }

  const datasetPredicate = (key: string) => {
    const lower = key.toLowerCase();
    return lower.includes('inventoryid') || lower.includes('itemid') || /(?:uuid|guid)$/.test(lower);
  };

  for (const node of searchNodes) {
    const direct = readAttributeValue(node, INVENTORY_ID_ATTRS);
    if (direct) {
      return direct;
    }

    const datasetValue = readDatasetValue(node, datasetPredicate);
    if (datasetValue) {
      return datasetValue;
    }
  }

  for (const node of searchNodes) {
    for (const selector of candidateSelectors) {
      const nested = node.querySelector(selector);
      if (!nested) {
        continue;
      }

      const nestedAttr = readAttributeValue(nested, INVENTORY_ID_ATTRS);
      if (nestedAttr) {
        return nestedAttr;
      }

      const nestedDataset = readDatasetValue(nested, datasetPredicate);
      if (nestedDataset) {
        return nestedDataset;
      }
    }
  }

  const reactId = readReactInventoryId(searchNodes);
  if (reactId) {
    return reactId;
  }

  return null;
}

function readAttributeValue(element: Element, names: string[]): string | null {
  for (const name of names) {
    const value = element.getAttribute(name);
    if (value != null) {
      return value;
    }
  }

  const lowerNames = names.map((name) => name.toLowerCase());
  for (const { name, value } of Array.from(element.attributes)) {
    if (lowerNames.includes(name.toLowerCase()) && value != null) {
      return value;
    }
  }

  return null;
}

function readDatasetValue(element: Element, predicate: (key: string) => boolean): string | null {
  const htmlElement = element as HTMLElement;
  const dataset = htmlElement.dataset;
  if (!dataset) return null;

  for (const [key, value] of Object.entries(dataset)) {
    if (predicate(key) && value != null && value !== '') {
      return value;
    }
  }

  return null;
}

interface ReactFiberLike {
  memoizedProps?: unknown;
  pendingProps?: unknown;
  memoizedState?: unknown;
  stateNode?: unknown;
  child?: ReactFiberLike | null;
  sibling?: ReactFiberLike | null;
}

function readReactInventoryId(nodes: Element[]): string | null {
  for (const node of nodes) {
    const fromProps = extractIdFromReactProps(node);
    if (fromProps) {
      return fromProps;
    }

    const fiber = getReactFiber(node);
    const fromFiber = extractIdFromReactFiber(fiber);
    if (fromFiber) {
      return fromFiber;
    }
  }

  return null;
}

function extractIdFromReactProps(node: Element): string | null {
  const keys = Object.getOwnPropertyNames(node);
  for (const key of keys) {
    if (!key.startsWith(REACT_PROPS_KEY_PREFIX)) {
      continue;
    }

    const props = (node as unknown as Record<string, unknown>)[key] as unknown;
    const id = extractInventoryIdFromUnknown(props);
    if (id) {
      return id;
    }
  }

  return null;
}

function getReactFiber(node: Element): ReactFiberLike | null {
  const keys = Object.getOwnPropertyNames(node);
  for (const key of keys) {
    if (key.startsWith(REACT_FIBER_KEY_PREFIX)) {
      return (node as unknown as Record<string, unknown>)[key] as ReactFiberLike;
    }
  }

  return null;
}

function extractIdFromReactFiber(fiber: ReactFiberLike | null): string | null {
  if (!fiber) {
    return null;
  }

  const stack: Array<{ fiber: ReactFiberLike; depth: number }> = [{ fiber, depth: 0 }];
  const visited = new WeakSet<object>();

  while (stack.length > 0) {
    const { fiber: current, depth } = stack.pop()!;
    if (!current || visited.has(current as unknown as object)) {
      continue;
    }

    visited.add(current as unknown as object);

    const id =
      extractInventoryIdFromUnknown(current.memoizedProps) ||
      extractInventoryIdFromUnknown(current.pendingProps) ||
      extractInventoryIdFromUnknown(current.memoizedState) ||
      extractInventoryIdFromUnknown(current.stateNode);

    if (id) {
      return id;
    }

    if (depth >= MAX_REACT_FIBER_TRAVERSAL_DEPTH) {
      continue;
    }

    if (current.child) {
      stack.push({ fiber: current.child, depth: depth + 1 });
    }

    if (current.sibling) {
      stack.push({ fiber: current.sibling, depth });
    }
  }

  return null;
}

function extractInventoryIdFromUnknown(
  candidate: unknown,
  depth = 0,
  visited: WeakSet<object> = new WeakSet<object>()
): string | null {
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  if (candidate instanceof Element || candidate instanceof Node) {
    return null;
  }

  if (typeof Window !== 'undefined' && candidate instanceof Window) {
    return null;
  }

  if (visited.has(candidate as object)) {
    return null;
  }

  visited.add(candidate as object);

  const direct = resolveInventoryItemId(candidate);
  if (direct && isPlausibleInventoryId(direct)) {
    return direct;
  }

  if (depth >= MAX_REACT_FIBER_TRAVERSAL_DEPTH) {
    return null;
  }

  if (Array.isArray(candidate)) {
    for (const entry of candidate) {
      const nested = extractInventoryIdFromUnknown(entry, depth + 1, visited);
      if (nested) {
        return nested;
      }
    }
    return null;
  }

  const record = candidate as Record<string, unknown>;
  for (const value of Object.values(record)) {
    if (!value || (typeof value !== 'object' && typeof value !== 'function')) {
      continue;
    }

    const nested = extractInventoryIdFromUnknown(value, depth + 1, visited);
    if (nested) {
      return nested;
    }
  }

  return null;
}

function getMutationTagColor(mutation: string): { bg: string; text: string; letter: string } {
  const normalized = mutation.toLowerCase();
  if (normalized.includes('rainbow')) return { bg: 'rgba(255, 99, 255, 0.7)', text: '#fff', letter: 'R' };
  if (normalized.includes('gold')) return { bg: 'rgba(255, 215, 0, 0.9)', text: '#000', letter: 'G' };
  if (normalized.includes('frozen')) return { bg: 'rgba(135, 217, 255, 0.9)', text: '#000', letter: 'F' };
  if (normalized.includes('wet')) return { bg: 'rgba(110, 205, 255, 0.9)', text: '#000', letter: 'W' };
  if (normalized.includes('chilled')) return { bg: 'rgba(160, 200, 255, 0.9)', text: '#000', letter: 'C' };
  if (normalized.includes('dawn')) return { bg: 'rgba(255, 165, 95, 0.9)', text: '#000', letter: 'D' };
  if (normalized.includes('amber')) return { bg: 'rgba(255, 175, 35, 0.9)', text: '#000', letter: 'A' };
  return { bg: 'rgba(150, 150, 150, 0.7)', text: '#fff', letter: '?' };
}

function addLockButtonToItem(representativeItem: CropItem, speciesKey: string, allItems: CropItem[]): void {
  const itemElement = representativeItem.element as HTMLElement;
  if (!itemElement) return;

  // Make the item wrapper relative positioned
  itemElement.classList.add('qpm-inventory-item-wrapper');
  itemElement.style.position = 'relative';

  // Add mutation tags if present
  const mutations = representativeItem.mutations || [];
  if (mutations.length > 0) {
    const mutationContainer = document.createElement('div');
    mutationContainer.className = 'qpm-mutation-tags';

    // Show up to 3 mutation tags
    mutations.slice(0, 3).forEach(mutation => {
      const tagInfo = getMutationTagColor(mutation);
      const tag = document.createElement('span');
      tag.className = 'qpm-mutation-tag';
      tag.textContent = tagInfo.letter;
      tag.title = mutation;
      tag.style.cssText = `background: ${tagInfo.bg}; color: ${tagInfo.text};`;
      mutationContainer.appendChild(tag);
    });

    itemElement.appendChild(mutationContainer);
  }

  // Create lock button
  const lockButton = document.createElement('button');
  lockButton.className = 'qpm-crop-lock-button';
  lockButton.title = `Toggle lock for all ${representativeItem.species} items`;

  let configLocked = config.lockedTypes[speciesKey] || false;
  const allFavoritedNow = allItems.every((crop) => (crop.element ? isInventoryItemFavorited(crop.element) : false));

  if (allFavoritedNow !== configLocked) {
    config.lockedTypes[speciesKey] = allFavoritedNow;
    storage.set(LOCK_CONFIG_KEY, config);
    configLocked = allFavoritedNow;
  }

  updateLockButtonState(lockButton, configLocked);

  // Handle click
  lockButton.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleCropTypeLock(speciesKey, allItems, lockButton);
  });

  itemElement.appendChild(lockButton);
  currentLockButtons.set(speciesKey, lockButton);

  log(`🔒 Added lock button for ${representativeItem.species} (${allItems.length} items)`);
}

function updateLockButtonState(button: HTMLElement, isLocked: boolean): void {
  button.textContent = isLocked ? '🔒' : '🔓';
  button.className = `qpm-crop-lock-button ${isLocked ? 'locked' : 'unlocked'}`;
}

function getFavoriteToggleButton(element: Element | null | undefined): HTMLButtonElement | null {
  if (!element) return null;

  // First try: search within element (legacy)
  let button = element.querySelector(FAVORITE_BUTTON_SELECTOR);
  if (button instanceof HTMLButtonElement) return button;

  // NEW - Second try: search in grandparent (new graphics engine)
  // Structure: grandparent -> parent -> element (div.css-79elbk)
  // Favorite button is sibling of parent, so it's in grandparent
  const parent = element.parentElement;
  const grandparent = parent?.parentElement;
  if (grandparent) {
    button = grandparent.querySelector(FAVORITE_BUTTON_SELECTOR);
    if (button instanceof HTMLButtonElement) return button;
  }

  return null;
}

function isInventoryItemFavorited(element: Element | null | undefined): boolean {
  const favoriteButton = getFavoriteToggleButton(element);
  return favoriteButton ? isFavoriteButtonActive(favoriteButton) : false;
}

async function toggleCropTypeLock(speciesKey: string, items: CropItem[], button?: HTMLElement): Promise<void> {
  if (items.length === 0) {
    return;
  }

  const speciesLabel = items[0]?.species ?? speciesKey;
  const wasLocked = config.lockedTypes[speciesKey] || false;
  const shouldLock = !wasLocked;
  const syncMode = config.syncModeEnabled !== false;

  log(`🔄 ${shouldLock ? 'Locking' : 'Unlocking'} all ${speciesLabel} items...`);

  const inventoryContext = await captureInventoryContext();
  if (!inventoryContext) {
    log('⚠️ Unable to capture inventory context; aborting crop lock toggle', { speciesKey });
    showToast(`⚠️ Unable to ${shouldLock ? 'lock' : 'unlock'} ${speciesLabel}`);
    return;
  }

  log('📦 Inventory context ready for crop lock', {
    speciesKey,
    source: inventoryContext.source,
    items: inventoryContext.items.length,
    favorited: inventoryContext.favoritedIds.size
  });

  const initialFavoritedSet = new Set(inventoryContext.favoritedIds);
  const statesBefore = collectInventoryStates(items, inventoryContext);
  if (statesBefore.length === 0) {
    log('⚠️ No inventory entries with ids found for crop type', { speciesKey });
    showToast(`⚠️ No ${speciesLabel} inventory entries found`);
    return;
  }

  const initialFavoriteIds = statesBefore
    .filter((state) => state.isFavorited)
    .map((state) => state.itemId);
  const baselineFavoritesBefore = new Set(
    config.baselineFavoriteIds[speciesKey] ?? initialFavoriteIds
  );
  const managedBefore = new Set(config.managedFavoriteIds[speciesKey] ?? []);
  const toggleSet = new Set<string>();

  if (shouldLock) {
    for (const state of statesBefore) {
      if (!state.isFavorited) {
        toggleSet.add(state.itemId);
      }
    }
  } else {
    if (syncMode) {
      const manualFavorites: string[] = [];

      for (const state of statesBefore) {
        if (!state.isFavorited) {
          continue;
        }

        if (!managedBefore.has(state.itemId) && !baselineFavoritesBefore.has(state.itemId)) {
          manualFavorites.push(state.itemId);
          baselineFavoritesBefore.add(state.itemId);
        }
      }

      if (manualFavorites.length > 0) {
        log('ℹ️ Detected manual favorites during unlock; merging into baseline', {
          speciesKey,
          manual: manualFavorites.length
        });

        config.baselineFavoriteIds[speciesKey] = Array.from(baselineFavoritesBefore);
        storage.set(LOCK_CONFIG_KEY, config);
      }

      for (const state of statesBefore) {
        if (!state.isFavorited) {
          continue;
        }

        const isManaged = managedBefore.has(state.itemId);
        const isBaseline = baselineFavoritesBefore.has(state.itemId);

        if (isManaged || !isBaseline) {
          toggleSet.add(state.itemId);
        }
      }
    } else {
      for (const state of statesBefore) {
        if (state.isFavorited) {
          toggleSet.add(state.itemId);
        }
      }
    }

    if (managedBefore.size > 0) {
      for (const managedId of managedBefore) {
        if (!toggleSet.has(managedId) && !statesBefore.some((state) => state.itemId === managedId)) {
          toggleSet.add(managedId);
        }
      }
    }

    if (syncMode && managedBefore.size === 0 && toggleSet.size > 0) {
      log('⚠️ Unlocking without managed ids; will toggle all favorited items for this species', {
        speciesKey,
        count: toggleSet.size
      });
    }
  }

  const idsToToggle = Array.from(toggleSet);

  if (idsToToggle.length === 0) {
    log('ℹ️ Crop lock toggle skipped (state already matches request)', { speciesKey, shouldLock });
    config.lockedTypes[speciesKey] = shouldLock;
    if (baselineFavoritesBefore.size > 0) {
      config.baselineFavoriteIds[speciesKey] = Array.from(baselineFavoritesBefore);
    } else {
      delete config.baselineFavoriteIds[speciesKey];
    }
    if (button) {
      updateLockButtonState(button, shouldLock);
    }
    storage.set(LOCK_CONFIG_KEY, config);
    showToast(`${speciesLabel} already ${shouldLock ? 'locked' : 'unlocked'}`);
    return;
  }

  let dispatched = 0;
  for (const itemId of idsToToggle) {
    if (sendFavoriteToggle(itemId)) {
      dispatched += 1;
      await delay(40);
    } else {
      log('⚠️ Failed to dispatch favorite toggle via websocket', { speciesKey, itemId });
    }
  }

  if (dispatched === 0) {
    log('❌ No favorite toggles were dispatched; aborting state update', { speciesKey });
    showToast(`⚠️ Could not ${shouldLock ? 'lock' : 'unlock'} ${speciesLabel}`);
    return;
  }

  const waitOk = await waitForFavoriteState(idsToToggle, shouldLock);
  if (!waitOk) {
    log('⚠️ Favorite state did not settle after toggle commands', { speciesKey, shouldLock });
  }

  const finalContext = await captureInventoryContext();
  const effectiveFavoritedSet = finalContext?.favoritedIds ?? initialFavoritedSet;
  if (!finalContext) {
    log('⚠️ Using initial inventory context as fallback after toggles', { speciesKey });
  }

  const effectiveContext: InventoryContext = finalContext ?? {
    items: inventoryContext.items,
    favoritedIds: new Set(effectiveFavoritedSet),
    source: inventoryContext.source
  };

  const statesAfter = collectInventoryStates(items, effectiveContext);
  const favoritedAfter = new Set(statesAfter.filter((state) => state.isFavorited).map((state) => state.itemId));
  const totalCount = statesAfter.length;
  const favoritedCount = favoritedAfter.size;

  const managedAfter = new Set(managedBefore);
  if (shouldLock) {
    for (const state of statesAfter) {
      if (!state.isFavorited) {
        continue;
      }
      const previouslyFavorited = statesBefore.find((prev) => prev.itemId === state.itemId)?.isFavorited ?? false;
      if (!previouslyFavorited) {
        managedAfter.add(state.itemId);
      }
    }
  } else if (managedBefore.size > 0) {
    for (const state of statesAfter) {
      if (!state.isFavorited) {
        managedAfter.delete(state.itemId);
      }
    }
  } else {
    for (const itemId of idsToToggle) {
      if (!favoritedAfter.has(itemId)) {
        managedAfter.delete(itemId);
      }
    }
  }

  let operationSucceeded: boolean;
  if (shouldLock) {
    operationSucceeded = favoritedAfter.size === totalCount;
  } else if (managedBefore.size > 0) {
    operationSucceeded = statesAfter.every((state) => !managedBefore.has(state.itemId) || !state.isFavorited);
  } else {
    operationSucceeded = idsToToggle.every((itemId) => !favoritedAfter.has(itemId));
  }

  if (operationSucceeded) {
    config.lockedTypes[speciesKey] = shouldLock;
    if (shouldLock) {
      const baselineAfterLock = statesBefore
        .filter((state) => state.isFavorited)
        .map((state) => state.itemId);
      if (baselineAfterLock.length > 0) {
        config.baselineFavoriteIds[speciesKey] = baselineAfterLock;
      } else {
        delete config.baselineFavoriteIds[speciesKey];
      }
    } else {
      const baselineAfterUnlock = Array.from(favoritedAfter);
      if (baselineAfterUnlock.length > 0) {
        config.baselineFavoriteIds[speciesKey] = baselineAfterUnlock;
      } else {
        delete config.baselineFavoriteIds[speciesKey];
      }
    }
    if (button) {
      updateLockButtonState(button, shouldLock);
    }
  } else {
    config.lockedTypes[speciesKey] = wasLocked;
    if (button) {
      updateLockButtonState(button, wasLocked);
    }
    log('⚠️ Crop lock operation did not fully succeed', {
      speciesKey,
      shouldLock,
      favoritedCount,
      totalCount,
      managedBefore: managedBefore.size,
      dispatched
    });
  }

  if (managedAfter.size > 0) {
    config.managedFavoriteIds[speciesKey] = Array.from(managedAfter);
  } else {
    delete config.managedFavoriteIds[speciesKey];
  }

  storage.set(LOCK_CONFIG_KEY, config);

  const successCount = shouldLock ? favoritedAfter.size : totalCount - favoritedAfter.size;
  showToast(`${shouldLock ? '🔒 Locked' : '🔓 Unlocked'} ${successCount}/${totalCount} ${speciesLabel} items`);
}

function isFavoriteButtonActive(button: HTMLButtonElement): boolean {
  // NEW - Check SVG class for new graphics engine (2025-12-13)
  const svg = button.querySelector('svg');
  if (svg) {
    // Favorited = css-etd02c, Unfavorited = css-gtfkln
    if (svg.classList.contains('css-etd02c')) {
      return true; // Favorited
    }
    if (svg.classList.contains('css-gtfkln')) {
      return false; // Not favorited
    }
  }

  // Legacy detection methods below
  const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() ?? '';
  if (ariaLabel.includes('unfavorite')) {
    return true;
  }
  if (ariaLabel.includes('favorite') && !ariaLabel.includes('unfavorite')) {
    return false;
  }

  const ariaPressed = button.getAttribute('aria-pressed');
  if (ariaPressed === 'true') return true;
  if (ariaPressed === 'false') return false;

  if (svg) {
    const path = svg.querySelector('path');
    if (path) {
      const fill = path.getAttribute('fill');
      if (fill && fill !== 'none' && fill !== 'currentColor') {
        return true;
      }
    }
  }

  const buttonStyle = getComputedStyle(button);
  const isActive = buttonStyle.color !== 'currentColor' ||
                   button.classList.contains('active');

  return isActive;
}

function showToast(text: string): void {
  const toast = document.createElement('div');
  toast.textContent = text;
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: #2e7d32;
    color: #fff;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 12px;
    z-index: 2147483647;
    opacity: 0.95;
    animation: qpm-toast-in 0.3s ease;
  `;
  
  // Add animation keyframes if not already added
  if (!document.querySelector('#qpm-toast-styles')) {
    addStyle(`
      @keyframes qpm-toast-in {
        from { transform: translateY(20px); opacity: 0; }
        to { transform: translateY(0); opacity: 0.95; }
      }
    `).id = 'qpm-toast-styles';
  }
  
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

function createCropLockSidebar(panel: HTMLElement, cropsByType: Map<string, CropItem[]>): void {
  // Remove any existing sidebar first
  const existingSidebar = document.querySelector('#quinoa-crop-lock-sidebar');
  if (existingSidebar) {
    log('🗑️ Removing existing sidebar');
    existingSidebar.remove();
  }

  log(`📊 Creating sidebar with ${cropsByType.size} crop types`);
  
  // Log what crops we found
  cropsByType.forEach((crops, species) => {
    log(`  🌾 ${species}: ${crops.length} items`);
  });

  // Find the actual modal dialog container
  let modalContainer = panel.closest('[role="dialog"]') || 
                       panel.closest('.chakra-modal__content') ||
                       panel.closest('[aria-modal="true"]') ||
                       panel;
  
  const modalRect = modalContainer.getBoundingClientRect();
  
  log(`📐 Modal rect: left=${modalRect.left}, right=${modalRect.right}, top=${modalRect.top}, width=${modalRect.width}, height=${modalRect.height}`);

  // Position sidebar just outside the right edge of the modal
  const sidebarLeft = modalRect.right + 8; // 8px gap from modal's right edge
  const sidebarTop = modalRect.top + 60; // Start below the header
  
  log(`📐 Sidebar positioning: left=${sidebarLeft}px, top=${sidebarTop}px`);

  const sidebar = document.createElement('div');
  sidebar.id = 'quinoa-crop-lock-sidebar';
  sidebar.style.cssText = `
    position: fixed;
    top: ${sidebarTop}px;
    left: ${sidebarLeft}px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    z-index: 2147483646;
    pointer-events: auto;
  `;

  // Create crop type buttons
  let buttonCount = 0;
  cropsByType.forEach((crops, species) => {
    const cropButton = createCropTypeButton(species, crops);
    sidebar.appendChild(cropButton);
    buttonCount++;
  });

  if (cropsByType.size === 0) {
    return; // Don't show sidebar if no crops
  }

  document.body.appendChild(sidebar);
  log(`✨ Created crop lock sidebar with ${buttonCount} buttons`);
  
  // Watch for inventory close and remove sidebar
  const observer = new MutationObserver(() => {
    if (!document.body.contains(panel)) {
      log('🗑️ Inventory closed, removing sidebar');
      sidebar.remove();
      observer.disconnect();
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function createCropTypeButton(species: string, crops: CropItem[]): HTMLElement {
  const container = document.createElement('div');
  container.style.cssText = `
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    transition: transform 0.2s ease;
  `;
  
  container.addEventListener('mouseenter', () => {
    container.style.transform = 'scale(1.05)';
  });
  
  container.addEventListener('mouseleave', () => {
    container.style.transform = 'scale(1)';
  });
  
  const button = document.createElement('button');
  button.className = 'quinoa-crop-type-button';
  button.title = `${species} (${crops.length} items) - Click to favorite/unfavorite all`;
  
  // Try to get the crop sprite from the first crop item
  const firstCrop = crops[0];
  let cropImage = '';
  
  if (firstCrop && firstCrop.element) {
    // Look for img tag first
    const imgElement = firstCrop.element.querySelector('img');
    if (imgElement && imgElement.src) {
      cropImage = imgElement.src;
    } else {
      // Try canvas as fallback
      const canvasElement = firstCrop.element.querySelector('canvas');
      if (canvasElement) {
        try {
          cropImage = canvasElement.toDataURL();
        } catch (e) {
          log('⚠️ Could not get canvas data for', species);
        }
      }
    }
  }
  
  button.style.cssText = `
    width: 68px;
    height: 68px;
    border: none;
    background: rgba(0, 0, 0, 0.92);
    border-radius: 8px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    position: relative;
    padding: 11px 4px 4px 4px;
    gap: 0px;
  `;
  
  // Create icon container
  const iconContainer = document.createElement('div');
  iconContainer.style.cssText = `
    width: 100%;
    height: 33px;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    flex-shrink: 0;
  `;
  
  if (cropImage) {
    iconContainer.style.backgroundImage = `url(${cropImage})`;
    iconContainer.style.backgroundSize = '60%';
    iconContainer.style.backgroundRepeat = 'no-repeat';
    iconContainer.style.backgroundPosition = 'center';
  } else {
    // Fallback text if no image
    iconContainer.textContent = species.charAt(0).toUpperCase();
    iconContainer.style.color = '#fff';
    iconContainer.style.fontSize = '24px';
    iconContainer.style.fontWeight = 'bold';
  }
  
  button.appendChild(iconContainer);
  
  // Add species label below the icon (inside the black background)
  const label = document.createElement('div');
  label.style.cssText = `
    color: #fff;
    font-size: 11px;
    font-weight: 600;
    text-align: center;
    text-shadow: 0 1px 2px rgba(0,0,0,0.8);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    width: 100%;
    margin-top: -24px;
    flex-shrink: 0;
    line-height: 1.2;
    position: relative;
    z-index: 10;
  `;
  label.textContent = species.charAt(0).toUpperCase() + species.slice(1);
  button.appendChild(label);
  
  // Track favorites state
  const speciesKey = normalizeSpeciesKey(species) ?? species.toLowerCase();
  let allFavorited = crops.every((crop) => isInventoryItemFavorited(crop.element));
  updateButtonState();

  // Click handler
  container.addEventListener('click', async () => {
    const lockButton = currentLockButtons.get(speciesKey);
    await toggleCropTypeLock(speciesKey, crops, lockButton);
    allFavorited = crops.every((crop) => isInventoryItemFavorited(crop.element));
    updateButtonState();
  });
  
  function updateButtonState() {
    const favoritedCount = crops.filter((crop) => isInventoryItemFavorited(crop.element)).length;
    const partial = favoritedCount > 0 && favoritedCount < crops.length;

    if (allFavorited) {
      button.style.filter = 'drop-shadow(0 0 8px gold)';
      label.style.color = '#ffd700';
    } else if (partial) {
      button.style.filter = 'drop-shadow(0 0 6px #ffa726)';
      label.style.color = '#ffa726';
    } else {
      button.style.filter = 'none';
      label.style.color = '#fff';
    }
  }
  
  container.appendChild(button);
  container.appendChild(label);
  
  return container;
}

export function getCropLockConfig(): CropTypeLockConfig {
  return { ...config };
}

export function setCropLockEnabled(enabled: boolean): void {
  config.enabled = enabled;
  storage.set(LOCK_CONFIG_KEY, config);
}

export function setCropLockSyncMode(enabled: boolean): void {
  config.syncModeEnabled = enabled;
  storage.set(LOCK_CONFIG_KEY, config);
}

export function isCropTypeLocked(species: string): boolean {
  const speciesKey = normalizeSpeciesKey(species);
  return config.lockedTypes[speciesKey] || false;
}

export function setCropTypeLocked(species: string, locked: boolean): void {
  const speciesKey = normalizeSpeciesKey(species);
  config.lockedTypes[speciesKey] = locked;
  storage.set(LOCK_CONFIG_KEY, config);
  
  // Update button if it exists
  const button = currentLockButtons.get(speciesKey);
  if (button) {
    updateLockButtonState(button, locked);
  }
}

export function initCropTypeLocking(): void {
  if (!config.enabled) {
    dbg('Crop type locking is disabled');
    return;
  }

  dbg('Initializing crop type locking...');
  injectCropLockStyles();

  // Watch for inventory panels (modal dialogs)
  onAdded(INVENTORY_PANEL_SELECTOR, (panel: Element) => {
    const panelElement = panel as HTMLElement;
    dbg('Panel detected:', {
      className: panelElement.className,
      role: panelElement.getAttribute('role'),
      hasInventoryKeywords: isInventoryPanel(panelElement)
    });
    
    // Only process if it's actually an inventory panel (not shop)
    if (!isInventoryPanel(panelElement)) {
      dbg('❌ Detected shop panel, not inventory. Skipping.');
      return;
    }
    
    dbg('✅ Confirmed inventory panel, enhancing...');
    
    // Wait a bit for content to load, then enhance
    setTimeout(() => {
      enhanceInventoryPanel(panelElement);
    }, 100);
  });

  dbg('Crop type locking initialized ✅');
}