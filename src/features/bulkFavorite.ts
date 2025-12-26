// src/features/bulkFavorite.ts
// Bulk Favorite Feature - Clean rewrite of Inventory Locker
// Allows users to favorite/unfavorite all produce items of a species with one click

import { log } from '../utils/logger';
import { pageWindow } from '../core/pageContext';
import { getInventoryItems, getFavoritedItemIds, InventoryItem } from '../store/inventory';
import { getCropSpriteDataUrl } from '../sprite-v2/compat';
import { addStyle } from '../utils/dom';
import { getAllPlantSpecies, areCatalogsReady } from '../catalogs/gameCatalogs';

// ============================================================================
// TYPES
// ============================================================================

interface ProduceGroup {
  species: string;
  itemIds: string[];
  allFavorited: boolean;
}

export interface BulkFavoriteConfig {
  enabled: boolean;
}

// ============================================================================
// STATE
// ============================================================================

let observer: MutationObserver | null = null;
let sidebar: HTMLElement | null = null;
let inventoryContainer: Element | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let stylesInjected = false;

const STYLE_ID = 'qpm-bulk-favorite-styles';
const SIDEBAR_ID = 'qpm-bulk-favorite-sidebar';
const DEBOUNCE_MS = 100;

// Selector for inventory items - this attribute only exists when inventory is open
const INVENTORY_ITEM_SELECTOR = '[data-tm-inventory-base-index]';
const FIRST_INVENTORY_ITEM_SELECTOR = '[data-tm-inventory-base-index="0"]';

// ============================================================================
// STYLES
// ============================================================================

const CSS = `
  #${SIDEBAR_ID} {
    display: flex;
    flex-direction: column;
    gap: 6px;
    pointer-events: auto;
    padding: 4px;
    background: rgba(0, 0, 0, 0.6);
    border-radius: 8px;
    backdrop-filter: blur(4px);
  }

  #${SIDEBAR_ID}::-webkit-scrollbar {
    width: 4px;
  }

  #${SIDEBAR_ID}::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 2px;
  }

  #${SIDEBAR_ID}::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.3);
    border-radius: 2px;
  }

  .qpm-bulk-fav-btn {
    position: relative;
    width: 62px;
    height: 62px;
    background: rgba(0, 0, 0, 0.85);
    border-radius: 6px;
    border: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
    padding: 4px;
    gap: 2px;
  }

  .qpm-bulk-fav-btn:hover {
    transform: scale(1.08);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  }

  .qpm-bulk-fav-btn:active {
    transform: scale(0.96);
  }

  .qpm-bulk-fav-sprite {
    width: 36px;
    height: 36px;
    object-fit: contain;
    image-rendering: pixelated;
  }

  .qpm-bulk-fav-heart {
    position: absolute;
    top: 3px;
    right: 3px;
    width: 14px;
    height: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    line-height: 1;
  }

  .qpm-bulk-fav-heart.filled {
    color: #ff4d4d;
  }

  .qpm-bulk-fav-heart.outline {
    color: #ffffff;
    opacity: 0.85;
  }

  .qpm-bulk-fav-label {
    color: #ffffff;
    font-size: 9px;
    font-weight: 600;
    text-align: center;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1.1;
  }
`;

// ============================================================================
// UTILITIES
// ============================================================================

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function ensureStyles(): void {
  if (stylesInjected) return;
  if (document.getElementById(STYLE_ID)) {
    stylesInjected = true;
    return;
  }
  const style = addStyle(CSS);
  style.id = STYLE_ID;
  stylesInjected = true;
}

// ============================================================================
// INVENTORY HELPERS
// ============================================================================

/**
 * Extract the actual UUID from an inventory item.
 * The raw data contains the true 'id' field which is the UUID.
 * This is what we need for the WebSocket ToggleFavoriteItem command.
 */
function getItemUUID(item: InventoryItem): string | null {
  const raw = item.raw as Record<string, unknown> | undefined;
  
  // Priority: raw.id (the actual UUID) > itemId > item.id (which might be species)
  const uuid = raw?.id ?? item.itemId ?? null;
  
  if (typeof uuid === 'string' && uuid.length > 0) {
    return uuid;
  }
  
  return null;
}

/**
 * Validate if a species exists in catalog (FUTUREPROOF!)
 */
function isValidSpecies(species: string): boolean {
  if (!areCatalogsReady()) return true; // Allow all if catalog not ready (permissive)

  const knownSpecies = getAllPlantSpecies();
  return knownSpecies.includes(species);
}

