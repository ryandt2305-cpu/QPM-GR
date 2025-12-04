// src/features/cropSizeIndicator.ts
// Inject crop size info into game's tooltip/info card when player hovers over crops

import { getGardenSnapshot, onGardenSnapshot } from './gardenBridge';
import { lookupMaxScale } from '../utils/plantScales';
import { log } from '../utils/logger';
import { storage } from '../utils/storage';
import { onAdded } from '../utils/dom';
import { getCropStats, CROP_BASE_STATS } from '../data/cropBaseStats';
import { getGrowSlotIndex, startGrowSlotIndexTracker } from '../store/growSlotIndex';
import { getAtomByLabel, readAtomValue, subscribeAtom } from '../core/jotaiBridge';

interface CropSizeConfig {
  enabled: boolean;
  showForGrowing: boolean;
  showForMature: boolean;
}

const DEFAULT_CONFIG: CropSizeConfig = {
  enabled: true,
  showForGrowing: true,
  showForMature: true,
};

let config: CropSizeConfig = { ...DEFAULT_CONFIG };
let gardenUnsubscribe: (() => void) | null = null;
let domObserverHandle: { disconnect: () => void } | null = null;
let lastSnapshotCache: any = null;

// ============================================================================
// Configuration
// ============================================================================

export function getCropSizeIndicatorConfig(): CropSizeConfig {
  return { ...config };
}

export function setCropSizeIndicatorConfig(updates: Partial<CropSizeConfig>): void {
  config = { ...config, ...updates };
  storage.set('cropSizeIndicator:config', config);
  
  if (config.enabled) {
    startCropSizeIndicator();
  } else {
    stopCropSizeIndicator();
  }
}

function loadConfig(): void {
  const saved = storage.get<CropSizeConfig>('cropSizeIndicator:config', DEFAULT_CONFIG);
  config = { ...DEFAULT_CONFIG, ...saved };
}

// ============================================================================
// Size Calculation
// ============================================================================

function calculateCropSizeInfo(slot: any): { sizePercent: number; scale: number; weight: number; value: number } | null {
  let species = slot.species;
  if (!species) return null;

  // Map species names (MoonCelestial -> moonbinder, DawnCelestial -> dawnbinder)
  const speciesToCropMap: Record<string, string> = {
    'mooncelestial': 'moonbinder',
    'dawncelestial': 'dawnbinder'
  };
  const speciesNormalized = species.toLowerCase();
  const mappedSpecies = speciesToCropMap[speciesNormalized];
  if (mappedSpecies) {
    species = mappedSpecies;
  }

  // Get crop base stats first
  const cropStats = getCropStats(species);
  if (!cropStats) return null;

  // Calculate CURRENT scale from weight (weight = baseWeight * scale)
  const weight = slot.weight ?? 0;
  let currentScale: number;
  
  if (weight > 0 && cropStats.baseWeight > 0) {
    // If we have weight, calculate actual current scale from it
    currentScale = weight / cropStats.baseWeight;
  } else {
    // For mature crops, targetScale IS the actual current scale
    // For growing crops, targetScale is what it's growing towards
    // Priority: slot.scale > targetScale > plantScale
    currentScale = slot.scale ?? slot.targetScale ?? slot.plantScale ?? 1.0;
  }
  
  // Get max scale for this crop (from plantScales.ts lookup)
  const maxScale = lookupMaxScale(speciesNormalized) ?? 2.0;
  
  // Size display formula: maps scale range (1.0 to maxScale) to display range (50 to 100)
  // Example: Pumpkin maxScale=3, so scale 1.0->50, scale 2.0->75, scale 3.0->100
  // Formula: size = 50 + ((currentScale - 1) / (maxScale - 1)) * 50
  const ratio = Math.max(0, Math.min(1, (currentScale - 1.0) / (maxScale - 1.0)));
  const sizePercent = 50 + ratio * 50;

  // Calculate value
  const value = cropStats.baseSellPrice * currentScale;

  return { sizePercent, scale: currentScale, weight, value };
}

