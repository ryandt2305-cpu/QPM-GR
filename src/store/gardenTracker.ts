// src/store/gardenTracker.ts
// Tracks garden events by monitoring garden state changes
// Integrates with auto-favorite to favorite rare produce

import { getAtomByLabel, subscribeAtom } from '../core/jotaiBridge';
import { recordGardenPlant, recordGardenHarvest, recordGardenDestroy, recordWateringCan } from './stats';
import { log } from '../utils/logger';

const GARDEN_ATOM_LABEL = 'myDataAtom'; // Contains garden state
let started = false;
let unsubscribe: (() => void) | null = null;

interface GardenCell {
  id?: string;
  produce?: {
    id?: string;
    level?: number;
    health?: number;
    rarity?: string;
    isGold?: boolean;
    isRainbow?: boolean;
    targetScale?: number;
    [key: string]: unknown;
  } | null;
  isEmpty?: boolean;
}

interface GardenState {
  cells?: GardenCell[];
  [key: string]: unknown;
}

// Track previous state to detect changes
let previousCellStates = new Map<string, GardenCell>();
let previousWateringCanCount = 0;

// Determine produce rarity using multiple detection methods
function determineProduceRarity(produce: GardenCell['produce']): 'normal' | 'gold' | 'rainbow' {
  if (!produce) return 'normal';

  // Method 1: Check explicit rarity property
  if (produce.rarity) {
    const rarityLower = String(produce.rarity).toLowerCase();
    if (rarityLower.includes('rainbow')) return 'rainbow';
    if (rarityLower.includes('gold')) return 'gold';
  }

  // Method 2: Check boolean flags
  if (produce.isRainbow === true) return 'rainbow';
  if (produce.isGold === true) return 'gold';

  // Method 3: Check targetScale (similar to pets)
  if (produce.targetScale !== undefined && typeof produce.targetScale === 'number') {
    if (produce.targetScale >= 1.25) return 'rainbow';
    if (produce.targetScale >= 1.1) return 'gold';
  }

  return 'normal';
}

function extractGardenData(value: unknown): {
  cells: GardenCell[];
  wateringCans: number;
} {
  if (!value || typeof value !== 'object') {
    return { cells: [], wateringCans: 0 };
  }

  const data = value as Record<string, unknown>;

  // Extract garden cells
  let cells: GardenCell[] = [];
  if (data.garden && typeof data.garden === 'object') {
    const garden = data.garden as Record<string, unknown>;
    if (Array.isArray(garden.cells)) {
      cells = garden.cells;
    }
  } else if (Array.isArray(data.cells)) {
    cells = data.cells;
  }

  // Extract watering can count
  let wateringCans = 0;
  if (data.inventory && typeof data.inventory === 'object') {
    const inventory = data.inventory as Record<string, unknown>;
    wateringCans = typeof inventory.wateringCans === 'number' ? inventory.wateringCans : 0;
  } else if (typeof data.wateringCans === 'number') {
    wateringCans = data.wateringCans;
  }

  return { cells, wateringCans };
}

function detectGardenChanges(cells: GardenCell[]): void {
  const now = Date.now();
  const currentCellStates = new Map<string, GardenCell>();

  let plantsAdded = 0;
  let plantsHarvested = 0;
  let plantsDestroyed = 0;

  for (const cell of cells) {
    const cellId = cell.id || `cell-${cells.indexOf(cell)}`;
    const previousCell = previousCellStates.get(cellId);

    currentCellStates.set(cellId, cell);

    // Detect planting: cell was empty, now has produce
    if (previousCell && (previousCell.isEmpty || !previousCell.produce) && cell.produce && !cell.isEmpty) {
      plantsAdded++;
    }

    // Detect harvesting: cell had fully grown produce, now empty
    // (produce health was at or near max)
    if (previousCell && previousCell.produce && (!cell.produce || cell.isEmpty)) {
      const wasFullyGrown = (previousCell.produce.health ?? 0) >= 90; // Threshold for "fully grown"
      if (wasFullyGrown) {
        plantsHarvested++;
      } else {
        // Produce removed before fully grown = destroyed
        plantsDestroyed++;
      }
    }
  }

  // Record changes
  if (plantsAdded > 0) {
    recordGardenPlant(plantsAdded, now);
    log(`🌱 Detected ${plantsAdded} plant(s) added`);
  }

  if (plantsHarvested > 0) {
    recordGardenHarvest(plantsHarvested, now);
    log(`🌾 Detected ${plantsHarvested} plant(s) harvested`);
  }

  if (plantsDestroyed > 0) {
    recordGardenDestroy(plantsDestroyed, now);
    log(`💥 Detected ${plantsDestroyed} plant(s) destroyed`);
  }

  // Update previous state
  previousCellStates = currentCellStates;
}

function detectWateringCanUse(currentCount: number): void {
  // Watering can count decreases when used
  if (previousWateringCanCount > 0 && currentCount < previousWateringCanCount) {
    const used = previousWateringCanCount - currentCount;
    for (let i = 0; i < used; i++) {
      recordWateringCan(Date.now());
    }
    log(`💧 Detected ${used} watering can(s) used`);
  }

  previousWateringCanCount = currentCount;
}

function processGardenData(value: unknown): void {
  const { cells, wateringCans } = extractGardenData(value);

  if (cells.length > 0) {
    detectGardenChanges(cells);
  }

  if (wateringCans >= 0) {
    detectWateringCanUse(wateringCans);
  }
}

export async function startGardenTracker(): Promise<void> {
  if (started) return;

  const atom = getAtomByLabel(GARDEN_ATOM_LABEL);
  if (!atom) {
    log('⚠️ Garden atom not found, garden tracking disabled');
    return;
  }

  let isFirstCall = true;

  try {
    unsubscribe = await subscribeAtom(atom, (value) => {
      try {
        if (isFirstCall) {
          // On first call, initialize state without recording events
          isFirstCall = false;
          const { cells, wateringCans } = extractGardenData(value);

          // Initialize cell states
          for (const cell of cells) {
            const cellId = cell.id || `cell-${cells.indexOf(cell)}`;
            previousCellStates.set(cellId, cell);
          }

          // Initialize watering can count
          previousWateringCanCount = wateringCans;

          log(`✅ Garden tracker initialized with ${cells.length} cells`);
        } else {
          // On subsequent calls, track changes
          processGardenData(value);
        }
      } catch (error) {
        log('⚠️ Failed processing garden data', error);
      }
    });

    started = true;
    log('✅ Garden tracker started');
  } catch (error) {
    log('⚠️ Failed to start garden tracker', error);
    throw error;
  }
}

export function stopGardenTracker(): void {
  unsubscribe?.();
  unsubscribe = null;
  started = false;
  previousCellStates.clear();
  previousWateringCanCount = 0;
  log('🛑 Garden tracker stopped');
}

export function isGardenTrackerStarted(): boolean {
  return started;
}
