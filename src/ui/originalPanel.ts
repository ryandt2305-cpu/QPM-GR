// src/ui/originalPanel.ts - Complete UI matching the working original
import { onTurtleTimerState, setTurtleTimerEnabled, configureTurtleTimer, getTurtleTimerState, setManualOverride, clearManualOverride, getManualOverride, type PetManualOverride } from '../features/turtleTimer.ts';
import type { TurtleTimerState, TurtleTimerChannel } from '../features/turtleTimer.ts';
import { formatCoins } from '../features/valueCalculator';
import { onNotifications, clearNotifications, type NotificationEvent, type NotificationLevel } from '../core/notifications';
import { createJournalCheckerSection as createJournalCheckerSectionNew } from './journalCheckerSection';
import { isVisible, getGameHudRoot } from '../utils/dom';
import { log } from '../utils/logger';
import { storage } from '../utils/storage';
import { isBulkFavoriteActive, refreshBulkFavorite } from '../features/bulkFavorite';
import { getWeatherSnapshot } from '../store/weatherHub';
import { formatSince } from '../utils/helpers';
import { subscribeToStats, resetStats, getStatsSnapshot, type StatsSnapshot, type ShopCategoryKey } from '../store/stats';
import { findWeatherCanvas, WEATHER_CANVAS_SELECTORS } from '../utils/weatherDetection';
import { onActivePetInfos, startPetInfoStore, type ActivePetInfo } from '../store/pets';
import { estimatePetXpTarget } from '../store/petXpTracker';
import {
  getAllMutationSummaries,
  onMutationSummary,
  type MutationSummary,
  type MutationSummaryEnvelope,
  type MutationSummarySource,
  type MutationWeatherWindow,
} from '../store/mutationSummary';
import { startAbilityTriggerStore, onAbilityHistoryUpdate, findAbilityHistoryForIdentifiers, type AbilityHistory, type AbilityEvent } from '../store/abilityLogs';
import { getAbilityDefinition, computeAbilityStats, computeEffectPerHour, type AbilityDefinition } from '../data/petAbilities';
import { buildAbilityValuationContext, resolveDynamicAbilityEffect, type DynamicAbilityEffect } from '../features/abilityValuation';
import { toggleWindow, isWindowOpen, type PanelRender } from './modalWindow';
import { calculateLiveETA } from './trackerWindow';
import { getMutationValueSnapshot, subscribeToMutationValueTracking, resetMutationValueTracking } from '../features/mutationValueTracking';
import { renderCompactPetSprite, renderPetSpeciesIcon, getAbilityColor } from '../utils/petCardRenderer';
import {
  getCropSpriteCanvas,
  getCropSpriteWithMutations,
  getPetSpriteCanvas,
  getPetSpriteWithMutations,
  spriteExtractor,
  onSpritesReady,
} from '../sprite-v2/compat';
import { getWeatherMutationSnapshot, subscribeToWeatherMutationTracking } from '../features/weatherMutationTracking';
import { getAutoFavoriteConfig, updateAutoFavoriteConfig, subscribeToAutoFavoriteConfig } from '../features/autoFavorite';
import { getGardenFiltersConfig, updateGardenFiltersConfig, subscribeToGardenFiltersConfig, applyGardenFiltersNow, resetGardenFiltersNow, getAllPlantSpecies, getAllEggTypes } from '../features/gardenFilters';
import { calculateItemStats, initializeRestockTracker, onRestockUpdate, getAllRestockEvents, getSummaryStats, clearAllRestocks } from '../features/shopRestockTracker';
import { startLiveShopTracking } from '../features/shopRestockLiveTracker';
import { startVersionChecker, onVersionChange, getVersionInfo, getCurrentVersion, UPDATE_URL, GITHUB_URL, type VersionInfo, type VersionStatus } from '../utils/versionChecker';
import { canvasToDataUrl } from '../utils/canvasHelpers';
import { visibleInterval, criticalInterval, timerManager } from '../utils/timerManager';
import { throttle, yieldToBrowser } from '../utils/scheduling';
import { getAllPetSpecies, areCatalogsReady } from '../catalogs/gameCatalogs';
import { ensurePanelStyles, ensureToastStyle, TOAST_STYLE_ID } from './panelStyles';
import { ShopCountdownView, CheckboxChangeHandler, NumberOptionConfig, CardComponents, CardOptions, FOCUS_KEY_SEPARATOR, GROWTH_MINUTES_PER_PROC, formatRestockCountdown, formatDurationPretty, formatMinutesPretty, formatRatePretty, formatHungerPretty, createEditablePetValue, buildFocusTargetKey, parseFocusTargetKey, createCard, createHeaderSegment, btn, showToast, createToggleOption, createCheckboxOption, createNumberOption, capitalizeWord, formatWeatherLabel, formatDuration, formatPercentPretty, formatFeedsPerHour, formatMinutesWithUnit, formatMinutesPerHour, formatCompletionTime } from './panelHelpers';
import { UIState, createInitialUIState } from './panelState';
import { AbilityContribution, AbilityGroup, AbilityTotals, AbilityAnalysis, TrackerTargetMode, analyzeActivePetAbilities, getPetDisplayName, computeObservedMetrics, ABILITY_HISTORY_LOOKBACK_MS } from './abilityAnalysis';
import { TurtleTimerUIConfig, ensureTurtleTimerConfig, computeTimingSpread, updateTurtleTimerViews } from './turtleTimerLogic';
import { createNotificationSection } from './notificationSection';
import { createGuideSection } from './sections/guideSection';
import { createBulkFavoriteSection } from './sections/bulkFavoriteSection';
import { createTrackersSection } from './sections/trackersSection';
import { createStatsSection } from './sections/statsSection';
import { createStatsOverviewSection } from './sections/statsOverviewSection';
import { createMutationValueSection, createMutationSection } from './sections/mutationValueSection';
import { createGardenFiltersSection } from './sections/gardenFiltersSection';
import { createAutoFavoriteSection } from './sections/autoFavoriteSection';
import { createStatsHeader } from './sections/statsHeaderSection';
import { createTurtleTimerSection } from './sections/turtleTimerSection';
// Display Tweaker removed

