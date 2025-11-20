// src/store/abilityHistoryExtended.ts
// Extended ability history with localStorage persistence for long-term tracking

import { storage } from '../utils/storage';
import { log } from '../utils/logger';
import { onAbilityHistoryUpdate, getAbilityHistorySnapshot, type AbilityHistory, type AbilityEvent } from './abilityLogs';
import { getActivePetInfos, type ActivePetInfo } from './pets';

const STORAGE_KEY = 'qpm.abilityHistoryExtended.v1';
const MAX_HISTORY_ENTRIES = 1000; // Keep last 1000 ability procs
const SAVE_DEBOUNCE_MS = 5000; // Save every 5 seconds when changed

export interface ExtendedAbilityLogEntry {
  petId: string;
  petName: string;
  petSpecies: string;
  petLevel: number;
  timestamp: number; // Local time
  timestampISO: string; // Human-readable timestamp
  abilityId: string;
  abilityName: string;
  abilityLevel: number; // Ability strength/level
  details: string; // What the ability did (e.g., "Generated Rainbow mutation on 3 crops")
  rawData?: unknown; // Store raw event data for debugging
}

let extendedHistory: ExtendedAbilityLogEntry[] = [];
let saveTimer: number | null = null;
let initialized = false;

// Map ability IDs to readable names
const ABILITY_NAMES: Record<string, string> = {
  'GoldGranter': 'Gold Granter',
  'RainbowGranter': 'Rainbow Granter',
  'ProduceScaleBoost': 'Crop Size Boost',
  'ProduceScaleBoostII': 'Crop Size Boost II',
  'ProduceRefund': 'Produce Refund',
  'DoubleHarvest': 'Double Harvest',
  'SellBoostI': 'Sell Boost I',
  'SellBoostII': 'Sell Boost II',
  'SellBoostIII': 'Sell Boost III',
  'SellBoostIV': 'Sell Boost IV',
  'CoinFinderI': 'Coin Finder I',
  'CoinFinderII': 'Coin Finder II',
  'CoinFinderIII': 'Coin Finder III',
  'PetRefund': 'Pet Refund',
  'PetRefundII': 'Pet Refund II',
  'Wet': 'Wet Mutation',
  'Chilled': 'Chilled Mutation',
  'Frozen': 'Frozen Mutation',
  'Dawnlit': 'Dawnlit Mutation',
  'Dawnbound': 'Dawnbound Mutation',
  'Amberlit': 'Amberlit Mutation',
  'Amberbound': 'Amberbound Mutation',
};

function formatAbilityDetails(abilityId: string, data: unknown): string {
  // Try to extract meaningful details from the ability event data
  if (!data || typeof data !== 'object') {
    return 'Ability triggered';
  }

  const eventData = data as Record<string, unknown>;

  // Handle different ability types
  switch (abilityId) {
    case 'GoldGranter':
      return `Generated Gold mutation on ${eventData.affectedCrops || 'crops'}`;
    case 'RainbowGranter':
      return `Generated Rainbow mutation on ${eventData.affectedCrops || 'crops'}`;
    case 'ProduceScaleBoost':
    case 'ProduceScaleBoostII':
      return `Boosted crop size by ${eventData.scaleBoost || '?'}x`;
    case 'ProduceRefund':
      return `Refunded ${eventData.refundedCount || '?'} produce`;
    case 'DoubleHarvest':
      return `Doubled harvest yield`;
    case 'Wet':
    case 'Chilled':
    case 'Frozen':
    case 'Dawnlit':
    case 'Dawnbound':
    case 'Amberlit':
    case 'Amberbound':
      return `Applied ${abilityId} mutation to ${eventData.affectedCrops || '?'} crops`;
    default:
      if (eventData.value) {
        return `Generated value: ${eventData.value}`;
      }
      return 'Ability triggered';
  }
}

function getPetInfoForAbility(petId: string | null): { name: string; species: string; level: number } | null {
  if (!petId) return null;

  const activePets = getActivePetInfos();
  const petInfo = activePets.find((p: ActivePetInfo) => p.petId === petId);

  if (petInfo) {
    return {
      name: petInfo.petName || 'Unknown Pet',
      species: petInfo.species || 'Unknown',
      level: petInfo.level || 1,
    };
  }

  return null;
}

