// src/ui/shopRestockAlerts/index.ts
// Public lifecycle entry — startShopRestockAlerts / stopShopRestockAlerts.

import { log } from '../../utils/logger';
import { storage } from '../../utils/storage';
import { onSpritesReady } from '../../sprite-v2/compat';
import { getShopStockState, onShopStock, startShopStockStore } from '../../store/shopStock';
import { onInventoryChange, startInventoryStore } from '../../store/inventory';
import { getAtomByLabel, subscribeAtom } from '../../core/jotaiBridge';
import {
  DISMISSED_CYCLES_KEY,
  ALERT_STYLE_ID,
  MY_DATA_ATOM_LABEL,
  MY_TOOL_INVENTORY_ATOM_LABEL,
  TRACKED_UPDATED_EVENT,
} from './types';
import {
  alertState,
  activeAlerts,
  alertSpriteUrlCache,
  pendingOwnershipConfirmations,
  dismissedCyclesByKey,
  dismissedInStockKeys,
  debugLastStockStateByKey,
  fallbackCycleByKey,
  lastSeenStockQtyByKey,
  ownershipListeners,
} from './alertState';
import {
  clearPendingOwnershipConfirmation,
  debugLog,
  handleInventorySnapshot,
  handleMyDataSnapshot,
  handleToolInventorySnapshot,
} from './ownershipTracker';
import { processShopStock, loadDismissedCycles } from './stockProcessor';
import { applyAlertSprite, removeAlert } from './alertDom';

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export function startShopRestockAlerts(): void {
  if (alertState.started) return;
  try {
    alertState.started = true;
    debugLog('Starting shop restock alerts');
    dismissedInStockKeys.clear();
    debugLastStockStateByKey.clear();
    fallbackCycleByKey.clear();
    lastSeenStockQtyByKey.clear();
    alertSpriteUrlCache.clear();
    storage.remove(DISMISSED_CYCLES_KEY);
    loadDismissedCycles();
    ownershipListeners.clear();
    for (const key of Array.from(pendingOwnershipConfirmations.keys())) {
      clearPendingOwnershipConfirmation(key);
    }
    alertState.inventoryKeyCounts        = new Map<string, number>();
    alertState.inventoryKeyItemQuantities = new Map<string, Map<string, number>>();
    alertState.seedSiloKeyCounts         = new Map<string, number>();
    alertState.decorShedKeyCounts        = new Map<string, number>();
    alertState.toolInventoryKeyCounts    = new Map<string, number>();
    alertState.hasInventoryBaseline      = false;
    alertState.hasSeedSiloBaseline       = false;
    alertState.hasDecorShedBaseline      = false;
    alertState.hasToolInventoryBaseline  = false;

    void startShopStockStore().then(() => {
      if (!alertState.started) return;
      alertState.stopStockListener = onShopStock((state) => {
        processShopStock(state);
      }, true);
    }).catch((error) => {
      log('[ShopRestockAlerts] Failed to start shop stock store', error);
    });

    void startInventoryStore().then(() => {
      if (!alertState.started) return;
      alertState.stopInventoryListener = onInventoryChange((data) => {
        handleInventorySnapshot(data);
      }, true);
    }).catch((error) => {
      log('[ShopRestockAlerts] Failed to start inventory store', error);
    });

    const myDataAtom = getAtomByLabel(MY_DATA_ATOM_LABEL);
    if (myDataAtom) {
      void subscribeAtom<unknown>(myDataAtom, (value) => {
        handleMyDataSnapshot(value);
      }).then((unsubscribe) => {
        if (!alertState.started) {
          unsubscribe();
          return;
        }
        alertState.stopMyDataListener = unsubscribe;
      }).catch((error) => {
        log('[ShopRestockAlerts] Failed to subscribe to myDataAtom', error);
      });
    }

    const toolInventoryAtom = getAtomByLabel(MY_TOOL_INVENTORY_ATOM_LABEL);
    if (toolInventoryAtom) {
      void subscribeAtom<unknown>(toolInventoryAtom, (value) => {
        handleToolInventorySnapshot(value);
      }).then((unsubscribe) => {
        if (!alertState.started) {
          unsubscribe();
          return;
        }
        alertState.stopToolInventoryListener = unsubscribe;
      }).catch((error) => {
        log('[ShopRestockAlerts] Failed to subscribe to myToolInventoryAtom', error);
      });
    }

    alertState.stopSpritesReadyListener = onSpritesReady(() => {
      alertSpriteUrlCache.clear();
      for (const active of activeAlerts.values()) {
        applyAlertSprite(active, active.model);
      }
    });

    alertState.trackedChangedHandler = () => {
      processShopStock(getShopStockState());
    };
    window.addEventListener(TRACKED_UPDATED_EVENT, alertState.trackedChangedHandler as EventListener);
  } catch (error) {
    alertState.started = false;
    log('[ShopRestockAlerts] start failed', error);
  }
}

export function stopShopRestockAlerts(): void {
  if (!alertState.started) return;
  alertState.started = false;
  debugLog('Stopping shop restock alerts');

  alertState.stopStockListener?.();
  alertState.stopStockListener = null;
  alertState.stopInventoryListener?.();
  alertState.stopInventoryListener = null;
  alertState.stopMyDataListener?.();
  alertState.stopMyDataListener = null;
  alertState.stopToolInventoryListener?.();
  alertState.stopToolInventoryListener = null;
  alertState.stopSpritesReadyListener?.();
  alertState.stopSpritesReadyListener = null;
  if (alertState.trackedChangedHandler) {
    window.removeEventListener(TRACKED_UPDATED_EVENT, alertState.trackedChangedHandler as EventListener);
    alertState.trackedChangedHandler = null;
  }

  dismissedInStockKeys.clear();
  dismissedCyclesByKey.clear();
  debugLastStockStateByKey.clear();
  fallbackCycleByKey.clear();
  lastSeenStockQtyByKey.clear();
  alertSpriteUrlCache.clear();
  ownershipListeners.clear();
  for (const key of Array.from(pendingOwnershipConfirmations.keys())) {
    clearPendingOwnershipConfirmation(key);
  }
  alertState.inventoryKeyCounts         = new Map<string, number>();
  alertState.inventoryKeyItemQuantities = new Map<string, Map<string, number>>();
  alertState.seedSiloKeyCounts          = new Map<string, number>();
  alertState.decorShedKeyCounts         = new Map<string, number>();
  alertState.toolInventoryKeyCounts     = new Map<string, number>();
  alertState.hasInventoryBaseline       = false;
  alertState.hasSeedSiloBaseline        = false;
  alertState.hasDecorShedBaseline       = false;
  alertState.hasToolInventoryBaseline   = false;
  alertState.currentCoinsCount     = 0;
  alertState.hasCoinsBaseline      = false;
  for (const key of Array.from(activeAlerts.keys())) {
    removeAlert(key);
  }
  document.getElementById(ALERT_STYLE_ID)?.remove();
}