let uiState = createInitialUIState();

const SHOP_COUNTDOWN_WARNING_THRESHOLD_MS = 10_000;
const PANEL_POSITION_KEY = 'quinoa-ui-panel-position';
const PANEL_COLLAPSED_KEY = 'quinoa-ui-panel-collapsed';
const TRACKER_TARGET_MODE_KEY = 'quinoa-ui-tracker-target-mode';
const TRACKER_TARGET_PET_KEY = 'quinoa-ui-tracker-target-pet';
const TRACKER_ABILITY_FILTER_KEY = 'quinoa-ui-tracker-ability-filter';
const MUTATION_TRACKER_SOURCE_KEY = 'quinoa-ui-mutation-tracker-source';
const MUTATION_TRACKER_DETAIL_KEY = 'quinoa-ui-mutation-tracker-detail';

const shopCountdownViews: ShopCountdownView[] = [];
let unregisterShopCountdownTimer: (() => void) | null = null;
let latestRestockInfo: { nextRestockAt?: Record<string, number | null> } | null = null;
let _panelResizeCleanup: (() => void) | null = null;


interface ShopCategoryDefinition {
  key: ShopCategoryKey;
  label: string;
  icon: string;
}

const SHOP_CATEGORY_DEFINITIONS: readonly ShopCategoryDefinition[] = [
  { key: 'seeds', label: 'Seeds', icon: '🌱' },
  { key: 'eggs', label: 'Eggs', icon: '🥚' },
  { key: 'tools', label: 'Tools', icon: '🛠️' },
  { key: 'decor', label: 'Decor', icon: '🪴' },
];


function ensureShopCountdownTimer(): void {
  if (unregisterShopCountdownTimer != null) {
    return;
  }
  // Use unified timer manager - pauses when page is hidden
  unregisterShopCountdownTimer = visibleInterval('shop-countdown', updateShopCountdownViews, 1000);
}

function registerShopCountdownView(view: ShopCountdownView): void {
  shopCountdownViews.push(view);
  ensureShopCountdownTimer();
  updateShopCountdownViews();
}

function updateShopCountdownViews(): void {
  if (!shopCountdownViews.length) {
    return;
  }

  const now = Date.now();

  for (const view of shopCountdownViews) {
    const summaryParts: string[] = [];
    view.summaryEl.style.color = '#ccc';

    for (const cat of SHOP_CATEGORY_DEFINITIONS) {
      const valueEl = view.values[cat.key];
      if (!valueEl) {
        continue;
      }

      const row = valueEl.parentElement as HTMLElement | null;
      if (row) {
        row.style.opacity = '1';
      }

      const nextAt = latestRestockInfo?.nextRestockAt?.[cat.key] ?? null;
      if (!nextAt) {
        valueEl.textContent = '...';
        valueEl.style.color = '#aaa';
        summaryParts.push(`${cat.icon} ...`);
        continue;
      }

      const remaining = nextAt - now;
      if (remaining <= 1000) {
        valueEl.textContent = 'now';
        valueEl.style.color = '#4CAF50';
        summaryParts.push(`${cat.icon} now`);
      } else {
        const formatted = formatRestockCountdown(remaining);
        valueEl.textContent = formatted;
        valueEl.style.color = remaining <= SHOP_COUNTDOWN_WARNING_THRESHOLD_MS ? '#FFEB3B' : '#ddd';
        summaryParts.push(`${cat.icon} ${formatted}`);
      }
    }

    if (summaryParts.length === 0) {
      view.summaryEl.textContent = 'No shops tracked';
    } else {
      view.summaryEl.textContent = summaryParts.join(' | ');
    }
  }
}