// ============================================================================
// Tooltip Injection
// ============================================================================

const INJECTED_MARKER = 'data-qpm-crop-size-injected';

// Aries-style injection: reuses existing span, structured icon + label, idempotent
function ensureSizeIndicator(
  innerContainer: Element,
  text: string,
  markerClass: string = 'qpm-crop-size'
): void {
  // Find or create the main span (reuse if exists, remove duplicates)
  const existingSpans = Array.from(
    innerContainer.querySelectorAll(`:scope > span.${CSS.escape(markerClass)}`)
  ) as HTMLSpanElement[];
  let span: HTMLSpanElement | null = existingSpans[0] ?? null;
  
  // Remove duplicates if multiple exist
  for (let i = 1; i < existingSpans.length; i++) {
    const duplicateSpan = existingSpans[i];
    if (duplicateSpan) {
      duplicateSpan.remove();
    }
  }
  
  // Create if doesn't exist
  if (!span) {
    span = document.createElement('span');
    span.className = markerClass;
  }
  
  // Apply main span styling (matching Aries' pattern but with different color)
  span.style.display = 'block';
  span.style.marginTop = '6px';
  span.style.fontWeight = '700';
  span.style.color = 'rgb(100, 181, 246)'; // Blue for size (Aries uses yellow for price)
  span.style.fontSize = '14px';
  
  // Label class constant
  const LABEL_CLASS = 'qpm-crop-size-label';
  
  // Create or reuse label span (no icon needed)
  let label = span.querySelector(`:scope > span.${CSS.escape(LABEL_CLASS)}`) as HTMLSpanElement;
  if (!label) {
    label = document.createElement('span');
    label.className = LABEL_CLASS;
    label.style.display = 'inline';
    span.appendChild(label);
  }
  
  // Update label text if changed
  if (label.textContent !== text) {
    label.textContent = text;
  }
  
  // Append to inner container if not already there (Aries' pattern)
  if (!span.parentElement || span.parentElement !== innerContainer) {
    innerContainer.appendChild(span);
  }
}

function removeSizeIndicator(element: Element): void {
  const existing = element.querySelector('.qpm-crop-size');
  if (existing) {
    existing.remove();
  }
}

