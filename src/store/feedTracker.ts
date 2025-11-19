// src/store/feedTracker.ts
// Tracks manual feeding events by monitoring pet hunger and food inventory changes

import { getAtomByLabel, subscribeAtom } from '../core/jotaiBridge';
import { recordFeedManual } from './stats';
import { log } from '../utils/logger';

const MY_DATA_ATOM_LABEL = 'myDataAtom';
let started = false;
let unsubscribe: (() => void) | null = null;

interface PetSlotInfo {
  petId?: string;
  slotId?: string;
  hunger?: number;
  [key: string]: unknown;
}

interface InventoryData {
  food?: number;
  [key: string]: unknown;
}

interface MyData {
  inventory?: InventoryData;
  petSlots?: PetSlotInfo[];
  [key: string]: unknown;
}

// Track previous state to detect changes
let previousFoodCount = 0;
let previousPetHunger = new Map<string, number>();

function extractMyData(value: unknown): MyData | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return value as MyData;
}

function detectManualFeeds(data: MyData): void {
  const currentFoodCount = data.inventory?.food ?? 0;
  const petSlots = data.petSlots ?? [];

  // Check if food decreased
  if (previousFoodCount > 0 && currentFoodCount < previousFoodCount) {
    const foodUsed = previousFoodCount - currentFoodCount;

    // Check if any pet's hunger increased significantly (manual feed increases hunger)
    let manualFeedDetected = false;

    for (const slot of petSlots) {
      const petId = slot.petId || slot.slotId;
      if (!petId) continue;

      const currentHunger = slot.hunger ?? 0;
      const previousHunger = previousPetHunger.get(petId) ?? 0;

      // Manual feed typically increases hunger by a large amount (e.g., 20-50)
      // Natural hunger decay is small (e.g., 0.1-1 per update)
      const hungerChange = currentHunger - previousHunger;

      if (hungerChange > 5) {
        // Significant hunger increase = manual feed
        manualFeedDetected = true;
      }

      // Update tracked hunger
      previousPetHunger.set(petId, currentHunger);
    }

    if (manualFeedDetected) {
      // Record manual feeds (count = food used)
      for (let i = 0; i < foodUsed; i++) {
        recordFeedManual(Date.now());
      }
      log(`🍖 Detected ${foodUsed} manual feed(s)`);
    }
  }

  // Update previous food count
  previousFoodCount = currentFoodCount;

  // Update hunger for any new pets
  for (const slot of petSlots) {
    const petId = slot.petId || slot.slotId;
    if (petId && !previousPetHunger.has(petId)) {
      previousPetHunger.set(petId, slot.hunger ?? 0);
    }
  }
}

function processMyData(value: unknown): void {
  const data = extractMyData(value);
  if (!data) return;

  detectManualFeeds(data);
}

export async function startFeedTracker(): Promise<void> {
  if (started) return;

  const atom = getAtomByLabel(MY_DATA_ATOM_LABEL);
  if (!atom) {
    log('⚠️ myData atom not found, feed tracking disabled');
    return;
  }

  let isFirstCall = true;

  try {
    unsubscribe = await subscribeAtom(atom, (value) => {
      try {
        if (isFirstCall) {
          // On first call, initialize state without recording events
          isFirstCall = false;
          const data = extractMyData(value);
          if (data) {
            previousFoodCount = data.inventory?.food ?? 0;

            // Initialize hunger tracking
            const petSlots = data.petSlots ?? [];
            for (const slot of petSlots) {
              const petId = slot.petId || slot.slotId;
              if (petId) {
                previousPetHunger.set(petId, slot.hunger ?? 0);
              }
            }
          }
          log('✅ Feed tracker initialized');
        } else {
          // On subsequent calls, track changes
          processMyData(value);
        }
      } catch (error) {
        log('⚠️ Failed processing feed data', error);
      }
    });

    started = true;
    log('✅ Feed tracker started');
  } catch (error) {
    log('⚠️ Failed to start feed tracker', error);
    throw error;
  }
}

export function stopFeedTracker(): void {
  unsubscribe?.();
  unsubscribe = null;
  started = false;
  previousFoodCount = 0;
  previousPetHunger.clear();
  log('🛑 Feed tracker stopped');
}

export function isFeedTrackerStarted(): boolean {
  return started;
}