function getProduceGroups(): ProduceGroup[] {
  const items = getInventoryItems();
  const favoritedIds = getFavoritedItemIds();

  // Group by species, storing actual UUIDs
  const groupMap = new Map<string, string[]>();

  for (const item of items) {
    const raw = item.raw as Record<string, unknown> | undefined;
    const itemType = raw?.itemType ?? item.itemType;
    const species = (raw?.species ?? item.species) as string | undefined;

    // Get the actual UUID for this item
    const uuid = getItemUUID(item);

    if (itemType !== 'Produce' || !species || !uuid) continue;

    // Validate species exists in catalog
    if (!isValidSpecies(species)) {
      log(`⚠️ Unknown species in bulk favorite: ${species}`);
    }
    
    const existing = groupMap.get(species);
    if (existing) {
      existing.push(uuid);
    } else {
      groupMap.set(species, [uuid]);
    }
  }
  
  // Convert to ProduceGroup array
  const groups: ProduceGroup[] = [];
  for (const [species, itemIds] of groupMap) {
    // Check favorite state for each individual item UUID
    const allFavorited = itemIds.length > 0 && itemIds.every(uuid => favoritedIds.has(uuid));
    groups.push({ species, itemIds, allFavorited });
  }
  
  // Sort alphabetically
  groups.sort((a, b) => a.species.localeCompare(b.species));
  
  return groups;
}

// ============================================================================
// WEBSOCKET
// ============================================================================

function sendFavoriteToggle(itemId: string): boolean {
  try {
    const connection = (pageWindow as any)?.MagicCircle_RoomConnection;
    if (connection && typeof connection.sendMessage === 'function') {
      connection.sendMessage({
        scopePath: ['Room', 'Quinoa'],
        type: 'ToggleFavoriteItem',
        itemId,
      });
      return true;
    }
  } catch (error) {
    log('⚠️ [BulkFavorite] Failed to send favorite toggle', error);
  }
  return false;
}

// ============================================================================
// UI RENDERING
// ============================================================================

function createButton(group: ProduceGroup): HTMLButtonElement {
  const { species, itemIds, allFavorited } = group;
  
  const btn = document.createElement('button');
  btn.className = 'qpm-bulk-fav-btn';
  btn.title = `Click to ${allFavorited ? 'Unfavorite' : 'Favorite'} all ${itemIds.length} ${species}`;
  btn.dataset.species = species;
  
  // Sprite
  const sprite = document.createElement('img');
  sprite.className = 'qpm-bulk-fav-sprite';
  sprite.alt = species;
  
  const spriteUrl = getCropSpriteDataUrl(species);
  if (spriteUrl && spriteUrl.startsWith('data:image')) {
    sprite.src = spriteUrl;
  } else {
    // Fallback: show first letter in a styled container
    const fallback = document.createElement('div');
    fallback.className = 'qpm-bulk-fav-sprite';
    fallback.style.cssText = 'display:flex;align-items:center;justify-content:center;font-size:18px;color:#fff;background:rgba(255,255,255,0.15);border-radius:4px;';
    fallback.textContent = species.charAt(0).toUpperCase();
    btn.appendChild(fallback);
  }
  
  // Heart indicator (matching game's native style)
  // Filled red heart = all favorited, outline white heart = not all favorited
  const heart = document.createElement('span');
  heart.className = `qpm-bulk-fav-heart ${allFavorited ? 'filled' : 'outline'}`;
  heart.innerHTML = allFavorited
    ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>'
    : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
  
  // Label (species name)
  const label = document.createElement('span');
  label.className = 'qpm-bulk-fav-label';
  label.textContent = species;
  
  // Only add sprite if we have one (fallback already added above if no sprite)
  if (spriteUrl && spriteUrl.startsWith('data:image')) {
    btn.appendChild(sprite);
  }
  btn.appendChild(heart);
  btn.appendChild(label);
  
  // Click handler
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleToggle(species);
  });
  
  return btn;
}

function createSidebar(container: Element): HTMLElement {
  const sidebarEl = document.createElement('div');
  sidebarEl.id = SIDEBAR_ID;
  
  // Use container bounds for stable positioning (not individual items which change with filters)
  const containerRect = container.getBoundingClientRect();
  const rightmostEdge = containerRect.right;
  const topEdge = containerRect.top;
  const bottomEdge = containerRect.bottom;
  
  // Position directly to the right of the inventory container
  const gap = 8;
  const leftPosition = rightmostEdge + gap;
  
  // Top aligns with where inventory items start
  const topPosition = topEdge;
  
  // Max height based on inventory grid height
  const maxHeight = Math.min(
    bottomEdge - topEdge,
    window.innerHeight - topPosition - 20
  );
  
  sidebarEl.style.cssText = `
    position: fixed;
    top: ${topPosition}px;
    left: ${leftPosition}px;
    max-height: ${Math.max(maxHeight, 200)}px;
    overflow-y: auto;
    z-index: 2147483646;
    pointer-events: auto;
  `;
  
  return sidebarEl;
}

