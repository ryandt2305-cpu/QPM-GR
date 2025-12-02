// src/features/shopRestockLiveTracker.ts
// Live shop monitoring to detect restocks in real-time

import { onShopStock, startShopStockStore, type ShopStockState } from '../store/shopStock';
import { addRestockEvent, RestockEvent, RestockItem } from './shopRestockTracker';
import { log } from '../utils/logger';

let unsubscribeShop: (() => void) | null = null;
let previousShopState: Map<string, number> | null = null;
let isTracking = false;
let isEnabled = true; // Default to enabled for backwards compatibility
let lastProcessedSignature = '';
let lastProcessedAt = 0;
const MIN_PROCESS_INTERVAL_MS = 1200;

/**
 * Item categories - only track seeds and eggs (comprehensive list)
 */
const TRACKED_ITEM_NAMES = [
  // All Seeds
  'Carrot', 'Strawberry', 'Aloe', 'Delphinium', 'Blueberry', 'Apple',
  'Tulip', 'Tomato', 'Daffodil', 'Corn', 'Watermelon', 'Pumpkin',
  'Echeveria', 'Coconut', 'Banana', 'Lily', 'Camellia', 'Squash',
  "Burro's Tail", 'Mushroom', 'Cactus', 'Bamboo', 'Chrysanthemum',
  'Grape', 'Pepper', 'Lemon', 'Passion Fruit', 'Dragon Fruit',
  'Lychee', 'Sunflower', 'Starweaver', 'Dawnbinder', 'Moonbinder',
  // Celestial seeds with their actual shop names
  'Starweaver Pod', 'Dawnbinder Pod', 'Moonbinder Pod',
  // All Eggs (both singular and plural forms)
  'Uncommon Eggs', 'Uncommon Egg', 'Rare Eggs', 'Rare Egg',
  'Mythical Eggs', 'Mythical Egg', 'Legendary Eggs', 'Legendary Egg',
];

/**
 * Invalid patterns that indicate this is not a real item
 */
const INVALID_PATTERNS = [
  /!!!/,           // Multiple exclamation marks
  /omg/i,          // Common Discord expressions
  /ping/i,         // Ping mentions
  /spam/i,         // Spam mentions
  /^\d+/,          // Starts with numbers
  /\d+\s+[A-Z]/,   // Number followed by space and capital letter
  /stock!!!/i,     // "in stock!!!" messages
  /vegetables/i,   // Message text
  /named/i,        // Message text
];

/**
 * Check if item name is valid
 */
function isValidItemName(itemName: string): boolean {
  // Reject if matches any invalid pattern
  if (INVALID_PATTERNS.some(pattern => pattern.test(itemName))) {
    return false;
  }

  // Reject if too long (real item names are short)
  if (itemName.length > 50) {
    return false;
  }

  return true;
}

/**
 * Check if item should be tracked
 */
function shouldTrackItem(itemName: string): boolean {
  if (!isValidItemName(itemName)) {
    return false;
  }

  return TRACKED_ITEM_NAMES.some(tracked => itemName.includes(tracked));
}

/**
 * Determine item type
 */
function getItemType(itemName: string): 'seed' | 'egg' | 'unknown' {
  if (itemName.includes('Eggs') || itemName.includes('Egg') || itemName.includes('egg')) return 'egg';
  if (TRACKED_ITEM_NAMES.some(s => itemName.includes(s))) return 'seed';
  return 'unknown';
}

/**
 * Extract current shop inventory from ShopStockState
 */
function extractShopInventory(shopState: ShopStockState): Map<string, number> {
  const inventory = new Map<string, number>();
  let totalItems = 0;
  let trackedItems = 0;

  try {
    // Process all shop categories (seeds, eggs, tools, decor)
    for (const [categoryName, category] of Object.entries(shopState.categories)) {
      if (!category || !category.items) continue;

      for (const item of category.items) {
        const itemName = item.label || item.id;
        const quantity = item.initialStock || item.currentStock || item.remaining || 0;

        totalItems++;

        if (itemName && shouldTrackItem(itemName) && quantity > 0) {
          inventory.set(itemName, quantity);
          trackedItems++;
        }
      }
    }
  } catch (error) {
    log('⚠️ Failed to extract shop inventory:', error);
  }

  return inventory;
}