function injectCropSizeInfo(element: Element): void {
  if (!config.enabled || 
      element.classList.contains('qpm-window') || 
      element.closest('.qpm-window')) {
    return;
  }

  // Find the crop name element - try multiple selectors
  let cropNameElement: Element | null = 
    element.querySelector('p.chakra-text.css-1jc0opy') || // Specific class
    element.querySelector('p.chakra-text') ||              // Any chakra text
    Array.from(element.querySelectorAll('p')).find(p => { // Any p with reasonable text
      const text = p.textContent?.trim();
      return text && text.length > 0 && text.length < 50;
    }) ||
    null;
  
  if (!cropNameElement) {
    removeSizeIndicator(element);
    return;
  }

  const cropName = cropNameElement.textContent?.trim();
  
  if (!cropName) {
    removeSizeIndicator(element);
    return;
  }
  
  // Normalize crop name and handle special cases
  let normalizedCropName = cropName.toLowerCase().trim();
  
  // Map fruit/harvest names to their base plant species (as they appear in game data)
  const fruitToPlantMap: Record<string, string> = {
    // Celestial plants - tooltip shows "bulb", species is "celestial", but CROP_BASE_STATS uses "binder"
    'dawnbinder bulb': 'dawnbinder',
    'moonbinder bulb': 'moonbinder',
    'starweaver fruit': 'starweaver',
    // Multi-harvest fruit names
    'lychee fruit': 'lychee',
    'strawberry': 'strawberry',
    'grape': 'grape',
    'pepper': 'pepper',
    'blueberry': 'blueberry',
    'eggplant': 'eggplant',
    'coffee bean': 'coffee',
    'cherry': 'cherry'
  };
  
  const mappedName = fruitToPlantMap[normalizedCropName];
  if (mappedName) {
    normalizedCropName = mappedName;
  }
  
  // Check if this is actually a known crop name (skip decorations, eggs, etc)
  const isKnownCrop = Object.keys(CROP_BASE_STATS).some(crop => crop.toLowerCase() === normalizedCropName);
  
  if (!isKnownCrop) {
    // Not a crop - remove any existing indicator
    removeSizeIndicator(element);
    return;
  }
  
  // Get current garden snapshot first
  const snapshot = lastSnapshotCache || getGardenSnapshot();
  if (!snapshot) {
    return;
  }
  
  // Helper to convert tile index to coordinates
  // Standard garden is 20 cols, boardwalk is variable
  const tileIndexToCoords = (tileIndex: number, isBoardwalk: boolean = false): { x: number; y: number } => {
    // Get cols from snapshot if available, otherwise use default
    const cols = (snapshot as any)?.cols || (snapshot as any)?.map?.cols || 20;
    const x = tileIndex % cols;
    const y = Math.floor(tileIndex / cols);
    return { x, y };
  };
  
  // Collect all matching crops (for multi-harvest and same species on different tiles)
  const matchingCrops: Array<{slot: any, tileKey: string, slotIndex: number, coords: {x: number, y: number}, tile: any}> = [];
  
  // Search through all crops to match this crop name
  const searchCrops = (tiles: Record<string, any> | undefined) => {
    if (!tiles) return;

    for (const [tileKey, tile] of Object.entries(tiles)) {
      // Only process plant tiles (not decorations, eggs, etc)
      if (tile.objectType !== 'plant') {
        continue;
      }
      
      if (!tile.slots || !Array.isArray(tile.slots)) continue;

      for (let slotIndex = 0; slotIndex < tile.slots.length; slotIndex++) {
        const slot = tile.slots[slotIndex];
        if (!slot || !slot.species) continue;

        // Remove mutation prefixes from slot species to match base crop name
        let baseSpecies = slot.species;
        const mutationPrefixes = ['Rainbow', 'Gold', 'Golden', 'Frozen', 'Amber', 'Wet', 'Chilled', 'Dawnlit', 'Dawnbound', 'Amberbound'];
        for (const prefix of mutationPrefixes) {
          if (baseSpecies.startsWith(prefix + ' ')) {
            baseSpecies = baseSpecies.substring(prefix.length + 1);
            break;
          }
        }
        
        // Map species names (DawnCelestial -> dawnbinder, etc.)
        const speciesToCropMap: Record<string, string> = {
          'dawncelestial': 'dawnbinder',
          'mooncelestial': 'moonbinder'
        };
        const mappedSpecies = speciesToCropMap[baseSpecies.toLowerCase()];
        if (mappedSpecies) {
          baseSpecies = mappedSpecies;
        }
        
        // Check if this is the matching crop
        if (baseSpecies.toLowerCase() === normalizedCropName) {
          const tileIndex = parseInt(tileKey, 10);
          const coords = tileIndexToCoords(tileIndex);
          matchingCrops.push({slot, tileKey, slotIndex, coords, tile});
        }
      }
    }
  };
  
  // Search both gardens
  searchCrops(snapshot.tileObjects);
  searchCrops(snapshot.boardwalkTileObjects);
  
  if (matchingCrops.length === 0) {
    // Debug: Show what species names are actually in the garden
    const allSpecies = new Set<string>();
    const debugSearch = (tiles: Record<string, any> | undefined) => {
      if (!tiles) return;
      for (const tile of Object.values(tiles)) {
        if (tile.objectType === 'plant' && tile.slots) {
          for (const slot of tile.slots) {
            if (slot?.species) allSpecies.add(slot.species);
          }
        }
      }
    };
    debugSearch(snapshot.tileObjects);
    debugSearch(snapshot.boardwalkTileObjects);
    
    log(`📐 ⚠️ No match for "${normalizedCropName}" (original: "${cropName}")`);
    log(`📐 Available species: ${Array.from(allSpecies).sort().join(', ')}`);
    return; // No matching crops found
  }
  
  // For multi-harvest plants, use the currently selected grow slot index
  const selectedSlotIndex = getGrowSlotIndex();
  
  let bestMatch = matchingCrops[0]!;
  
  // Try to match using the current tile info (tile index)
  if (currentTileInfoCache) {
    // Match by tile index first
    const tilesMatches = matchingCrops.filter(m => m.tileKey === String(currentTileInfoCache!.tileIndex));
    
    if (tilesMatches.length > 0) {
      // If this tile has multiple slots (multi-harvest) and we have a selected slot index, use it
      if (tilesMatches.length > 1 && selectedSlotIndex !== null && selectedSlotIndex !== undefined) {
        const slotMatch = tilesMatches.find(m => m.slotIndex === selectedSlotIndex);
        bestMatch = slotMatch || tilesMatches[0]!;
      } else {
        bestMatch = tilesMatches[0]!;
      }
    }
  }
  
  const {slot, tileKey, slotIndex, tile} = bestMatch;
  
  // Track using crop + tile + slot + scale to detect changes between different tiles
  const scale = slot.scale ?? slot.targetScale ?? 1.0;
  const contentId = `${normalizedCropName}-${tileKey}-${slotIndex}-${scale.toFixed(3)}`;
  const lastProcessed = element.getAttribute(INJECTED_MARKER);
  
  // Skip if we just processed this exact crop
  if (lastProcessed === contentId) {
    return;
  }
  
  // Remove old indicator before processing new one
  if (lastProcessed) {
    removeSizeIndicator(element);
  }
  
  // Check if we should show this crop based on maturity
  const endTime = slot.endTime ?? 0;
  const isMature = endTime > 0 && Date.now() >= endTime;
  
  if ((isMature && !config.showForMature) || (!isMature && !config.showForGrowing)) {
    return;
  }
  
  const sizeInfo = calculateCropSizeInfo(slot);
  if (!sizeInfo) return;
  
  // Mark what we processed
  element.setAttribute(INJECTED_MARKER, contentId);
  
  // Find the inner container (matching Aries' selectors)
  let innerContainer = element.querySelector('.McFlex.css-1l3zq7') ||
                       element.querySelector('.McFlex.css-11dqzw') ||
                       Array.from(element.querySelectorAll('.McFlex')).find(flex =>
                         flex.className.includes('css-')
                       );

  if (!innerContainer) {
    return; // Can't inject without container
  }

  // Format the size text - floor to show accurate size (game rounds internally)
  const size = Math.floor(sizeInfo.sizePercent);
  const sizeText = `Size: ${size}`;

  // Use Aries-style injection: reuse span, structured DOM
  // This will display alongside Aries Mod value if present (both on separate lines)
  ensureSizeIndicator(innerContainer, sizeText, 'qpm-crop-size');
}

