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
  'qpm.restock.dismissedCycles.v1',
  'qpm.restock.detailWindows.v1',
  'qpm.restock.detailScale.v1',
  'qpm.restock.soundConfig.v1',
  'qpm.restock.customSounds.v1',
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

  // Action Guard (Locker)
  'qpm.locker.config.v1',

  // Crop Boost / Size Indicator / Tile Value
  'cropBoostTracker:config',
  'cropSizeIndicator:config',
  'qpm.tileValue.v1',

  // Journal
  'journal:notes',

  // Pet Hutch keybind
  'petHutch:keybind',

  // Public Rooms
  'publicRooms:refreshInterval',
  'player-inspector:journal-expanded',

  // Pet Hub
  'petHub:ariesImportOnce.v1',

  // Pets Window tab
  'qpm.petsWindow.activeTab',

  // Section collapse state
  'qpm.sectionCollapsed',

  // Legacy UI state
  'quinoa-ui-panel-size',
  'quinoa-mutation-reminder-config',

  // Turtle Timer
  'qpm-turtle-manual-overrides',
  'qpm-turtle-completion-log',

  // Garden Filters
  'qpm.gardenFilters.v1',

  // Texture Debug
  'qpm.textureSwaps.debugLogs',

  // Restock cache / tracked
  'qpm.restockCache.v4',
  'qpm.ariedam.gamedata',
  'qpm.restock.tracked',
  'qpm.restock.ui.v1',

  // Hub visible cards
  'qpm.utilityHub.visibleCards',
  'qpm.toolsHub.visibleCards',
  'qpm.trackersHub.visibleTrackers',

  // Stats Hub
  'qpm.statsHub.filters.v1',

  // Turtle Timer tab
  'qpm.turtleTimer.activeTab',

  // Debug globals opt-in
  'qpm.debug.globals.v1',

  // Version checker
  'qpm.versionCheck.v1',
];

/**
 * Dynamic key prefixes for window position/size/state keys that are generated at runtime.
 * These are NOT in QPM_STORAGE_KEYS because the suffixes are per-window-id.
 */
const QPM_DYNAMIC_KEY_PREFIXES = [
  'qpm-window-pos-',
  'qpm-window-size-',
  'qpm-window-state-',
] as const;

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

/**
 * Returns true if `key` is a recognised QPM storage key.
 * Matches: anything in QPM_STORAGE_KEYS, or prefixed with qpm. / quinoa,
 * or a dynamic window-position/size/state key.
 */
function isQpmKey(key: string): boolean {
  if (QPM_STORAGE_KEYS.includes(key)) return true;
  if (key.startsWith('qpm.') || key.startsWith('quinoa')) return true;
  if (QPM_DYNAMIC_KEY_PREFIXES.some(p => key.startsWith(p))) return true;
  return false;
}

/**
 * Returns true if `key` is a dynamic window layout key (position, size, state).
 * These are ephemeral UI state and should not be included in exports.
 */
function isDynamicWindowKey(key: string): boolean {
  return QPM_DYNAMIC_KEY_PREFIXES.some(p => key.startsWith(p));
}

/**
 * Serialises all currently-stored QPM values to a plain object of JSON strings.
 *
 * Only exports keys in QPM_STORAGE_KEYS or matching known QPM prefixes (qpm.*, quinoa*).
 * Excludes dynamic window layout keys (position/size/state) — those are ephemeral UI state.
 *
 * Values are returned as JSON strings (the same format that storage.set writes)
 * so they can be written verbatim to localStorage or forwarded to the Starweaver
 * Mod Manager's import pipeline without any further transformation.
 */
export function exportAllValues(): Record<string, string> {
  const out: Record<string, string> = {};

  try {
    if (typeof GM_listValues === 'function') {
      for (const key of GM_listValues()) {
        if (!isQpmKey(key) || isDynamicWindowKey(key)) continue;
        const val = storage.get(key);
        if (val !== null) {
          try { out[key] = JSON.stringify(val); } catch { /* skip non-serialisable */ }
        }
      }
      return out;
    }
  } catch { /* GM_listValues unavailable */ }

  // Fallback: iterate the known key list against localStorage
  for (const key of QPM_STORAGE_KEYS) {
    const val = storage.get(key);
    if (val !== null) {
      try { out[key] = JSON.stringify(val); } catch { /* skip */ }
    }
  }

  return out;
}

/**
 * Writes key→value pairs into storage. Values must already be JSON strings.
 * Returns the number of keys written. Callers control whether to clear() first.
 */
export function importAllValues(data: Record<string, string>): number {
  let count = 0;
  for (const [key, jsonStr] of Object.entries(data)) {
    try {
      const parsed = JSON.parse(jsonStr);
      storage.set(key, parsed);
      count++;
    } catch {
      // Skip malformed entries
    }
  }
  return count;
}