function renderSidebar(): void {
  if (!sidebar || !inventoryContainer) return;
  
  // Clear existing buttons
  sidebar.innerHTML = '';
  
  const groups = getProduceGroups();
  
  if (groups.length === 0) {
    // No produce items - hide sidebar
    sidebar.style.display = 'none';
    return;
  }
  
  sidebar.style.display = 'flex';
  
  for (const group of groups) {
    const btn = createButton(group);
    sidebar.appendChild(btn);
  }
  
  log(`🎯 [BulkFavorite] Rendered ${groups.length} produce types`);
}

// ============================================================================
// TOGGLE LOGIC
// ============================================================================

/**
 * Handle bulk favorite toggle for a species.
 * 
 * Logic:
 * - If ALL items are favorited → unfavorite all (toggle only favorited items)
 * - If ANY items are NOT favorited → favorite all (toggle only unfavorited items)
 * 
 * This ensures:
 * - Clicking when heart is filled (all favorited) → all become unfavorited
 * - Clicking when heart is outline (some/none favorited) → all become favorited
 */
async function handleToggle(species: string): Promise<void> {
  const items = getInventoryItems();
  const favoritedIds = getFavoritedItemIds();
  
  // Get all item UUIDs for this species
  const itemUUIDs: string[] = [];
  for (const item of items) {
    const raw = item.raw as Record<string, unknown> | undefined;
    const itemType = raw?.itemType ?? item.itemType;
    const itemSpecies = (raw?.species ?? item.species) as string | undefined;
    
    if (itemType === 'Produce' && itemSpecies === species) {
      const uuid = getItemUUID(item);
      if (uuid) {
        itemUUIDs.push(uuid);
      }
    }
  }
  
  if (itemUUIDs.length === 0) {
    log(`⚠️ [BulkFavorite] No items found for species: ${species}`);
    return;
  }
  
  // Check current state of all items
  const favoritedCount = itemUUIDs.filter(uuid => favoritedIds.has(uuid)).length;
  const unfavoritedCount = itemUUIDs.length - favoritedCount;
  const allFavorited = unfavoritedCount === 0;
  
  // Determine action and which items to toggle
  // ToggleFavoriteItem is a TOGGLE - it flips the state
  // So we only send it for items that need to change
  let uuidsToToggle: string[];
  let action: string;
  
  if (allFavorited) {
    // All are favorited → user wants to unfavorite all
    // Toggle only the favorited ones (to unfavorite them)
    uuidsToToggle = itemUUIDs.filter(uuid => favoritedIds.has(uuid));
    action = 'Unfavoriting';
  } else {
    // Some or none are favorited → user wants to favorite all
    // Toggle only the unfavorited ones (to favorite them)
    uuidsToToggle = itemUUIDs.filter(uuid => !favoritedIds.has(uuid));
    action = 'Favoriting';
  }
  
  log(`🔄 [BulkFavorite] ${action} ${uuidsToToggle.length}/${itemUUIDs.length} ${species} items (${favoritedCount} already favorited)`);
  
  let successCount = 0;
  for (const uuid of uuidsToToggle) {
    if (sendFavoriteToggle(uuid)) {
      successCount++;
      await delay(40); // Small delay to avoid overwhelming the server
    }
  }
  
  log(`✅ [BulkFavorite] Toggled ${successCount}/${uuidsToToggle.length} ${species} items`);
  
  // Re-render after a brief delay to let the game update state
  setTimeout(() => renderSidebar(), 250);
}

// ============================================================================
// INVENTORY DETECTION
// ============================================================================

/**
 * Find the inventory grid container by looking for inventory items.
 * The inventory items have data-tm-inventory-base-index attributes.
 * Returns the scrollable grid container that holds all items.
 */