/**
 * Detect new items (restock occurred)
 */
function detectRestock(current: Map<string, number>, previous: Map<string, number> | null): RestockItem[] {
  const newItems: RestockItem[] = [];

  if (!previous) {
    return newItems; // First check, no comparison
  }

  // Find items that appeared or increased in quantity
  for (const [itemName, currentQty] of current.entries()) {
    const previousQty = previous.get(itemName) || 0;

    // Item appeared or quantity increased (likely a restock)
    if (currentQty > previousQty) {
      newItems.push({
        name: itemName,
        quantity: currentQty,
        type: getItemType(itemName),
      });
    }
  }

  return newItems;
}

/**
 * Generate unique ID for restock event
 */
function generateRestockId(timestamp: number, items: RestockItem[]): string {
  const itemsHash = items.map(i => `${i.name}:${i.quantity}`).join(',');
  return `${timestamp}-${btoa(itemsHash).substring(0, 8)}`;
}

/**
 * Start live shop tracking using shop stock system
 */
export async function startLiveShopTracking(): Promise<void> {
  if (!isEnabled) {
    log('⚠️ Live tracking is disabled');
    return;
  }

  if (isTracking) {
    log('⚠️ Shop tracking already active');
    return;
  }

  try {
    log('📊 Starting live shop restock tracking...');

    // Ensure shop stock store is started
    await startShopStockStore().catch(error => {
      log('⚠️ Failed to start shop stock store', error);
    });

    // Subscribe to shop stock updates (same system auto-buy uses)
    const unsub = onShopStock((shopState) => {
      try {
        const signature = Object.values(shopState.categories || {})
          .map(cat => cat.signature)
          .join('|');
        const now = Date.now();

        // Throttle duplicate snapshots and rapid-fire updates to reduce lag
        if (signature && signature === lastProcessedSignature && now - lastProcessedAt < MIN_PROCESS_INTERVAL_MS) {
          return;
        }
        if (now - lastProcessedAt < MIN_PROCESS_INTERVAL_MS / 2) {
          return;
        }
        lastProcessedSignature = signature;
        lastProcessedAt = now;

        const currentInventory = extractShopInventory(shopState);
        const restockedItems = detectRestock(currentInventory, previousShopState);

        if (restockedItems.length > 0) {
          log(`🏪 RESTOCK DETECTED! Items: ${restockedItems.map(i => `${i.name} (${i.quantity})`).join(', ')}`);

          const now = Date.now();
          const event: RestockEvent = {
            id: generateRestockId(now, restockedItems),
            timestamp: now,
            dateString: new Date(now).toLocaleString(),
            items: restockedItems,
            source: 'live',
          };

          addRestockEvent(event);
        }

        // Update previous state
        previousShopState = currentInventory;
      } catch (error) {
        log('⚠️ Error processing shop update:', error);
      }
    }, false); // Don't fire immediately, wait for actual changes

    unsubscribeShop = unsub;
    isTracking = true;
    log('✅ Live shop tracking active');
  } catch (error) {
    log('❌ Failed to start live shop tracking:', error);
  }
}

/**
 * Stop live shop tracking
 */
export function stopLiveShopTracking(): void {
  if (unsubscribeShop) {
    unsubscribeShop();
    unsubscribeShop = null;
  }

  isTracking = false;
  previousShopState = null;
  lastProcessedSignature = '';
  lastProcessedAt = 0;
  log('🛑 Live shop tracking stopped');
}

/**
 * Check if tracking is active
 */
export function isLiveTrackingActive(): boolean {
  return isTracking;
}

/**
 * Enable live tracking
 */
export function enableLiveTracking(): void {
  isEnabled = true;
  if (!isTracking) {
    startLiveShopTracking();
  }
}

/**
 * Disable live tracking
 */
export function disableLiveTracking(): void {
  isEnabled = false;
  if (isTracking) {
    stopLiveShopTracking();
  }
  lastProcessedSignature = '';
  lastProcessedAt = 0;
}

/**
 * Check if live tracking is enabled
 */
export function isLiveTrackingEnabled(): boolean {
  return isEnabled;
}