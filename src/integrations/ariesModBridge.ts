// src/integrations/ariesModBridge.ts
// Bridge to access Aries mod's pet ability logs and stats for extended history

import { pageWindow } from '../core/pageContext';
import { log } from '../utils/logger';

/**
 * Aries mod stores extended pet ability logs on the window object.
 * This bridge provides type-safe access to that data.
 */

export interface AriesPetLog {
  abilityId: string;
  performedAt: number;
  petId?: string;
  slotId?: string;
  slotIndex?: number;
  data?: unknown;
  [key: string]: unknown;
}

export interface AriesAbilityStats {
  abilityId: string;
  totalProcs: number;
  lastProcAt: number;
  [key: string]: unknown;
}

export interface AriesStatsSnapshot {
  createdAt?: number;
  garden?: {
    totalPlanted: number;
    totalHarvested: number;
    totalDestroyed: number;
    watercanUsed: number;
    waterTimeSavedMs: number;
  };
  shops?: {
    seedsBought: number;
    decorBought: number;
    eggsBought: number;
    toolsBought: number;
    cropsSoldCount: number;
    cropsSoldValue: number;
    petsSoldCount: number;
    petsSoldValue: number;
  };
  pets?: {
    hatchedByType: Record<string, {
      normal: number;
      gold: number;
      rainbow: number;
    }>;
  };
  abilities?: Record<string, {
    triggers: number;
    totalValue: number;
  }>;
  weather?: Record<string, {
    triggers: number;
  }>;
}

interface AriesModData {
  petAbilityLogs?: AriesPetLog[];
  abilityStats?: Record<string, AriesAbilityStats>;
  petLogs?: AriesPetLog[];
  stats?: {
    abilities?: Record<string, AriesAbilityStats>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Attempts to access Aries mod data from various possible locations on the window object
 */
function getAriesModData(): AriesModData | null {
  try {
    const win = pageWindow as any;

    // Try multiple possible locations where Aries mod might store data
    const candidates = [
      win.AriesMod,
      win.ariesMod,
      win.ARIES_MOD,
      win.MagicGardenMods?.Aries,
      win.MagicGardenMods?.aries,
      win.__ARIES_MOD__,
      win.__ariesMod__,
    ];

    for (const candidate of candidates) {
      if (candidate && typeof candidate === 'object') {
        return candidate as AriesModData;
      }
    }

    return null;
  } catch (error) {
    log('⚠️ Failed to access Aries mod data', error);
    return null;
  }
}

/**
 * Get pet ability logs from Aries mod
 * Returns an empty array if Aries mod is not available
 */
export function getAriesPetLogs(): AriesPetLog[] {
  try {
    const ariesData = getAriesModData();
    if (!ariesData) {
      return [];
    }

    // Try multiple possible locations for pet logs
    const logs = ariesData.petAbilityLogs
      || ariesData.petLogs
      || [];

    if (Array.isArray(logs)) {
      return logs as AriesPetLog[];
    }

    return [];
  } catch (error) {
    log('⚠️ Failed to get Aries pet logs', error);
    return [];
  }
}

/**
 * Get ability statistics from Aries mod
 */
export function getAriesAbilityStats(): Record<string, AriesAbilityStats> {
  try {
    const ariesData = getAriesModData();
    if (!ariesData) {
      return {};
    }

    // Try multiple possible locations for ability stats
    const stats = ariesData.abilityStats
      || ariesData.stats?.abilities
      || {};

    if (stats && typeof stats === 'object') {
      return stats as Record<string, AriesAbilityStats>;
    }

    return {};
  } catch (error) {
    log('⚠️ Failed to get Aries ability stats', error);
    return {};
  }
}

/**
 * Check if Aries mod is available
 */
export function isAriesModAvailable(): boolean {
  return getAriesModData() !== null;
}

/**
 * Subscribe to Aries mod pet log updates
 * Returns unsubscribe function
 */
export function subscribeToAriesLogs(callback: (logs: AriesPetLog[]) => void): () => void {
  let lastLogLength = 0;
  let disposed = false;

  const checkForUpdates = () => {
    if (disposed) return;

    try {
      const logs = getAriesPetLogs();

      // Only trigger callback if logs have changed
      if (logs.length !== lastLogLength) {
        lastLogLength = logs.length;
        callback(logs);
      }
    } catch (error) {
      log('⚠️ Failed checking Aries log updates', error);
    }
  };

  // Check every 2 seconds for new logs
  const interval = setInterval(checkForUpdates, 2000);

  // Initial check
  checkForUpdates();

  return () => {
    disposed = true;
    clearInterval(interval);
  };
}

/**
 * Get all ability logs from Aries mod for a specific ability
 */
export function getAriesLogsForAbility(abilityId: string): AriesPetLog[] {
  const allLogs = getAriesPetLogs();
  return allLogs.filter(log => log.abilityId === abilityId);
}

/**
 * Get all ability logs from Aries mod for a specific pet
 */
export function getAriesLogsForPet(petId: string): AriesPetLog[] {
  const allLogs = getAriesPetLogs();
  return allLogs.filter(log => log.petId === petId || log.slotId === petId);
}

/**
 * Get stats snapshot from Aries mod
 * Returns null if Aries mod is not available or stats not found
 */
export function getAriesStats(): AriesStatsSnapshot | null {
  try {
    const ariesData = getAriesModData();
    if (!ariesData) {
      return null;
    }

    // Try multiple possible locations for stats
    const statsService = (ariesData as any).StatsService
      || (ariesData as any).statsService
      || (ariesData as any).stats;

    if (statsService && typeof statsService === 'object') {
      // Try to get snapshot from service
      if (typeof statsService.getSnapshot === 'function') {
        const snapshot = statsService.getSnapshot();
        if (snapshot && typeof snapshot === 'object') {
          return snapshot as AriesStatsSnapshot;
        }
      }

      // Try to access stats directly
      if (statsService.garden || statsService.pets || statsService.abilities) {
        return statsService as AriesStatsSnapshot;
      }
    }

    // Try direct stats property on window
    const win = pageWindow as any;
    if (win.qwsStats || win.AriesStats || win.MGStats) {
      const stats = win.qwsStats || win.AriesStats || win.MGStats;
      if (stats && typeof stats === 'object') {
        return stats as AriesStatsSnapshot;
      }
    }

    return null;
  } catch (error) {
    log('⚠️ Failed to get Aries stats', error);
    return null;
  }
}
