# Bulk Favorite Feature Rewrite Plan

## Overview

This document outlines the complete rewrite of the "Inventory Locker" / "Crop Type Locking" feature into a simpler, more maintainable "Bulk Favorite" feature.

**Current State:** `src/features/cropTypeLocking.ts` - 1,968 lines, overly complex, breaks frequently
**Target State:** `src/features/bulkFavorite.ts` - ~200 lines, simple, robust

## Verified Data Sources (Confirmed Working)

### 1. Inventory Access
```typescript
import { getInventoryItems, getFavoritedItemIds, readInventoryDirect } from '../store/inventory';

// Synchronous (cached)
const items = getInventoryItems();
const favoritedIds = getFavoritedItemIds(); // Returns Set<string>

// Async (fresh read)
const inventory = await readInventoryDirect();
```

### 2. Produce Item Structure
```json
{
  "id": "84bdcd45-3b78-46bf-ac68-48760d6db818",
  "itemType": "Produce",
  "species": "Pumpkin",
  "mutations": ["Frozen"],
  "scale": 0.5,
  "value": 100
}
```

### 3. WebSocket Command
```typescript
import { pageWindow } from '../core/pageContext';

const connection = (pageWindow as any).MagicCircle_RoomConnection;
connection.sendMessage({
  scopePath: ['Room', 'Quinoa'],
  type: 'ToggleFavoriteItem',
  itemId: string
});
```

### 4. Sprite System
```typescript
import { getCropSpriteDataUrl } from '../sprite-v2/compat';

const spriteDataUrl = getCropSpriteDataUrl('Sunflower'); // Returns data:image/png;base64,...
```

## User Requirements

### Detection
- ✅ Use MutationObserver only (NOT onAdded)
- ✅ Must be extremely performance-friendly (low and high spec systems)
- ✅ Detect inventory modal open/close via `[role="dialog"]`

### UI Design
- ✅ Base produce species sprite
- ✅ Semi-transparent black, rounded square background
- ✅ Species name underneath the sprite
- ✅ Heart icon in top-right corner:
  - Filled red heart = ALL items of that species are favorited
  - White outline heart = NOT all items are favorited
- ✅ Hover effect: slight enlargement (1.05x scale)
- ✅ Tooltip: "Click to Favorite or Unfavorite all"
- ✅ NO size/weight indication (no "0.01 kg" text)
- ✅ Proper sprite sizing (current buttons are too small)

### Functionality
- ✅ NO sync mode (simple toggle logic)
- ✅ Toggle favorite for ALL items of that species type
- ✅ Visual feedback showing current favorited state
- ✅ Works with game's native favorite system

### Code Quality
- ✅ Professional, future-proof, expandable
- ✅ Wire-able to QPM UI/config panel later
- ✅ Clean separation of concerns
- ✅ TypeScript with proper types

## Architecture

```
src/features/bulkFavorite/
├── index.ts           # Main entry point, exports start/stop
├── types.ts           # TypeScript interfaces
├── detector.ts        # MutationObserver for inventory detection
├── sidebar.ts         # Sidebar UI rendering
├── favoriteService.ts # WebSocket favorite toggling
└── styles.ts          # CSS-in-JS styles
```

Or single file if simpler:
```
src/features/bulkFavorite.ts  # ~200 lines, all-in-one
```

## Implementation Details

### 1. MutationObserver Strategy (Performance-Optimized)

```typescript
// Single observer, minimal checks
const observer = new MutationObserver((mutations) => {
  // Only process if we haven't already
  if (sidebarVisible && inventoryStillOpen()) return;
  if (!sidebarVisible && !inventoryJustOpened(mutations)) return;
  
  // Debounce rapid mutations
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(handleInventoryChange, 50);
});

// Observe only what we need
observer.observe(document.body, {
  childList: true,
  subtree: false, // Only direct children - modals are direct children of body
});
```

### 2. Inventory Detection Logic

```typescript
function isInventoryDialog(element: Element): boolean {
  if (element.getAttribute('role') !== 'dialog') return false;
  
  const text = element.textContent?.toLowerCase() || '';
  
  // Exclude shop panels
  if (text.includes('shop') || text.includes('seeds in stock') || text.includes('buy')) {
    return false;
  }
  
  // Must have produce items visible OR be a general inventory
  return true;
}
```

### 3. Sidebar Positioning

```typescript
function positionSidebar(dialog: Element): void {
  const rect = dialog.getBoundingClientRect();
  sidebar.style.cssText = `
    position: fixed;
    top: ${rect.top + 60}px;
    left: ${rect.right + 8}px;
    z-index: 2147483646;
  `;
}
```

### 4. Button UI (Matching Game Style)