// Configuration shape passed down from main.ts via setCfg()
interface PanelCfg {
  ui?: Record<string, unknown>;
  mutationReminder?: { enabled?: boolean; showNotifications?: boolean; highlightPlants?: boolean };
  turtleTimer?: { enabled?: boolean; [key: string]: unknown };
  harvestReminder?: Record<string, unknown>;
  inventoryLocker?: Record<string, unknown>;
  [key: string]: unknown;
}

let cfg: PanelCfg = {};



function createJournalCheckerSection(): HTMLElement {
  // Use the new visually enhanced journal checker
  return createJournalCheckerSectionNew();
}



export async function createOriginalUI(): Promise<HTMLElement> {
  ensurePanelStyles();
  if (uiState.panel) return uiState.panel;
  shopCountdownViews.length = 0;

  const panel = document.createElement('div');
  panel.className = 'qpm-panel';

  const titleBar = document.createElement('div');
  titleBar.className = 'qpm-panel__titlebar';
  titleBar.title = 'Drag to move • Click to collapse';

  const titleText = document.createElement('span');
  titleText.textContent = '🍖 Quinoa Pet Manager';

  // Create version bubble
  const versionBubble = document.createElement('a');
  versionBubble.className = 'qpm-version-bubble';
  versionBubble.dataset.status = 'checking';
  versionBubble.textContent = `v${getCurrentVersion()}`;
  versionBubble.title = 'Checking for updates...';
  versionBubble.style.cursor = 'pointer';
  versionBubble.target = '_blank';
  versionBubble.rel = 'noopener noreferrer';

  const renderVersionInfo = (info: VersionInfo): void => {
    const statusMap: Record<VersionStatus, 'up-to-date' | 'outdated' | 'checking' | 'error'> = {
      current: 'up-to-date',
      outdated: 'outdated',
      checking: 'checking',
      error: 'error',
    };

    versionBubble.dataset.status = statusMap[info.status];

    if (info.status === 'outdated' && info.latest) {
      versionBubble.textContent = `v${info.current} → v${info.latest}`;
      versionBubble.title = `Update available! Current: v${info.current}\nLatest: v${info.latest}\nClick to open the latest userscript.`;
    } else if (info.status === 'error') {
      versionBubble.textContent = `v${info.current}`;
      versionBubble.title = 'Version check failed. Click to open the repo.';
    } else if (info.status === 'checking') {
      versionBubble.textContent = `v${info.current}`;
      versionBubble.title = 'Checking for updates...';
    } else {
      versionBubble.textContent = `v${info.current}`;
      versionBubble.title = `QPM v${info.current}\nUp to date.`;
    }
  };

  const versionClickUrl = 'https://raw.githubusercontent.com/ryandt2305-cpu/QPM-GR/master/dist/QPM.user.js';
  versionBubble.href = versionClickUrl;

  const openVersionLink = (): void => {
    const gmOpen = (globalThis as any).GM_openInTab || (globalThis as any).GM?.openInTab;
    if (typeof gmOpen === 'function') {
      try {
        gmOpen(versionClickUrl, { active: true, insert: true, setParent: true });
        return;
      } catch (error) {
        console.warn('[QPM] GM_openInTab failed, falling back', error);
      }
    }

    const win = window.open(versionClickUrl, '_blank', 'noopener,noreferrer');
    if (!win) {
      window.location.href = versionClickUrl;
    }
  };

  versionBubble.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    openVersionLink();
  });

  onVersionChange(renderVersionInfo);
  startVersionChecker();

  const collapseButton = document.createElement('button');
  collapseButton.type = 'button';
  collapseButton.dataset.qpmCollapseButton = 'true';
  collapseButton.className = 'qpm-button';
  collapseButton.setAttribute('aria-label', 'Collapse panel');

  const collapseIcon = document.createElement('span');
  collapseIcon.textContent = '▼';
  collapseButton.appendChild(collapseIcon);

  titleBar.append(titleText, versionBubble, collapseButton);

  const content = document.createElement('div');
  content.className = 'qpm-content';

  const nav = document.createElement('div');
  nav.className = 'qpm-nav';

  const tabsContainer = document.createElement('div');
  tabsContainer.className = 'qpm-tabs';

  content.append(nav, tabsContainer);
  panel.append(titleBar, content);

  // Create UI sections with yields to prevent freezing
  const statsHeader = createStatsHeader(uiState, cfg, saveCfg, resetAllStats);
  await yieldToBrowser();
  
  const statsSection = createStatsSection(resetAllStats);
  await yieldToBrowser();
  
  const notificationsSection = createNotificationSection(uiState);
  await yieldToBrowser();
  
  const turtleSection = createTurtleTimerSection(uiState, cfg, saveCfg);
  await yieldToBrowser();
  
  const trackerSections = createTrackersSection(uiState);
  await yieldToBrowser();

  // Bulk favorite section
  const lockerSection = createBulkFavoriteSection();
  await yieldToBrowser();

  // Mutation reminder section
  const mutationSection = createMutationSection(uiState, cfg, saveCfg);
  await yieldToBrowser();

  // Mutation value section
  const mutationValueSection = createMutationValueSection(cfg, saveCfg);
  await yieldToBrowser();

  // Stats overview section
  const statsOverviewSection = createStatsOverviewSection();

  const tabs = new Map<string, HTMLElement>();
  const tabButtons = new Map<string, HTMLButtonElement>();
  let activeTab: string | null = null;

  const activateTab = (key: string) => {
    if (activeTab === key) return;
    activeTab = key;
    for (const [tabKey, tabContent] of tabs) {
      tabContent.classList.toggle('qpm-tab--active', tabKey === key);
    }
    for (const [tabKey, button] of tabButtons) {
      const isActive = tabKey === key;
      button.classList.toggle('qpm-nav__button--active', isActive);
      
      // Apply color coding with glow - each button has unique color
      if (button.dataset.tabColor) {
        const baseColor = button.dataset.tabColor;
        // Extract RGB values for glow effect
        const rgbMatch = baseColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        const glowColor = rgbMatch ? `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, 0.4)` : baseColor;
        
        // Check if this tab has an associated window that's open
        const windowId = button.dataset.windowId;
        const isWindowActive = windowId && isWindowOpen(windowId);
        
        if (isActive || isWindowActive) {
          button.style.background = baseColor;
          button.style.boxShadow = `0 4px 14px ${glowColor}, inset 0 1px 0 rgba(255,255,255,0.1)`;
          button.style.borderColor = baseColor.replace('0.28', '0.6');
        } else {
          // All buttons show their color dimly with subtle glow
          button.style.background = baseColor.replace('0.28', '0.12');
          button.style.boxShadow = `0 2px 8px ${glowColor.replace('0.4', '0.15')}`;
          button.style.borderColor = baseColor.replace('0.28', '0.3');
        }
      }
    }
  };

  const registerTab = (key: string, label: string, icon: string, elements: HTMLElement[]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'qpm-nav__button';
    button.innerHTML = `${icon}<span>${label}</span>`;
    // Only activate tab if it has content (not a window-opening tab)
    if (elements.length > 0) {
      button.addEventListener('click', () => activateTab(key));
    }
    
    // Add color coding for visual distinction - each button has unique color with glow
    const tabColors: Record<string, string> = {
      'dashboard': 'rgba(76, 175, 80, 0.28)',      // Green
      'turtle': 'rgba(33, 150, 243, 0.28)',        // Blue
      'trackers': 'rgba(156, 39, 176, 0.28)',      // Purple
      'xp-tracker': 'rgba(255, 152, 0, 0.28)',     // Orange
      'shop-restock': 'rgba(0, 188, 212, 0.28)',   // Cyan
      'pet-hub': 'rgba(103, 58, 183, 0.28)',       // Deep Purple
      'pet-optimizer': 'rgba(244, 67, 54, 0.28)',  // Red
      'public-rooms': 'rgba(233, 30, 99, 0.28)',   // Pink
      'crop-boost': 'rgba(139, 195, 74, 0.28)',    // Light Green
      'achievements': 'rgba(255, 215, 64, 0.28)',  // Gold
      'auto-favorite': 'rgba(255, 235, 59, 0.28)', // Yellow
      'garden-filters': 'rgba(63, 81, 181, 0.28)', // Indigo
      'journal-checker': 'rgba(121, 85, 72, 0.28)', // Brown
      'guide': 'rgba(96, 125, 139, 0.28)',         // Blue Grey
      'weather': 'rgba(156, 39, 176, 0.28)',       // Purple (Reminders)
      'bulk-favorite': 'rgba(244, 143, 177, 0.28)', // Light Pink (Hearts)
    };
    
    if (tabColors[key]) {
      const baseColor = tabColors[key];
      button.dataset.tabColor = baseColor;
      // Set initial background with subtle glow
      const rgbMatch = baseColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      const glowColor = rgbMatch ? `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, 0.15)` : baseColor;
      button.style.background = baseColor.replace('0.28', '0.12');
      button.style.boxShadow = `0 2px 8px ${glowColor}`;
      button.style.borderColor = baseColor.replace('0.28', '0.3');
    }
    
    nav.appendChild(button);
    tabButtons.set(key, button);

    const tab = document.createElement('div');
    tab.className = 'qpm-tab';
    for (const el of elements) {
      tab.appendChild(el);
    }
    tabsContainer.appendChild(tab);
    tabs.set(key, tab);
  };

  // Auto-Favorite section
  const autoFavoriteSection = await createAutoFavoriteSection();

  // Garden Filters section
  const gardenFiltersSection = await createGardenFiltersSection();

  // Journal Checker section
  const journalCheckerSection = createJournalCheckerSection();

  // Guide section
  const guideSection = createGuideSection();

  registerTab('dashboard', 'Dashboard', '📊', [statsHeader]);
  // Tabs that open windows should have no content (empty array prevents tab content area)
  registerTab('turtle', 'Turtle Timer', '🐢', []);
  registerTab('trackers', 'Trackers', '📈', []);
  registerTab('xp-tracker', 'XP Tracker', '✨', []);
  registerTab('shop-restock', 'Shop Restock', '🏪', []);
  registerTab('pet-hub', 'Pet Hub', '🐾', []);
  registerTab('pet-optimizer', 'Pet Optimizer', '🎯', []);
  registerTab('public-rooms', 'Public Rooms', '🌐', []);
  registerTab('crop-boost', 'Crop Boosts', '🌱', []);
  registerTab('achievements', 'Achievements', '🏆', []);
  registerTab('auto-favorite', 'Auto-Favorite', '⭐', [autoFavoriteSection]);
  registerTab('garden-filters', 'Garden Filters', '🔍', [gardenFiltersSection]);
  registerTab('journal-checker', 'Journal', '📔', [journalCheckerSection]);
  registerTab('guide', 'Guide', '📖', [guideSection]);
  registerTab('weather', 'Reminders', '🔔', [mutationSection]);
  registerTab('bulk-favorite', 'Bulk Favorite', '❤️', [lockerSection]);
  // Display Tweaker tab removed

  // Override tab click handlers to open windows instead
  const trackersButton = tabButtons.get('trackers');
  if (trackersButton) {
    const newTrackersButton = trackersButton.cloneNode(true) as HTMLButtonElement;
    newTrackersButton.addEventListener('click', async () => {
      try {
        const { createAbilityTrackerWindow, showAbilityTrackerWindow, hideAbilityTrackerWindow, setGlobalAbilityTrackerState } = await import('./trackerWindow');

        if (!uiState.abilityTrackerWindow) {
          uiState.abilityTrackerWindow = createAbilityTrackerWindow();
          setGlobalAbilityTrackerState(uiState.abilityTrackerWindow);
        }

        const isCurrentlyVisible = uiState.abilityTrackerWindow.root.style.display !== 'none';
        if (isCurrentlyVisible) {
          hideAbilityTrackerWindow(uiState.abilityTrackerWindow);
        } else {
          showAbilityTrackerWindow(uiState.abilityTrackerWindow);
        }
      } catch (error) {
        log('⚠️ Failed to toggle Ability Tracker window', error);
      }
    });
    trackersButton.replaceWith(newTrackersButton);
    tabButtons.set('trackers', newTrackersButton);
  }

  const xpTrackerButton = tabButtons.get('xp-tracker');
  if (xpTrackerButton) {
    const newXpTrackerButton = xpTrackerButton.cloneNode(true) as HTMLButtonElement;
    newXpTrackerButton.addEventListener('click', async () => {
      try {
        const { createXpTrackerWindow, showXpTrackerWindow, hideXpTrackerWindow, setGlobalXpTrackerState } = await import('./xpTrackerWindow');

        // Check if window already exists
        if (!uiState.xpTrackerWindow) {
          uiState.xpTrackerWindow = createXpTrackerWindow();
          setGlobalXpTrackerState(uiState.xpTrackerWindow);
        }

        // Toggle visibility
        const isCurrentlyVisible = uiState.xpTrackerWindow.root.style.display !== 'none';
        if (isCurrentlyVisible) {
          hideXpTrackerWindow(uiState.xpTrackerWindow);
        } else {
          showXpTrackerWindow(uiState.xpTrackerWindow);
        }
      } catch (error) {
        log('⚠️ Failed to toggle XP Tracker window', error);
      }
    });
    xpTrackerButton.replaceWith(newXpTrackerButton);
    tabButtons.set('xp-tracker', newXpTrackerButton);
  }

  const shopRestockButton = tabButtons.get('shop-restock');
  if (shopRestockButton) {
    const newShopRestockButton = shopRestockButton.cloneNode(true) as HTMLButtonElement;
    newShopRestockButton.addEventListener('click', async () => {
      try {
        const { createShopRestockWindow, showShopRestockWindow, hideShopRestockWindow } = await import('./shopRestockWindow');

        // Check if window already exists
        if (!uiState.shopRestockWindow) {
          uiState.shopRestockWindow = createShopRestockWindow();
        }

        // Toggle visibility
        const isCurrentlyVisible = uiState.shopRestockWindow.root.style.display !== 'none';
        if (isCurrentlyVisible) {
          hideShopRestockWindow(uiState.shopRestockWindow);
        } else {
          showShopRestockWindow(uiState.shopRestockWindow);
        }
      } catch (error) {
        log('⚠️ Failed to toggle Shop Restock window', error);
      }
    });
    shopRestockButton.replaceWith(newShopRestockButton);
    tabButtons.set('shop-restock', newShopRestockButton);
  }

  const publicRoomsButton = tabButtons.get('public-rooms');
  if (publicRoomsButton) {
    const newPublicRoomsButton = publicRoomsButton.cloneNode(true) as HTMLButtonElement;
    newPublicRoomsButton.dataset.windowId = 'public-rooms';
    newPublicRoomsButton.addEventListener('click', () => {
      const renderPublicRoomsWindow = (root: HTMLElement) => {
        import('./publicRoomsWindow').then(({ renderPublicRoomsWindow }) => {
          renderPublicRoomsWindow(root);
        }).catch(error => {
          log('⚠️ Failed to load Public Rooms window', error);
        });
      };
      toggleWindow('public-rooms', '🌐 Public Rooms', renderPublicRoomsWindow, '950px', '85vh');
    });
    publicRoomsButton.replaceWith(newPublicRoomsButton);
    tabButtons.set('public-rooms', newPublicRoomsButton);
  }

  const cropBoostButton = tabButtons.get('crop-boost');
  if (cropBoostButton) {
    const newCropBoostButton = cropBoostButton.cloneNode(true) as HTMLButtonElement;
    newCropBoostButton.addEventListener('click', async () => {
      try {
        const { openCropBoostTrackerWindow } = await import('./cropBoostTrackerWindow');
        openCropBoostTrackerWindow();
      } catch (error) {
        log('⚠️ Failed to open Crop Boost Tracker window', error);
      }
    });
    cropBoostButton.replaceWith(newCropBoostButton);
    tabButtons.set('crop-boost', newCropBoostButton);
  }

  // Display Tweaker toggle/hotkey removed

  const achievementsButton = tabButtons.get('achievements');
  if (achievementsButton) {
    const newAchievementsButton = achievementsButton.cloneNode(true) as HTMLButtonElement;
    newAchievementsButton.dataset.windowId = 'achievements';
    newAchievementsButton.addEventListener('click', () => {
      const renderAchievementsWindow = async (root: HTMLElement) => {
        // Show loading state immediately
        root.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;min-height:200px;color:var(--qpm-text-dim);"><span>⏳ Loading Achievements...</span></div>';
        // Yield to let loading state render
        await new Promise(r => requestAnimationFrame(r));
        try {
          const { createAchievementsWindow } = await import('./achievementsWindow');
          root.innerHTML = '';
          const state = createAchievementsWindow();
          state.root.dataset.achievementsRoot = 'true';
          root.appendChild(state.root);
        } catch (error) {
          log('⚠️ Failed to load Achievements window', error);
          root.innerHTML = '<div style="color:#ff6b6b;padding:20px;text-align:center;">Failed to load Achievements</div>';
        }
      };
      toggleWindow('achievements', '🏆 Achievements', renderAchievementsWindow, undefined, '90vh');
    });
    achievementsButton.replaceWith(newAchievementsButton);
    tabButtons.set('achievements', newAchievementsButton);
  }

  const turtleButton = tabButtons.get('turtle');
  if (turtleButton) {
    const newTurtleButton = turtleButton.cloneNode(true) as HTMLButtonElement;
    newTurtleButton.addEventListener('click', async () => {
      try {
        const { createTurtleTimerWindow, showTurtleTimerWindow, hideTurtleTimerWindow } = await import('./turtleTimerWindow');

        if (!uiState.turtleTimerWindow) {
          uiState.turtleTimerWindow = createTurtleTimerWindow();
        }

        const isCurrentlyVisible = uiState.turtleTimerWindow.root.style.display !== 'none';
        if (isCurrentlyVisible) {
          hideTurtleTimerWindow(uiState.turtleTimerWindow);
        } else {
          showTurtleTimerWindow(uiState.turtleTimerWindow);
        }
      } catch (error) {
        log('⚠️ Failed to toggle Turtle Timer window', error);
      }
    });
    turtleButton.replaceWith(newTurtleButton);
    tabButtons.set('turtle', newTurtleButton);
  }

  const weatherButton = tabButtons.get('weather');
  if (weatherButton) {
    const newWeatherButton = weatherButton.cloneNode(true) as HTMLButtonElement;
    newWeatherButton.addEventListener('click', () => {
      toggleWindow('reminders', '🔔 Reminders', renderRemindersWindow, '650px', '85vh');
    });
    weatherButton.replaceWith(newWeatherButton);
    tabButtons.set('weather', newWeatherButton);
  }

  // Bulk Favorite now opens in the main panel (no separate window needed)
  // The tab content is already registered with [lockerSection]

  const petHubButton = tabButtons.get('pet-hub');
  if (petHubButton) {
    const newPetHubButton = petHubButton.cloneNode(true) as HTMLButtonElement;
    newPetHubButton.dataset.windowId = 'pet-hub';
    newPetHubButton.addEventListener('click', () => {
      const renderPetHubWindow = async (root: HTMLElement) => {
        // Show loading state immediately
        root.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;min-height:200px;color:var(--qpm-text-dim);"><span>⏳ Loading Pet Hub...</span></div>';
        // Yield to let loading state render
        await new Promise(r => requestAnimationFrame(r));
        try {
          const { renderPetHubWindow: render } = await import('./petHubWindow');
          root.innerHTML = '';
          render(root);
        } catch (error) {
          log('⚠️ Failed to load Pet Hub window', error);
          root.innerHTML = '<div style="color:#ff6b6b;padding:20px;text-align:center;">Failed to load Pet Hub</div>';
        }
      };
      toggleWindow('pet-hub', '🐾 Pet Hub', renderPetHubWindow, '1600px', '92vh');
    });
    petHubButton.replaceWith(newPetHubButton);
    tabButtons.set('pet-hub', newPetHubButton);
  }

  const petOptimizerButton = tabButtons.get('pet-optimizer');
  if (petOptimizerButton) {
    const newPetOptimizerButton = petOptimizerButton.cloneNode(true) as HTMLButtonElement;
    newPetOptimizerButton.dataset.windowId = 'pet-optimizer';
    newPetOptimizerButton.addEventListener('click', async () => {
      try {
        const { openPetOptimizerWindow } = await import('./petOptimizerWindow');
        openPetOptimizerWindow();
      } catch (error) {
        log('⚠️ Failed to load Pet Optimizer window', error);
      }
    });
    petOptimizerButton.replaceWith(newPetOptimizerButton);
    tabButtons.set('pet-optimizer', newPetOptimizerButton);
  }

  activateTab('dashboard');

  const applyPosition = (left: number, top: number) => {
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  };

  const savedPosition = storage.get<{ left: number; top: number } | null>(PANEL_POSITION_KEY, null);
  if (savedPosition && Number.isFinite(savedPosition.left) && Number.isFinite(savedPosition.top)) {
    applyPosition(savedPosition.left, savedPosition.top);
  }

  const applyCollapsed = (collapsed: boolean) => {
    content.style.display = collapsed ? 'none' : '';
    collapseIcon.textContent = collapsed ? '▲' : '▼';
    collapseButton.setAttribute('aria-expanded', String(!collapsed));
    panel.style.overflowY = collapsed ? 'visible' : 'auto';
    storage.set(PANEL_COLLAPSED_KEY, collapsed);
  };

  collapseButton.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
  });

  collapseButton.addEventListener('click', (event) => {
    event.stopPropagation();
    const collapsed = content.style.display === 'none';
    applyCollapsed(!collapsed);
  });

  applyCollapsed(!!storage.get<boolean>(PANEL_COLLAPSED_KEY, false));

  let isDragging = false;
  let dragMoved = false;
  let pointerId: number | null = null;
  let offsetX = 0;
  let offsetY = 0;
  let suppressClick = false;

  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

  // Clamp panel position to keep it visible within viewport
  const clampPanelPosition = () => {
    const rect = panel.getBoundingClientRect();
    const panelWidth = panel.offsetWidth;
    const panelHeight = panel.offsetHeight;
    const maxLeft = Math.max(8, window.innerWidth - panelWidth - 8);
    const maxTop = Math.max(8, window.innerHeight - panelHeight - 8);

    const newLeft = clamp(rect.left, 8, maxLeft);
    const newTop = clamp(rect.top, 8, maxTop);

    // Only update if position changed
    if (Math.abs(newLeft - rect.left) > 1 || Math.abs(newTop - rect.top) > 1) {
      applyPosition(newLeft, newTop);
      storage.set(PANEL_POSITION_KEY, { left: Math.round(newLeft), top: Math.round(newTop) });
    }
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!isDragging || pointerId !== event.pointerId) return;

    const panelWidth = panel.offsetWidth;
    const panelHeight = panel.offsetHeight;
    const maxLeft = Math.max(8, window.innerWidth - panelWidth - 8);
    const maxTop = Math.max(8, window.innerHeight - panelHeight - 8);

    const newLeft = clamp(event.clientX - offsetX, 8, maxLeft);
    const newTop = clamp(event.clientY - offsetY, 8, maxTop);
    const rect = panel.getBoundingClientRect();

    if (!dragMoved && (Math.abs(newLeft - rect.left) > 2 || Math.abs(newTop - rect.top) > 2)) {
      dragMoved = true;
    }

    applyPosition(newLeft, newTop);
  };

  const onPointerUp = (event: PointerEvent) => {
    if (!isDragging || pointerId !== event.pointerId) return;

    isDragging = false;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    if (panel.hasPointerCapture && panel.hasPointerCapture(event.pointerId)) {
      panel.releasePointerCapture(event.pointerId);
    } else {
      try {
        panel.releasePointerCapture(event.pointerId);
      } catch {}
    }
    titleBar.style.touchAction = '';

    if (dragMoved) {
      suppressClick = true;
      const rect = panel.getBoundingClientRect();
      storage.set(PANEL_POSITION_KEY, { left: Math.round(rect.left), top: Math.round(rect.top) });
    }

    pointerId = null;
    dragMoved = false;
  };

  titleBar.addEventListener('pointerdown', (event: PointerEvent) => {
    const target = event.target as HTMLElement | null;
    if (target && target.closest('[data-qpm-collapse-button]')) {
      return;
    }
    if (target && target.closest('.qpm-version-bubble')) {
      return; // let version bubble handle its own click/navigation
    }
    if (!event.isPrimary) return;
    if (event.pointerType === 'mouse') {
      if (event.button !== 0) return;
      if ((event.buttons & 1) !== 1) return;
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    isDragging = true;
    dragMoved = false;
    suppressClick = false;
    pointerId = event.pointerId;

    const rect = panel.getBoundingClientRect();
    offsetX = event.clientX - rect.left;
    offsetY = event.clientY - rect.top;

    if (panel.setPointerCapture) {
      panel.setPointerCapture(event.pointerId);
    }
    titleBar.style.touchAction = 'none';
    event.preventDefault();
  });

  titleBar.addEventListener('click', () => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    const collapsed = content.style.display === 'none';
    applyCollapsed(!collapsed);
  });

  // Add resize listener to keep panel visible when viewport changes
  window.addEventListener('resize', clampPanelPosition);
  _panelResizeCleanup = () => window.removeEventListener('resize', clampPanelPosition);

  document.body.appendChild(panel);

  uiState.panel = panel;
  uiState.content = content;
  return panel;
}




