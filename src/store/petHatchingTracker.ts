// src/store/petHatchingTracker.ts
// Tracks pet hatching events by monitoring pet collection changes
// Integrates with auto-favorite to favorite rare pets

import { getAtomByLabel, subscribeAtom } from '../core/jotaiBridge';
import { recordPetHatch } from './stats';
import { log } from '../utils/logger';

const PET_INFOS_LABEL = 'myPetInfosAtom'; // Contains all owned pets
let started = false;
let unsubscribe: (() => void) | null = null;

interface PetInfo {
  id?: string;
  species?: string;
  name?: string;
  targetScale?: number; // Used to determine rarity: 1.0 = normal, 1.15 = gold, 1.3 = rainbow
  rarity?: string;
  isGold?: boolean;
  isRainbow?: boolean;
  [key: string]: unknown;
}

// Track known pet IDs to detect new hatches
let knownPetIds = new Set<string>();

function determinePetRarity(pet: PetInfo): 'normal' | 'gold' | 'rainbow' {
  // Method 1: Check explicit rarity property
  if (pet.rarity) {
    const rarityLower = String(pet.rarity).toLowerCase();
    if (rarityLower.includes('rainbow')) return 'rainbow';
    if (rarityLower.includes('gold')) return 'gold';
  }

  // Method 2: Check boolean flags
  if (pet.isRainbow === true) return 'rainbow';
  if (pet.isGold === true) return 'gold';

  // Method 3: Check targetScale (common pattern in Magic Garden)
  // Normal = 1.0, Gold = 1.15, Rainbow = 1.3
  if (pet.targetScale !== undefined && typeof pet.targetScale === 'number') {
    if (pet.targetScale >= 1.25) return 'rainbow'; // Rainbow threshold
    if (pet.targetScale >= 1.1) return 'gold';     // Gold threshold
  }

  // Method 4: Check name for Rainbow/Gold prefix
  if (pet.name || pet.species) {
    const nameStr = String(pet.name || pet.species).toLowerCase();
    if (nameStr.startsWith('rainbow ')) return 'rainbow';
    if (nameStr.startsWith('gold ')) return 'gold';
  }

  // Default to normal
  return 'normal';
}

function extractPetInfos(value: unknown): PetInfo[] {
  if (!value || typeof value !== 'object') {
    return [];
  }

  // Handle both array and object formats
  if (Array.isArray(value)) {
    return value.filter(pet => pet && typeof pet === 'object') as PetInfo[];
  }

  // Handle object with pet entries
  const data = value as Record<string, unknown>;
  const pets: PetInfo[] = [];

  for (const entry of Object.values(data)) {
    if (entry && typeof entry === 'object') {
      pets.push(entry as PetInfo);
    }
  }

  return pets;
}

function detectNewPets(pets: PetInfo[]): void {
  const now = Date.now();
  const currentPetIds = new Set<string>();

  for (const pet of pets) {
    const petId = pet.id || `${pet.species}-${Math.random()}`;
    currentPetIds.add(petId);

    // Check if this is a new pet (not seen before)
    if (!knownPetIds.has(petId)) {
      const rarity = determinePetRarity(pet);
      recordPetHatch(rarity, now);

      const speciesName = pet.name || pet.species || 'Unknown';
      log(`🥚 Detected new ${rarity} pet hatched: ${speciesName}`);
    }
  }

  // Update known pets
  knownPetIds = currentPetIds;
}

function processPetData(value: unknown): void {
  const pets = extractPetInfos(value);

  if (pets.length > 0) {
    detectNewPets(pets);
  }
}

export async function startPetHatchingTracker(): Promise<void> {
  if (started) return;

  const atom = getAtomByLabel(PET_INFOS_LABEL);
  if (!atom) {
    log('⚠️ Pet infos atom not found, pet hatching tracking disabled');
    return;
  }

  let isFirstCall = true;

  try {
    unsubscribe = await subscribeAtom(atom, (value) => {
      try {
        if (isFirstCall) {
          // On first call, initialize known pets without recording hatches
          isFirstCall = false;
          const pets = extractPetInfos(value);
          for (const pet of pets) {
            const petId = pet.id || `${pet.species}-${Math.random()}`;
            knownPetIds.add(petId);
          }
          log(`✅ Pet hatching tracker initialized with ${knownPetIds.size} existing pets`);
        } else {
          // On subsequent calls, detect new pets
          processPetData(value);
        }
      } catch (error) {
        log('⚠️ Failed processing pet hatching data', error);
      }
    });

    started = true;
    log('✅ Pet hatching tracker started');
  } catch (error) {
    log('⚠️ Failed to start pet hatching tracker', error);
    throw error;
  }
}

export function stopPetHatchingTracker(): void {
  unsubscribe?.();
  unsubscribe = null;
  started = false;
  knownPetIds.clear();
  log('🛑 Pet hatching tracker stopped');
}

export function isPetHatchingTrackerStarted(): boolean {
  return started;
}
