// src/main.ts
// Quinoa Pet Manager - Optimized for non-blocking initialization
// Uses cooperative yielding and lazy loading patterns inspired by Aries mod

import { ready, sleep, getGameHudRoot } from './utils/dom';
import { log } from './utils/logger';
import { shareGlobal } from './core/pageContext';
import { storage } from './utils/storage';
import { yieldToBrowser, delay, waitFor } from './utils/scheduling';

// CRITICAL: Import sprite module immediately for PIXI hook setup!
// This side-effect import ensures hooks are created before any async code runs.
// The game calls __PIXI_APP_INIT__ early, so we must have hooks ready.
import './sprite-v2/index';

// Type declaration for unsafeWindow (Tampermonkey/Greasemonkey)
declare const unsafeWindow: (Window & typeof globalThis) | undefined;

// ============================================================================
// CRITICAL: Expose minimal API immediately (before any async work)
// This allows other scripts to detect QPM quickly
// ============================================================================

// Create a lazy-loading proxy for the debug API
// The full API loads on first access to avoid blocking startup
const createLazyQPMApi = () => {
  const api: Record<string, any> = {
    storage,
    __isLazyProxy: true,
    __version: '2.0.0',
    __initialized: false,
  };

  // Lazy getter for full debug API
  api.__getFullApi = async () => {
    const { getDebugApi } = await import('./debug/debugApi');
    const fullApi = await getDebugApi();
    // Merge full API into this object
    Object.assign(api, fullApi);
    api.__isLazyProxy = false;
    api.__initialized = true;
    return fullApi;
  };

  return api;
};

// Expose immediately so other scripts can detect QPM
const QPM_API = createLazyQPMApi();
shareGlobal('QPM', QPM_API);
shareGlobal('QPM_DEBUG_API', QPM_API);

const globalDebugTarget = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
(globalDebugTarget as any).QPM_DEBUG_API = QPM_API;
(globalDebugTarget as any).QPM = QPM_API;

// ============================================================================
// CONFIGURATION
// ============================================================================

const LS_KEY = 'quinoa-pet-manager';
const defaultCfg = {
  enabled: false,
  threshold: 40,
  pollMs: 3000,
  clickCooldownMs: 4000,
  retryDelaySeconds: 15,
  logs: true,
  ui: {
    preventScrollClicks: true,
  },
  inventoryLocker: {
    syncMode: true,
  },
  mutationReminder: {
    enabled: true,
    showNotifications: true,
    highlightPlants: true,
  },
  harvestReminder: {
    enabled: false,
    highlightEnabled: true,
    toastEnabled: true,
    minSize: 80,
    selectedMutations: {
      Rainbow: true,
      Gold: false,
      Frozen: false,
      Wet: false,
      Chilled: false,
      Dawnlit: false,
      Amberlit: false,
      Amberbound: false,
      Dawnbound: false,
    },
  },
  turtleTimer: {
    enabled: true,
    includeBoardwalk: false,
    minActiveHungerPct: 2,
    fallbackTargetScale: 1.5,
    focus: 'latest',
  },
};

function loadCfg() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '{}');
  } catch {
    return {};
  }
}

// ============================================================================
// HELPER REGISTRATION (non-blocking)
// ============================================================================

async function registerHelpers(): Promise<void> {
  // Import these lazily to avoid blocking
  const [
    { resetFriendsCache },
    { openInspectorDirect },
  ] = await Promise.all([
    import('./services/ariesPlayers'),
    import('./ui/publicRoomsWindow'),
  ]);

  // Inspector friend helper
  const inspectFriend = (playerId: string): void => {
    const pid = (playerId || '').trim();
    if (!pid) {
      console.warn('[QPM Inspector] Provide a playerId string.');
      return;
    }
    try {
      localStorage.setItem('quinoa:selfPlayerId', pid);
      resetFriendsCache();
      console.log('[QPM Inspector] self playerId set to', pid);
    } catch (err) {
      console.warn('[QPM Inspector] Unable to persist self playerId', err);
    }
  };

  // Inspector player helper
  const inspectPlayer = (playerId: string, playerName?: string): void => {
    const pid = (playerId || '').trim();
    if (!pid) {
      console.warn('[PublicRooms] Provide a playerId string.');
      return;
    }
    openInspectorDirect(pid, playerName || pid);
  };

  // Register globally
  (window as any).QPM_INSPECT_FRIEND = inspectFriend;
  (window as any).QPM_INSPECT_PLAYER = inspectPlayer;
  
  try {
    shareGlobal('QPM_INSPECT_FRIEND', inspectFriend);
    shareGlobal('QPM_INSPECT_PLAYER', inspectPlayer);
  } catch {
    // Ignore errors
  }
}

// ============================================================================
// GAME DETECTION (non-blocking with yields)
// ============================================================================