// ============================================================================
// DOM Observation
// ============================================================================

function startTooltipWatcher(): void {
  if (domObserverHandle) return;

  log('📐 Crop Size Indicator: Watching for crop tooltips');

  let pollingInterval: number | null = null;

  // Process tooltips immediately - no debouncing for rapid switching
  const processTooltips = () => {
    const tooltips = document.querySelectorAll('.McFlex.css-fsggty');
    tooltips.forEach(tooltip => {
      injectCropSizeInfo(tooltip);
    });
  };

  // Use MutationObserver to watch for crop info cards being added/changed
  const observer = new MutationObserver(() => {
    processTooltips();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    characterDataOldValue: true
  });

  // Aggressive polling for rapid tile switching - check every 50ms
  pollingInterval = window.setInterval(() => {
    const tooltips = document.querySelectorAll('.McFlex.css-fsggty');
    if (tooltips.length > 0) {
      processTooltips();
    }
  }, 50);

  domObserverHandle = { 
    disconnect: () => {
      observer.disconnect();
      if (pollingInterval !== null) {
        clearInterval(pollingInterval);
      }
    }
  };
  
  // Check for existing tooltips immediately
  processTooltips();
}

function stopTooltipWatcher(): void {
  if (domObserverHandle) {
    domObserverHandle.disconnect();
    domObserverHandle = null;
  }
}