function refreshHeaderStats(): void {
  if (!uiState.headerWeather) {
    return;
  }

  // Weather segment
  let weatherLabel = 'Unknown';
  const weatherParts: string[] = [];

  try {
    const snapshot = getWeatherSnapshot();
    weatherLabel = formatWeatherLabel(snapshot.kind);
    weatherParts.push(weatherLabel);
  } catch {
    weatherParts.push(weatherLabel);
  }

  if (weatherParts.length === 0) {
    weatherParts.push(weatherLabel);
  }

  uiState.headerWeather.textContent = weatherParts.join(' • ');
}

function resetAllStats(): void {
  resetStats();
  refreshHeaderStats();
  showToast('Stats reset');
}

/**
 * Render function for the reminders modal window
 */
function renderRemindersWindow(root: HTMLElement): void{
  root.style.cssText = 'display: flex; flex-direction: column; gap: 16px; min-width: 600px;';

  const mutationSection = createMutationSection(uiState, cfg, saveCfg);
  mutationSection.style.margin = '0';
  root.appendChild(mutationSection);
}



// Update functions
export function updateUIStatus(text: string): void {
  if (uiState.status) uiState.status.textContent = text;
}

export function updateWeatherUI(text: string): void {
  if (uiState.weatherStatus) uiState.weatherStatus.textContent = `Current: ${text}`;
}

export function updateShopStatus(text: string): void {
  if (uiState.shopStatus) uiState.shopStatus.textContent = text;
}

export function setCfg(newCfg: PanelCfg): void {
  cfg = newCfg;
}

function saveCfg(): void {
  storage.set('quinoa-pet-manager', cfg);
}