function processAbilityHistory(histories: ReadonlyMap<string, AbilityHistory>): void {
  const now = Date.now();
  const nowISO = new Date(now).toLocaleString();

  // Process each ability history
  for (const [_, history] of histories) {
    if (!history.events || history.events.length === 0) continue;

    // Get the latest event
    const latestEvent = history.events[history.events.length - 1];

    // Check if we've already logged this event (by timestamp)
    const alreadyLogged = extendedHistory.some(
      (entry) =>
        entry.petId === (history.petId || 'unknown') &&
        entry.timestamp === latestEvent.performedAt &&
        entry.abilityId === history.abilityId
    );

    if (alreadyLogged) continue;

    // Get pet info
    const petInfo = getPetInfoForAbility(history.petId);

    // Create extended log entry
    const entry: ExtendedAbilityLogEntry = {
      petId: history.petId || 'unknown',
      petName: petInfo?.name || 'Unknown Pet',
      petSpecies: petInfo?.species || 'Unknown',
      petLevel: petInfo?.level || 1,
      timestamp: latestEvent.performedAt,
      timestampISO: new Date(latestEvent.performedAt).toLocaleString(),
      abilityId: history.abilityId,
      abilityName: ABILITY_NAMES[history.abilityId] || history.abilityId,
      abilityLevel: 1, // TODO: Extract from pet abilities array
      details: formatAbilityDetails(history.abilityId, latestEvent.data),
      rawData: latestEvent.data,
    };

    extendedHistory.push(entry);
  }

  // Keep only the last MAX_HISTORY_ENTRIES
  if (extendedHistory.length > MAX_HISTORY_ENTRIES) {
    extendedHistory = extendedHistory.slice(-MAX_HISTORY_ENTRIES);
  }

  scheduleSave();
}

function scheduleSave(): void {
  if (saveTimer !== null) {
    window.clearTimeout(saveTimer);
  }

  saveTimer = window.setTimeout(() => {
    try {
      storage.set(STORAGE_KEY, {
        version: 1,
        entries: extendedHistory,
        lastUpdated: Date.now(),
      });
      log(`💾 Saved ${extendedHistory.length} extended ability log entries`);
    } catch (error) {
      log('⚠️ Failed to save extended ability history', error);
    }
    saveTimer = null;
  }, SAVE_DEBOUNCE_MS);
}

function loadHistory(): void {
  try {
    const stored = storage.get<{ version: number; entries: ExtendedAbilityLogEntry[]; lastUpdated: number } | null>(
      STORAGE_KEY,
      null
    );

    if (stored && stored.version === 1 && Array.isArray(stored.entries)) {
      extendedHistory = stored.entries;
      log(`📖 Loaded ${extendedHistory.length} extended ability log entries`);
    }
  } catch (error) {
    log('⚠️ Failed to load extended ability history', error);
  }
}

export function initializeExtendedAbilityHistory(): void {
  if (initialized) return;
  initialized = true;

  loadHistory();

  // Subscribe to ability history updates
  onAbilityHistoryUpdate((histories) => {
    processAbilityHistory(histories);
  });

  log('✅ Extended ability history initialized');
}

export function getExtendedAbilityHistory(): ExtendedAbilityLogEntry[] {
  return [...extendedHistory];
}

export function getExtendedAbilityHistoryForPet(petId: string): ExtendedAbilityLogEntry[] {
  return extendedHistory.filter((entry) => entry.petId === petId);
}

export function getExtendedAbilityHistoryForAbility(abilityId: string): ExtendedAbilityLogEntry[] {
  return extendedHistory.filter((entry) => entry.abilityId === abilityId);
}

export function clearExtendedAbilityHistory(): void {
  extendedHistory = [];
  try {
    storage.set(STORAGE_KEY, {
      version: 1,
      entries: [],
      lastUpdated: Date.now(),
    });
    log('🗑️ Cleared extended ability history');
  } catch (error) {
    log('⚠️ Failed to clear extended ability history', error);
  }
}
