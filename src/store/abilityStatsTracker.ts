// src/store/abilityStatsTracker.ts
// Tracks cumulative ability statistics by monitoring ability log updates
// Integrates with Aries mod for extended history when available

import { onAbilityHistoryUpdate, getAbilityHistorySnapshot } from './abilityLogs';
import { recordAbilityProc } from './stats';
import { log } from '../utils/logger';
import { getAriesPetLogs, subscribeToAriesLogs, isAriesModAvailable } from '../integrations/ariesModBridge';

// Ability value estimates (same as petEfficiency.ts for consistency)
const ABILITY_VALUE_ESTIMATES: Record<string, number> = {
  // Coin finders
  'CoinFinder': 60000,
  'CoinFinderII': 600000,
  'CoinFinderIII': 5000000,

  // Gold/Rainbow granters
  'GoldGranter': 500000,
  'RainbowGranter': 1000000,

  // Crop size boost
  'ProduceScaleBoost': 50000,
  'ProduceScaleBoostII': 80000,

  // XP boost
  'XPBoost': 30000,
  'XPBoostII': 40000,

  // Growth boosters
  'PlantGrowthBoost': 20000,
  'PlantGrowthBoostII': 30000,
  'EggGrowthBoost': 25000,
  'EggGrowthBoostII': 35000,

  // Sell boosts
  'SellBoostI': 40000,
  'SellBoostII': 50000,
  'SellBoostIII': 60000,
  'SellBoostIV': 70000,

  // Other abilities
  'DoubleHarvest': 100000,
  'ProduceEater': 80000,
  'ProduceRefund': 50000,
};

let started = false;
let unsubscribe: (() => void) | null = null;
let ariesUnsubscribe: (() => void) | null = null;
let processedEventIds = new Set<string>();

function getAbilityValue(abilityId: string): number {
  return ABILITY_VALUE_ESTIMATES[abilityId] ?? 10000; // Default value
}

function processAbilityUpdates(): void {
  const historySnapshot = getAbilityHistorySnapshot();

  for (const history of historySnapshot.values()) {
    for (const event of history.events) {
      // Create unique event ID to avoid duplicates
      const eventId = `${history.abilityId}::${event.performedAt}`;

      if (!processedEventIds.has(eventId)) {
        processedEventIds.add(eventId);

        // Record the ability proc with estimated value
        const value = getAbilityValue(history.abilityId);
        recordAbilityProc(history.abilityId, value, event.performedAt);
      }
    }
  }

  // Clean up old event IDs to prevent memory bloat (keep last 10000)
  if (processedEventIds.size > 10000) {
    const sorted = Array.from(processedEventIds).sort();
    const toKeep = sorted.slice(-10000);
    processedEventIds = new Set(toKeep);
  }
}

function processAriesLogs(): void {
  try {
    const ariesLogs = getAriesPetLogs();

    for (const logEntry of ariesLogs) {
      if (!logEntry.abilityId || !logEntry.performedAt) {
        continue;
      }

      // Create unique event ID to avoid duplicates with our own tracking
      const eventId = `aries::${logEntry.abilityId}::${logEntry.performedAt}`;

      if (!processedEventIds.has(eventId)) {
        processedEventIds.add(eventId);

        // Record the ability proc with estimated value
        const value = getAbilityValue(logEntry.abilityId);
        recordAbilityProc(logEntry.abilityId, value, logEntry.performedAt);
      }
    }

    // Clean up old event IDs to prevent memory bloat (keep last 10000)
    if (processedEventIds.size > 10000) {
      const sorted = Array.from(processedEventIds).sort();
      const toKeep = sorted.slice(-10000);
      processedEventIds = new Set(toKeep);
    }
  } catch (error) {
    log('⚠️ Failed processing Aries logs', error);
  }
}

export async function startAbilityStatsTracker(): Promise<void> {
  if (started) return;

  // Check if Aries mod is available
  const hasAries = isAriesModAvailable();
  if (hasAries) {
    log('📊 Aries mod detected - integrating extended ability logs');
  }

  // Process existing events from our own tracking
  processAbilityUpdates();

  // Process existing events from Aries mod if available
  if (hasAries) {
    processAriesLogs();
  }

  // Subscribe to future updates from our own tracking
  unsubscribe = onAbilityHistoryUpdate(() => {
    try {
      processAbilityUpdates();
    } catch (error) {
      log('⚠️ Failed processing ability stats', error);
    }
  });

  // Subscribe to Aries mod updates if available
  if (hasAries) {
    ariesUnsubscribe = subscribeToAriesLogs(() => {
      try {
        processAriesLogs();
      } catch (error) {
        log('⚠️ Failed processing Aries log updates', error);
      }
    });
  }

  started = true;
  log(`✅ Ability stats tracker started${hasAries ? ' (with Aries integration)' : ''}`);
}

export function stopAbilityStatsTracker(): void {
  unsubscribe?.();
  unsubscribe = null;
  ariesUnsubscribe?.();
  ariesUnsubscribe = null;
  started = false;
  processedEventIds.clear();
  log('🛑 Ability stats tracker stopped');
}

export function isAbilityStatsTrackerStarted(): boolean {
  return started;
}