// ============================================================================
// Current Tile Tracking
// ============================================================================

let currentTileInfoCache: { objectType: string; species?: string; tileIndex: number; tileType: string } | null = null;
let tileInfoUnsubscribe: (() => void) | null = null;

async function updateCurrentTileInfo(): Promise<void> {
  try {
    // Get the current tile info atom which has tileType and localTileIndex
    const currentGardenTileAtom = getAtomByLabel('myCurrentGardenTileAtom');
    if (!currentGardenTileAtom) {
      return;
    }
    
    const tileInfo = await readAtomValue<any>(currentGardenTileAtom);
    if (!tileInfo) {
      currentTileInfoCache = null;
      return;
    }
    
    // Get the current tile object
    const currentGardenObjectAtom = getAtomByLabel('myOwnCurrentGardenObjectAtom');
    if (!currentGardenObjectAtom) {
      return;
    }
    
    const tileObject = await readAtomValue<any>(currentGardenObjectAtom);
    if (!tileObject) {
      currentTileInfoCache = null;
      return;
    }
    
    currentTileInfoCache = {
      objectType: tileObject.objectType,
      species: tileObject.species,
      tileIndex: tileInfo.localTileIndex,
      tileType: tileInfo.tileType
    };
  } catch (e) {
    // Silently fail
  }
}

function startCurrentTileTracking(): void {
  if (tileInfoUnsubscribe) return;
  
  log('📐 Starting current tile tracking');
  
  const currentGardenTileAtom = getAtomByLabel('myCurrentGardenTileAtom');
  if (!currentGardenTileAtom) {
    log('📐 ⚠️ myCurrentGardenTileAtom not found');
    return;
  }
  
  // Subscribe to changes
  subscribeAtom(currentGardenTileAtom, () => {
    updateCurrentTileInfo();
  }).then((unsub: () => void) => {
    tileInfoUnsubscribe = unsub;
  }).catch((e: any) => {
    log('📐 ⚠️ Error subscribing to tile info:', e);
  });
  
  // Initial update
  updateCurrentTileInfo();
}

function stopCurrentTileTracking(): void {
  if (tileInfoUnsubscribe) {
    tileInfoUnsubscribe();
    tileInfoUnsubscribe = null;
  }
  currentTileInfoCache = null;
}

// ============================================================================
// Lifecycle
// ============================================================================

function startCropSizeIndicator(): void {
  if (gardenUnsubscribe) return; // Already started

  log('📐 Crop Size Indicator: Starting');
  
  // Start tracking the selected grow slot for multi-harvest plants
  startGrowSlotIndexTracker();
  
  // Start tracking current tile
  startCurrentTileTracking();
  
  // Subscribe to garden changes to keep snapshot cache updated
  gardenUnsubscribe = onGardenSnapshot((snapshot) => {
    lastSnapshotCache = snapshot;
  });

  // Initial snapshot
  lastSnapshotCache = getGardenSnapshot();

  // Start watching for tooltips
  startTooltipWatcher();
}

function stopCropSizeIndicator(): void {
  if (gardenUnsubscribe) {
    gardenUnsubscribe();
    gardenUnsubscribe = null;
  }

  stopTooltipWatcher();
  stopCurrentTileTracking();
  
  log('📐 Crop Size Indicator: Stopped');
}

// ============================================================================
// Public API
// ============================================================================

export function initCropSizeIndicator(): void {
  loadConfig();

  if (config.enabled) {
    startCropSizeIndicator();
  }
}

export { startCropSizeIndicator, stopCropSizeIndicator };
