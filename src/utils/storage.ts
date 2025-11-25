// src/utils/storage.ts
declare const GM_getValue: ((key: string) => string | undefined) | undefined;
declare const GM_setValue: ((key: string, value: string) => void) | undefined;
declare const GM_deleteValue: ((key: string) => void) | undefined;
declare const GM_listValues: (() => string[]) | undefined;

export interface Storage {
  get<T = any>(key: string, fallback?: T): T;
  set(key: string, value: any): void;
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

  // XP Tracker
  'qpm.xpTrackerProcs.v1',
  'qpm.xpTrackerConfig.v1',
  'qpm.petXpObservations.v1',

  // Auto Favorite
  'qpm.autoFavorite.v1',

  // Pet Hatching Tracker
  'qpm.petHatchingTracker.knownPetIds.v1',

  // Stats
  'quinoa:stats:v1',

  // Mutation Tracking
  'qpm.mutationValueTracking.v1',
  'qpm.weatherMutationTracking.v1',

  // Pet Food Rules
  'quinoa-pet-food-rules',

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