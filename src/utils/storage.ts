// src/utils/storage.ts
declare const GM_getValue: ((key: string) => string | undefined) | undefined;
declare const GM_setValue: ((key: string, value: string) => void) | undefined;
declare const GM_deleteValue: ((key: string) => void) | undefined;
declare const GM_listValues: (() => string[]) | undefined;

export interface Storage {
  get<T = any>(key: string, fallback?: T): T;
  set(key: string, value: any): void;
  remove(key: string): void;
  clear(): void;
}

/**
 * All QPM storage keys (for comprehensive clearing)
 */
const QPM_STORAGE_KEYS = [
  // Shop Restock Tracker
  'qpm.shopRestocks.v1',
  'qpm.shopRestockConfig.v1',
  'qpm.shopRestocks.migration',
  'qpm.shopQuadModalSpike.v1',

  // XP Tracker
  'qpm.xpTrackerProcs.v1',
  'qpm.xpTrackerConfig.v1',
  'qpm.petXpObservations.v1',

  // Auto Favorite
  'qpm.autoFavorite.v1',
  'qpm.bulkFavorite.v1',
  'qpm.autoReconnect.enabled.v1',
  'qpm.autoReconnect.delayMs.v1',

  // Pet Hatching Tracker
  'qpm.petHatchingTracker.knownPetIds.v1',
  'qpm.hatchStats.v1',

  // Stats
  'quinoa:stats:v1',

  // Mutation Tracking
  'qpm.mutationValueTracking.v1',
  'qpm.weatherMutationTracking.v1',

  // Pet Food Rules
  'quinoa-pet-food-rules',

  // XP Tracker window layout
  'qpm.xpTrackerWindow.layout.v1',

  // Ability Tracker window layout
  'qpm.trackerWindow.layout.v1',

  // Turtle Timer window layout
  'qpm.turtleTimerWindow.layout.v1',

  // UI State
  'quinoa-ui-panel-position',
  'quinoa-ui-panel-collapsed',
  'quinoa-ui-notifications-collapsed',
  'quinoa-ui-notifications-detail-expanded',
  'quinoa-ui-tracker-target-mode',
  'quinoa-ui-tracker-target-pet',
  'quinoa-ui-tracker-ability-filter',
  'quinoa-ui-mutation-tracker-source',
  'quinoa-ui-mutation-tracker-detail',
  'qpm-tracker-settings',

  // Main data
  'quinoa-pet-manager',
  'quinoaData',

  // Player identity
  'quinoa:selfPlayerId',

  // Pet Teams
  'qpm.petTeams.config.v1',
  'qpm.petTeams.feedPolicy.v1',
  'qpm.petTeams.logs.v1',
  'qpm.petTeams.uiState.v1',
  'qpm.petFloatingCards.v1',

  // Shop Restock (Supabase)
  'qpm.restockCache',
  'qpm.restockCache.v2',
  'qpm.restockCache.v3',
  'qpm.restock.refreshBudget.v1',
  'qpm.dashboardModules',

  // Pet Optimizer
  'qpm.petOptimizer.config.v4',
  'petOptimizer:config.v2',
  'petOptimizer:config.v3',

  // Sprite Debug
  'qpm.debug.sprite.allowLegacyFallbackOnKtx2',

  // Activity Log Enhancer
  'qpm.activityLogEnhanced.entries.v1',
  'qpm.activityLogEnhanced.entries.v2',
  'qpm.activityLogEnhanced.entries.v3',
  'qpm.activityLogEnhanced.filters.v1',
  'qpm.activityLog.history.v1',
  'qpm.activityLog.history.backup.v1',
  'qpm.activityLog.history.meta.v1',
  'qpm.activityLog.filter.action.v1',
  'qpm.activityLog.filter.type.v1',
  'qpm.activityLog.filter.order.v1',
  'qpm.activityLog.filter.petSpecies.v1',
  'qpm.activityLog.filter.plantSpecies.v1',
  'qpm.activityLog.migration.v1',
  'qpm.activityLog.ariesImport.v1',
  'qpm.activityLog.enabled.v1',
  'qpm.activityLog.debug.summary.v1',

  // Sell All Pets
  'qpm.petTeams.sellAllPets.v1',

  // Controller
  'qpm.controller.enabled.v1',
  'qpm.controller.bindings.v1',
  'qpm.controller.cursorSpeed.v1',

  // Storage Value
  'qpm.storageValue.v1',
  'qpm.trackers.storageValue.migrated.v1',

  // Texture Manipulator
  'qpm.textureSwaps.v1',
];

export const storage: Storage = {
  get<T = any>(key: string, fallback: T = null as T): T {
    try {
      if (typeof GM_getValue === 'function') {
        const raw = GM_getValue(key);
        if (raw == null) return fallback;
        try {
          return JSON.parse(raw);
        } catch {
          return raw as T;
        }
      }
    } catch {}

    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  },

  set(key: string, value: any): void {
    try {
      if (typeof GM_setValue === 'function') {
        GM_setValue(key, JSON.stringify(value));
        return;
      }
    } catch {}

    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  },

  remove(key: string): void {
    try {
      if (typeof GM_deleteValue === 'function') {
        GM_deleteValue(key);
        return;
      }
    } catch {}

    try {
      localStorage.removeItem(key);
    } catch {}
  },

  /**
   * Clear all QPM data from both GM storage and localStorage
   */
  clear(): void {
    let cleared = 0;

    // Clear from GM storage (if available)
    try {
      if (typeof GM_deleteValue === 'function' && typeof GM_listValues === 'function') {
        const allKeys = GM_listValues();
        for (const key of allKeys) {
          if (QPM_STORAGE_KEYS.includes(key) || key.startsWith('qpm.') || key.startsWith('quinoa')) {
            GM_deleteValue(key);
            cleared++;
          }
        }
      }
    } catch (error) {
      console.error('[QPM Storage] Error clearing GM storage:', error);
    }

    // Clear from localStorage
    try {
      for (const key of QPM_STORAGE_KEYS) {
        if (localStorage.getItem(key) !== null) {
          localStorage.removeItem(key);
          cleared++;
        }
      }

      // Also clear any keys that start with qpm. or quinoa
      const allLocalKeys = Object.keys(localStorage);
      for (const key of allLocalKeys) {
        if (key.startsWith('qpm.') || key.startsWith('quinoa')) {
          localStorage.removeItem(key);
          cleared++;
        }
      }
    } catch (error) {
      console.error('[QPM Storage] Error clearing localStorage:', error);
    }

    console.log(`[QPM Storage] Cleared ${cleared} storage keys`);
  }
};