async function waitForGame(): Promise<void> {
  log('⏳ Waiting for game to load...');
  
  // Wait for DOM ready
  await ready;
  await yieldToBrowser();
  
  // Wait for game UI with timeout
  const maxWait = 30000;
  const interval = 500;
  const deadline = Date.now() + maxWait;
  
  while (Date.now() < deadline) {
    const hudRoot = getGameHudRoot();
    if (hudRoot) {
      const hudContent = hudRoot.querySelector('canvas, button, [data-tm-main-interface], [data-tm-hud-root]');
      if (hudContent) {
        log('✅ Game UI detected');
        return;
      }
    }

    const anyCanvas = document.querySelector('#App canvas');
    if (anyCanvas) {
      log('✅ Game UI detected');
      return;
    }

    await delay(interval);
  }
  
  log('⚠️ Game UI not detected within timeout, proceeding anyway');
}

// ============================================================================
// MAIN INITIALIZATION (async, non-blocking)
// ============================================================================

async function initialize(): Promise<void> {
  log('🚀 Quinoa Pet Manager initializing...');

  // Load configuration
  const loadedCfg = loadCfg();
  const cfg = {
    ...defaultCfg,
    ...loadedCfg,
    ui: { ...defaultCfg.ui, ...(loadedCfg.ui || {}) },
    inventoryLocker: { ...defaultCfg.inventoryLocker, ...(loadedCfg.inventoryLocker || {}) },
    mutationReminder: { ...defaultCfg.mutationReminder, ...(loadedCfg.mutationReminder || {}) },
    harvestReminder: {
      ...defaultCfg.harvestReminder,
      ...(loadedCfg.harvestReminder || {}),
      selectedMutations: {
        ...defaultCfg.harvestReminder.selectedMutations,
        ...(loadedCfg.harvestReminder?.selectedMutations || {}),
      },
    },
    turtleTimer: {
      ...defaultCfg.turtleTimer,
      ...(loadedCfg.turtleTimer || {}),
    },
  };

  // ============================================================================
  // PHASE 1: Wait for game UI first (fast - no heavy work yet)
  // ============================================================================
  
  await waitForGame();
  
  // Yield to let browser paint
  await yieldToBrowser();

  // ============================================================================
  // PHASE 2: Start sprite system in BACKGROUND (don't wait for it)
  // UI will render without sprites, sprites load in background
  // ============================================================================
  
  // Fire-and-forget sprite initialization - runs in background
  const spriteInitPromise = (async () => {
    // Small delay to let UI render first
    await delay(100);
    
    try {
      const { initSpriteSystem } = await import('./sprite-v2/index');
      const service = await initSpriteSystem();
      
      // Set up sprite service globally
      const { setSpriteService } = await import('./sprite-v2/compat');
      setSpriteService(service);
      shareGlobal('Sprites', service);
      
      // Export sprite inspector
      if (typeof window !== 'undefined') {
        const targetWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        const { inspectPetSprites } = await import('./sprite-v2/compat');
        (targetWindow as any).inspectPetSprites = inspectPetSprites;
      }
      
      log('✅ Sprite system v2 initialized (background)');
      return service;
    } catch (err) {
      log('❌ Sprite system failed to initialize:', err);
      return null;
    }
  })();
  
  // Don't await - let it run in background while we continue initialization

  // ============================================================================
  // PHASE 3: Initialize core systems (parallel where possible)
  // ============================================================================

  // Initialize stores and features in parallel groups
  // Group 1: Core stores (can run in parallel)
  const [
    { initializeStatsStore },
    { initializePetXpTracker },
    { initializeXpTracker },
    { initializeMutationValueTracking },
    { initializeAutoFavorite },
    { initializeAchievements },
    { exposeAriesBridge },
  ] = await Promise.all([
    import('./store/stats'),
    import('./store/petXpTracker'),
    import('./store/xpTracker'),
    import('./features/mutationValueTracking'),
    import('./features/autoFavorite'),
    import('./store/achievements'),
    import('./integrations/ariesBridge'),
  ]);

  // Run sync initializations (these are fast)
  initializeStatsStore();
  initializePetXpTracker();
  initializeXpTracker();
  initializeMutationValueTracking();
  initializeAutoFavorite();
  initializeAchievements();
  exposeAriesBridge();

  await yieldToBrowser();

  // Group 2: Async stores and bridges
  const [
    { startInventoryStore },
    { startSellSnapshotWatcher },
    { startGardenBridge },
  ] = await Promise.all([
    import('./store/inventory'),
    import('./store/sellSnapshot'),
    import('./features/gardenBridge'),
  ]);

  // These can run in parallel
  await Promise.all([
    startInventoryStore(),
    startSellSnapshotWatcher(),
    startGardenBridge(),
  ]);

  await yieldToBrowser();

  // ============================================================================
  // PHASE 4: Initialize features (parallel where safe)
  // ============================================================================

  const [
    { startCropTypeLocking },
    { initializeHarvestReminder, configureHarvestReminder },
    { initializeTurtleTimer, configureTurtleTimer },
    { startMutationReminder },
    { startMutationTracker },
    { startCropBoostTracker },
    { initCropSizeIndicator },
    { initPublicRooms },
  ] = await Promise.all([
    import('./features/cropTypeLocking'),
    import('./features/harvestReminder'),
    import('./features/turtleTimer'),
    import('./features/mutationReminder'),
    import('./features/mutationTracker'),
    import('./features/cropBoostTracker'),
    import('./features/cropSizeIndicator'),
    import('./features/publicRooms'),
  ]);

  // Initialize features
  startCropTypeLocking();
  initializeHarvestReminder({
    enabled: cfg.harvestReminder.enabled,
    highlightEnabled: cfg.harvestReminder.highlightEnabled,
    toastEnabled: cfg.harvestReminder.toastEnabled,
    minSize: cfg.harvestReminder.minSize,
    selectedMutations: cfg.harvestReminder.selectedMutations,
  });
  initializeTurtleTimer(cfg.turtleTimer);
  startMutationReminder();
  startMutationTracker();
  startCropBoostTracker();
  initCropSizeIndicator();
  initPublicRooms();

  // Apply configurations
  configureHarvestReminder({
    enabled: cfg.harvestReminder.enabled,
    highlightEnabled: cfg.harvestReminder.highlightEnabled,
    toastEnabled: cfg.harvestReminder.toastEnabled,
    minSize: cfg.harvestReminder.minSize,
    selectedMutations: cfg.harvestReminder.selectedMutations,
  });
  configureTurtleTimer(cfg.turtleTimer);

  await yieldToBrowser();

  // ============================================================================
  // PHASE 5: Setup garden inspector and validation commands
  // ============================================================================

  const { setupGardenInspector } = await import('./ui/publicRoomsWindow');
  const gardenCommands = setupGardenInspector();
  shareGlobal('QPM_INSPECT_GARDEN', gardenCommands.QPM_INSPECT_GARDEN);
  shareGlobal('QPM_EXPOSE_GARDEN', gardenCommands.QPM_EXPOSE_GARDEN);
  shareGlobal('QPM_CURRENT_TILE', gardenCommands.QPM_CURRENT_TILE);

  // Add to debug API
  QPM_API.inspectGarden = gardenCommands.QPM_INSPECT_GARDEN;
  QPM_API.exposeGarden = gardenCommands.QPM_EXPOSE_GARDEN;
  QPM_API.currentTile = gardenCommands.QPM_CURRENT_TILE;

  const { exposeValidationCommands } = await import('./utils/validationCommands');
  exposeValidationCommands();

  await yieldToBrowser();

  // ============================================================================
  // PHASE 6: Create UI (the heaviest part - but sprites load in background)
  // ============================================================================

  const { createOriginalUI, setCfg } = await import('./ui/originalPanel');
  setCfg(cfg);
  
  // Create UI without waiting for sprites - sprites will hydrate when ready
  await createOriginalUI();

  // Mark initialization complete EARLY - UI is usable now
  QPM_API.__initialized = true;
  log('✅ Quinoa Pet Manager UI ready');

  // ============================================================================
  // PHASE 7: Background tasks (non-blocking, fire-and-forget)
  // ============================================================================

  // Wait for sprite system to complete in background (for full functionality)
  spriteInitPromise.then((service) => {
    log('✅ Sprite system ready - full functionality available');
    
    // Trigger UI refresh for components that need sprites
    // The qpm-sprites-ready event was dispatched by setSpriteService()
    // Some windows may need manual refresh - trigger a pet info refresh to update tracker
    if (service) {
      import('./store/pets').then(({ refreshPetInfoListeners }) => {
        // Small delay to let the event propagate
        setTimeout(() => {
          refreshPetInfoListeners();
          log('🔄 Triggered pet info refresh for sprite-dependent UI');
        }, 100);
      }).catch(() => {});
    }
  }).catch(() => {});

  // Start version checker in background
  import('./utils/versionChecker').then(({ startVersionChecker }) => {
    startVersionChecker();
  }).catch(() => {});

  // Register helpers in background
  registerHelpers().catch(() => {});

  // Show tutorial after a delay (non-blocking)
  setTimeout(async () => {
    try {
      const { showTutorialPopup } = await import('./ui/tutorialPopup');
      showTutorialPopup();
    } catch {
      // Ignore errors
    }
  }, 2000);

  log('✅ Quinoa Pet Manager initialized successfully');
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

// Global error filter to silence noisy external proxy errors
window.addEventListener('error', (event) => {
  try {
    const message = String(event?.message || '');
    if (message.includes("Failed to execute 'contains' on 'Node'")) {
      event.stopImmediatePropagation?.();
      event.preventDefault?.();
      return false;
    }
  } catch {}
  return true;
}, true);

// ============================================================================
// ENTRY POINT - Wrapped in async IIFE for non-blocking execution
// ============================================================================

(async function main() {
  'use strict';
  
  try {
    await initialize();
  } catch (error) {
    console.error('[QuinoaPetMgr] Initialization failed:', error);
  }
})();