```typescript
function createProduceButton(species: string, itemIds: string[], allFavorited: boolean): HTMLElement {
  const button = document.createElement('div');
  button.className = 'qpm-bulk-fav-btn';
  button.title = 'Click to Favorite or Unfavorite all';
  
  // Sprite
  const sprite = document.createElement('img');
  sprite.src = getCropSpriteDataUrl(species);
  sprite.alt = species;
  
  // Heart indicator
  const heart = document.createElement('span');
  heart.className = `qpm-bulk-fav-heart ${allFavorited ? 'filled' : 'outline'}`;
  heart.innerHTML = allFavorited ? '❤️' : '🤍'; // Or SVG for better control
  
  // Label
  const label = document.createElement('span');
  label.className = 'qpm-bulk-fav-label';
  label.textContent = species;
  
  button.append(sprite, heart, label);
  return button;
}
```

### 5. CSS Styles

```css
.qpm-bulk-fav-btn {
  position: relative;
  width: 72px;
  height: 88px;
  background: rgba(0, 0, 0, 0.85);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.15s ease;
  padding: 8px 4px 4px;
}

.qpm-bulk-fav-btn:hover {
  transform: scale(1.05);
}

.qpm-bulk-fav-btn img {
  width: 48px;
  height: 48px;
  object-fit: contain;
}

.qpm-bulk-fav-heart {
  position: absolute;
  top: 4px;
  right: 4px;
  font-size: 14px;
}

.qpm-bulk-fav-heart.filled {
  color: #ff4444;
}

.qpm-bulk-fav-heart.outline {
  color: #ffffff;
  opacity: 0.8;
}

.qpm-bulk-fav-label {
  color: #ffffff;
  font-size: 11px;
  font-weight: 600;
  text-align: center;
  margin-top: 4px;
  text-shadow: 0 1px 2px rgba(0,0,0,0.8);
}
```

### 6. Toggle Logic (Simple, No Sync Mode)

```typescript
async function toggleSpeciesFavorite(species: string, itemIds: string[]): Promise<void> {
  const favoritedIds = getFavoritedItemIds();
  const allFavorited = itemIds.every(id => favoritedIds.has(id));
  
  // If all favorited -> unfavorite all
  // If not all favorited -> favorite all unfavorited
  const idsToToggle = allFavorited 
    ? itemIds // Unfavorite all
    : itemIds.filter(id => !favoritedIds.has(id)); // Favorite only unfavorited
  
  for (const itemId of idsToToggle) {
    sendFavoriteToggle(itemId);
    await delay(40); // Small delay between messages
  }
  
  // Update UI after toggle
  updateButtonState(species);
}
```

## Integration Points

### Main.ts Integration
```typescript
// In main.ts initialization
import { startBulkFavorite, stopBulkFavorite } from './features/bulkFavorite';

// Start after inventory store is ready
await startBulkFavorite();
```

### Future Config Panel Hook
```typescript
// Export config interface for future UI integration
export interface BulkFavoriteConfig {
  enabled: boolean;
  buttonSize: 'small' | 'medium' | 'large';
  showLabels: boolean;
}

export function setBulkFavoriteConfig(config: Partial<BulkFavoriteConfig>): void;
export function getBulkFavoriteConfig(): BulkFavoriteConfig;
```

## Cross-Reference Notes

### Aries Mod (https://github.com/Ariedam64/MagicGarden-modMenu)
- Uses similar WebSocket pattern for game interactions
- Has crop locker feature with weather/mutation filters (more complex than what we need)
- Sprite system loads from game's PIXI textures

### MGTools (https://github.com/Myke247/MGTools)
- Alternative mod with similar functionality
- Different approach to inventory management

### Game Native UI
- Favorited items show filled red heart (❤️) in top-right
- Unfavorited items show white outline heart (🤍)
- Items display: sprite, name, weight (we skip weight)

## Migration Plan

1. **Create new feature file** - `src/features/bulkFavorite.ts`
2. **Test in parallel** - Both old and new can coexist briefly
3. **Remove old feature** - Delete `src/features/cropTypeLocking.ts`
4. **Update references** - Update main.ts, remove old imports

## Testing Checklist

- [ ] Opens sidebar when inventory modal appears
- [ ] Closes sidebar when inventory modal closes
- [ ] Shows correct produce species from inventory
- [ ] Sprites render correctly for all species
- [ ] Heart indicator shows correct state (filled/outline)
- [ ] Clicking button toggles favorites for all items of that species
- [ ] Button hover effect works
- [ ] Tooltip displays correctly
- [ ] Works on Firefox and Chrome
- [ ] Performance acceptable on low-end systems
- [ ] No memory leaks (MutationObserver properly disconnected)

## Files to Modify

1. **CREATE:** `src/features/bulkFavorite.ts`
2. **MODIFY:** `src/main.ts` - Replace cropTypeLocking import/call
3. **DELETE:** `src/features/cropTypeLocking.ts` (1,968 lines)
4. **MODIFY:** `src/ui/originalPanel.ts` - Remove Inventory Locker section if present

---

*Document created: 2025-12-23*
*Status: Ready for implementation*