function findInventoryContainer(): Element | null {
  // First, check if any inventory item exists
  const firstItem = document.querySelector(FIRST_INVENTORY_ITEM_SELECTOR);
  if (!firstItem) return null;
  
  // Navigate up to find the scrollable container (the McFlex with the grid)
  // Structure: McFlex css-1cyjil4 > McFlex css-zo8r2v > individual items
  let container: Element = firstItem;
  
  // Find the first McFlex parent that contains multiple inventory items
  // This is the stable container (css-zo8r2v) that maintains consistent bounds regardless of filters
  for (let i = 0; i < 5; i++) {
    const parent = container.parentElement;
    if (!parent) break;
    
    // Check if this is the inventory grid container
    // It should contain the first item and have the McFlex class
    if (
      parent.classList.contains('McFlex') &&
      parent.querySelectorAll(INVENTORY_ITEM_SELECTOR).length > 1
    ) {
      // Return this first McFlex - don't traverse further up
      // The outer containers extend beyond the visible grid area
      return parent;
    }
    
    container = parent;
  }
  
  return container;
}

/**
 * Check if this is the inventory (not the shop).
 */
function isInventoryNotShop(): boolean {
  // Check if any shop-specific text exists near the inventory items
  const inventoryArea = document.querySelector(FIRST_INVENTORY_ITEM_SELECTOR)?.closest('[role="dialog"]');
  if (!inventoryArea) return true; // No dialog, might still be valid inventory
  
  const text = inventoryArea.textContent?.toLowerCase() || '';
  
  // Exclude shop panels
  if (
    text.includes('seeds in stock') ||
    text.includes('buy for') ||
    (text.includes('shop') && !text.includes('workshop'))
  ) {
    return false;
  }
  
  return true;
}

function showSidebar(container: Element): void {
  if (sidebar) {
    hideSidebar();
  }
  
  ensureStyles();
  
  inventoryContainer = container;
  sidebar = createSidebar(container);
  document.body.appendChild(sidebar);
  
  renderSidebar();
  
  log('🎒 [BulkFavorite] Sidebar shown');
}

function hideSidebar(): void {
  if (sidebar) {
    sidebar.remove();
    sidebar = null;
  }
  inventoryContainer = null;
  log('🗑️ [BulkFavorite] Sidebar hidden');
}

function handleMutations(): void {
  // Check if inventory items exist
  const hasInventoryItems = document.querySelector(FIRST_INVENTORY_ITEM_SELECTOR) !== null;
  
  if (hasInventoryItems && !sidebar) {
    // Inventory just opened
    if (!isInventoryNotShop()) {
      // This is a shop, not the inventory
      return;
    }
    
    const container = findInventoryContainer();
    if (container) {
      showSidebar(container);
    }
  } else if (!hasInventoryItems && sidebar) {
    // Inventory just closed
    hideSidebar();
  } else if (hasInventoryItems && sidebar) {
    // Inventory is open, update position if container changed
    const newContainer = findInventoryContainer();
    if (newContainer && newContainer !== inventoryContainer) {
      hideSidebar();
      showSidebar(newContainer);
    }
  }
}

function debouncedMutationHandler(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(handleMutations, DEBOUNCE_MS);
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Start the bulk favorite feature.
 * Sets up MutationObserver to detect inventory open/close.
 */
export function startBulkFavorite(): void {
  if (observer) {
    log('⚠️ [BulkFavorite] Already started');
    return;
  }
  
  ensureStyles();
  
  // Create observer with minimal configuration for performance
  // Only watch childList changes - we detect inventory by presence of 
  // elements with data-tm-inventory-base-index attribute
  observer = new MutationObserver(debouncedMutationHandler);
  
  observer.observe(document.body, {
    childList: true,
    subtree: true, // Need subtree to catch inventory items in nested containers
    attributes: false,
    characterData: false,
  });
  
  // Check if inventory is already open
  const hasInventoryItems = document.querySelector(FIRST_INVENTORY_ITEM_SELECTOR) !== null;
  if (hasInventoryItems && isInventoryNotShop()) {
    const container = findInventoryContainer();
    if (container) {
      showSidebar(container);
    }
  }
  
  log('✅ [BulkFavorite] Started');
}

/**
 * Stop the bulk favorite feature.
 * Cleans up MutationObserver and removes sidebar.
 */
export function stopBulkFavorite(): void {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  
  hideSidebar();
  
  log('🛑 [BulkFavorite] Stopped');
}

/**
 * Refresh the sidebar UI.
 * Call this if inventory data changed externally.
 */
export function refreshBulkFavorite(): void {
  if (sidebar && inventoryContainer) {
    renderSidebar();
  }
}

/**
 * Check if bulk favorite is currently active.
 */
export function isBulkFavoriteActive(): boolean {
  return observer !== null;
}

