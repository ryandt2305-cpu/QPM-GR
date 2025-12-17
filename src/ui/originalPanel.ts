// src/ui/originalPanel.ts - Complete UI matching the working original
import { onTurtleTimerState, setTurtleTimerEnabled, configureTurtleTimer, getTurtleTimerState, setManualOverride, clearManualOverride, getManualOverride, type PetManualOverride } from '../features/turtleTimer.ts';
import type { TurtleTimerState, TurtleTimerChannel } from '../features/turtleTimer.ts';
import { formatCoins } from '../features/valueCalculator';
import { onNotifications, clearNotifications, type NotificationEvent, type NotificationLevel } from '../core/notifications';
import { createJournalCheckerSection as createJournalCheckerSectionNew } from './journalCheckerSection';
import { isVisible, getGameHudRoot } from '../utils/dom';
import { log } from '../utils/logger';
import { storage } from '../utils/storage';
import { getCropLockConfig, setCropLockSyncMode } from '../features/cropTypeLocking';
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
import { createAbilityRow, createAbilityGroupTotalRow, calculateLiveETA, calculateEffectiveProcRate } from './trackerWindow';
import { getMutationValueSnapshot, subscribeToMutationValueTracking, resetMutationValueTracking } from '../features/mutationValueTracking';
import { renderCompactPetSprite, renderPetSpeciesIcon, getAbilityColor } from '../utils/petCardRenderer';
import { getCropSpriteDataUrl, getPetSpriteDataUrl, spriteExtractor } from '../sprite-v2/compat';
import { getWeatherMutationSnapshot, subscribeToWeatherMutationTracking } from '../features/weatherMutationTracking';
import { getAutoFavoriteConfig, updateAutoFavoriteConfig, subscribeToAutoFavoriteConfig } from '../features/autoFavorite';
import { calculateItemStats, initializeRestockTracker, onRestockUpdate, getAllRestockEvents, getSummaryStats, clearAllRestocks } from '../features/shopRestockTracker';
import { startLiveShopTracking } from '../features/shopRestockLiveTracker';
import { startVersionChecker, onVersionChange, getVersionInfo, getCurrentVersion, UPDATE_URL, GITHUB_URL, type VersionInfo, type VersionStatus } from '../utils/versionChecker';

// Helper function to get mutated crop sprite URL
function getMutatedCropSpriteUrl(species: string, mutations: string[]): string {
  // Ensure species is a valid string
  const speciesStr = String(species || '').trim().toLowerCase();
  if (!speciesStr) {
    return '';
  }

  const baseCanvas = spriteExtractor.getCropSprite(speciesStr);
  if (!baseCanvas) {
    return getCropSpriteDataUrl(speciesStr) || '';
  }

  // Apply mutations if present
  const mutatedCanvas = mutations && mutations.length > 0
    ? spriteExtractor.renderPlantWithMutations(baseCanvas, mutations)
    : baseCanvas;

  if (!mutatedCanvas) return '';

  try {
    return mutatedCanvas.toDataURL('image/png');
  } catch {
    return '';
  }
}

export interface UIState {
  panel: HTMLElement | null;
  content: HTMLElement | null;
  status: HTMLElement | null;
  toggle: HTMLElement | null;
  weatherStatus: HTMLElement | null;
  shopStatus: HTMLElement | null;
  shopItemToggles: HTMLElement | null;
  mutationStatus: HTMLElement | null;
  headerContainer: HTMLElement | null;
  headerAutoFeed: HTMLElement | null;
  headerWeather: HTMLElement | null;
  headerShop: HTMLElement | null;
  headerMeta: HTMLElement | null;
  headerTimer: number | null;
  dashboardFeedList: HTMLElement | null;
  dashboardFeedMeta: HTMLElement | null;
  dashboardRestockSummary: HTMLElement | null;
  dashboardRestockValues: Record<ShopCategoryKey, HTMLElement | null>;
  turtleStatus: HTMLElement | null;
  turtleDetail: HTMLElement | null;
  turtleFooter: HTMLElement | null;
  turtleEnableButtons: HTMLButtonElement[];
  turtleFocusSelects: HTMLSelectElement[];
  turtleFocusTargetSelects: HTMLSelectElement[];
  turtleFocusTargetContainers: HTMLElement[];
  turtleEggFocusSelects: HTMLSelectElement[];
  turtleEggFocusTargetSelects: HTMLSelectElement[];
  turtleEggFocusTargetContainers: HTMLElement[];
  turtlePlantSummary: HTMLElement | null;
  turtlePlantEta: HTMLElement | null;
  turtlePlantTable: HTMLElement | null;
  turtlePlantTotals: HTMLElement | null;
  turtlePlantSimple: HTMLElement | null;
  turtlePlantLuck: HTMLElement | null;
  turtleEggSummary: HTMLElement | null;
  turtleEggEta: HTMLElement | null;
  turtleEggTable: HTMLElement | null;
  turtleEggTotals: HTMLElement | null;
  turtleEggSimple: HTMLElement | null;
  turtleEggLuck: HTMLElement | null;
  turtleSupportSummary: HTMLElement | null;
  turtleSupportTotals: HTMLElement | null;
  turtleSupportSimple: HTMLElement | null;
  turtleSupportList: HTMLElement | null;
  trackerAbilitySummary: HTMLElement | null;
  trackerAbilityFilterSelect: HTMLSelectElement | null;
  trackerAbilityTable: HTMLElement | null;
  trackerAbilityUnknown: HTMLElement | null;
  trackerXpSummary: HTMLElement | null;
  trackerXpAbilityTable: HTMLElement | null;
  trackerXpPerPetTable: HTMLElement | null;
  trackerXpTargetModeSelect: HTMLSelectElement | null;
  trackerXpTargetPetSelect: HTMLSelectElement | null;
  mutationTrackerCard: HTMLElement | null;
  mutationTrackerSummary: HTMLElement | null;
  mutationTrackerTotals: HTMLElement | null;
  mutationTrackerRatios: HTMLElement | null;
  mutationTrackerCountdown: HTMLElement | null;
  mutationTrackerDetail: HTMLElement | null;
  mutationTrackerTable: HTMLTableSectionElement | null;
  mutationTrackerSourceSelect: HTMLSelectElement | null;
  mutationTrackerDetailToggle: HTMLButtonElement | null;
  mutationTrackerSourceBadge: HTMLElement | null;
  mutationTrackerEmpty: HTMLElement | null;
  trackerAbilityHistoryUnsubscribe: (() => void) | null;
  trackerAbilityTicker: number | null;
  xpTrackerWindow: any | null; // XpTrackerWindowState from xpTrackerWindow.ts
  shopRestockWindow: any | null; // ShopRestockWindowState from shopRestockWindow.ts
  mutationTrackerUnsubscribe: (() => void) | null;
  mutationTrackerTicker: number | null;
  turtleUnsubscribe: (() => void) | null;
  notificationsSection: HTMLElement | null;
  notificationsListWrapper: HTMLElement | null;
  notificationsList: HTMLElement | null;
  notificationsFilterBar: HTMLElement | null;
  notificationsEmpty: HTMLElement | null;
  notificationsUnsubscribe: (() => void) | null;
  notificationsDetail: HTMLElement | null;
  notificationsDetailHeader: HTMLElement | null;
  notificationsDetailTitle: HTMLElement | null;
  notificationsDetailTimestamp: HTMLElement | null;
  notificationsDetailMeta: HTMLElement | null;
  notificationsDetailMessage: HTMLElement | null;
  notificationsDetailActions: HTMLElement | null;
  notificationsDetailRaw: HTMLElement | null;
  notificationsDetailPlaceholder: HTMLElement | null;
  notificationsDetailToggle: HTMLButtonElement | null;
}

let uiState: UIState = {
  panel: null,
  content: null,
  status: null,
  toggle: null,
  weatherStatus: null,
  shopStatus: null,
  shopItemToggles: null,
  mutationStatus: null,
  headerContainer: null,
  headerAutoFeed: null,
  headerWeather: null,
  headerShop: null,
  headerMeta: null,
  headerTimer: null,
  dashboardFeedList: null,
  dashboardFeedMeta: null,
  dashboardRestockSummary: null,
  dashboardRestockValues: {
    seeds: null,
    eggs: null,
    tools: null,
    decor: null,
  },
  turtleStatus: null,
  turtleDetail: null,
  turtleFooter: null,
  turtleEnableButtons: [],
  turtleFocusSelects: [],
  turtleFocusTargetSelects: [],
  turtleFocusTargetContainers: [],
  turtleEggFocusSelects: [],
  turtleEggFocusTargetSelects: [],
  turtleEggFocusTargetContainers: [],
  turtlePlantSummary: null,
  turtlePlantEta: null,
  turtlePlantTable: null,
  turtlePlantTotals: null,
  turtlePlantSimple: null,
  turtlePlantLuck: null,
  turtleEggSummary: null,
  turtleEggEta: null,
  turtleEggTable: null,
  turtleEggTotals: null,
  turtleEggSimple: null,
  turtleEggLuck: null,
  turtleSupportSummary: null,
  turtleSupportTotals: null,
  turtleSupportSimple: null,
  turtleSupportList: null,
  trackerAbilitySummary: null,
  trackerAbilityFilterSelect: null,
  trackerAbilityTable: null,
  trackerAbilityUnknown: null,
  trackerXpSummary: null,
  trackerXpAbilityTable: null,
  trackerXpPerPetTable: null,
  trackerXpTargetModeSelect: null,
  trackerXpTargetPetSelect: null,
  mutationTrackerCard: null,
  mutationTrackerSummary: null,
  mutationTrackerTotals: null,
  mutationTrackerRatios: null,
  mutationTrackerCountdown: null,
  mutationTrackerDetail: null,
  mutationTrackerTable: null,
  mutationTrackerSourceSelect: null,
  mutationTrackerDetailToggle: null,
  mutationTrackerSourceBadge: null,
  mutationTrackerEmpty: null,
  trackerAbilityHistoryUnsubscribe: null,
  trackerAbilityTicker: null,
  xpTrackerWindow: null,
  shopRestockWindow: null,
  mutationTrackerUnsubscribe: null,
  mutationTrackerTicker: null,
  turtleUnsubscribe: null,
  notificationsSection: null,
  notificationsListWrapper: null,
  notificationsList: null,
  notificationsFilterBar: null,
  notificationsEmpty: null,
  notificationsUnsubscribe: null,
  notificationsDetail: null,
  notificationsDetailHeader: null,
  notificationsDetailTitle: null,
  notificationsDetailTimestamp: null,
  notificationsDetailMeta: null,
  notificationsDetailMessage: null,
  notificationsDetailActions: null,
  notificationsDetailRaw: null,
  notificationsDetailPlaceholder: null,
  notificationsDetailToggle: null,
};

const SHOP_COUNTDOWN_WARNING_THRESHOLD_MS = 10_000;

interface ShopCountdownView {
  summaryEl: HTMLElement;
  values: Record<ShopCategoryKey, HTMLElement>;
}

interface TurtleTimerUIConfig {
  enabled: boolean;
  includeBoardwalk: boolean;
  focus: TurtleTimerState['focus'];
  focusTargetTileId: string | null;
  focusTargetSlotIndex: number | null;
  eggFocus: TurtleTimerState['eggFocus'];
  eggFocusTargetTileId: string | null;
  eggFocusTargetSlotIndex: number | null;
}

// Type definitions for legacy autoShop feature (currently disabled)
interface RestockInfo {
  nextRestockAt?: Record<string, number | null>;
}

interface AutoShopItemConfig {
  enabled: boolean;
  category: string;
  itemName: string;
  priority?: number;
  rarityRank?: number;
}

type CheckboxChangeHandler = (checked: boolean) => void;

interface NumberOptionConfig {
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}

const shopCountdownViews: ShopCountdownView[] = [];
let shopCountdownTimer: number | null = null;
let latestRestockInfo: RestockInfo | null = null;
let latestFeedStatusText = 'Waiting for auto-feed...';

let feedCount = 0;
let weatherCheckCount = 0;
let shopBuyCount = 0;
let statsUnsubscribe: (() => void) | null = null;

const NOTIFICATION_LEVEL_COLORS: Record<NotificationLevel, string> = {
  info: '#64b5f6',
  success: 'var(--qpm-accent)',
  warn: '#ffb74d',
  error: '#ef5350',
};

const NOTIFICATION_LEVEL_ICONS: Record<NotificationLevel, string> = {
  info: 'ℹ️',
  success: '✅',
  warn: '⚠️',
  error: '⛔',
};

const PANEL_POSITION_KEY = 'quinoa-ui-panel-position';
const PANEL_COLLAPSED_KEY = 'quinoa-ui-panel-collapsed';
const NOTIFICATIONS_COLLAPSED_KEY = 'quinoa-ui-notifications-collapsed';
const NOTIFICATIONS_DETAIL_EXPANDED_KEY = 'quinoa-ui-notifications-detail-expanded';
const TOAST_STYLE_ID = 'qpm-toast-style';
const TRACKER_TARGET_MODE_KEY = 'quinoa-ui-tracker-target-mode';
const TRACKER_TARGET_PET_KEY = 'quinoa-ui-tracker-target-pet';
const TRACKER_ABILITY_FILTER_KEY = 'quinoa-ui-tracker-ability-filter';
const MUTATION_TRACKER_SOURCE_KEY = 'quinoa-ui-mutation-tracker-source';
const MUTATION_TRACKER_DETAIL_KEY = 'quinoa-ui-mutation-tracker-detail';

const notificationFilters = new Set<string>();
let lastNotificationEvents: NotificationEvent[] = [];
let notificationAllButton: HTMLButtonElement | null = null;
const notificationFeatureButtons = new Map<string, HTMLButtonElement>();
const notificationItemElements = new Map<string, HTMLButtonElement>();
let notificationSelectedId: string | null = null;
let notificationSectionCollapsed = storage.get<boolean>(NOTIFICATIONS_COLLAPSED_KEY, false) ?? false;
let notificationDetailExpanded = storage.get<boolean>(NOTIFICATIONS_DETAIL_EXPANDED_KEY, false) ?? false;
let lastNotificationFilteredCount = 0;

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

const GROWTH_MINUTES_PER_PROC: Record<'plant' | 'egg', number> = {
  plant: 5,
  egg: 10,
};

const FOCUS_KEY_SEPARATOR = '::';

function buildFocusTargetKey(tileId: string, slotIndex: number): string {
  return `${tileId}${FOCUS_KEY_SEPARATOR}${slotIndex}`;
}

function parseFocusTargetKey(value: string): { tileId: string | null; slotIndex: number | null } {
  if (!value) {
    return { tileId: null, slotIndex: null };
  }
  const [tileId, slotRaw] = value.split(FOCUS_KEY_SEPARATOR);
  const slotIndex = Number.parseInt(slotRaw ?? '', 10);
  if (!tileId || !Number.isFinite(slotIndex)) {
    return { tileId: null, slotIndex: null };
  }
  return { tileId, slotIndex };
}

function formatRestockCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatDurationPretty(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) {
    return '—';
  }
  if (ms <= 0) {
    return 'Ready';
  }
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const totalMinutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (totalMinutes < 60) {
    return seconds > 0 ? `${totalMinutes}m ${seconds}s` : `${totalMinutes}m`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes.toString().padStart(2, '0')}m` : `${hours}h`;
}

function formatMinutesPretty(minutes: number | null): string {
  if (minutes == null || !Number.isFinite(minutes)) {
    return '0m';
  }
  const safe = Math.max(0, minutes);
  if (safe >= 120) {
    const hours = Math.floor(safe / 60);
    const mins = Math.round(safe % 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  if (safe >= 60) {
    const hours = Math.floor(safe / 60);
    const mins = Math.round(safe % 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  if (safe >= 1) {
    return `${Math.round(safe)}m`;
  }
  return `${Math.max(1, Math.round(safe * 60))}s`;
}

function formatRatePretty(rate: number | null): string {
  if (rate == null || !Number.isFinite(rate)) {
    return '1.00×';
  }
  return `${rate.toFixed(2)}×`;
}

function formatHungerPretty(pct: number | null): string {
  if (pct == null || !Number.isFinite(pct)) {
    return '—';
  }
  return `${Math.round(pct)}%`;
}

function formatPercentPretty(pct: number | null, decimals = 0): string {
  if (pct == null || !Number.isFinite(pct)) {
    return '0%';
  }
  return `${pct.toFixed(decimals)}%`;
}

function formatFeedsPerHour(pctPerHour: number | null, decimals = 1): string {
  if (pctPerHour == null || !Number.isFinite(pctPerHour) || pctPerHour <= 0) {
    return '0.0 feeds/hr';
  }
  const feeds = pctPerHour / 100;
  return `${feeds.toFixed(decimals)} feeds/hr`;
}

function formatMinutesWithUnit(minutes: number | null): string {
  if (minutes == null || !Number.isFinite(minutes)) {
    return '—';
  }
  if (minutes < 1) {
    const seconds = Math.max(1, Math.round(minutes * 60));
    return `${seconds}s`;
  }
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  return `${Math.round(minutes)}m`;
}

function createEditablePetValue(
  petInfo: { species: string | null; slotIndex: number; petId?: string | null },
  field: 'xp' | 'targetScale',
  currentValue: number | null,
  formatFn: (val: number | null) => string,
): HTMLSpanElement {
  const span = document.createElement('span');
  span.style.cssText = 'cursor:pointer;text-decoration:underline dotted;';
  span.title = `Click to manually set ${field} value (leave empty to clear)`;
  span.textContent = formatFn(currentValue);

  span.addEventListener('click', (e) => {
    e.stopPropagation();

    const input = document.createElement('input');
    input.type = 'number';
    input.style.cssText = 'width:60px;font-size:9px;padding:2px;border:1px solid #4CAF50;background:#1a1a1a;color:#fff;';
    input.value = currentValue != null ? String(currentValue) : '';
    input.placeholder = field === 'xp' ? 'XP' : 'Scale';
    input.step = field === 'targetScale' ? '0.01' : '1';

    const save = () => {
      const val = input.value.trim();
      // Create minimal pet object for key generation
      const minimalPet = {
        species: petInfo.species,
        slotIndex: petInfo.slotIndex,
        petId: petInfo.petId ?? null,
        // Add other required fields with null values
        slotId: null,
        hungerPct: null,
        hungerValue: null,
        hungerMax: null,
        hungerRaw: null,
        name: null,
        targetScale: field === 'targetScale' && val ? Number(val) : null,
        mutations: [],
        abilities: [],
        xp: field === 'xp' && val ? Number(val) : null,
        level: null,
        levelRaw: null,
        strength: null,
        position: null,
        updatedAt: Date.now(),
        raw: null,
      } as ActivePetInfo;

      if (val === '') {
        clearManualOverride(minimalPet, field);
      } else {
        const num = Number(val);
        if (Number.isFinite(num) && num >= 0) {
          setManualOverride(minimalPet, { [field]: num });
        }
      }
      input.remove();
      span.style.display = '';
    };

    input.addEventListener('blur', () => setTimeout(save, 100));
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        save();
      } else if (event.key === 'Escape') {
        span.style.display = '';
        input.remove();
      }
    });

    span.style.display = 'none';
    span.parentElement?.insertBefore(input, span.nextSibling);
    input.focus();
    input.select();
  });

  return span;
}

function formatMinutesPerHour(minutes: number | null): string {
  if (minutes == null || !Number.isFinite(minutes) || minutes === 0) {
    return '0m per hour';
  }
  const sign = minutes >= 0 ? '-' : '+';
  const absMinutes = Math.abs(minutes);
  const rounded = Math.max(0, Math.round(absMinutes));
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;
  const parts: string[] = [];
  if (hours > 0) {
    parts.push(`${hours}hr`);
  }
  if (mins > 0 || parts.length === 0) {
    parts.push(`${mins}m`);
  }
  return `${sign}${parts.join(' ')} per hour`;
}

const ABILITY_HISTORY_LOOKBACK_MS = 1000 * 60 * 60 * 4;

const normalizeNumericValue = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.+-]/g, '');
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const extractNumericField = (source: unknown, ...fields: string[]): number | null => {
  if (!source || typeof source !== 'object') {
    return null;
  }
  const record = source as Record<string, unknown>;
  for (const field of fields) {
    if (!(field in record)) continue;
    const numeric = normalizeNumericValue(record[field]);
    if (numeric != null) {
      return numeric;
    }
  }
  return null;
};

const getAbilityHistoryForPet = (info: ActivePetInfo, abilityId: string): AbilityHistory | null => {
  const fallback: string[] = [];
  if (info.petId) fallback.push(info.petId);
  if (info.slotId) fallback.push(info.slotId);
  if (typeof info.slotIndex === 'number' && Number.isFinite(info.slotIndex)) {
    fallback.push(String(Math.max(0, Math.round(info.slotIndex))));
  }

  return findAbilityHistoryForIdentifiers(abilityId, {
    petId: info.petId,
    slotId: info.slotId,
    slotIndex: typeof info.slotIndex === 'number' && Number.isFinite(info.slotIndex) ? info.slotIndex : null,
    fallbackKeys: fallback,
  });
};

const getRecentAbilityEvents = (history: AbilityHistory): AbilityEvent[] => {
  const cutoff = Date.now() - ABILITY_HISTORY_LOOKBACK_MS;
  return history.events.filter((event) => event.performedAt >= cutoff);
};

interface AbilityObservation {
  procsPerHour: number | null;
  effectPerProc: number | null;
  lastProcAt: number | null;
  sampleCount: number;
}

const extractAbilityEventEffect = (definition: AbilityDefinition, event: AbilityEvent): number | null => {
  const data = event.data;
  switch (definition.category) {
    case 'xp':
      return extractNumericField(data, 'bonusXp', 'xp', 'value');
    case 'plantGrowth':
      return extractNumericField(data, 'plantGrowthReductionMinutes', 'reductionMinutes', 'minutes');
    case 'eggGrowth':
      return extractNumericField(data, 'eggGrowthTimeReductionMinutes', 'reductionMinutes', 'minutes');
    case 'coins':
      return extractNumericField(
        data,
        'coinsFound',
        'coins',
        'coinsEarned',
        'sellPrice',
        'bonusCoins',
        'value',
        'valueEarned',
        'coinsValue',
      );
    default:
      return null;
  }
};

const computeObservedMetrics = (history: AbilityHistory, definition: AbilityDefinition): AbilityObservation | null => {
  const recent = getRecentAbilityEvents(history);
  if (!recent.length) {
    return null;
  }

  const latest = recent[recent.length - 1]!;
  const earliest = recent[0]!;

  let procsPerHour: number | null = null;
  if (recent.length >= 2) {
    const spanMs = latest.performedAt - earliest.performedAt;
    if (spanMs > 0) {
      procsPerHour = (recent.length - 1) / (spanMs / 3_600_000);
    }
  }

  const effects: number[] = [];
  for (const event of recent) {
    const effect = extractAbilityEventEffect(definition, event);
    if (effect != null && Number.isFinite(effect)) {
      effects.push(effect);
    }
  }
  const effectPerProc = effects.length ? effects.reduce((sum, value) => sum + value, 0) / effects.length : null;

  return {
    procsPerHour,
    effectPerProc,
    lastProcAt: latest.performedAt,
    sampleCount: recent.length,
  };
};

type AbilityEffectSource = 'observed' | 'definition' | 'computed';

export interface AbilityContribution {
  pet: ActivePetInfo;
  petIndex: number;
  displayName: string;
  abilityName: string;
  definition: AbilityDefinition;
  procsPerHour: number;
  procsPerHourSource: 'observed' | 'estimated';
  chancePerMinute: number;
  expectedMinutesBetween: number | null;
  lastProcAt: number | null;
  sampleCount: number;
  effectPerProc: number | null;
  effectSource: AbilityEffectSource;
  effectDetail: string | null;
  effectPerHour: number;
}

interface AbilityGroup {
  definition: AbilityDefinition;
  entries: AbilityContribution[];
  totalProcsPerHour: number;
  chancePerMinute: number;
  combinedEtaMinutes: number | null;
  effectPerHour: number;
  totalSamples: number;
  lastProcAt: number | null;
  averageEffectPerProc: number | null;
}

interface AbilityTotals {
  xpPerHour: number;
  plantMinutesPerHour: number;
  eggMinutesPerHour: number;
  coinsPerHour: number;
}

interface UnknownAbilityEntry {
  abilityName: string;
  pet: ActivePetInfo;
}

interface AbilityAnalysis {
  groups: AbilityGroup[];
  totals: AbilityTotals;
  unknown: UnknownAbilityEntry[];
}

type TrackerTargetMode = 'nextLevel' | 'maxLevel';

function createEmptyAbilityAnalysis(): AbilityAnalysis {
  return {
    groups: [],
    totals: {
      xpPerHour: 0,
      plantMinutesPerHour: 0,
      eggMinutesPerHour: 0,
      coinsPerHour: 0,
    },
    unknown: [],
  };
}

function analyzeActivePetAbilities(infos: ActivePetInfo[]): AbilityAnalysis {
  if (!infos.length) {
    return createEmptyAbilityAnalysis();
  }

  const valuationContext = buildAbilityValuationContext();
  const dynamicEffectCache = new Map<string, DynamicAbilityEffect | null>();

  const groupMap = new Map<string, AbilityGroup>();
  const unknown: UnknownAbilityEntry[] = [];

  infos.forEach((info, petIndex) => {
    const abilities = Array.isArray(info.abilities) ? info.abilities : [];
    for (const raw of abilities) {
      if (!raw) continue;

      const definition = getAbilityDefinition(raw);
      if (!definition) {
        unknown.push({ abilityName: raw, pet: info });
        continue;
      }
      if (definition.trigger !== 'continuous') {
        continue;
      }

      const stats = computeAbilityStats(definition, info.strength);
      const history = getAbilityHistoryForPet(info, definition.id);
      const observation = history ? computeObservedMetrics(history, definition) : null;

      const normalizedStrength = typeof info.strength === 'number' && Number.isFinite(info.strength) ? info.strength : null;
      const cacheKey = `${definition.id}::${normalizedStrength != null ? normalizedStrength.toFixed(2) : 'baseline'}`;
      let dynamicEffect = dynamicEffectCache.get(cacheKey);
      if (dynamicEffect === undefined) {
        dynamicEffect = resolveDynamicAbilityEffect(definition.id, valuationContext, normalizedStrength);
        dynamicEffectCache.set(cacheKey, dynamicEffect ?? null);
      }

      const observedProcsPerHour = observation?.procsPerHour ?? null;
      const procsPerHour =
        observedProcsPerHour != null && observedProcsPerHour > 0 ? observedProcsPerHour : stats.procsPerHour;
      const procsPerHourSource = observedProcsPerHour != null && observedProcsPerHour > 0 ? 'observed' : 'estimated';

      const observedEffectPerProc = observation?.effectPerProc ?? null;
      const computedEffectPerProc = dynamicEffect?.effectPerProc ?? null;
      const definitionEffectPerProc = definition.effectValuePerProc ?? null;

      let effectPerProc: number | null = null;
      let effectSource: AbilityEffectSource = 'definition';
      let effectDetail: string | null = dynamicEffect?.detail ?? null;

      if (observedEffectPerProc != null && observedEffectPerProc > 0) {
        effectPerProc = observedEffectPerProc;
        effectSource = 'observed';
        effectDetail = observation?.sampleCount ? `Observed average from ${observation.sampleCount} recent sample${observation.sampleCount === 1 ? '' : 's'}.` : 'Observed from ability log.';
      } else if (computedEffectPerProc != null && computedEffectPerProc > 0) {
        effectPerProc = computedEffectPerProc;
        effectSource = 'computed';
      } else if (definitionEffectPerProc != null && definitionEffectPerProc > 0) {
        effectPerProc = definitionEffectPerProc;
        effectSource = 'definition';
        effectDetail = definition.notes ?? null;
      }

      const effectPerHour =
        effectPerProc != null && procsPerHour > 0 ? procsPerHour * effectPerProc : computeEffectPerHour(definition, stats);

      const lastProcAt = observation?.lastProcAt ?? (history?.lastPerformedAt ?? null);
      const sampleCount = observation?.sampleCount ?? 0;

      const contribution: AbilityContribution = {
        pet: info,
        petIndex,
        displayName: getPetDisplayName(info),
        abilityName: raw,
        definition,
        procsPerHour,
        procsPerHourSource,
        chancePerMinute: stats.chancePerMinute,
        expectedMinutesBetween: procsPerHour > 0 ? 60 / procsPerHour : null,
        lastProcAt,
        sampleCount,
        effectPerProc,
        effectSource,
        effectDetail,
        effectPerHour,
      };

      const key = definition.id;
      const existing = groupMap.get(key);
      if (existing) {
        existing.entries.push(contribution);
        existing.totalProcsPerHour += procsPerHour;
        existing.effectPerHour += effectPerHour;
        existing.totalSamples += sampleCount;
        if (existing.lastProcAt == null || (lastProcAt != null && lastProcAt > existing.lastProcAt)) {
          existing.lastProcAt = lastProcAt;
        }
      } else {
        groupMap.set(key, {
          definition,
          entries: [contribution],
          totalProcsPerHour: procsPerHour,
          chancePerMinute: procsPerHour / 60,
          combinedEtaMinutes: procsPerHour > 0 ? 60 / procsPerHour : null,
          effectPerHour,
          totalSamples: sampleCount,
          lastProcAt,
          averageEffectPerProc: effectPerProc,
        });
      }
    }
  });

  if (groupMap.size === 0 && unknown.length === 0) {
    return createEmptyAbilityAnalysis();
  }

  const totals: AbilityTotals = {
    xpPerHour: 0,
    plantMinutesPerHour: 0,
    eggMinutesPerHour: 0,
    coinsPerHour: 0,
  };

  const orderedGroups = Array.from(groupMap.values())
    .map((group) => {
      // Sum individual chance per minute values for user clarity
      group.chancePerMinute = group.entries.reduce((sum, entry) => sum + entry.chancePerMinute, 0);
      group.combinedEtaMinutes = group.totalProcsPerHour > 0 ? 60 / group.totalProcsPerHour : null;
      group.averageEffectPerProc =
        group.totalProcsPerHour > 0 ? group.effectPerHour / group.totalProcsPerHour : null;

      switch (group.definition.category) {
        case 'xp':
          totals.xpPerHour += group.effectPerHour;
          break;
        case 'plantGrowth':
          totals.plantMinutesPerHour += group.effectPerHour;
          break;
        case 'eggGrowth':
          totals.eggMinutesPerHour += group.effectPerHour;
          break;
        case 'coins':
          totals.coinsPerHour += group.effectPerHour;
          break;
      }

      return group;
    })
    .sort((a, b) => b.totalProcsPerHour - a.totalProcsPerHour);

  return {
    groups: orderedGroups,
    totals,
    unknown,
  };
}

function getPetDisplayName(pet: ActivePetInfo): string {
  if (pet.name && pet.name.trim().length > 0) {
    return pet.name;
  }
  if (pet.species && pet.species.trim().length > 0) {
    return pet.species;
  }
  if (typeof pet.slotIndex === 'number' && Number.isFinite(pet.slotIndex)) {
    return `Pet ${pet.slotIndex + 1}`;
  }
  return 'Unknown pet';
}

function formatAbilityEffect(definition: AbilityDefinition, value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '—';
  }
  if (definition.effectUnit === 'coins' || definition.category === 'coins') {
    return `${formatCoins(value)} coins/h`;
  }
  if (definition.effectUnit === 'xp' || definition.category === 'xp') {
    return `${Math.round(value).toLocaleString()} xp/h`;
  }
  if (value >= 100) {
    return `${Math.round(value).toLocaleString()} min/h`;
  }
  const rounded = Math.round(value * 10) / 10;
  return `${rounded.toFixed(1)} min/h`;
}

function formatAbilityEffectPerProc(definition: AbilityDefinition, value: number | null): string {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return '—';
  }
  if (definition.effectUnit === 'coins' || definition.category === 'coins') {
    return `${formatCoins(value)} coins`;
  }
  if (definition.effectUnit === 'xp' || definition.category === 'xp') {
    return `${Math.round(value).toLocaleString()} xp`;
  }
  if (value >= 100) {
    return `${Math.round(value).toLocaleString()} min`;
  }
  const rounded = Math.round(value * 10) / 10;
  return `${rounded.toFixed(1)} min`;
}

function formatHoursPretty(hours: number | null): string {
  if (hours == null || !Number.isFinite(hours)) {
    return '—';
  }
  const minutes = Math.max(0, hours * 60);
  return formatMinutesPretty(minutes);
}

function ensureTurtleTimerConfig(): TurtleTimerUIConfig {
  const current = cfg.turtleTimer ?? {};
  const resolved: TurtleTimerUIConfig = {
    enabled: current.enabled ?? true,
    includeBoardwalk: current.includeBoardwalk ?? false,
    focus: current.focus === 'earliest' || current.focus === 'specific' ? current.focus : 'latest',
    focusTargetTileId: typeof current.focusTargetTileId === 'string' ? current.focusTargetTileId : null,
    focusTargetSlotIndex:
      typeof current.focusTargetSlotIndex === 'number' && Number.isFinite(current.focusTargetSlotIndex)
        ? Math.max(0, Math.round(current.focusTargetSlotIndex))
        : null,
    eggFocus: current.eggFocus === 'earliest' || current.eggFocus === 'specific' ? current.eggFocus : 'latest',
    eggFocusTargetTileId: typeof current.eggFocusTargetTileId === 'string' ? current.eggFocusTargetTileId : null,
    eggFocusTargetSlotIndex:
      typeof current.eggFocusTargetSlotIndex === 'number' && Number.isFinite(current.eggFocusTargetSlotIndex)
        ? Math.max(0, Math.round(current.eggFocusTargetSlotIndex))
        : null,
  };

  cfg.turtleTimer = resolved;
  return resolved;
}

function formatCompletionTime(msRemaining: number | null): string {
  if (msRemaining == null || !Number.isFinite(msRemaining)) return '';
  const completionTime = new Date(Date.now() + msRemaining);
  const hours = completionTime.getHours();
  const minutes = completionTime.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  const displayMinutes = minutes.toString().padStart(2, '0');
  return ` • ${displayHours}:${displayMinutes} ${ampm}`;
}

function computeTimingSpread(channel: TurtleTimerChannel): {
  luckyMs: number | null;
  unluckyMs: number | null;
  stdMinutes: number | null;
} {
  if (
    channel.status !== 'estimating' ||
    channel.naturalMsRemaining == null ||
    channel.adjustedMsRemaining == null ||
    !Number.isFinite(channel.adjustedMsRemaining)
  ) {
    return { luckyMs: null, unluckyMs: null, stdMinutes: null };
  }

  const adjustedMinutes = Math.max(0, channel.adjustedMsRemaining / 60000);
  const runtimeMinutes = Math.max(1, adjustedMinutes);
  let varianceMinutes = 0;

  for (const entry of channel.contributions) {
    const abilityKind = entry.ability as 'plant' | 'egg';
    const minutesPerProc = GROWTH_MINUTES_PER_PROC[abilityKind];
    if (!Number.isFinite(minutesPerProc)) {
      continue;
    }
    const reductionPerProc = minutesPerProc * (entry.baseScore / 100);
    if (!Number.isFinite(reductionPerProc) || reductionPerProc <= 0) {
      continue;
    }
    const ratePerMinute = entry.rateContribution;
    if (!Number.isFinite(ratePerMinute) || ratePerMinute <= 0) {
      continue;
    }
    const probability = Math.min(0.99, Math.max(0, ratePerMinute / Math.max(reductionPerProc, 0.0001)));
    if (probability <= 0) {
      continue;
    }
    const variance = runtimeMinutes * probability * (1 - probability) * reductionPerProc * reductionPerProc;
    varianceMinutes += variance;
  }

  if (varianceMinutes <= 0) {
    return {
      luckyMs: channel.adjustedMsRemaining,
      unluckyMs: channel.adjustedMsRemaining,
      stdMinutes: 0,
    };
  }

  const stdMinutes = Math.sqrt(varianceMinutes);
  const luckyMinutes = Math.max(0, adjustedMinutes - stdMinutes);
  const unluckyMinutes = adjustedMinutes + stdMinutes;

  return {
    luckyMs: luckyMinutes * 60000,
    unluckyMs: unluckyMinutes * 60000,
    stdMinutes,
  };
}

function updateTurtleTimerViews(snapshot: TurtleTimerState): void {
  const plant = snapshot.plant;
  const egg = snapshot.egg;
  const support = snapshot.support;

  const plantPerHourReduction = plant.contributions.reduce((sum, entry) => sum + (entry.perHourReduction ?? 0), 0);
  const plantNaturalMinutes = plant.naturalMsRemaining != null ? plant.naturalMsRemaining / 60000 : null;
  const plantAdjustedMinutes = plant.adjustedMsRemaining != null ? plant.adjustedMsRemaining / 60000 : null;
  const plantMinutesSaved = plant.minutesSaved ?? null;
  const plantTiming = computeTimingSpread(plant);

  const eggPerHourReduction = egg.contributions.reduce((sum, entry) => sum + (entry.perHourReduction ?? 0), 0);
  const eggNaturalMinutes = egg.naturalMsRemaining != null ? egg.naturalMsRemaining / 60000 : null;
  const eggAdjustedMinutes = egg.adjustedMsRemaining != null ? egg.adjustedMsRemaining / 60000 : null;
  const eggMinutesSaved = egg.minutesSaved ?? null;
  const eggTiming = computeTimingSpread(egg);

  const restorePerProcActive = support.restorePctActive;
  const restorePerProcTotal = support.restorePctTotal;
  const restoreFeedsPerHourActive = support.restorePctPerHourActive;
  const restoreFeedsPerHourTotal = support.restorePctPerHourTotal;
  const restoreTriggersPerHourActive = support.restoreTriggersPerHourActive;
  const restoreTriggersPerHourTotal = support.restoreTriggersPerHourTotal;
  const slowPctActive = support.slowPctActive;
  const slowPctTotal = support.slowPctTotal;

  const createPlaceholder = (text: string): HTMLDivElement => {
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText = 'font-size:10px;color:#90a4ae;font-style:italic;';
    return el;
  };

  const enableButtons = uiState.turtleEnableButtons;
  if (enableButtons.length === 0) {
    uiState.turtleEnableButtons = enableButtons;
  }
  for (const button of enableButtons) {
    if (!button) continue;
    if (snapshot.enabled) {
      button.textContent = 'Enabled';
      button.style.background = 'rgba(56, 142, 60, 0.28)';
      button.style.borderColor = 'rgba(56, 142, 60, 0.55)';
      button.style.color = '#e8f5e9';
    } else {
      button.textContent = 'Disabled';
      button.style.background = 'rgba(158, 158, 158, 0.22)';
      button.style.borderColor = 'rgba(158, 158, 158, 0.35)';
      button.style.color = '#eceff1';
    }
  }

  // Boardwalk toggles removed

  for (const select of uiState.turtleFocusSelects) {
    if (!select) continue;
    if (select.value !== snapshot.focus) {
      select.value = snapshot.focus;
    }
  }

  for (const select of uiState.turtleEggFocusSelects) {
    if (!select) continue;
    if (select.value !== snapshot.eggFocus) {
      select.value = snapshot.eggFocus;
    }
  }

  const plantFocusTargetKey = snapshot.focusTargetKey;
  const plantFocusOptions = snapshot.plantTargets ?? [];
  const plantFocusEnabled = snapshot.focus === 'specific';
  const hasPlantTargets = plantFocusOptions.length > 0;

  uiState.turtleFocusTargetSelects.forEach((select, index) => {
    if (!select) {
      return;
    }
    const container = uiState.turtleFocusTargetContainers[index];
    if (container) {
      container.style.display = plantFocusEnabled ? 'inline-flex' : 'none';
    }

    const previousKeys = Array.from(select.options).map((option) => option.value);
    const nextKeys = plantFocusOptions.map((option) => option.key);
    const needsRebuild =
      previousKeys.length !== nextKeys.length + 1 ||
      previousKeys.slice(1).some((key, idx) => key !== nextKeys[idx]);

    if (needsRebuild) {
      select.textContent = '';
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = plantFocusOptions.length
        ? 'Pick a plant...'
        : 'No plants detected yet';
      placeholder.disabled = plantFocusOptions.length > 0;
      placeholder.hidden = plantFocusOptions.length > 0;
      select.appendChild(placeholder);

      for (const option of plantFocusOptions) {
        const opt = document.createElement('option');
        opt.value = option.key;
        const speciesLabel = option.species ?? 'Unknown plant';
        const timingLabel = option.remainingMs != null ? formatDurationPretty(option.remainingMs) : 'Ready';
        const boardwalkBadge = option.boardwalk ? ' (boardwalk)' : '';
        opt.textContent = `${speciesLabel} - ${timingLabel}${boardwalkBadge}`;
        select.appendChild(opt);
      }
    }

    const desiredValue = plantFocusEnabled && snapshot.focusTargetAvailable && plantFocusTargetKey ? plantFocusTargetKey : '';
    if (select.value !== desiredValue) {
      select.value = desiredValue;
    }
    select.disabled = !plantFocusEnabled || plantFocusOptions.length === 0;
  });

  const eggFocusTargetKey = snapshot.eggFocusTargetKey;
  const eggFocusOptions = snapshot.eggTargets ?? [];
  const eggFocusEnabled = snapshot.eggFocus === 'specific';
  const hasEggTargets = eggFocusOptions.length > 0;

  uiState.turtleEggFocusTargetSelects.forEach((select, index) => {
    if (!select) {
      return;
    }
    const container = uiState.turtleEggFocusTargetContainers[index];
    if (container) {
      container.style.display = eggFocusEnabled ? 'inline-flex' : 'none';
    }

    const previousKeys = Array.from(select.options).map((option) => option.value);
    const nextKeys = eggFocusOptions.map((option) => option.key);
    const needsRebuild =
      previousKeys.length !== nextKeys.length + 1 ||
      previousKeys.slice(1).some((key, idx) => key !== nextKeys[idx]);

    if (needsRebuild) {
      select.textContent = '';
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = eggFocusOptions.length
        ? 'Pick an egg...'
        : 'No eggs detected yet';
      placeholder.disabled = eggFocusOptions.length > 0;
      placeholder.hidden = eggFocusOptions.length > 0;
      select.appendChild(placeholder);

      for (const option of eggFocusOptions) {
        const opt = document.createElement('option');
        opt.value = option.key;
        const speciesLabel = option.species ?? 'Unknown egg';
        const timingLabel = option.remainingMs != null ? formatDurationPretty(option.remainingMs) : 'Ready';
        const boardwalkBadge = option.boardwalk ? ' (boardwalk)' : '';
        opt.textContent = `${speciesLabel} - ${timingLabel}${boardwalkBadge}`;
        select.appendChild(opt);
      }
    }

    const desiredValue = eggFocusEnabled && snapshot.eggFocusTargetAvailable && eggFocusTargetKey ? eggFocusTargetKey : '';
    if (select.value !== desiredValue) {
      select.value = desiredValue;
    }
    select.disabled = !eggFocusEnabled || eggFocusOptions.length === 0;
  });

  const hintParts: string[] = [];
  if (snapshot.hungerFilteredCount > 0) {
    hintParts.push(`${snapshot.hungerFilteredCount} need feeding`);
  }
  if (snapshot.turtlesMissingStats > 0) {
    hintParts.push(`${snapshot.turtlesMissingStats} missing stats`);
  }
  const hintLabel = hintParts.length ? hintParts.join(' • ') : null;
  const boardwalkLabel = snapshot.includeBoardwalk ? 'Boardwalk on' : null;

  const statusEl = uiState.turtleStatus;
  const detailEl = uiState.turtleDetail;
  const footerEl = uiState.turtleFooter;

  const setSummary = (status: string, detail: string, footer: string, detailIsHTML = false): void => {
    if (statusEl) statusEl.textContent = status;
    if (detailEl) {
      if (detailIsHTML) {
        detailEl.innerHTML = detail;
      } else {
        detailEl.textContent = detail;
      }
    }
    if (footerEl) footerEl.textContent = footer;
  };

  // Update plant name header
  const plantNameTextEl = (uiState as any).turtlePlantNameText;

  if (!snapshot.enabled) {
    if (plantNameTextEl) plantNameTextEl.textContent = 'Timer Disabled';
    setSummary('Timer disabled', 'Enable to track crops and eggs', '');
  } else if (plant.status === 'no-data') {
    if (plantNameTextEl) plantNameTextEl.textContent = 'Waiting...';
    setSummary('Waiting for garden data…', 'Move camera or interact with garden', '');
  } else if (plant.status === 'no-crops') {
    if (plantNameTextEl) plantNameTextEl.textContent = 'No Crops';
    setSummary('No crops growing', 'Plant seeds to start tracking', '');
  } else if (plant.status === 'no-turtles') {
    const cropName = plant.focusSlot?.species || 'Crop';
    if (plantNameTextEl) plantNameTextEl.textContent = cropName;
    const etaText = plant.naturalMsRemaining ? formatDurationPretty(plant.naturalMsRemaining) : '—';
    const cropsText = `${plant.growingSlots}/${plant.trackedSlots} crops`;
    setSummary(`${cropName} • ${etaText}`, `No plant boost • ${cropsText}`, '');
  } else if (plant.status === 'estimating') {
    const cropName = plant.focusSlot?.species || 'Crop';
    if (plantNameTextEl) plantNameTextEl.textContent = cropName;
    const etaText = formatDurationPretty(plant.adjustedMsRemaining);
    const finishTime = formatCompletionTime(plant.adjustedMsRemaining);
    const speedText = formatRatePretty(plant.effectiveRate);

    // Calculate unlucky time
    const timing = computeTimingSpread(plant);
    const unluckyText = timing.unluckyMs != null ? formatDurationPretty(timing.unluckyMs) : '';

    // Build turtle booster summary with growth rates
    const turtleParts: string[] = [];
    if (plant.contributions.length > 0) {
      turtleParts.push(`🌱 ${speedText} plant`);
    }
    if (egg.contributions.length > 0 && egg.status === 'estimating' && egg.effectiveRate != null) {
      const eggSpeed = formatRatePretty(egg.effectiveRate);
      turtleParts.push(`🥚 ${eggSpeed} egg`);
    } else if (egg.contributions.length > 0) {
      turtleParts.push(`🥚 ${egg.contributions.length} egg`);
    }
    const totalFoodTurtles = support.restoreCount + support.slowCount;
    if (totalFoodTurtles > 0) {
      turtleParts.push(`🍽️ ${totalFoodTurtles} food`);
    }

    const turtleSummary = turtleParts.length > 0 ? turtleParts.join(' • ') : 'No turtles';
    const cropsText = `${plant.growingSlots}/${plant.trackedSlots} crops`;

    // Create detailed second line with unlucky time in red
    let detailHTML = `${turtleSummary} • ${cropsText}`;
    if (unluckyText) {
      detailHTML += ` • <span style="color:#ff5252;font-size:9px;">(${unluckyText})</span>`;
    }

    setSummary(`${cropName} • ${etaText}${finishTime}`, detailHTML, '', true);
  } else {
    if (plantNameTextEl) plantNameTextEl.textContent = 'Idle';
    setSummary('Turtle timer idle', '', '');
  }

  const plantSummary = uiState.turtlePlantSummary;
  if (plantSummary) {
    if (!snapshot.enabled) {
      plantSummary.innerHTML = '<div style="font-size:11px;color:#ef5350;">⏸️ Timer disabled</div>';
    } else if (plant.status === 'no-data') {
      plantSummary.innerHTML = plantFocusEnabled && !snapshot.focusTargetAvailable && hasPlantTargets
        ? '<div style="font-size:11px;color:#FFB74D;">🎯 Select target plant</div>'
        : '<div style="font-size:11px;color:#9E9E9E;">⏳ Waiting...</div>';
    } else if (plant.status === 'no-crops') {
      plantSummary.innerHTML = '<div style="font-size:11px;color:#9E9E9E;">🌾 No crops</div>';
    } else {
      const cropName = plant.focusSlot?.species || 'Unknown';
      const boosterCount = plant.contributions.length;
      plantSummary.innerHTML = `<div style="font-size:11px;font-weight:600;color:#4CAF50;">🌱 ${cropName}</div><div style="font-size:10px;color:#81C784;">⚡ ${boosterCount} booster${boosterCount === 1 ? '' : 's'}</div>`;
    }
  }

  const plantEta = uiState.turtlePlantEta;
  if (plantEta) {
    if (!snapshot.enabled) {
      plantEta.textContent = '—';
    } else if (plant.status === 'estimating') {
      const completionTime = formatCompletionTime(plant.adjustedMsRemaining);
      plantEta.innerHTML = `⏱️ ${formatDurationPretty(plant.adjustedMsRemaining)}<span style="font-size:10px;color:#81C784;margin-left:6px;">${completionTime}</span>`;
    } else if (plant.status === 'no-turtles') {
      if (plant.naturalMsRemaining != null) {
        const completionTime = formatCompletionTime(plant.naturalMsRemaining);
        plantEta.innerHTML = `⏱️ ${formatDurationPretty(plant.naturalMsRemaining)}<span style="font-size:10px;color:#9E9E9E;margin-left:6px;">(no boost)</span>`;
      } else {
        plantEta.textContent = '—';
      }
    } else {
      plantEta.textContent = '—';
    }
  }

  const plantTotals = uiState.turtlePlantTotals;
  if (plantTotals) {
    if (!snapshot.enabled) {
      plantTotals.innerHTML = '<div style="font-size:10px;color:#9E9E9E;">⏸️ Paused</div>';
    } else if (plantFocusEnabled && !snapshot.focusTargetAvailable) {
      plantTotals.innerHTML = hasPlantTargets
        ? '<div style="font-size:10px;color:#9E9E9E;">🎯 Select focus plant</div>'
        : '<div style="font-size:10px;color:#9E9E9E;">⏳ Loading...</div>';
    } else if (plant.status === 'no-data') {
      plantTotals.innerHTML = '<div style="font-size:10px;color:#9E9E9E;">⏳ Loading...</div>';
    } else if (plant.status === 'no-crops') {
      plantTotals.innerHTML = '<div style="font-size:10px;color:#9E9E9E;">🌾 No crops</div>';
    } else if (plant.status === 'no-turtles') {
      const naturalText = plantNaturalMinutes != null ? formatMinutesWithUnit(plantNaturalMinutes) : '—';
      plantTotals.innerHTML = `<div style="font-size:10px;font-weight:600;color:#FFB74D;">⚠️ No boost</div><div style="font-size:9px;color:#BDBDBD;">Normal: ${naturalText}</div>`;
    } else {
      const naturalText = plantNaturalMinutes != null ? formatMinutesWithUnit(plantNaturalMinutes) : '—';
      const savedText = plantMinutesSaved != null ? formatMinutesWithUnit(plantMinutesSaved) : '—';
      plantTotals.innerHTML = `<div style="font-size:10px;font-weight:600;color:#4CAF50;">⚡ Boost: ${formatMinutesPerHour(plantPerHourReduction)}</div><div style="font-size:9px;color:#81C784;">✂️ Cut: ${savedText}</div><div style="font-size:9px;color:#BDBDBD;">📅 Normal: ${naturalText}</div>`;
    }
  }

  const plantSimple = uiState.turtlePlantSimple;
  if (plantSimple) {
    if (!snapshot.enabled) {
      plantSimple.innerHTML = '<span style="font-size:16px;">⏸️</span><span>Enable temple to track</span>';
    } else if (plantFocusEnabled && !snapshot.focusTargetAvailable) {
      plantSimple.innerHTML = hasPlantTargets
        ? '<span style="font-size:16px;">🎯</span><span>Select a focus plant</span>'
        : '<span style="font-size:16px;">⏳</span><span>Loading garden data...</span>';
    } else if (plant.status === 'no-data') {
      plantSimple.innerHTML = '<span style="font-size:16px;">⏳</span><span>Loading garden data...</span>';
    } else if (plant.status === 'no-crops') {
      plantSimple.innerHTML = '<span style="font-size:16px;">🌾</span><span>No crops growing</span>';
    } else if (plant.status === 'no-turtles') {
      plantSimple.innerHTML = `<span style="font-size:16px;">⏱️</span><span>Matures in ${formatDurationPretty(plant.naturalMsRemaining)} <span style="color:#9E9E9E;">(no boost)</span></span>`;
    } else {
      const savedText = plantMinutesSaved != null ? formatMinutesWithUnit(plantMinutesSaved) : '—';
      plantSimple.innerHTML = `<span style="font-size:16px;">✨</span><span>Matures in <strong>${formatDurationPretty(plant.adjustedMsRemaining)}</strong> • <span style="color:#4CAF50;font-weight:600;">✂️ ${savedText} saved</span></span>`;
    }
  }

  const plantLuck = uiState.turtlePlantLuck;
  if (plantLuck) {
    if (!snapshot.enabled || plant.status !== 'estimating') {
      plantLuck.textContent = '';
    } else {
      const luckyText = plantTiming.luckyMs != null ? formatDurationPretty(plantTiming.luckyMs) : '—';
      const unluckyText = plantTiming.unluckyMs != null ? formatDurationPretty(plantTiming.unluckyMs) : '—';
      const stdText = plantTiming.stdMinutes != null ? formatMinutesWithUnit(plantTiming.stdMinutes) : '—';
      plantLuck.innerHTML = `<span style="font-size:14px;">🎲</span><span>🍀 ${luckyText} • 😐 ${unluckyText} <span style="color:#80CBC4;">(±${stdText})</span></span>`;
    }
  }

  const eggSummary = uiState.turtleEggSummary;
  if (eggSummary) {
    if (!snapshot.enabled) {
      eggSummary.textContent = 'Timer disabled';
    } else if (egg.status === 'no-data') {
      eggSummary.textContent = eggFocusEnabled && !snapshot.eggFocusTargetAvailable && hasEggTargets
        ? 'Select a target egg with Egg focus to track hatching.'
        : 'Waiting for garden snapshot…';
    } else if (egg.status === 'no-eggs') {
      eggSummary.textContent = 'No eggs incubating.';
    } else {
  eggSummary.textContent = `${egg.growingSlots}/${egg.trackedSlots} growing eggs • ${egg.contributions.length} booster${egg.contributions.length === 1 ? '' : 's'}`;
    }
  }

  const eggEta = uiState.turtleEggEta;
  if (eggEta) {
    if (!snapshot.enabled) {
      eggEta.textContent = '—';
    } else if (egg.status === 'estimating') {
      const completionTime = formatCompletionTime(egg.adjustedMsRemaining);
      eggEta.textContent = `${formatDurationPretty(egg.adjustedMsRemaining)} (${formatRatePretty(egg.effectiveRate)})${completionTime}`;
    } else if (egg.status === 'no-turtles') {
      if (egg.naturalMsRemaining != null) {
        const completionTime = formatCompletionTime(egg.naturalMsRemaining);
        eggEta.textContent = `${formatDurationPretty(egg.naturalMsRemaining)} (no turtle boost)${completionTime}`;
      } else {
        eggEta.textContent = '—';
      }
    } else {
      eggEta.textContent = '—';
    }
  }

  const eggTotals = uiState.turtleEggTotals;
  if (eggTotals) {
    if (!snapshot.enabled) {
      eggTotals.textContent = 'Totals paused while the temple is disabled.';
    } else if (eggFocusEnabled && !snapshot.eggFocusTargetAvailable) {
      eggTotals.textContent = hasEggTargets
        ? 'Total Hatch Boost will appear once a target egg is selected.'
        : 'Waiting for a fresh egg snapshot...';
    } else if (egg.status === 'no-eggs') {
      eggTotals.textContent = 'No incubating eggs detected yet – hatchery estimates will appear here.';
    } else if (egg.status === 'no-turtles') {
      const naturalText = eggNaturalMinutes != null ? formatMinutesWithUnit(eggNaturalMinutes) : '—';
      eggTotals.textContent = `No hatch turtles boosting yet. Normal ETA: ${naturalText}. Assign turtles to speed this up.`;
    } else if (egg.status === 'estimating') {
      eggTotals.textContent = `Total Growth Boost: ${formatMinutesPerHour(eggPerHourReduction)} • Normal ETA: ${
        eggNaturalMinutes != null ? formatMinutesWithUnit(eggNaturalMinutes) : '—'
      } • Estimated Time Cut: ${eggMinutesSaved != null ? formatMinutesWithUnit(eggMinutesSaved) : '—'}`;
    } else {
      eggTotals.textContent = 'Waiting for an egg snapshot…';
    }
  }

  const eggSimple = uiState.turtleEggSimple;
  if (eggSimple) {
    if (!snapshot.enabled) {
      eggSimple.textContent = 'Enable the temple to see egg hatching boosts too.';
    } else if (egg.status === 'no-eggs') {
      eggSimple.textContent = 'No eggs on the boardwalk or garden right now. Drop an egg to start tracking.';
    } else if (eggFocusEnabled && !snapshot.eggFocusTargetAvailable) {
      eggSimple.textContent = hasEggTargets
        ? 'Pick a target egg with Egg focus to show its hatch ETA and boost cut.'
        : 'Waiting on egg snapshots – try moving the camera or drop an egg to refresh.';
    } else if (egg.status === 'no-data') {
      eggSimple.textContent = 'Waiting on egg snapshots – try moving the camera or interacting with the garden.';
    } else if (egg.status === 'no-turtles') {
      const naturalText = eggNaturalMinutes != null ? formatMinutesWithUnit(eggNaturalMinutes) : '—';
      eggSimple.textContent = `Focused egg hatches in ${formatDurationPretty(egg.naturalMsRemaining)} (no turtle boost active). Normal ETA: ${naturalText}.`;
    } else if (egg.status === 'estimating') {
      const naturalText = eggNaturalMinutes != null ? formatMinutesWithUnit(eggNaturalMinutes) : '—';
      const savedText = eggMinutesSaved != null ? formatMinutesWithUnit(eggMinutesSaved) : '—';
      eggSimple.textContent = `Focused egg hatches in ${formatDurationPretty(egg.adjustedMsRemaining)} (Normal ETA: ${naturalText}); Estimated Time Cut: ${savedText}.`;
    } else {
      eggSimple.textContent = '';
    }
  }

  const eggLuck = uiState.turtleEggLuck;
  if (eggLuck) {
    if (!snapshot.enabled) {
      eggLuck.textContent = '';
    } else if (egg.status === 'estimating') {
      const luckyText = eggTiming.luckyMs != null ? formatDurationPretty(eggTiming.luckyMs) : '—';
      const unluckyText = eggTiming.unluckyMs != null ? formatDurationPretty(eggTiming.unluckyMs) : '—';
      const stdText = eggTiming.stdMinutes != null ? formatMinutesWithUnit(eggTiming.stdMinutes) : '—';
      eggLuck.textContent = `Lucky ≈ ${luckyText} • Unlucky ≈ ${unluckyText} (±${stdText})`;
    } else if (egg.status === 'no-turtles') {
      eggLuck.textContent = 'No turtle boosts active for eggs right now.';
    } else {
      eggLuck.textContent = '';
    }
  }

  const supportSummary = uiState.turtleSupportSummary;
  const supportTotalsEl = uiState.turtleSupportTotals;
  const supportSimple = uiState.turtleSupportSimple;
  const supportList = uiState.turtleSupportList;

  if (supportSummary) {
    if (!snapshot.enabled) {
      supportSummary.textContent = 'Food buffs paused while the temple is disabled.';
    } else if (support.entries.length === 0) {
      supportSummary.textContent = 'No food turtles detected – add Hunger Restore or Hunger Boost companions.';
    } else {
      supportSummary.textContent = `Restore turtles active ${support.restoreActiveCount}/${support.restoreCount} • Slow drain turtles active ${support.slowActiveCount}/${support.slowCount}`;
    }
  }

  if (supportTotalsEl) {
    if (!snapshot.enabled || support.entries.length === 0) {
      supportTotalsEl.textContent = '';
    } else {
      const activeRestoreFeeds = restoreFeedsPerHourActive > 0 ? formatFeedsPerHour(restoreFeedsPerHourActive, 1) : '0.0 feeds/hr';
      const maxRestoreFeeds = restoreFeedsPerHourTotal > 0 ? formatFeedsPerHour(restoreFeedsPerHourTotal, 1) : '0.0 feeds/hr';
      const restoreLine = support.restoreCount > 0
        ? `Restore: ~${activeRestoreFeeds} (max ${maxRestoreFeeds})`
        : 'Restore: none yet';
      const slowLine = support.slowCount > 0
        ? `Slow drain: ${formatPercentPretty(slowPctActive, 0)} active (${formatPercentPretty(slowPctTotal, 0)} possible)`
        : 'Slow drain: none yet';
      supportTotalsEl.textContent = `${restoreLine} • ${slowLine}`;
    }
  }

  if (supportSimple) {
    if (!snapshot.enabled) {
      supportSimple.textContent = 'Enable the turtle temple and keep turtles fed to maintain hunger buffs.';
    } else if (support.entries.length === 0) {
      supportSimple.textContent = 'Assign turtles with Hunger Restore (refills) or Hunger Boost (slow drain) abilities to see food support stats.';
    } else {
      const hasRestoreTurtles = support.restoreCount > 0;
      const activeRestore = restorePerProcActive > 0 && support.restoreActiveCount > 0;
      const hasSlowBuff = support.slowActiveCount > 0 && slowPctActive > 0;

      if (activeRestore && restoreTriggersPerHourActive > 0) {
        const feedsPerHour = restoreFeedsPerHourActive / 100;
        supportSimple.textContent = `Restore turtles are covering ~${feedsPerHour.toFixed(1)} feeds/hr and slow drain buffs are cutting hunger by ${formatPercentPretty(slowPctActive, 0)} while they stay fed.`;
      } else if (hasRestoreTurtles && support.restoreActiveCount === 0) {
        supportSimple.textContent = 'Your restore turtles need food before their hourly refills kick back in.';
      } else if (hasSlowBuff) {
        supportSimple.textContent = `Slow drain buffs are active, trimming hunger by ${formatPercentPretty(slowPctActive, 0)} as long as the turtles stay full.`;
      } else if (hasRestoreTurtles) {
        supportSimple.textContent = 'Restore turtles are present but idle—feed them to start the hourly refills.';
      } else {
        supportSimple.textContent = 'Add food turtles with Hunger Restore or Hunger Boost abilities to see refills and slowdown buffs here.';
      }
    }
  }

  if (supportList) {
    supportList.textContent = '';
    if (!snapshot.enabled) {
      supportList.appendChild(createPlaceholder('Timer disabled.'));
    } else if (support.entries.length === 0) {
      supportList.appendChild(createPlaceholder('No food turtles detected.'));
    } else {
      for (const entry of support.entries) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;flex-direction:column;gap:3px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:10px;';

  const headerLine = document.createElement('div');
  headerLine.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:12px;color:#ffe9a6;';

  const nameLabel = document.createElement('span');
  nameLabel.style.cssText = 'display:flex;align-items:center;gap:6px;';
  const turtleSprite = renderCompactPetSprite({
    species: 'Turtle'
  });
  nameLabel.innerHTML = `${turtleSprite}<span>${entry.name ?? 'Unknown'} • ${entry.abilityNames.join(', ')}</span>`;

  const statusBadge = document.createElement('span');
        statusBadge.textContent = entry.active ? 'Active' : 'Needs feed';
        statusBadge.style.cssText = `padding:1px 6px;border-radius:12px;font-size:9px;background:${entry.active ? 'rgba(129,199,132,0.25)' : 'rgba(255,138,128,0.25)'};color:${entry.active ? '#c8e6c9' : '#ffab91'};`; 
  headerLine.append(nameLabel, statusBadge);

        const infoLines = document.createElement('div');
        infoLines.style.cssText = 'display:flex;flex-direction:column;gap:2px;color:#ffecb3;';

        const perHourFeeds = entry.totalRestorePerHourPct > 0 ? entry.totalRestorePerHourPct / 100 : 0;
        if (entry.totalRestorePerHourPct > 0) {
          const restoreLine = document.createElement('div');
          restoreLine.textContent = `Restore: ${perHourFeeds.toFixed(1)} feeds/hr (${formatPercentPretty(entry.totalRestorePerTriggerPct, 0)} per proc, ~${entry.totalTriggersPerHour.toFixed(1)} procs/hr)`;
          infoLines.appendChild(restoreLine);
        }
        if (entry.totalSlowPct > 0) {
          const slowLine = document.createElement('div');
          slowLine.textContent = `Slow drain: ${formatPercentPretty(entry.totalSlowPct, 0)} less hunger/hr while active`;
          infoLines.appendChild(slowLine);
        }
        if (perHourFeeds > 0 || entry.totalSlowPct > 0) {
          const reliefLine = document.createElement('div');
          if (perHourFeeds > 0 && entry.totalSlowPct > 0) {
            reliefLine.textContent = `Auto-feed relief: ~${perHourFeeds.toFixed(1)} fewer feeds/hr and pets eat ~${formatPercentPretty(entry.totalSlowPct, 0)} less often.`;
          } else if (perHourFeeds > 0) {
            reliefLine.textContent = `Auto-feed relief: ~${perHourFeeds.toFixed(1)} fewer feeds/hr thanks to this turtle.`;
          } else {
            reliefLine.textContent = `Auto-feed relief: pets eat ~${formatPercentPretty(entry.totalSlowPct, 0)} less often.`;
          }
          infoLines.appendChild(reliefLine);
        }
        if (!infoLines.hasChildNodes()) {
          const placeholderLine = document.createElement('div');
          placeholderLine.textContent = 'No active food effects yet.';
          infoLines.appendChild(placeholderLine);
        }

        const metaLine = document.createElement('div');
        metaLine.style.cssText = 'font-size:9px;color:#ffdd99;display:flex;flex-wrap:wrap;gap:8px;';
        const hungerText = `Hunger ${formatHungerPretty(entry.hungerPct)}`;
        const scoreText = `Score ${Math.round(entry.baseScore)}`;

        // Create editable XP field
        const xpLabel = document.createElement('span');
        xpLabel.textContent = 'xp: ';
        const xpValue = createEditablePetValue(
          { species: entry.species, slotIndex: entry.slotIndex },
          'xp',
          entry.xp,
          (val) => val != null ? `${Math.round(val / 1000)}k` : '?'
        );

        // Create editable Scale field
        const scaleLabel = document.createElement('span');
        scaleLabel.textContent = ' • Scale: ';
        const scaleValue = createEditablePetValue(
          { species: entry.species, slotIndex: entry.slotIndex },
          'targetScale',
          entry.targetScale,
          (val) => val != null && Number.isFinite(val) ? `${val.toFixed(2)}×` : '?'
        );

        metaLine.textContent = `${hungerText} • ${scoreText} • `;
        metaLine.appendChild(xpLabel);
        metaLine.appendChild(xpValue);
        metaLine.appendChild(scaleLabel);
        metaLine.appendChild(scaleValue);

        row.append(headerLine, infoLines, metaLine);
        supportList.appendChild(row);
      }

      const rows = supportList.querySelectorAll(':scope > div');
      if (rows.length > 0) {
        (rows[rows.length - 1] as HTMLElement).style.borderBottom = 'none';
      }
    }
  }

  const plantTable = uiState.turtlePlantTable;
  if (plantTable) {
    plantTable.textContent = '';
    if (!snapshot.enabled) {
      plantTable.appendChild(createPlaceholder('Timer disabled.'));
    } else if (plant.contributions.length === 0) {
      plantTable.appendChild(createPlaceholder('No growth turtles contributing yet.'));
    } else {
      for (const entry of plant.contributions) {
        const row = document.createElement('div');
        row.style.cssText = 'display:grid;grid-template-columns:1.4fr 0.7fr 0.6fr 0.8fr;gap:6px;font-size:10px;padding:2px 0;';

        const nameCell = document.createElement('div');
        // Prioritize actual pet NAME (user's custom name), fallback to species, then slot number
        nameCell.textContent = (entry.name && entry.name.trim()) || entry.species || `Slot ${entry.slotIndex + 1}`;
        nameCell.style.color = entry.missingStats ? '#ffcc80' : '#e0f2f1';

        const hungerCell = document.createElement('div');
        hungerCell.textContent = formatHungerPretty(entry.hungerPct);
        hungerCell.style.color = entry.hungerPct != null && entry.hungerPct < snapshot.minActiveHungerPct ? '#ff8a80' : '#b2dfdb';

        const rateCell = document.createElement('div');
        rateCell.textContent = `${entry.perHourReduction.toFixed(1)} min/hr`;
        rateCell.style.color = '#aed581';

        const xpCell = document.createElement('div');
        xpCell.style.color = entry.missingStats ? '#ffcc80' : '#c5cae9';
        const xpEditableValue = createEditablePetValue(
          { species: entry.species, slotIndex: entry.slotIndex },
          'xp',
          entry.xp,
          (val) => val != null ? `${Math.round(val / 1000)}k xp` : '—'
        );
        xpCell.appendChild(xpEditableValue);

        row.append(nameCell, hungerCell, rateCell, xpCell);
        plantTable.appendChild(row);
      }
    }
  }

  const eggTable = uiState.turtleEggTable;
  if (eggTable) {
    eggTable.textContent = '';
    if (!snapshot.enabled) {
      eggTable.appendChild(createPlaceholder('Timer disabled.'));
    } else if (egg.contributions.length === 0) {
      eggTable.appendChild(createPlaceholder('No egg boosters contributing yet.'));
    } else {
      for (const entry of egg.contributions) {
        const row = document.createElement('div');
        row.style.cssText = 'display:grid;grid-template-columns:1.4fr 0.7fr 0.6fr 0.8fr;gap:6px;font-size:10px;padding:2px 0;';

        const nameCell = document.createElement('div');
        // Prioritize actual pet NAME (user's custom name), fallback to species, then slot number
        nameCell.textContent = (entry.name && entry.name.trim()) || entry.species || `Slot ${entry.slotIndex + 1}`;
        nameCell.style.color = entry.missingStats ? '#ffcc80' : '#e0f2f1';

        const hungerCell = document.createElement('div');
        hungerCell.textContent = formatHungerPretty(entry.hungerPct);
        hungerCell.style.color = entry.hungerPct != null && entry.hungerPct < snapshot.minActiveHungerPct ? '#ff8a80' : '#b2dfdb';

        const rateCell = document.createElement('div');
        rateCell.textContent = `${entry.perHourReduction.toFixed(1)} min/hr`;
        rateCell.style.color = '#aed581';

        const xpCell = document.createElement('div');
        xpCell.style.color = entry.missingStats ? '#ffcc80' : '#c5cae9';
        const xpEditableValue = createEditablePetValue(
          { species: entry.species, slotIndex: entry.slotIndex },
          'xp',
          entry.xp,
          (val) => val != null ? `${Math.round(val / 1000)}k xp` : '—'
        );
        xpCell.appendChild(xpEditableValue);

        row.append(nameCell, hungerCell, rateCell, xpCell);
        eggTable.appendChild(row);
      }
    }
  }
}

function ensureShopCountdownTimer(): void {
  if (shopCountdownTimer != null) {
    return;
  }
  shopCountdownTimer = window.setInterval(updateShopCountdownViews, 1000) as unknown as number;
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

function updateDashboardFeedDisplay(status?: string): void {
  if (typeof status === 'string') {
    latestFeedStatusText = status;
  }

  const list = uiState.dashboardFeedList;
  const meta = uiState.dashboardFeedMeta;
  if (!list || !meta) {
    return;
  }

  const source = (typeof status === 'string' ? status : latestFeedStatusText).trim();

  list.textContent = '';
  meta.textContent = '';
  meta.style.display = 'none';

  if (!source) {
    const placeholder = document.createElement('div');
    placeholder.textContent = 'Waiting for auto-feed...';
    placeholder.style.cssText = 'font-size:11px;color:var(--qpm-text-muted)';
    list.appendChild(placeholder);
    return;
  }

  const segments = source.split('|').map(part => part.trim()).filter(Boolean);
  const petSegments = segments.filter(segment => !/^(Waiting|No pets|Auto-feed disabled)/i.test(segment));
  const extraSegments = segments.filter(segment => /^(Waiting|No pets|Auto-feed disabled)/i.test(segment));

  if (petSegments.length === 0) {
    const message = document.createElement('div');
    message.textContent = source;
    message.style.cssText = 'font-size:11px;color:var(--qpm-text-muted)';
    list.appendChild(message);
    return;
  }

  petSegments.forEach((segment) => {
  const match = segment.match(/^(.+?)\s*:\s*(.+)$/);
  const labelText = match?.[1] ? match[1].trim() : segment.trim();
  const valueText = match?.[2] ?? '';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;font-size:10px;color:var(--qpm-text);';

    const label = document.createElement('span');
  label.textContent = labelText;
  label.style.cssText = 'font-size:10px;';

    const value = document.createElement('span');
  const trimmedValue = valueText.trim();
    value.textContent = trimmedValue || '—';
    value.style.cssText = 'font-family:monospace;color:var(--qpm-text);font-size:10px;';

    if (/skip/i.test(trimmedValue)) {
      value.style.color = '#ffb74d';
    } else {
      const numericMatch = trimmedValue.match(/(\d+(?:\.\d+)?)/);
      if (numericMatch) {
        const numeric = Number(numericMatch[1]);
        if (Number.isFinite(numeric)) {
          if (numeric <= 40) {
            value.style.color = '#ef5350';
          } else if (numeric <= 70) {
            value.style.color = '#ffca28';
          } else {
            value.style.color = '#81c784';
          }
        }
      }
    }

    row.append(label, value);
    list.appendChild(row);
  });

  if (extraSegments.length > 0) {
    meta.textContent = extraSegments.join(' | ');
    meta.style.display = 'block';
  }
}

function computeShopItemRank(entry: AutoShopItemConfig): number {
  const rarityRank = typeof entry.rarityRank === 'number' ? entry.rarityRank : 999;
  const enabledBias = entry.enabled ? -0.5 : 0;
  return rarityRank + enabledBias;
}

let qpmPanelStylesInjected = false;

function ensurePanelStyles(): void {
  if (qpmPanelStylesInjected) {
    return;
  }
  const style = document.createElement('style');
  style.id = 'qpm-panel-styles';
  style.textContent = `:root {
    --qpm-surface-1: rgba(18, 21, 32, 0.95);
    --qpm-surface-2: rgba(32, 36, 52, 0.9);
    --qpm-surface-3: rgba(52, 58, 78, 0.85);
    --qpm-border: rgba(120, 130, 170, 0.28);
    --qpm-text: #eef0ff;
    --qpm-text-muted: #97a0c0;
    --qpm-accent: #8f82ff;
    --qpm-accent-strong: #b39cff;
    --qpm-positive: #4fd18b;
    --qpm-danger: #ff6f91;
    --qpm-warning: #ffb347;
    --qpm-shadow: 0 14px 32px rgba(15, 17, 28, 0.55);
    --qpm-divider: rgba(120, 130, 170, 0.2);
    --qpm-font: 'Inter', 'Segoe UI', Arial, sans-serif;
  }

  .qpm-panel {
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 2147483647;
    background: var(--qpm-surface-1);
    color: var(--qpm-text);
    padding: 0;
    border-radius: 14px;
    font: 12px/1.55 var(--qpm-font);
    box-shadow: var(--qpm-shadow);
    min-width: 360px;
    max-width: 430px;
    max-height: calc(100vh - 32px);
    overflow: hidden;
    backdrop-filter: blur(18px);
    border: 1px solid var(--qpm-border);
  }

  .qpm-panel__titlebar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    font-size: 15px;
    font-weight: 600;
    background: linear-gradient(135deg, rgba(143, 130, 255, 0.28), rgba(32, 36, 52, 0.85));
    cursor: move;
    user-select: none;
  }

  .qpm-panel__titlebar button {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.18);
    color: var(--qpm-text-muted);
    border-radius: 18px;
    font-size: 11px;
    padding: 4px 10px;
    cursor: pointer;
    transition: background 0.2s ease, color 0.2s ease;
  }

  .qpm-panel__titlebar button:hover {
    background: rgba(255, 255, 255, 0.16);
    color: var(--qpm-text);
  }

  .qpm-version-bubble {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.3px;
    transition: all 0.2s ease;
    margin-left: auto;
    margin-right: 8px;
  }

  .qpm-version-bubble[data-status="up-to-date"] {
    background: rgba(76, 175, 80, 0.2);
    color: #4CAF50;
    border: 1px solid rgba(76, 175, 80, 0.4);
  }

  .qpm-version-bubble[data-status="outdated"] {
    background: rgba(244, 67, 54, 0.18);
    color: #F44336;
    border: 1px solid rgba(244, 67, 54, 0.55);
    animation: pulse-warning 2s ease-in-out infinite;
  }

  .qpm-version-bubble[data-status="checking"] {
    background: rgba(158, 158, 158, 0.2);
    color: #9E9E9E;
    border: 1px solid rgba(158, 158, 158, 0.4);
  }

  .qpm-version-bubble[data-status="error"] {
    background: rgba(244, 67, 54, 0.2);
    color: #F44336;
    border: 1px solid rgba(244, 67, 54, 0.4);
  }

  .qpm-version-bubble:hover[data-status="outdated"] {
    transform: scale(1.05);
    background: rgba(255, 193, 7, 0.3);
  }

  @keyframes pulse-warning {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.7;
    }
  }

  .qpm-content {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px 16px 16px;
    overflow-y: auto;
    overflow-x: hidden;
    max-height: calc(100vh - 120px);
  }

  .qpm-nav {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 6px;
  }

  .qpm-nav__button {
    flex: 1 1 calc(33% - 8px);
    min-width: 120px;
    border: 1px solid var(--qpm-border);
    background: rgba(255, 255, 255, 0.04);
    color: var(--qpm-text-muted);
    border-radius: 10px;
    padding: 8px 10px;
    font-size: 12px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
  }

  .qpm-nav__button:hover {
    border-color: var(--qpm-accent-strong);
    color: var(--qpm-text);
  }

  .qpm-nav__button--active {
    border-color: var(--qpm-accent);
    color: var(--qpm-text);
    /* Background and box-shadow set by JavaScript based on tab color */
  }

  .qpm-tabs {
    position: relative;
  }

  .qpm-tab {
    display: none;
    flex-direction: column;
    gap: 12px;
  }

  .qpm-tab--active {
    display: flex;
  }

  .qpm-card {
    background: var(--qpm-surface-2);
    border: 1px solid var(--qpm-border);
    border-radius: 12px;
    padding: 12px 14px;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.03);
  }

  .qpm-table {
    width: 100%;
    border-collapse: collapse;
  }

  .qpm-table thead {
    background: rgba(255, 255, 255, 0.05);
    text-transform: uppercase;
    letter-spacing: 0.3px;
    font-size: 9px;
    color: var(--qpm-text-muted);
  }

  .qpm-table th,
  .qpm-table td {
    padding: 6px 8px;
    text-align: left;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  }

  .qpm-table tbody tr:nth-child(odd) {
    background: rgba(255, 255, 255, 0.02);
  }

  .qpm-table--compact th,
  .qpm-table--compact td {
    font-size: 10px;
  }

  .qpm-ability-divider td {
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .qpm-ability-section td {
    background: rgba(255, 255, 255, 0.04);
    font-weight: 600;
    font-size: 11px;
    color: var(--qpm-text);
    padding: 7px 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .qpm-ability-section__content {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .qpm-ability-section__title {
    font-weight: 600;
  }

  .qpm-ability-section__meta {
    font-weight: 400;
    font-size: 10px;
    color: var(--qpm-text-muted);
  }

  .qpm-ability-total {
    font-weight: 600;
    background: rgba(255, 255, 255, 0.03);
  }

  .qpm-ability-total td {
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .qpm-tracker-summary {
    font-size: 11px;
    color: var(--qpm-text-muted);
    line-height: 1.5;
  }

  .qpm-mutation-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
    font-size: 11px;
  }

  .qpm-mutation-meta__group {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .qpm-mutation-source {
    font-size: 10px;
    color: var(--qpm-text-muted);
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 999px;
    padding: 2px 8px;
  }

  .qpm-mutation-countdown {
    font-size: 11px;
    color: var(--qpm-text-muted);
    margin-top: 4px;
  }

  .qpm-mutation-countdown[data-state='active'] {
    color: #b3ffe0;
  }

  .qpm-mutation-countdown[data-state='expired'] {
    color: #ffcc80;
  }

  .qpm-mutation-totals {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  }

  .qpm-mutation-chip {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    padding: 6px 10px;
    min-width: 130px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .qpm-mutation-chip--active {
    border-color: rgba(143, 130, 255, 0.5);
    box-shadow: 0 0 0 1px rgba(143, 130, 255, 0.3);
  }

  .qpm-mutation-chip__label {
    font-size: 11px;
    font-weight: 600;
    color: var(--qpm-text);
  }

  .qpm-mutation-chip__meta {
    font-size: 10px;
    color: var(--qpm-text-muted);
  }

  .qpm-mutation-detail {
    margin-top: 8px;
  }

  .qpm-tracker-note {
    font-size: 10px;
    color: #90caf9;
    background: rgba(144, 202, 249, 0.08);
    border: 1px dashed rgba(144, 202, 249, 0.4);
    border-radius: 8px;
    padding: 8px;
  }

  .qpm-card__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }

  .qpm-card__title {
    font-size: 13px;
    font-weight: 600;
    color: var(--qpm-text);
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .qpm-section-muted {
    color: var(--qpm-text-muted);
    font-size: 11px;
  }

  .qpm-button {
    padding: 6px 10px;
    font-size: 12px;
    cursor: pointer;
    border: 1px solid var(--qpm-border);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.06);
    color: var(--qpm-text);
    transition: background 0.2s ease, border-color 0.2s ease;
  }

  .qpm-button:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.12);
    border-color: var(--qpm-accent);
  }

  .qpm-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .qpm-button--accent {
    background: rgba(143, 130, 255, 0.24);
    border-color: var(--qpm-accent);
  }

  .qpm-button--positive {
    background: rgba(79, 209, 139, 0.28);
    border-color: rgba(79, 209, 139, 0.6);
  }

  .qpm-grid {
    display: grid;
    gap: 10px;
  }

  .qpm-grid--two {
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }

  .qpm-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .qpm-input,
  .qpm-select {
    padding: 4px 8px;
    border: 1px solid var(--qpm-border);
    border-radius: 8px;
    background: rgba(20, 24, 36, 0.65);
    color: var(--qpm-text);
    font-size: 11px;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }

  .qpm-input:focus,
  .qpm-select:focus {
    outline: none;
    border-color: var(--qpm-accent);
    box-shadow: 0 0 0 2px rgba(143, 130, 255, 0.18);
  }

  .qpm-checkbox {
    accent-color: var(--qpm-accent);
  }

  .qpm-coming-grid {
    display: grid;
    gap: 10px;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  }

  .qpm-coming-card {
    background: var(--qpm-surface-3);
    border: 1px dashed rgba(143, 130, 255, 0.35);
    border-radius: 10px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    color: var(--qpm-text-muted);
  }

  .qpm-coming-card strong {
    color: var(--qpm-text);
    font-size: 12px;
  }

  .qpm-coming-card span {
    color: var(--qpm-accent-strong);
    font-size: 11px;
    font-weight: 600;
  }

  .qpm-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    border-radius: 999px;
    font-size: 10px;
    background: rgba(143, 130, 255, 0.22);
    color: var(--qpm-text);
    border: 1px solid rgba(143, 130, 255, 0.35);
  }

  .qpm-toast {
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: rgba(20, 26, 40, 0.92);
    border: 1px solid rgba(143, 130, 255, 0.35);
    color: var(--qpm-text);
    padding: 10px 14px;
    border-radius: 12px;
    font-size: 12px;
    z-index: 2147483647;
    box-shadow: 0 10px 26px rgba(12, 16, 28, 0.55);
    animation: qpm-toast-in 0.25s ease;
  }

  @keyframes qpm-toast-in {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* Custom scrollbar for main panel content */
  .qpm-content::-webkit-scrollbar {
    width: 8px;
  }
  .qpm-content::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 4px;
  }
  .qpm-content::-webkit-scrollbar-thumb {
    background: rgba(143, 130, 255, 0.35);
    border-radius: 4px;
    transition: background 0.2s;
  }
  .qpm-content::-webkit-scrollbar-thumb:hover {
    background: rgba(143, 130, 255, 0.55);
  }
  `;
  document.head.appendChild(style);
  qpmPanelStylesInjected = true;
}

interface CardComponents {
  root: HTMLElement;
  header: HTMLElement;
  body: HTMLElement;
  indicator: HTMLElement | null;
  subtitleEl: HTMLElement | null;
}

interface CardOptions {
  collapsible?: boolean;
  startCollapsed?: boolean;
  subtitle?: string;
  subtitleElement?: HTMLElement;
  headerActions?: HTMLElement[];
}

function createCard(title: string, options: CardOptions = {}): CardComponents {
  const root = document.createElement('div');
  root.className = 'qpm-card';
  root.style.display = 'flex';
  root.style.flexDirection = 'column';
  root.style.gap = '10px';

  const header = document.createElement('div');
  header.className = 'qpm-card__header';
  if (options.collapsible) {
    header.style.cursor = 'pointer';
  }

  const titleEl = document.createElement('div');
  titleEl.className = 'qpm-card__title';
  titleEl.textContent = title;
  header.appendChild(titleEl);

  const rightFragments: HTMLElement[] = [];
  let subtitleEl: HTMLElement | null = null;
  if (options.subtitleElement) {
    subtitleEl = options.subtitleElement;
    rightFragments.push(subtitleEl);
  } else if (options.subtitle) {
    subtitleEl = document.createElement('span');
    subtitleEl.className = 'qpm-section-muted';
    subtitleEl.textContent = options.subtitle;
    rightFragments.push(subtitleEl);
  }

  if (Array.isArray(options.headerActions) && options.headerActions.length > 0) {
    rightFragments.push(...options.headerActions);
  }

  let indicator: HTMLElement | null = null;
  if (options.collapsible) {
    indicator = document.createElement('span');
    indicator.className = 'qpm-section-muted';
    indicator.textContent = options.startCollapsed ? '▲' : '▼';
    rightFragments.push(indicator);
  }

  if (rightFragments.length > 0) {
    const right = document.createElement('div');
    right.className = 'qpm-row';
    right.style.justifyContent = 'flex-end';
    right.style.gap = '6px';
    right.style.flexWrap = 'nowrap';
    for (const fragment of rightFragments) {
      right.appendChild(fragment);
    }
    header.appendChild(right);
  }

  root.appendChild(header);

  const body = document.createElement('div');
  body.style.display = options.startCollapsed ? 'none' : 'flex';
  body.style.flexDirection = 'column';
  body.style.gap = '10px';
  root.appendChild(body);

  if (options.collapsible) {
    let collapsed = !!options.startCollapsed;
    const setCollapsed = (value: boolean) => {
      collapsed = value;
      body.style.display = collapsed ? 'none' : 'flex';
      if (indicator) {
        indicator.textContent = collapsed ? '▲' : '▼';
      }
    };
    setCollapsed(collapsed);
    header.addEventListener('click', () => {
      setCollapsed(!collapsed);
    });
  }

  return { root, header, body, indicator, subtitleEl };
}

// Configuration objects (will be passed from features)
let cfg: any = {};

function createMutationValueSection(): HTMLElement {
  const { root, body } = createCard('💎 Mutation Value & Reminders', {
    subtitle: 'Gold/Rainbow generation and mutation alerts',
    collapsible: true,
  });
  root.dataset.qpmSection = 'mutation-value';

  const info = document.createElement('div');
  info.style.cssText = 'padding:10px;background:#1a1a2a;border-radius:6px;font-size:11px;line-height:1.5;margin-bottom:12px;';
  info.innerHTML = `
    <strong>💰 Value generation tracking:</strong> Gold/Rainbow proc rates, session value, and best records.
  `;
  body.appendChild(info);

  // Mutation Reminder Controls
  const reminderSection = document.createElement('div');
  reminderSection.style.cssText = 'margin-bottom:16px;padding:12px;background:#2a1a3a;border-radius:6px;border-left:3px solid #9C27B0;';

  const reminderHeader = document.createElement('div');
  reminderHeader.style.cssText = 'font-weight:bold;font-size:12px;margin-bottom:8px;color:#9C27B0;';
  reminderHeader.textContent = '🧬 Mutation Reminder';
  reminderSection.appendChild(reminderHeader);

  const reminderInfo = document.createElement('div');
  reminderInfo.innerHTML = '💡 Detects weather events (Rain/Snow/Dawn/Amber) and notifies which plants to place for mutations.';
  reminderInfo.style.cssText = 'font-size:10px;line-height:1.5;color:#aaa;margin-bottom:8px;';
  reminderSection.appendChild(reminderInfo);

  const reminderToggle = btn(cfg.mutationReminder?.enabled ? '✓ Reminders Enabled' : '✗ Reminders Disabled', async () => {
    if (!cfg.mutationReminder) return;
    cfg.mutationReminder.enabled = !cfg.mutationReminder.enabled;
    reminderToggle.textContent = cfg.mutationReminder.enabled ? '✓ Reminders Enabled' : '✗ Reminders Disabled';
    reminderToggle.classList.toggle('qpm-button--positive', cfg.mutationReminder.enabled);
    reminderToggle.classList.toggle('qpm-button--accent', cfg.mutationReminder.enabled);
    saveCfg();

    const { setMutationReminderEnabled } = await import('../features/mutationReminder');
    setMutationReminderEnabled(cfg.mutationReminder.enabled);
  });
  reminderToggle.style.cssText = 'width:100%;margin-bottom:6px;';
  if (cfg.mutationReminder?.enabled) {
    reminderToggle.classList.add('qpm-button--positive', 'qpm-button--accent');
  }
  reminderSection.appendChild(reminderToggle);

  const checkBtn = btn('🔍 Check Now', async () => {
    checkBtn.disabled = true;
    checkBtn.textContent = '⏳ Checking...';
    try {
      const { checkForMutations } = await import('../features/mutationReminder');
      await checkForMutations();
      checkBtn.textContent = '✅ Done!';
      setTimeout(() => {
        checkBtn.textContent = '🔍 Check Now';
        checkBtn.disabled = false;
      }, 2000);
    } catch (error) {
      checkBtn.textContent = '❌ Error';
      log('Error checking mutations:', error);
      setTimeout(() => {
        checkBtn.textContent = '🔍 Check Now';
        checkBtn.disabled = false;
      }, 2000);
    }
  });
  checkBtn.style.cssText = 'width:100%;background:#9C27B0;';
  checkBtn.title = 'Manually check for mutation opportunities';
  reminderSection.appendChild(checkBtn);

  body.appendChild(reminderSection);

  // Clear Restock Data button
  const clearRestockButton = document.createElement('button');
  clearRestockButton.textContent = '🗑️ Clear Restock Data';
  clearRestockButton.style.cssText = 'width:100%;padding:8px;background:#2a1a1a;color:#FF6B6B;border:1px solid #FF6B6B;border-radius:4px;cursor:pointer;font-size:11px;font-weight:bold;margin-bottom:12px;transition:all 0.2s;';
  clearRestockButton.onmouseenter = () => {
    clearRestockButton.style.background = '#3a2020';
    clearRestockButton.style.borderColor = '#FF8888';
  };
  clearRestockButton.onmouseleave = () => {
    clearRestockButton.style.background = '#2a1a1a';
    clearRestockButton.style.borderColor = '#FF6B6B';
  };
  clearRestockButton.onclick = () => {
    if (confirm('⚠️ This will clear all Shop Restock history and prediction data.\n\nYour other QPM settings (auto-feed, XP tracking, etc.) will NOT be affected.\n\nThis cannot be undone. Are you sure?')) {
      clearAllRestocks();
      log('🗑️ Shop restock data cleared');
      alert('✅ Shop restock history and prediction data has been cleared.');
    }
  };
  body.appendChild(clearRestockButton);

  const valueContainer = document.createElement('div');
  valueContainer.style.cssText = 'display:flex;flex-direction:column;gap:12px;';
  body.appendChild(valueContainer);

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const formatTimeAgo = (timestamp: number): string => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h ${minutes % 60}m ago`;
    return `${minutes}m ago`;
  };

  const render = () => {
    const snapshot = getMutationValueSnapshot();
    const weatherSnapshot = getWeatherMutationSnapshot();
    valueContainer.innerHTML = '';

    const stats = snapshot.stats;
    const weatherStats = weatherSnapshot.stats;

    // Calculate total weather procs
    const totalWeatherProcs =
      weatherStats.wetCount +
      weatherStats.chilledCount +
      weatherStats.frozenCount +
      weatherStats.dawnlitCount +
      weatherStats.dawnboundCount +
      weatherStats.amberlitCount +
      weatherStats.amberboundCount;

    const totalWeatherProcsPerHour =
      weatherStats.wetPerHour +
      weatherStats.chilledPerHour +
      weatherStats.frozenPerHour +
      weatherStats.dawnlitPerHour +
      weatherStats.dawnboundPerHour +
      weatherStats.amberlitPerHour +
      weatherStats.amberboundPerHour;

    // Session Value Summary
    const sessionCard = document.createElement('div');
    sessionCard.style.cssText = 'padding:12px;background:linear-gradient(135deg,rgba(255,215,0,0.1),rgba(139,69,19,0.1));border-radius:6px;border-left:3px solid #FFD700;';
    sessionCard.innerHTML = `
      <div style="font-weight:bold;font-size:12px;margin-bottom:8px;">💰 Current Session Value</div>
      <div style="font-size:20px;font-weight:bold;color:#FFD700;">${formatNumber(stats.sessionValue)}</div>
      <div style="font-size:10px;color:#888;margin-top:4px;">Session started ${formatTimeAgo(stats.sessionStart)}</div>
    `;
    valueContainer.appendChild(sessionCard);

    // Proc Rates Grid (2x2 layout)
    const ratesGrid = document.createElement('div');
    ratesGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;';

    ratesGrid.innerHTML = `
      <div style="padding:10px;background:#1a1a2a;border-radius:6px;text-align:center;">
        <div style="font-size:18px;margin-bottom:4px;">🟡</div>
        <div style="font-size:14px;font-weight:bold;color:#FFD700;">${stats.goldProcs}</div>
        <div style="font-size:9px;color:#888;margin-top:2px;">Gold Procs</div>
        <div style="font-size:10px;color:#4CAF50;margin-top:4px;">${stats.goldPerHour.toFixed(1)}/hr</div>
      </div>
      <div style="padding:10px;background:#1a1a2a;border-radius:6px;text-align:center;">
        <div style="font-size:18px;margin-bottom:4px;">🌈</div>
        <div style="font-size:14px;font-weight:bold;color:#FFD700;">${stats.rainbowProcs}</div>
        <div style="font-size:9px;color:#888;margin-top:2px;">Rainbow Procs</div>
        <div style="font-size:10px;color:#4CAF50;margin-top:4px;">${stats.rainbowPerHour.toFixed(1)}/hr</div>
      </div>
      <div style="padding:10px;background:#1a1a2a;border-radius:6px;text-align:center;">
        <div style="font-size:18px;margin-bottom:4px;">📈</div>
        <div style="font-size:14px;font-weight:bold;color:#FFD700;">${stats.cropBoostProcs}</div>
        <div style="font-size:9px;color:#888;margin-top:2px;">Crop Boosts</div>
        <div style="font-size:10px;color:#4CAF50;margin-top:4px;">${stats.cropBoostPerHour.toFixed(1)}/hr</div>
      </div>
      <div style="padding:10px;background:#1a1a2a;border-radius:6px;text-align:center;">
        <div style="font-size:18px;margin-bottom:4px;">☁️</div>
        <div style="font-size:14px;font-weight:bold;color:#FFD700;">${totalWeatherProcs}</div>
        <div style="font-size:9px;color:#888;margin-top:2px;">Weather Procs</div>
        <div style="font-size:10px;color:#4CAF50;margin-top:4px;">${totalWeatherProcsPerHour.toFixed(1)}/hr</div>
      </div>
    `;
    valueContainer.appendChild(ratesGrid);

    // Best Records
    if (stats.bestSessionValue > 0 || stats.bestHourValue > 0) {
      const recordsCard = document.createElement('div');
      recordsCard.style.cssText = 'padding:10px;background:#1a1a2a;border-radius:6px;';
      recordsCard.innerHTML = `
        <div style="font-weight:bold;font-size:11px;margin-bottom:8px;">🏆 Best Records</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:10px;">
          <div><span style="color:#888;">Best Hour:</span> <strong style="color:#FFD700;">${formatNumber(stats.bestHourValue)}</strong></div>
          <div><span style="color:#888;">Best Session:</span> <strong style="color:#FFD700;">${formatNumber(stats.bestSessionValue)}</strong></div>
        </div>
      `;
      valueContainer.appendChild(recordsCard);
    }
  };

  render();
  const unsubscribe = subscribeToMutationValueTracking(render);
  const weatherUnsubscribe = subscribeToWeatherMutationTracking(render);

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.removedNodes.forEach((node) => {
        if (node === root || (node as HTMLElement).contains?.(root)) {
          unsubscribe();
          weatherUnsubscribe();
          observer.disconnect();
        }
      });
    });
  });
  if (root.parentElement) {
    observer.observe(root.parentElement, { childList: true, subtree: true });
  }

  return root;
}

function createStatsOverviewSection(): HTMLElement {
  const { root, body } = createCard('📊 Statistics Overview', {
    subtitle: 'Session performance and value tracking',
  });
  root.dataset.qpmSection = 'stats-overview';

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const formatDuration = (ms: number): string => {
    const hours = Math.floor(ms / (60 * 60 * 1000));
    const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const createStatRow = (label: string, value: string, icon: string = '•') => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #2a2a2a;font-size:11px;';
    row.innerHTML = `
      <span style="color:#888;">${icon} ${label}</span>
      <span style="color:#FFD700;font-weight:bold;">${value}</span>
    `;
    return row;
  };

  const createCategoryHeader = (title: string, icon: string) => {
    const header = document.createElement('div');
    header.style.cssText = 'font-weight:bold;font-size:13px;color:#FFD700;margin:16px 0 8px 0;padding-bottom:4px;border-bottom:2px solid #FFD700;';
    header.textContent = `${icon} ${title}`;
    return header;
  };

  // Value-generating abilities only
  const VALUE_ABILITIES = new Set([
    'GoldGranter', 'RainbowGranter',
    'ProduceScaleBoost', 'ProduceScaleBoostII',
    'ProduceRefund', 'DoubleHarvest',
    'SellBoostI', 'SellBoostII', 'SellBoostIII', 'SellBoostIV',
    'CoinFinderI', 'CoinFinderII', 'CoinFinderIII',
    'PetRefund', 'PetRefundII'
  ]);

  const updateStats = () => {
    body.innerHTML = '';

    // Get mutation value tracking data
    const mutationData = getMutationValueSnapshot();
    const qpmStats = getStatsSnapshot();
    const weatherData = getWeatherMutationSnapshot();

    // Session Stats
    body.appendChild(createCategoryHeader('Current Session', '⏱️'));
    const sessionDuration = Date.now() - mutationData.stats.sessionStart;
    body.appendChild(createStatRow('Session Duration', formatDuration(sessionDuration), '⏱️'));
    body.appendChild(createStatRow('Session Value', formatNumber(mutationData.stats.sessionValue) + ' coins', '💰'));

    const valuePerHour = sessionDuration > 0
      ? Math.round((mutationData.stats.sessionValue / sessionDuration) * (60 * 60 * 1000))
      : 0;
    body.appendChild(createStatRow('Value per Hour', formatNumber(valuePerHour) + ' coins/hr', '📊'));

    // Mutation Value Tracking
    body.appendChild(createCategoryHeader('Mutation Value', '💎'));
    body.appendChild(createStatRow('Gold Procs', mutationData.stats.goldProcs + ' (' + mutationData.stats.goldPerHour.toFixed(1) + '/hr)', '🟡'));
    body.appendChild(createStatRow('Gold Value', formatNumber(mutationData.stats.goldTotalValue) + ' coins', '💰'));
    body.appendChild(createStatRow('Rainbow Procs', mutationData.stats.rainbowProcs + ' (' + mutationData.stats.rainbowPerHour.toFixed(1) + '/hr)', '🌈'));
    body.appendChild(createStatRow('Rainbow Value', formatNumber(mutationData.stats.rainbowTotalValue) + ' coins', '💰'));
    body.appendChild(createStatRow('Crop Boost Procs', mutationData.stats.cropBoostProcs + ' (' + mutationData.stats.cropBoostPerHour.toFixed(1) + '/hr)', '📈'));
    body.appendChild(createStatRow('Boost Value', formatNumber(mutationData.stats.cropBoostTotalValue) + ' coins', '💰'));

    // Personal Records
    body.appendChild(createCategoryHeader('Personal Records', '🏆'));
    if (mutationData.stats.bestHourValue > 0) {
      body.appendChild(createStatRow('Best Hour', formatNumber(mutationData.stats.bestHourValue) + ' coins', '⭐'));
      if (mutationData.stats.bestHourTime) {
        const date = new Date(mutationData.stats.bestHourTime);
        body.appendChild(createStatRow('Best Hour Date', date.toLocaleDateString(), '📅'));
      }
    }
    if (mutationData.stats.bestSessionValue > 0) {
      body.appendChild(createStatRow('Best Session', formatNumber(mutationData.stats.bestSessionValue) + ' coins', '🌟'));
      if (mutationData.stats.bestSessionTime) {
        const date = new Date(mutationData.stats.bestSessionTime);
        body.appendChild(createStatRow('Best Session Date', date.toLocaleDateString(), '📅'));
      }
    }
    if (mutationData.stats.bestHourValue === 0 && mutationData.stats.bestSessionValue === 0) {
      const recordsNote = document.createElement('div');
      recordsNote.style.cssText = 'padding:8px;background:rgba(139,195,74,0.1);border-radius:4px;font-size:10px;color:#8BC34A;margin-top:4px;';
      recordsNote.innerHTML = 'ℹ️ Personal records will be tracked as you play.';
      body.appendChild(recordsNote);
    }

    // Weather Mutation Stats
    const totalWeatherProcs =
      weatherData.stats.wetCount +
      weatherData.stats.chilledCount +
      weatherData.stats.frozenCount +
      weatherData.stats.dawnlitCount +
      weatherData.stats.dawnboundCount +
      weatherData.stats.amberlitCount +
      weatherData.stats.amberboundCount;

    const totalWeatherProcsPerHour =
      weatherData.stats.wetPerHour +
      weatherData.stats.chilledPerHour +
      weatherData.stats.frozenPerHour +
      weatherData.stats.dawnlitPerHour +
      weatherData.stats.dawnboundPerHour +
      weatherData.stats.amberlitPerHour +
      weatherData.stats.amberboundPerHour;

    const totalWeatherValue =
      weatherData.stats.wetTotalValue +
      weatherData.stats.chilledTotalValue +
      weatherData.stats.frozenTotalValue +
      weatherData.stats.dawnlitTotalValue +
      weatherData.stats.dawnboundTotalValue +
      weatherData.stats.amberlitTotalValue +
      weatherData.stats.amberboundTotalValue;

    if (totalWeatherProcs > 0) {
      body.appendChild(createCategoryHeader('Weather Mutations', '🌤️'));
      body.appendChild(createStatRow('Total Weather Procs', formatNumber(totalWeatherProcs), '🌤️'));
      body.appendChild(createStatRow('Procs per Hour', totalWeatherProcsPerHour.toFixed(1), '⚡'));
      body.appendChild(createStatRow('Total Value', formatNumber(totalWeatherValue) + ' coins', '💰'));
    }

    // Ability Performance by Value
    body.appendChild(createCategoryHeader('Top Abilities by Value', '⚡'));
    const abilityDefinitions = []; // Get from data
    const valueAbilities = Object.entries(qpmStats.abilities.valueByAbility)
      .filter(([abilityId]) => VALUE_ABILITIES.has(abilityId))
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, 5);

    if (valueAbilities.length > 0) {
      valueAbilities.forEach(([abilityId, value]) => {
        const def = getAbilityDefinition(abilityId);
        const name = def?.name || abilityId;
        const procs = (qpmStats.abilities.procsByAbility as Record<string, number>)[abilityId] || 0;
        const labelText = name + " (" + String(procs) + "x)";
        const valueDisplay = formatNumber(value as number) + " coins";
        body.appendChild(createStatRow(labelText, valueDisplay, "▸"));
      });
    } else {
      const abilityNote = document.createElement('div');
      abilityNote.style.cssText = 'padding:8px;background:rgba(139,195,74,0.1);border-radius:4px;font-size:10px;color:#8BC34A;margin-top:4px;';
      abilityNote.innerHTML = 'ℹ️ Ability stats will appear as your pets proc abilities.';
      body.appendChild(abilityNote);
    }

    // Week-over-week trends (if we have session history)
    if (mutationData.sessions && mutationData.sessions.length > 0) {
      body.appendChild(createCategoryHeader('Session History', '📈'));

      const last7Days = mutationData.sessions.slice(-7);
      const totalValue = last7Days.reduce((sum, s) => sum + s.value, 0);
      const avgValue = totalValue / last7Days.length;

      body.appendChild(createStatRow('Sessions Logged', mutationData.sessions.length.toString(), '📝'));
      const avgLabel = formatNumber(Math.round(avgValue)) + " coins/session";
      body.appendChild(createStatRow("Last 7 Days Avg", avgLabel, "📊"));

      // Trend indicator
      if (last7Days.length >= 2) {
        const recent = last7Days.slice(-3).reduce((sum, s) => sum + s.value, 0) / Math.min(3, last7Days.length);
        const older = last7Days.slice(0, -3).reduce((sum, s) => sum + s.value, 0) / Math.max(1, last7Days.length - 3);
        const trend = recent > older ? '📈 Improving' : recent < older ? '📉 Declining' : '➡️ Stable';
        body.appendChild(createStatRow('Trend', trend, '📉'));
      }
    }

    // Garden Insights (only show if there's data)
    if (qpmStats.garden.totalHarvested > 0) {
      body.appendChild(createCategoryHeader('Garden Insights', '🌱'));
      body.appendChild(createStatRow('Total Harvested', formatNumber(qpmStats.garden.totalHarvested), '🌾'));

      const harvestRate = sessionDuration > 0
        ? Math.round((qpmStats.garden.totalHarvested / sessionDuration) * (60 * 60 * 1000))
        : 0;
      body.appendChild(createStatRow('Harvest Rate', harvestRate + '/hr', '⚡'));

      if (qpmStats.garden.totalWateringCans > 0) {
        body.appendChild(createStatRow('Watering Cans Used', formatNumber(qpmStats.garden.totalWateringCans), '💧'));
      }
    }

    // Reset stats button
    const resetButton = btn('🗑️ Reset All Stats', async () => {
      if (!confirm('⚠️ This will reset ALL statistics including:\n\n• Session value tracking\n• Mutation records\n• Ability performance\n• Garden metrics\n\nThis action cannot be undone. Continue?')) {
        return;
      }

      resetButton.disabled = true;
      resetButton.textContent = '⏳ Resetting...';

      try {
        const { resetPetHatchingTracker } = await import('../store/petHatchingTracker');
        resetStats();
        resetPetHatchingTracker();
        resetMutationValueTracking();

        resetButton.textContent = '✅ Reset Complete!';
        setTimeout(() => {
          resetButton.textContent = '🗑️ Reset All Stats';
          resetButton.disabled = false;
          updateStats();
        }, 2000);
      } catch (error) {
        log('Error resetting stats:', error);
        resetButton.textContent = '❌ Error';
        setTimeout(() => {
          resetButton.textContent = '🗑️ Reset All Stats';
          resetButton.disabled = false;
        }, 2000);
      }
    });
    resetButton.style.cssText = 'width:100%;margin-top:16px;background:#d32f2f;';
    resetButton.title = 'Reset all QPM statistics';
    body.appendChild(resetButton);
  };

  // Initial update
  updateStats();

  // Subscribe to all relevant data sources for live updates
  const unsubscribe1 = subscribeToStats(() => updateStats());
  const unsubscribe2 = subscribeToMutationValueTracking(() => updateStats());
  const unsubscribe3 = subscribeToWeatherMutationTracking(() => updateStats());

  // Cleanup on element removal
  const observer = new MutationObserver(() => {
    if (!document.contains(root)) {
      unsubscribe1();
      unsubscribe2();
      unsubscribe3();
      observer.disconnect();
    }
  });
  if (root.parentElement) {
    observer.observe(root.parentElement, { childList: true, subtree: true });
  }

  return root;
}

async function createAutoFavoriteSection(): Promise<HTMLElement> {
  const { root, body } = createCard('⭐ Auto-Favorite', {
    subtitle: 'Automatically favorite crops and pets',
  });
  root.dataset.qpmSection = 'auto-favorite';

  const config = getAutoFavoriteConfig();

  // Main toggle
  const enableToggle = document.createElement('label');
  enableToggle.style.cssText = `
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px;
    background: var(--qpm-surface-1, #1a1a1a);
    border-radius: 8px;
    cursor: pointer;
    margin-bottom: 16px;
  `;

  const enableCheckbox = document.createElement('input');
  enableCheckbox.type = 'checkbox';
  enableCheckbox.checked = config.enabled;
  enableCheckbox.style.cssText = `
    width: 20px;
    height: 20px;
    cursor: pointer;
  `;

  const enableLabel = document.createElement('span');
  enableLabel.textContent = 'Enable Auto-Favorite';
  enableLabel.style.cssText = `
    font-weight: 600;
    font-size: 14px;
    color: var(--qpm-text, #fff);
  `;

  enableCheckbox.addEventListener('change', () => {
    updateAutoFavoriteConfig({ enabled: enableCheckbox.checked });
  });

  enableToggle.appendChild(enableCheckbox);
  enableToggle.appendChild(enableLabel);
  body.appendChild(enableToggle);

  // Info box
  const infoBox = document.createElement('div');
  infoBox.style.cssText = `
    padding: 12px;
    background: rgba(76, 175, 80, 0.1);
    border-left: 3px solid var(--qpm-accent, #4CAF50);
    border-radius: 4px;
    margin-bottom: 16px;
    font-size: 12px;
    line-height: 1.6;
    color: var(--qpm-text-muted, #aaa);
  `;
  infoBox.innerHTML = `
    💡 <strong>How it works:</strong><br>
    • Monitors inventory in background (no need to open inventory)<br>
    • Automatically favorites matching items when detected<br>
    • Never unfavorites items (safe for manual favorites)<br>
    • Works via WebSocket (instant, no lag)
  `;
  body.appendChild(infoBox);

  // Pet Abilities section
  const petAbilitiesSection = document.createElement('div');
  petAbilitiesSection.style.cssText = `
    margin-bottom: 16px;
  `;

  const petAbilitiesTitle = document.createElement('h4');
  petAbilitiesTitle.textContent = '🐾 Pet Abilities';
  petAbilitiesTitle.style.cssText = `
    margin: 0 0 8px 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--qpm-accent, #4CAF50);
  `;
  petAbilitiesSection.appendChild(petAbilitiesTitle);

  const petAbilityOptions = [
    { id: 'Gold Granter', label: 'Gold Granter' },
    { id: 'Rainbow Granter', label: 'Rainbow Granter' },
  ];

  petAbilityOptions.forEach(option => {
    const checkbox = document.createElement('label');
    checkbox.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px;
      cursor: pointer;
      border-radius: 4px;
      transition: background 0.2s;
    `;
    checkbox.addEventListener('mouseenter', () => {
      checkbox.style.background = 'rgba(255, 255, 255, 0.05)';
    });
    checkbox.addEventListener('mouseleave', () => {
      checkbox.style.background = 'transparent';
    });

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = config.petAbilities?.includes(option.id) ?? false;
    input.style.cssText = `width: 16px; height: 16px; cursor: pointer;`;

    input.addEventListener('change', () => {
      const current = getAutoFavoriteConfig().petAbilities || [];
      const updated = input.checked
        ? [...current, option.id]
        : current.filter(m => m !== option.id);
      updateAutoFavoriteConfig({ petAbilities: updated });

      // Immediately favorite existing items with this ability
      if (input.checked) {
        (window as any).qpm_favoritePetAbility?.(option.id);
      }
    });

    // Create ability block instead of text label
    const abilityColor = getAbilityColor(option.id);
    const abilityBlock = document.createElement('div');
    abilityBlock.style.cssText = `
      width: 14px;
      height: 14px;
      background: ${abilityColor.base};
      border-radius: 2px;
      box-shadow: 0 0 6px ${abilityColor.glow}, 0 1px 3px rgba(0,0,0,0.3);
    `;
    abilityBlock.title = option.label;

    const label = document.createElement('span');
    label.textContent = option.label;
    label.style.cssText = `font-size: 13px; color: var(--qpm-text, #fff);`;

    checkbox.appendChild(input);
    checkbox.appendChild(abilityBlock);
    checkbox.appendChild(label);
    petAbilitiesSection.appendChild(checkbox);
  });

  body.appendChild(petAbilitiesSection);

  // Mutations section
  const mutationsSection = document.createElement('div');
  mutationsSection.style.cssText = `
    margin-bottom: 16px;
  `;

  const mutationsTitle = document.createElement('h4');
  mutationsTitle.textContent = '✨ Crop Mutations';
  mutationsTitle.style.cssText = `
    margin: 0 0 8px 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--qpm-accent, #4CAF50);
  `;
  mutationsSection.appendChild(mutationsTitle);

  const mutationOptions = [
    { id: 'Rainbow', label: 'Rainbow', color: '#9C27B0' },
    { id: 'Gold', label: 'Golden', color: '#FFD700' },
    { id: 'Frozen', label: 'Frozen', color: '#2196F3' },
    { id: 'Wet', label: 'Wet', color: '#03A9F4' },
    { id: 'Chilled', label: 'Chilled', color: '#00BCD4' },
    { id: 'Dawnlit', label: 'Dawnlit', color: '#FF9800' },
    { id: 'Dawnbound', label: 'Dawnbound', color: '#FF5722' },
    { id: 'Amberlit', label: 'Amberlit', color: '#FFC107' },
    { id: 'Amberbound', label: 'Amberbound', color: '#FF6F00' },
  ];

  mutationOptions.forEach(option => {
    const checkbox = document.createElement('label');
    checkbox.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px;
      cursor: pointer;
      border-radius: 4px;
      transition: background 0.2s;
    `;
    checkbox.addEventListener('mouseenter', () => {
      checkbox.style.background = 'rgba(255, 255, 255, 0.05)';
    });
    checkbox.addEventListener('mouseleave', () => {
      checkbox.style.background = 'transparent';
    });

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = config.mutations.includes(option.id);
    input.style.cssText = `width: 16px; height: 16px; cursor: pointer;`;

    input.addEventListener('change', () => {
      const current = getAutoFavoriteConfig().mutations;
      const updated = input.checked
        ? [...current, option.id]
        : current.filter(m => m !== option.id);
      updateAutoFavoriteConfig({ mutations: updated });

      // Immediately favorite existing items with this mutation
      if (input.checked) {
        (window as any).qpm_favoriteMutation?.(option.id);
      }
    });

    // Use mutated sunflower sprite instead of color dot
    const mutationSprite = getMutatedCropSpriteUrl('sunflower', [option.id]);
    const spriteEl = document.createElement('img');
    spriteEl.src = mutationSprite;
    spriteEl.style.cssText = `
      width: 20px;
      height: 20px;
      image-rendering: pixelated;
      flex-shrink: 0;
    `;
    spriteEl.title = option.label;

    const label = document.createElement('span');
    label.textContent = option.label;
    label.style.cssText = `font-size: 13px; color: var(--qpm-text, #fff);`;

    checkbox.appendChild(input);
    checkbox.appendChild(spriteEl);
    checkbox.appendChild(label);
    mutationsSection.appendChild(checkbox);
  });

  body.appendChild(mutationsSection);

  // Advanced Filters section
  const advancedSection = document.createElement('div');
  advancedSection.style.cssText = `
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  `;

  const advancedTitle = document.createElement('h4');
  advancedTitle.textContent = '⚙️ Advanced Filters';
  advancedTitle.style.cssText = `
    margin: 0 0 12px 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--qpm-accent, #4CAF50);
  `;
  advancedSection.appendChild(advancedTitle);

  const advancedNote = document.createElement('div');
  advancedNote.style.cssText = `
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
    margin-bottom: 12px;
    padding: 8px;
    background: rgba(255, 152, 0, 0.1);
    border-left: 2px solid #FF9800;
    border-radius: 4px;
  `;
  advancedNote.textContent = '💡 Select multiple options to filter which items get auto-favorited.';
  advancedSection.appendChild(advancedNote);

  // Filter by Abilities (multi-select checkboxes) - DYNAMIC from petAbilities.ts
  const abilityFilterSection = document.createElement('div');
  abilityFilterSection.style.cssText = 'margin-bottom: 16px;';

  const abilityFilterTitle = document.createElement('h5');
  abilityFilterTitle.textContent = 'Filter by Abilities:';
  abilityFilterTitle.style.cssText = 'margin: 0 0 8px 0; font-size: 12px; font-weight: 600; color: rgba(255, 255, 255, 0.8);';
  abilityFilterSection.appendChild(abilityFilterTitle);

  const abilityCheckboxContainer = document.createElement('div');
  abilityCheckboxContainer.style.cssText = 'display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;';

  // Dynamically import all abilities from petAbilities.ts
  const { getAllAbilityDefinitions } = await import('../data/petAbilities');
  const allAbilityDefinitions = getAllAbilityDefinitions();
  
  // Group abilities by base name (remove tier numbers for cleaner display)
  const abilityGroups = new Map<string, { id: string; name: string }[]>();
  
  allAbilityDefinitions.forEach(def => {
    // Extract base name (e.g., "Crop Size Boost" from "Crop Size Boost I")
    const baseName = def.name.replace(/\s+(I{1,4}|\d+)$/, '');
    if (!abilityGroups.has(baseName)) {
      abilityGroups.set(baseName, []);
    }
    abilityGroups.get(baseName)!.push({ id: def.id, name: def.name });
  });
  
  // Create options with single checkbox per base ability (groups all tiers)
  const abilityOptions: Array<{ value: string[]; label: string }> = [];
  
  Array.from(abilityGroups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([baseName, abilities]) => {
      // Group all tier IDs together for matching
      const abilityIds = abilities.map(a => a.id);
      abilityOptions.push({ value: abilityIds, label: baseName });
    });

  abilityOptions.forEach(option => {
    const checkbox = document.createElement('label');
    checkbox.style.cssText = 'display: flex; align-items: center; gap: 6px; padding: 4px 6px; cursor: pointer; border-radius: 4px; transition: background 0.2s; font-size: 12px;';
    checkbox.addEventListener('mouseenter', () => checkbox.style.background = 'rgba(255, 255, 255, 0.05)');
    checkbox.addEventListener('mouseleave', () => checkbox.style.background = 'transparent');

    const input = document.createElement('input');
    input.type = 'checkbox';
    // Check if ANY tier of this ability is selected
    const currentFilters = config.filterByAbilities || [];
    input.checked = option.value.some(id => currentFilters.includes(id));
    input.style.cssText = 'width: 14px; height: 14px; cursor: pointer; flex-shrink: 0;';

    input.addEventListener('change', () => {
      const current = getAutoFavoriteConfig().filterByAbilities || [];
      if (input.checked) {
        // Add all tiers of this ability
        const newIds = option.value.filter(id => !current.includes(id));
        updateAutoFavoriteConfig({ filterByAbilities: [...current, ...newIds] });
      } else {
        // Remove all tiers of this ability
        const updated = current.filter(id => !option.value.includes(id));
        updateAutoFavoriteConfig({ filterByAbilities: updated });
      }
    });

    const label = document.createElement('span');
    label.textContent = option.label;
    label.style.cssText = 'color: var(--qpm-text, #fff); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
    label.title = option.label;

    checkbox.appendChild(input);
    checkbox.appendChild(label);
    abilityCheckboxContainer.appendChild(checkbox);
  });

  abilityFilterSection.appendChild(abilityCheckboxContainer);
  advancedSection.appendChild(abilityFilterSection);

  // Filter by Ability Count dropdown
  const abilityCountRow = document.createElement('div');
  abilityCountRow.style.cssText = 'margin-bottom: 12px;';

  const abilityCountLabel = document.createElement('label');
  abilityCountLabel.textContent = 'Filter by Ability Count:';
  abilityCountLabel.style.cssText = 'display: block; font-size: 12px; color: rgba(255, 255, 255, 0.7); margin-bottom: 4px;';
  abilityCountRow.appendChild(abilityCountLabel);

  const abilityCountSelect = document.createElement('select');
  abilityCountSelect.style.cssText = `
    width: 100%;
    padding: 8px;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 4px;
    color: #fff;
    font-size: 13px;
    cursor: pointer;
  `;

  [
    { value: '', label: 'Any Count' },
    { value: '1', label: '1 Ability' },
    { value: '2', label: '2 Abilities' },
    { value: '3', label: '3 Abilities' },
    { value: '4', label: '4 Abilities' },
  ].forEach(option => {
    const opt = document.createElement('option');
    opt.value = option.value;
    opt.textContent = option.label;
    abilityCountSelect.appendChild(opt);
  });

  abilityCountSelect.value = config.filterByAbilityCount != null ? String(config.filterByAbilityCount) : '';
  abilityCountSelect.addEventListener('change', () => {
    const value = abilityCountSelect.value ? parseInt(abilityCountSelect.value) : null;
    updateAutoFavoriteConfig({ filterByAbilityCount: value });
  });

  abilityCountRow.appendChild(abilityCountSelect);
  advancedSection.appendChild(abilityCountRow);

  // Filter by Species (multi-select checkboxes)
  const speciesFilterSection = document.createElement('div');
  speciesFilterSection.style.cssText = 'margin-bottom: 16px;';

  const speciesFilterTitle = document.createElement('h5');
  speciesFilterTitle.textContent = 'Filter by Pet Species:';
  speciesFilterTitle.style.cssText = 'margin: 0 0 8px 0; font-size: 12px; font-weight: 600; color: rgba(255, 255, 255, 0.8);';
  speciesFilterSection.appendChild(speciesFilterTitle);

  const speciesCheckboxContainer = document.createElement('div');
  speciesCheckboxContainer.style.cssText = 'display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;';

  const speciesOptions = [
    'Worm', 'Snail', 'Bee', 'Chicken', 'Bunny', 'Dragonfly',
    'Pig', 'Cow', 'Turkey', 'Squirrel', 'Turtle', 'Goat',
    'Butterfly', 'Peacock', 'Capybara'
  ];

  speciesOptions.forEach(species => {
    const checkbox = document.createElement('label');
    checkbox.style.cssText = 'display: flex; align-items: center; gap: 6px; padding: 6px; cursor: pointer; border-radius: 4px; transition: background 0.2s; font-size: 12px;';
    checkbox.addEventListener('mouseenter', () => checkbox.style.background = 'rgba(255, 255, 255, 0.05)');
    checkbox.addEventListener('mouseleave', () => checkbox.style.background = 'transparent');

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = (config.filterBySpecies || []).includes(species);
    input.style.cssText = 'width: 14px; height: 14px; cursor: pointer;';

    input.addEventListener('change', () => {
      const current = getAutoFavoriteConfig().filterBySpecies || [];
      const updated = input.checked ? [...current, species] : current.filter(s => s !== species);
      updateAutoFavoriteConfig({ filterBySpecies: updated });
    });

    // Use pet species icon (no STR label)
    const petIcon = renderPetSpeciesIcon(species);
    const iconContainer = document.createElement('div');
    iconContainer.innerHTML = petIcon;
    iconContainer.style.cssText = 'flex-shrink: 0;';

    checkbox.appendChild(input);
    checkbox.appendChild(iconContainer);
    speciesCheckboxContainer.appendChild(checkbox);
  });

  speciesFilterSection.appendChild(speciesCheckboxContainer);
  advancedSection.appendChild(speciesFilterSection);

  // Filter by Crop Type (multi-select checkboxes) - DYNAMIC from cropBaseStats.ts
  const cropTypeSection = document.createElement('div');
  cropTypeSection.style.cssText = 'margin-bottom: 16px;';

  const cropTypeTitle = document.createElement('h5');
  cropTypeTitle.textContent = 'Filter by Crop Name:';
  cropTypeTitle.style.cssText = 'margin: 0 0 8px 0; font-size: 12px; font-weight: 600; color: rgba(255, 255, 255, 0.8);';
  cropTypeSection.appendChild(cropTypeTitle);

  const cropTypeCheckboxContainer = document.createElement('div');
  cropTypeCheckboxContainer.style.cssText = 'display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;';

  // Dynamically import all crop names from cropBaseStats.ts
  const { getAllCropNames } = await import('../data/cropBaseStats');
  const cropTypeOptions = getAllCropNames();

  cropTypeOptions.forEach(cropName => {
    const checkbox = document.createElement('label');
    checkbox.style.cssText = 'display: flex; align-items: center; gap: 6px; padding: 4px 6px; cursor: pointer; border-radius: 4px; transition: background 0.2s; font-size: 12px;';
    checkbox.addEventListener('mouseenter', () => checkbox.style.background = 'rgba(255, 255, 255, 0.05)');
    checkbox.addEventListener('mouseleave', () => checkbox.style.background = 'transparent');

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = (config.filterByCropTypes || []).includes(cropName);
    input.style.cssText = 'width: 14px; height: 14px; cursor: pointer; flex-shrink: 0;';

    input.addEventListener('change', () => {
      const current = getAutoFavoriteConfig().filterByCropTypes || [];
      const updated = input.checked ? [...current, cropName] : current.filter(ct => ct !== cropName);
      updateAutoFavoriteConfig({ filterByCropTypes: updated });
    });

    // Use crop sprite
    const cropSprite = getMutatedCropSpriteUrl(cropName.toLowerCase(), []);
    const spriteImg = document.createElement('img');
    spriteImg.src = cropSprite;
    spriteImg.style.cssText = 'width: 20px; height: 20px; image-rendering: pixelated; flex-shrink: 0;';

    const label = document.createElement('span');
    label.textContent = cropName;
    label.style.cssText = 'color: var(--qpm-text, #fff); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
    label.title = cropName;

    checkbox.appendChild(input);
    checkbox.appendChild(spriteImg);
    checkbox.appendChild(label);
    cropTypeCheckboxContainer.appendChild(checkbox);
  });

  cropTypeSection.appendChild(cropTypeCheckboxContainer);
  advancedSection.appendChild(cropTypeSection);

  body.appendChild(advancedSection);

  // Subscribe to config changes to update UI
  subscribeToAutoFavoriteConfig((newConfig) => {
    enableCheckbox.checked = newConfig.enabled;
    abilityCountSelect.value = newConfig.filterByAbilityCount != null ? String(newConfig.filterByAbilityCount) : '';
    // Update checkboxes based on config
    abilityCheckboxContainer.querySelectorAll('input[type="checkbox"]').forEach((input: any, index) => {
      const option = abilityOptions[index];
      if (option) {
        // Check if ANY tier of this ability is selected
        input.checked = option.value.some(id => (newConfig.filterByAbilities || []).includes(id));
      }
    });
    speciesCheckboxContainer.querySelectorAll('input[type="checkbox"]').forEach((input: any, index) => {
      input.checked = (newConfig.filterBySpecies || []).includes(speciesOptions[index] || '');
    });
    cropTypeCheckboxContainer.querySelectorAll('input[type="checkbox"]').forEach((input: any, index) => {
      input.checked = (newConfig.filterByCropTypes || []).includes(cropTypeOptions[index] || '');
    });
  });

  return root;
}

function createJournalCheckerSection(): HTMLElement {
  // Use the new visually enhanced journal checker
  return createJournalCheckerSectionNew();
}

function createJournalCheckerSectionOld(): HTMLElement {
  const { root, body } = createCard('📔 Journal Checker', {
    subtitle: 'Track your collection progress',
  });
  root.dataset.qpmSection = 'journal-checker-old';

  // Stats summary
  const statsContainer = document.createElement('div');
  statsContainer.style.cssText = `
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    margin-bottom: 16px;
  `;

  const createStatBox = (label: string, value: string, color: string) => {
    const box = document.createElement('div');
    box.style.cssText = `
      background: var(--qpm-surface-1, #1a1a1a);
      border-radius: 8px;
      padding: 12px;
      text-align: center;
      border: 1px solid ${color};
    `;
    box.innerHTML = `
      <div style="color: ${color}; font-size: 24px; font-weight: bold; margin-bottom: 4px;">${value}</div>
      <div style="color: #999; font-size: 12px;">${label}</div>
    `;
    return box;
  };

  const produceStatBox = createStatBox('Produce Variants', '...', '#4CAF50');
  const petVariantStatBox = createStatBox('Pet Variants', '...', '#2196F3');
  const overallStatBox = createStatBox('Overall Progress', '...', '#9C27B0');

  statsContainer.appendChild(produceStatBox);
  statsContainer.appendChild(petVariantStatBox);
  statsContainer.appendChild(overallStatBox);

  body.appendChild(statsContainer);

  // Category selector
  const categoryContainer = document.createElement('div');
  categoryContainer.style.cssText = `
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  `;

  const categories = [
    { key: 'produce', label: 'Produce', icon: '🌾' },
    { key: 'pets', label: 'Pets', icon: '🐾' },
    { key: 'missing', label: 'Missing Only', icon: '❌' },
  ];

  let selectedCategory = 'produce';
  let showMissingOnly = false;

  const updateDisplay = async () => {
    const summary = await import('../features/journalChecker').then(m => m.getJournalSummary());
    const stats = await import('../features/journalChecker').then(m => m.getJournalStats());

    if (!summary || !stats) {
      resultsContainer.innerHTML = '<div style="color: #999; text-align: center; padding: 20px;">Unable to load journal data</div>';
      return;
    }

    // Update stats
    produceStatBox.querySelector('div')!.textContent = `${stats.produce.collected}/${stats.produce.total}`;
    petVariantStatBox.querySelector('div')!.textContent = `${stats.petVariants.collected}/${stats.petVariants.total}`;
    overallStatBox.querySelector('div')!.textContent = `${Math.round(stats.overall.percentage)}%`;

    // Clear results
    resultsContainer.innerHTML = '';

    if (selectedCategory === 'produce') {
      for (const species of summary.produce) {
        const variants = showMissingOnly
          ? species.variants.filter(v => !v.collected)
          : species.variants;

        if (variants.length === 0) continue;

        const speciesCard = document.createElement('div');
        speciesCard.style.cssText = `
          background: var(--qpm-surface-1, #1a1a1a);
          border-radius: 8px;
          padding: 12px;
          margin-bottom: 8px;
        `;

        const collectedCount = species.variants.filter(v => v.collected).length;
        const totalCount = species.variants.length;
        const percentage = Math.round((collectedCount / totalCount) * 100);

        speciesCard.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <strong style="color: #fff;">${species.species}</strong>
            <span style="color: #999; font-size: 12px;">${collectedCount}/${totalCount} (${percentage}%)</span>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            ${variants.map(v => `
              <span style="
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 12px;
                background: ${v.collected ? '#2e7d32' : '#424242'};
                color: ${v.collected ? '#fff' : '#999'};
              ">${v.variant}</span>
            `).join('')}
          </div>
        `;

        resultsContainer.appendChild(speciesCard);
      }
    } else if (selectedCategory === 'pets') {
      for (const species of summary.pets) {
        const variants = showMissingOnly
          ? species.variants.filter(v => !v.collected)
          : species.variants;

        if (variants.length === 0) continue;

        const speciesCard = document.createElement('div');
        speciesCard.style.cssText = `
          background: var(--qpm-surface-1, #1a1a1a);
          border-radius: 8px;
          padding: 12px;
          margin-bottom: 8px;
        `;

        const variantCollected = species.variants.filter(v => v.collected).length;
        const variantTotal = species.variants.length;

        let html = `
          <div style="margin-bottom: 8px;">
            <strong style="color: #fff;">${species.species}</strong>
          </div>
        `;

        if (variants.length > 0) {
          html += `
            <div style="margin-bottom: 8px;">
              <div style="color: #999; font-size: 11px; margin-bottom: 4px;">Variants (${variantCollected}/${variantTotal})</div>
              <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                ${variants.map(v => `
                  <span style="
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 12px;
                    background: ${v.collected ? '#1976d2' : '#424242'};
                    color: ${v.collected ? '#fff' : '#999'};
                  ">${v.variant}</span>
                `).join('')}
              </div>
            </div>
          `;
        }

        speciesCard.innerHTML = html;
        resultsContainer.appendChild(speciesCard);
      }
    }
  };

  categories.forEach(cat => {
    const button = document.createElement('button');
    button.textContent = `${cat.icon} ${cat.label}`;
    button.style.cssText = `
      padding: 8px 16px;
      border-radius: 6px;
      border: 1px solid #444;
      background: ${selectedCategory === cat.key || (cat.key === 'missing' && showMissingOnly) ? '#4CAF50' : '#2a2a2a'};
      color: #fff;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.2s;
    `;

    button.addEventListener('click', () => {
      if (cat.key === 'missing') {
        showMissingOnly = !showMissingOnly;
      } else {
        selectedCategory = cat.key;
        showMissingOnly = false;
      }

      // Update all button styles
      categoryContainer.querySelectorAll('button').forEach((btn, idx) => {
        const category = categories[idx];
        if (!category) return;
        const isActive = selectedCategory === category.key || (category.key === 'missing' && showMissingOnly);
        (btn as HTMLButtonElement).style.background = isActive ? '#4CAF50' : '#2a2a2a';
      });

      updateDisplay();
    });

    categoryContainer.appendChild(button);
  });

  body.appendChild(categoryContainer);

  // Results container
  const resultsContainer = document.createElement('div');
  resultsContainer.style.cssText = `
    max-height: 600px;
    overflow-y: auto;
  `;

  body.appendChild(resultsContainer);

  // Refresh button
  const refreshButton = document.createElement('button');
  refreshButton.textContent = '🔄 Refresh';
  refreshButton.style.cssText = `
    width: 100%;
    padding: 12px;
    margin-top: 16px;
    border-radius: 6px;
    border: 1px solid #444;
    background: #2a2a2a;
    color: #fff;
    cursor: pointer;
    font-size: 14px;
  `;
  refreshButton.addEventListener('click', () => {
    import('../features/journalChecker').then(m => m.refreshJournalCache());
    updateDisplay();
  });

  body.appendChild(refreshButton);

  // Initial load
  updateDisplay();

  return root;
}

function createGuideSection(): HTMLElement {
  const { root, body } = createCard('📖 Magic Garden Guide', {
    subtitle: 'Reference guide for game mechanics',
  });
  root.dataset.qpmSection = 'guide';

  const imageContainer = document.createElement('div');
  imageContainer.style.cssText = `
    width: 100%;
    text-align: center;
    padding: 12px;
    background: var(--qpm-surface-1, #1a1a1a);
    border-radius: 8px;
    position: relative;
  `;

  const clickHint = document.createElement('div');
  clickHint.textContent = '(Click to open full size!)';
  clickHint.style.cssText = `
    position: absolute;
    top: 20px;
    right: 20px;
    color: rgba(150, 150, 150, 0.7);
    font-size: 12px;
    font-style: italic;
    background: rgba(0, 0, 0, 0.5);
    padding: 4px 8px;
    border-radius: 4px;
    pointer-events: none;
    z-index: 10;
  `;

  const img = document.createElement('img');
  img.src = 'https://raw.githubusercontent.com/ryandt2305-cpu/QPM-GR/master/MGGuide.jpeg';
  img.alt = 'Magic Garden Guide';
  img.style.cssText = `
    width: 100%;
    max-width: 100%;
    height: auto;
    border-radius: 8px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
    cursor: pointer;
    transition: transform 0.2s;
    display: block;
  `;

  img.addEventListener('mouseenter', () => {
    img.style.transform = 'scale(1.02)';
  });

  img.addEventListener('mouseleave', () => {
    img.style.transform = 'scale(1)';
  });

  // Click to open full-size in new tab
  img.addEventListener('click', () => {
    window.open(img.src, '_blank');
  });

  img.onerror = () => {
    imageContainer.innerHTML = `
      <div style="padding: 40px; color: var(--qpm-text-muted, #999); font-style: italic;">
        📖 Guide image not found. Please ensure MGGuide.jpeg is uploaded to the master branch of the repository.
      </div>
    `;
  };

  imageContainer.appendChild(clickHint);
  imageContainer.appendChild(img);
  body.appendChild(imageContainer);

  return root;
}

export async function createOriginalUI(): Promise<HTMLElement> {
  ensurePanelStyles();
  if (uiState.panel) return uiState.panel;

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

  const cropLockConfig = getCropLockConfig();
  const activeSyncMode = cropLockConfig.syncModeEnabled !== false;
  const storedSyncMode = cfg.inventoryLocker?.syncMode;
  const resolvedSyncMode = typeof storedSyncMode === 'boolean' ? storedSyncMode : activeSyncMode;

  let updatedCfg = false;
  if (!cfg.inventoryLocker) {
    cfg.inventoryLocker = { syncMode: resolvedSyncMode };
    updatedCfg = true;
  } else if (cfg.inventoryLocker.syncMode !== resolvedSyncMode) {
    cfg.inventoryLocker.syncMode = resolvedSyncMode;
    updatedCfg = true;
  }

  if (updatedCfg) {
    saveCfg();
  }

  if (cropLockConfig.syncModeEnabled !== resolvedSyncMode) {
    setCropLockSyncMode(resolvedSyncMode);
  }

  const statsHeader = createStatsHeader();
  const statsSection = createStatsSection();
  const notificationsSection = createNotificationSection();
  const turtleSection = createTurtleTimerSection();
  const trackerSections = createTrackersSection();

  // Inventory locker section
  const lockerSection = createInventoryLockerSection(resolvedSyncMode);

  // Mutation reminder section
  const mutationSection = createMutationSection();

  // Mutation value section
  const mutationValueSection = createMutationValueSection();

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
      
      // Apply color coding - always show the color, brighter when active OR when window is open
      if (button.dataset.tabColor) {
        const baseColor = button.dataset.tabColor;
        // Check if this tab has an associated window that's open
        const windowId = button.dataset.windowId;
        const isWindowActive = windowId && isWindowOpen(windowId);
        
        if (isActive || isWindowActive) {
          button.style.background = baseColor;
          button.style.boxShadow = `0 6px 18px ${baseColor}`;
        } else {
          // Make inactive tabs show a dimmer version of their color
          button.style.background = baseColor.replace('0.28', '0.14');
          button.style.boxShadow = '';
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
    
    // Add color coding for visual distinction
    const tabColors: Record<string, string> = {
      'dashboard': 'rgba(76, 175, 80, 0.28)',      // Green
      'turtle': 'rgba(33, 150, 243, 0.28)',        // Blue
      'trackers': 'rgba(156, 39, 176, 0.28)',      // Purple
      'xp-tracker': 'rgba(255, 152, 0, 0.28)',     // Orange
      'shop-restock': 'rgba(0, 188, 212, 0.28)',   // Cyan
      'pet-hub': 'rgba(103, 58, 183, 0.28)',       // Deep Purple
      'public-rooms': 'rgba(233, 30, 99, 0.28)',   // Pink
      'crop-boost': 'rgba(139, 195, 74, 0.28)',    // Light Green
      'achievements': 'rgba(255, 215, 64, 0.28)',  // Gold
      'auto-favorite': 'rgba(255, 235, 59, 0.28)', // Yellow
      'journal-checker': 'rgba(121, 85, 72, 0.28)', // Brown
      'guide': 'rgba(96, 125, 139, 0.28)',         // Blue Grey
    };
    
    if (tabColors[key]) {
      button.dataset.tabColor = tabColors[key];
      // Set initial background to dimmed color
      button.style.background = tabColors[key].replace('0.28', '0.14');
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
  registerTab('journal-checker', 'Journal', '📔', [journalCheckerSection]);
  registerTab('guide', 'Guide', '📖', [guideSection]);
  registerTab('weather', 'Reminders', '🔔', [mutationSection]);
  registerTab('locker', 'Locker', '🔒', [lockerSection]);

  // Override tab click handlers to open windows instead
  const trackersButton = tabButtons.get('trackers');
  if (trackersButton) {
    const newTrackersButton = trackersButton.cloneNode(true) as HTMLButtonElement;
    newTrackersButton.dataset.windowId = 'trackers-detail';
    newTrackersButton.addEventListener('click', () => {
      toggleWindow('trackers-detail', '📊 Ability & Mutation Trackers', renderTrackersWindow);
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

  const achievementsButton = tabButtons.get('achievements');
  if (achievementsButton) {
    const newAchievementsButton = achievementsButton.cloneNode(true) as HTMLButtonElement;
    newAchievementsButton.dataset.windowId = 'achievements';
    newAchievementsButton.addEventListener('click', () => {
      const renderAchievementsWindow = async (root: HTMLElement) => {
        const { createAchievementsWindow } = await import('./achievementsWindow');
        const state = createAchievementsWindow();
        state.root.dataset.achievementsRoot = 'true';
        root.appendChild(state.root);
      };
      toggleWindow('achievements', '🏆 Achievements', renderAchievementsWindow, undefined, '90vh');
    });
    achievementsButton.replaceWith(newAchievementsButton);
    tabButtons.set('achievements', newAchievementsButton);
  }

  const turtleButton = tabButtons.get('turtle');
  if (turtleButton) {
    const newTurtleButton = turtleButton.cloneNode(true) as HTMLButtonElement;
    newTurtleButton.dataset.windowId = 'turtle-timer';
    newTurtleButton.addEventListener('click', () => {
      toggleWindow('turtle-timer', '🐢 Bella\'s Turtle Temple', renderTurtleTimerWindow);
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

  const lockerButton = tabButtons.get('locker');
  if (lockerButton) {
    const newLockerButton = lockerButton.cloneNode(true) as HTMLButtonElement;
    newLockerButton.addEventListener('click', () => {
      toggleWindow('locker', '🔒 Locker', renderLockerWindow, '650px', '85vh');
    });
    lockerButton.replaceWith(newLockerButton);
    tabButtons.set('locker', newLockerButton);
  }

  const petHubButton = tabButtons.get('pet-hub');
  if (petHubButton) {
    const newPetHubButton = petHubButton.cloneNode(true) as HTMLButtonElement;
    newPetHubButton.dataset.windowId = 'pet-hub';
    newPetHubButton.addEventListener('click', () => {
      const renderPetHubWindow = (root: HTMLElement) => {
        import('./petHubWindow').then(({ renderPetHubWindow }) => {
          renderPetHubWindow(root);
        }).catch(error => {
          log('⚠️ Failed to load Pet Hub window', error);
        });
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
    newPetOptimizerButton.addEventListener('click', () => {
      import('./petOptimizerWindow').then(({ openPetOptimizerWindow }) => {
        openPetOptimizerWindow();
      }).catch(error => {
        log('⚠️ Failed to load Pet Optimizer window', error);
      });
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

  document.body.appendChild(panel);

  // Connect status callbacks to update UI
  // TODO: Re-enable when autoFeed and weatherSwap features are implemented
  // setFeedStatusCallback((status: string) => {
  //   updateUIStatus(status);
  //   refreshHeaderStats();
  // });

  // setWeatherStatusCallback((status: string) => {
  //   updateWeatherUI(status);
  //   refreshHeaderStats();
  // });

  uiState.panel = panel;
  uiState.content = content;
  return panel;
}

function createStatsHeader(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'qpm-card';
  container.dataset.qpmSection = 'header';
  container.style.cssText = 'background: linear-gradient(135deg, rgba(143,130,255,0.08), rgba(143,130,255,0.03)); border: 1px solid rgba(143,130,255,0.15);';

  const headerRow = document.createElement('div');
  headerRow.className = 'qpm-card__header';

  const headerTitle = document.createElement('div');
  headerTitle.className = 'qpm-card__title';
  headerTitle.textContent = 'Session Overview';
  headerTitle.style.cssText = 'font-size: 14px; font-weight: 700; letter-spacing: 0.3px;';

  const resetButton = btn('♻ Reset Stats', resetAllStats);
  resetButton.classList.add('qpm-button--accent');
  resetButton.style.fontSize = '11px';
  resetButton.title = 'Reset header and detailed stats counters';

  headerRow.append(headerTitle, resetButton);
  container.appendChild(headerRow);

  // Create indicators grid - clean, minimal cards
  const indicatorsGrid = document.createElement('div');
  indicatorsGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-top:10px;';
  container.appendChild(indicatorsGrid);

  // === Bella's Turtle Temple Indicator ===
  const turtleCfg = ensureTurtleTimerConfig();
  const turtleCard = createMinimalCard('🐢', 'Bella\'s Turtle Temple', 'rgba(0,150,136,0.15)');

  // Enable/Disable toggle in card header
  const turtleHeader = turtleCard.querySelector('.indicator-header') as HTMLElement;
  const turtleToggle = document.createElement('button');
  turtleToggle.type = 'button';
  turtleToggle.className = 'qpm-chip';
  turtleToggle.style.cssText = 'cursor:pointer;user-select:none;font-size:9px;padding:2px 6px;';
  turtleHeader.appendChild(turtleToggle);

  // Plant name (clickable)
  const plantNameRow = document.createElement('div');
  plantNameRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:4px;cursor:pointer;padding:4px 6px;background:rgba(255,255,255,0.04);border-radius:4px;margin:4px 0;transition:background 0.2s;';
  plantNameRow.title = 'Click to select a different plant';

  const plantNameText = document.createElement('div');
  plantNameText.style.cssText = 'font-size:12px;font-weight:600;color:#e0f2f1;flex:1;';
  plantNameText.textContent = 'Loading...';
  plantNameRow.appendChild(plantNameText);

  const plantDropdownIcon = document.createElement('span');
  plantDropdownIcon.style.cssText = 'font-size:9px;color:#80cbc4;';
  plantDropdownIcon.textContent = '▼';
  plantNameRow.appendChild(plantDropdownIcon);

  turtleCard.appendChild(plantNameRow);

  // Plant selector dropdown
  const plantSelector = document.createElement('select');
  plantSelector.className = 'qpm-select';
  plantSelector.style.cssText = 'display:none;width:100%;padding:4px 6px;font-size:10px;background:rgba(0,0,0,0.3);border:1px solid rgba(0,150,136,0.3);border-radius:4px;color:#e0e0e0;margin-bottom:6px;';
  turtleCard.appendChild(plantSelector);

  const plantPlaceholder = document.createElement('option');
  plantPlaceholder.value = '';
  plantPlaceholder.textContent = 'Select a plant...';
  plantPlaceholder.disabled = true;
  plantSelector.appendChild(plantPlaceholder);

  // Toggle dropdown
  plantNameRow.addEventListener('click', (e) => {
    e.stopPropagation();
    const isHidden = plantSelector.style.display === 'none';
    plantSelector.style.display = isHidden ? 'block' : 'none';
    plantDropdownIcon.textContent = isHidden ? '▲' : '▼';
    if (isHidden) updatePlantSelectorOptions();
  });

  plantNameRow.addEventListener('mouseenter', () => {
    plantNameRow.style.background = 'rgba(255,255,255,0.08)';
  });
  plantNameRow.addEventListener('mouseleave', () => {
    plantNameRow.style.background = 'rgba(255,255,255,0.04)';
  });

  plantSelector.addEventListener('change', () => {
    const selectedKey = plantSelector.value;
    if (selectedKey) {
      const { tileId, slotIndex } = parseFocusTargetKey(selectedKey);
      cfg.turtleTimer = {
        ...ensureTurtleTimerConfig(),
        focus: 'specific',
        focusTargetTileId: tileId,
        focusTargetSlotIndex: slotIndex,
      };
      saveCfg();
      configureTurtleTimer({
        focus: 'specific',
        focusTargetTileId: tileId,
        focusTargetSlotIndex: slotIndex,
      });
      plantSelector.style.display = 'none';
      plantDropdownIcon.textContent = '▼';
    }
  });

  const updatePlantSelectorOptions = () => {
    const state = getTurtleTimerState();
    while (plantSelector.options.length > 1) {
      plantSelector.remove(1);
    }
    for (const target of state.plantTargets) {
      const option = document.createElement('option');
      option.value = target.key;
      const speciesLabel = target.species ?? 'Unknown';
      const timingLabel = target.remainingMs != null ? formatDurationPretty(target.remainingMs) : 'Ready';
      option.textContent = `${speciesLabel} - ${timingLabel}`;
      plantSelector.appendChild(option);
    }
  };

  const turtleStatus = document.createElement('div');
  turtleStatus.style.cssText = 'font-size:11px;color:#e0f2f1;font-weight:500;margin-bottom:2px;';
  turtleCard.appendChild(turtleStatus);

  const turtleDetail = document.createElement('div');
  turtleDetail.style.cssText = 'font-size:10px;color:#b2dfdb;line-height:1.4;';
  turtleCard.appendChild(turtleDetail);

  const turtleFooter = document.createElement('div');
  turtleFooter.style.cssText = 'font-size:9px;color:#80cbc4;margin-top:4px;';
  turtleCard.appendChild(turtleFooter);

  // Boardwalk checkbox removed (no longer needed)

  turtleToggle.addEventListener('click', () => {
    const nextEnabled = !(cfg.turtleTimer?.enabled ?? true);
    cfg.turtleTimer = { ...ensureTurtleTimerConfig(), enabled: nextEnabled };
    saveCfg();
    setTurtleTimerEnabled(nextEnabled);
  });

  uiState.turtleStatus = turtleStatus;
  uiState.turtleDetail = turtleDetail;
  uiState.turtleFooter = turtleFooter;
  uiState.turtleEnableButtons.push(turtleToggle);

  (uiState as any).turtlePlantNameText = plantNameText;

  if (uiState.turtleUnsubscribe) {
    uiState.turtleUnsubscribe();
  }
  uiState.turtleUnsubscribe = onTurtleTimerState((snapshot: TurtleTimerState) => {
    updateTurtleTimerViews(snapshot);
  });

  indicatorsGrid.appendChild(turtleCard);

  // === Shop Restock Tracker Cards ===
  const shopRestockTitle = document.createElement('div');
  shopRestockTitle.style.cssText = 'font-size:12px;font-weight:600;color:#64b5f6;margin-top:16px;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;';
  shopRestockTitle.textContent = '🏪 Shop Restock Tracker';
  container.appendChild(shopRestockTitle);

  const shopRestockGrid = document.createElement('div');
  shopRestockGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;';
  container.appendChild(shopRestockGrid);

  const trackedShopItems = [
    { name: 'Starweaver', emoji: '⭐', color: 'rgba(255,215,0,0.2)', textColor: '#FFD700' },
    { name: 'Dawnbinder', emoji: '🌅', color: 'rgba(255,152,0,0.2)', textColor: '#FF9800' },
    { name: 'Moonbinder', emoji: '🌙', color: 'rgba(156,39,176,0.2)', textColor: '#CE93D8' },
    { name: 'Mythical Eggs', emoji: '🥚', color: 'rgba(66,165,245,0.2)', textColor: '#42A5F5' },
  ];

  const formatDaysAgo = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor(diff / (1000 * 60));

    if (days > 0) {
      return days === 1 ? '1 day ago' : `${days} days ago`;
    } else if (hours > 0) {
      return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
    } else if (minutes > 0) {
      return minutes === 1 ? '1 min ago' : `${minutes} mins ago`;
    } else {
      return 'Just now';
    }
  };

  const updateShopRestockCards = () => {
    // Clear existing cards
    shopRestockGrid.innerHTML = '';

    const itemStats = calculateItemStats();

    trackedShopItems.forEach(itemConfig => {
      // Try exact match first, then fuzzy match (e.g., "Moonbinder" matches "Moonbinder Pod")
      let stat = itemStats.get(itemConfig.name);
      if (!stat) {
        // Try finding by partial match
        for (const [itemName, itemStat] of itemStats.entries()) {
          if (itemName.includes(itemConfig.name) || itemConfig.name.includes(itemName)) {
            stat = itemStat;
            break;
          }
        }
      }
      const card = document.createElement('div');
      card.style.cssText = `
        padding:12px;
        background:${itemConfig.color};
        border-radius:8px;
        border:2px solid ${itemConfig.textColor}40;
        box-shadow:0 2px 8px rgba(0,0,0,0.2);
        transition:all 0.2s ease;
        cursor:default;
      `;

      // Hover effect
      card.addEventListener('mouseenter', () => {
        card.style.transform = 'translateY(-2px)';
        card.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
      });
      card.addEventListener('mouseleave', () => {
        card.style.transform = 'translateY(0)';
        card.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
      });

      // Header with sprite icon
      const header = document.createElement('div');
      header.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:8px;';

      // Get sprite based on item name
      let spriteUrl: string | null = null;
      if (itemConfig.name === 'Mythical Eggs') {
        spriteUrl = getPetSpriteDataUrl('MythicalEgg');
      } else {
        // Starweaver, Dawnbinder, Moonbinder are crops
        spriteUrl = getCropSpriteDataUrl(itemConfig.name);
      }

      const iconContainer = document.createElement('div');
      iconContainer.style.cssText = 'width:24px;height:24px;display:flex;align-items:center;justify-content:center;flex-shrink:0;';

      if (spriteUrl) {
        const spriteImg = document.createElement('img');
        spriteImg.src = spriteUrl;
        spriteImg.alt = itemConfig.name;
        spriteImg.style.cssText = 'width:100%;height:100%;object-fit:contain;image-rendering:pixelated;';
        iconContainer.appendChild(spriteImg);
      } else {
        // Fallback to emoji if sprite not found
        iconContainer.textContent = itemConfig.emoji;
        iconContainer.style.fontSize = '18px';
      }

      const title = document.createElement('div');
      title.style.cssText = `font-size:11px;font-weight:700;color:${itemConfig.textColor};text-transform:uppercase;letter-spacing:0.5px;`;
      title.textContent = itemConfig.name;

      header.appendChild(iconContainer);
      header.appendChild(title);
      card.appendChild(header);

      if (stat && stat.lastSeen) {
        const lastSeenDate = new Date(stat.lastSeen);
        const timeString = lastSeenDate.toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });
        const dateString = lastSeenDate.toLocaleDateString([], {
          month: 'short',
          day: 'numeric'
        });
        const daysAgo = formatDaysAgo(stat.lastSeen);

        // Date and time
        const dateTimeDiv = document.createElement('div');
        dateTimeDiv.style.cssText = 'margin-bottom:4px;';

        const dateDiv = document.createElement('div');
        dateDiv.style.cssText = 'font-size:13px;color:#fff;font-weight:600;';
        dateDiv.textContent = `${dateString} ${timeString}`;
        dateTimeDiv.appendChild(dateDiv);

        card.appendChild(dateTimeDiv);

        // Days ago badge
        const daysAgoDiv = document.createElement('div');
        daysAgoDiv.style.cssText = `font-size:10px;color:${itemConfig.textColor};font-weight:600;background:rgba(0,0,0,0.2);padding:3px 8px;border-radius:4px;display:inline-block;`;
        daysAgoDiv.textContent = daysAgo;
        card.appendChild(daysAgoDiv);
      } else {
        const noDataDiv = document.createElement('div');
        noDataDiv.style.cssText = 'font-size:11px;color:#999;font-style:italic;text-align:center;padding:12px 0;';
        noDataDiv.textContent = 'No data yet';
        card.appendChild(noDataDiv);
      }

      shopRestockGrid.appendChild(card);
    });
  };

  // Initialize the shop restock tracker
  initializeRestockTracker();

  // Start live tracking (async - shop stock store initialization)
  startLiveShopTracking().catch(error => {
    log('⚠️ Failed to start live shop tracking', error);
  });

  // Subscribe to restock updates to refresh cards (with debouncing)
  let debounceTimer: number | null = null;
  onRestockUpdate(() => {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = window.setTimeout(() => {
      debounceTimer = null;
      updateShopRestockCards();
    }, 500); // Debounce 500ms to batch rapid updates
  });

  // Initial render
  updateShopRestockCards();

  return container;
}

// Helper to create minimal indicator cards
function createMinimalCard(icon: string, title: string, bgColor: string): HTMLElement {
  const card = document.createElement('div');
  card.style.cssText = `padding:8px 10px;border-radius:6px;background:${bgColor};border:1px solid ${bgColor.replace('0.15', '0.25')};display:flex;flex-direction:column;gap:4px;`;

  const header = document.createElement('div');
  header.className = 'indicator-header';
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:2px;';

  const titleEl = document.createElement('div');
  titleEl.style.cssText = 'font-size:11px;font-weight:600;color:#b0b0b0;letter-spacing:0.3px;';
  titleEl.textContent = `${icon} ${title}`;

  header.appendChild(titleEl);
  card.appendChild(header);

  return card;
}

function createDashboardIndicatorsCard(): HTMLElement {
  const card = document.createElement('div');
  card.className = 'qpm-card';
  card.dataset.qpmSection = 'dashboard-indicators';

  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;';
  card.appendChild(grid);

  const hungerBox = document.createElement('div');
  hungerBox.style.cssText = 'padding:10px 12px;border-radius:8px;background:linear-gradient(135deg, rgba(255,204,128,0.12), rgba(255,204,128,0.04));border:1px solid rgba(255,204,128,0.25);display:flex;flex-direction:column;gap:6px;';

  const hungerTitle = document.createElement('div');
  hungerTitle.textContent = '🍖 Pet Hunger';
  hungerTitle.style.cssText = 'font-weight:700;font-size:12px;color:#ffcc80;margin-bottom:2px;letter-spacing:0.3px;';
  hungerBox.appendChild(hungerTitle);

  const hungerList = document.createElement('div');
  hungerList.style.cssText = 'display:flex;flex-direction:column;gap:3px;font-size:11px;color:#f0f0f0;line-height:1.4;';
  hungerBox.appendChild(hungerList);

  const hungerMeta = document.createElement('div');
  hungerMeta.style.cssText = 'font-size:10px;color:#b0b0b0;margin-top:2px;';
  hungerMeta.style.display = 'none';
  hungerBox.appendChild(hungerMeta);

  const feedRateEl = document.createElement('div');
  feedRateEl.style.cssText = 'font-size:10px;color:#81c784;margin-top:3px;font-family:monospace;font-weight:600;';
  hungerBox.appendChild(feedRateEl);

  const updateFeedRate = (): void => {
    try {
      // TODO: Re-enable when stats feature is implemented
      // const stats = getSessionStats();
      // const rateValue = Number(stats.feedsPerHour);
      const rateValue = 0; // Placeholder
      if (!Number.isFinite(rateValue) || rateValue <= 0) {
        feedRateEl.style.display = 'none';
        return;
      }

      // TODO: Re-enable when stats feature is implemented
      let detail: string = 'est.';
      // if (stats.feedRateSource === 'events') {
      //   detail = `${stats.feedSampleCount} feeds/${stats.feedWindowMinutes}m`;
      // } else if (stats.feedRateSource === 'model') {
      //   detail = `est. ×${stats.modelPetSamples}`;
      // } else {
      //   detail = 'est.';
      // }

      feedRateEl.textContent = `${rateValue.toFixed(1)} feeds/hr • ${detail}`;
      feedRateEl.style.display = 'block';
    } catch {
      feedRateEl.style.display = 'none';
    }
  };

  setInterval(updateFeedRate, 5000);
  updateFeedRate();

  uiState.dashboardFeedList = hungerList;
  uiState.dashboardFeedMeta = hungerMeta;
  updateDashboardFeedDisplay();

  const restockBox = document.createElement('div');
  restockBox.style.cssText = 'padding:10px 12px;border-radius:8px;background:linear-gradient(135deg, rgba(255,152,0,0.12), rgba(255,152,0,0.04));border:1px solid rgba(255,152,0,0.25);display:flex;flex-direction:column;gap:6px;';

  const restockHeader = document.createElement('div');
  restockHeader.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:2px;';

  const restockTitle = document.createElement('div');
  restockTitle.textContent = '🛒 Restock';
  restockTitle.style.cssText = 'font-weight:700;font-size:12px;color:#ffab91;letter-spacing:0.3px;';
  restockHeader.appendChild(restockTitle);

  const clearRestocksBtn = document.createElement('button');
  clearRestocksBtn.type = 'button';
  clearRestocksBtn.textContent = 'Clear Data';
  clearRestocksBtn.style.cssText = 'padding:4px 8px;font-size:10px;color:#ffcc80;background:rgba(255,152,0,0.15);border:1px solid rgba(255,152,0,0.45);border-radius:6px;cursor:pointer;';
  clearRestocksBtn.addEventListener('mouseenter', () => clearRestocksBtn.style.borderColor = '#ffcc80');
  clearRestocksBtn.addEventListener('mouseleave', () => clearRestocksBtn.style.borderColor = 'rgba(255,152,0,0.45)');
  clearRestocksBtn.onclick = () => {
    if (confirm('Clear all saved shop restock history and predictions? This does not affect other QPM data.')) {
      clearAllRestocks();
      restockSummary.style.display = 'block';
      restockSummary.textContent = 'Restock history cleared';
      restockRows.innerHTML = '';
      updateShopCountdownViews();
    }
  };
  restockHeader.appendChild(clearRestocksBtn);

  restockBox.appendChild(restockHeader);

  const restockSummary = document.createElement('div');
  restockSummary.style.cssText = 'font-size:10px;color:#b0b0b0;display:none;';
  restockBox.appendChild(restockSummary);

  const restockRows = document.createElement('div');
  restockRows.style.cssText = 'display:flex;flex-direction:column;gap:3px;font-size:11px;color:#f0f0f0;';
  restockBox.appendChild(restockRows);

  const restockValues = {} as Record<ShopCategoryKey, HTMLElement>;
  for (const cat of SHOP_CATEGORY_DEFINITIONS) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;';

    const label = document.createElement('span');
    label.textContent = cat.icon;
    label.style.cssText = 'font-size:12px;';

    const value = document.createElement('span');
    value.textContent = '...';
    value.style.cssText = 'font-family:monospace;color:#b0b0b0;font-size:11px;font-weight:600;';

    row.append(label, value);
    restockRows.appendChild(row);
    restockValues[cat.key] = value;
  }

  uiState.dashboardRestockSummary = restockSummary;
  uiState.dashboardRestockValues = {
    seeds: restockValues.seeds ?? null,
    eggs: restockValues.eggs ?? null,
    tools: restockValues.tools ?? null,
    decor: restockValues.decor ?? null,
  };

  registerShopCountdownView({ summaryEl: restockSummary, values: restockValues });
  updateShopCountdownViews();

  const turtleCfg = ensureTurtleTimerConfig();

  const turtleBox = document.createElement('div');
  turtleBox.style.cssText = 'padding:10px 12px;border-radius:8px;background:linear-gradient(135deg, rgba(0,150,136,0.15), rgba(0,150,136,0.05));border:1px solid rgba(0,150,136,0.3);display:flex;flex-direction:column;gap:6px;';

  const turtleHeader = document.createElement('div');
  turtleHeader.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;';
  turtleBox.appendChild(turtleHeader);

  const turtleTitle = document.createElement('div');
  turtleTitle.textContent = '🐢 Bella\'s Turtle Temple';
  turtleTitle.style.cssText = 'font-weight:700;font-size:12px;color:#80cbc4;letter-spacing:0.3px;';
  turtleHeader.appendChild(turtleTitle);

  const turtleToggle = document.createElement('button');
  turtleToggle.type = 'button';
  turtleToggle.className = 'qpm-chip';
  turtleToggle.style.cursor = 'pointer';
  turtleToggle.style.userSelect = 'none';
  turtleToggle.style.transition = 'background 0.2s ease, border-color 0.2s ease, color 0.2s ease';
  turtleHeader.appendChild(turtleToggle);

  const turtleStatus = document.createElement('div');
  turtleStatus.style.cssText = 'font-size:11px;color:#e0f2f1;font-weight:600;line-height:1.4;';
  turtleBox.appendChild(turtleStatus);

  const turtleDetail = document.createElement('div');
  turtleDetail.style.cssText = 'font-size:11px;color:#b2dfdb;line-height:1.5;';
  turtleBox.appendChild(turtleDetail);

  const turtleFooter = document.createElement('div');
  turtleFooter.style.cssText = 'font-size:10px;color:#9acccc;line-height:1.5;';
  turtleBox.appendChild(turtleFooter);

  // Boardwalk checkbox removed (no longer needed)

  turtleToggle.addEventListener('click', () => {
    const nextEnabled = !(cfg.turtleTimer?.enabled ?? true);
    cfg.turtleTimer = {
      ...ensureTurtleTimerConfig(),
      enabled: nextEnabled,
    };
    saveCfg();
    setTurtleTimerEnabled(nextEnabled);
  });

  uiState.turtleStatus = turtleStatus;
  uiState.turtleDetail = turtleDetail;
  uiState.turtleFooter = turtleFooter;
  uiState.turtleEnableButtons.push(turtleToggle);

  if (uiState.turtleUnsubscribe) {
    uiState.turtleUnsubscribe();
  }
  uiState.turtleUnsubscribe = onTurtleTimerState((snapshot: TurtleTimerState) => {
    updateTurtleTimerViews(snapshot);
  });

  grid.append(hungerBox, restockBox, turtleBox);
  return card;
}

function createStatsSection(): HTMLElement {
  if (statsUnsubscribe) {
    statsUnsubscribe();
    statsUnsubscribe = null;
  }

  const section = document.createElement('div');
  section.className = 'qpm-card';
  section.dataset.qpmSection = 'stats';
  section.style.cssText = 'background: linear-gradient(135deg, rgba(100,181,246,0.08), rgba(100,181,246,0.03)); border: 1px solid rgba(100,181,246,0.15);';

  const header = document.createElement('div');
  header.className = 'qpm-card__header';
  header.style.cssText = 'cursor: pointer; padding: 12px 14px; border-radius: 8px; transition: all 0.2s ease; user-select: none;';

  const headerLabel = document.createElement('div');
  headerLabel.className = 'qpm-card__title';
  headerLabel.textContent = '📊 Detailed Stats';
  headerLabel.style.cssText = 'font-size: 14px; font-weight: 700; letter-spacing: 0.3px; color: #64b5f6;';

  const caret = document.createElement('span');
  caret.style.cssText = 'font-size: 14px; color: #64b5f6; transition: transform 0.2s ease;';
  caret.textContent = '▼';

  const expandHint = document.createElement('span');
  expandHint.style.cssText = 'font-size: 10px; color: #90a4ae; margin-left: 8px; font-weight: 400;';
  expandHint.textContent = '(click to expand)';

  header.append(headerLabel, caret, expandHint);

  const content = document.createElement('div');
  content.style.cssText = 'display:block;margin-top:12px;font-size:11px;color:#dbe1ff;line-height:1.6;';

  header.addEventListener('click', () => {
    const hidden = content.style.display === 'none';
    content.style.display = hidden ? 'block' : 'none';
    caret.textContent = hidden ? '▼' : '▲';
    caret.style.transform = hidden ? 'rotate(0deg)' : 'rotate(180deg)';
    expandHint.textContent = hidden ? '(click to expand)' : '(click to collapse)';
    header.style.background = hidden ? 'transparent' : 'rgba(100,181,246,0.08)';
  });

  header.addEventListener('mouseenter', () => {
    if (content.style.display !== 'none') return;
    header.style.background = 'rgba(100,181,246,0.05)';
  });

  header.addEventListener('mouseleave', () => {
    if (content.style.display !== 'none') return;
    header.style.background = 'transparent';
  });

  const feedTitle = document.createElement('div');
  feedTitle.textContent = '🍖 Auto Feed';
  feedTitle.style.cssText = 'font-weight:700;color:#ffcc80;font-size:12px;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;margin-top:4px;';

  const feedSummary = document.createElement('div');
  feedSummary.style.cssText = 'color:#f0f0f0;margin-bottom:3px;font-size:11px;line-height:1.5;';

  const feedDetail = document.createElement('div');
  feedDetail.style.cssText = 'color:#c0c0c0;font-size:10px;margin-bottom:10px;line-height:1.5;';

  const weatherTitle = document.createElement('div');
  weatherTitle.textContent = '☀️ Weather';
  weatherTitle.style.cssText = 'font-weight:700;color:#80deea;font-size:12px;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;';

  const weatherSummary = document.createElement('div');
  weatherSummary.style.cssText = 'color:#f0f0f0;margin-bottom:3px;font-size:11px;line-height:1.5;';

  const weatherDetail = document.createElement('div');
  weatherDetail.style.cssText = 'color:#c0c0c0;font-size:10px;margin-bottom:10px;line-height:1.5;';

  const shopTitle = document.createElement('div');
  shopTitle.textContent = '🛒 Auto Shop';
  shopTitle.style.cssText = 'font-weight:700;color:#ffab91;font-size:12px;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;';

  const shopSummary = document.createElement('div');
  shopSummary.style.cssText = 'color:#f0f0f0;margin-bottom:3px;font-size:11px;line-height:1.5;';

  const shopDetail = document.createElement('div');
  shopDetail.style.cssText = 'color:#c0c0c0;font-size:10px;margin-bottom:8px;line-height:1.5;';

  const historyTitle = document.createElement('div');
  historyTitle.textContent = 'Recent Purchases';
  historyTitle.style.cssText = 'font-weight:700;font-size:11px;color:#d0d0d0;margin-top:8px;margin-bottom:4px;letter-spacing:0.5px;text-transform:uppercase;';

  const historyList = document.createElement('div');
  historyList.style.cssText = 'display:flex;flex-direction:column;gap:3px;font-size:10px;color:#b0b0b0;line-height:1.5;';

  const resetRow = document.createElement('div');
  resetRow.style.cssText = 'margin-top:14px;display:flex;justify-content:flex-end;padding-top:10px;border-top:1px solid rgba(255,255,255,0.08);';

  const resetButton = btn('♻ Reset Stats', resetAllStats);
  resetButton.classList.add('qpm-button--accent');
  resetButton.style.cssText = 'font-size:11px;font-weight:600;';

  resetRow.append(resetButton);

  content.append(
    feedTitle,
    feedSummary,
    feedDetail,
    weatherTitle,
    weatherSummary,
    weatherDetail,
    shopTitle,
    shopSummary,
    shopDetail,
    historyTitle,
    historyList,
    resetRow,
  );

  section.append(header, content);

  const renderStats = (snapshot: StatsSnapshot): void => {
    const { feed, weather, shop } = snapshot;

    const feedParts: string[] = [];
    feedParts.push(`${feed.totalFeeds} total feeds`);
    if (feed.lastFeedAt) {
      feedParts.push(`last ${formatSince(feed.lastFeedAt)}`);
    }
    feedSummary.textContent = feedParts.join(' • ');

    const petEntries = Object.entries(feed.perPet)
      .sort((a, b) => (b[1]?.count ?? 0) - (a[1]?.count ?? 0))
      .slice(0, 3);
    if (petEntries.length === 0) {
      feedDetail.textContent = 'No feed history yet';
    } else {
      const lines = petEntries.map(([name, data]) => {
        const since = data.lastFeedAt ? ` (${formatSince(data.lastFeedAt)})` : '';
        return `${name} ×${data.count}${since}`;
      });
      feedDetail.textContent = lines.join(' • ');
    }

    const totalPrimary = weather.presetUsage.weather.primary + weather.presetUsage.noweather.primary;
    const totalAlternate = weather.presetUsage.weather.alternate + weather.presetUsage.noweather.alternate;
    const weatherParts: string[] = [];
    weatherParts.push(`Swaps ${weather.totalSwaps}`);
    weatherParts.push(`Primary ${totalPrimary}`);
    if (totalAlternate > 0) weatherParts.push(`Alternate ${totalAlternate}`);
    if (weather.cooldownBlocks > 0) weatherParts.push(`Cooldown blocks ${weather.cooldownBlocks}`);
    weatherSummary.textContent = weatherParts.join(' • ');

    const uptimeEntries = Object.entries(weather.timeByKind)
      .filter(([, value]) => value > 0)
      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
      .slice(0, 3)
      .map(([kind, value]) => `${formatWeatherLabel(kind)} ${formatDuration(value)}`);
    weatherDetail.textContent = uptimeEntries.length > 0 ? uptimeEntries.join(' • ') : 'No uptime recorded yet';

    const shopParts: string[] = [];
    shopParts.push(`Items ${shop.totalPurchases}`);
    if (shop.totalSpentCoins > 0) {
      shopParts.push(`🪙 ${formatCoins(shop.totalSpentCoins)}`);
    }
    if (shop.totalSpentCredits > 0) {
      shopParts.push(`🍩 ${shop.totalSpentCredits.toLocaleString()}`);
    }
    shopSummary.textContent = shopParts.join(' • ');

    const categoryEntries = Object.entries(shop.purchasesByCategory)
      .filter(([, value]) => value > 0)
      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
      .map(([category, value]) => `${category}: ${value}`);
    shopDetail.textContent = categoryEntries.length > 0 ? categoryEntries.join(' • ') : 'No purchases yet';

    historyList.innerHTML = '';
    const historyItems = shop.history.slice(-5).reverse();
    if (historyItems.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'No recent purchases';
      historyList.appendChild(empty);
    } else {
      for (const entry of historyItems) {
        const itemRow = document.createElement('div');
        const spendParts: string[] = [];
        if (entry.coins > 0) spendParts.push(`🪙 ${formatCoins(entry.coins)}`);
  if (entry.credits > 0) spendParts.push(`🍩 ${entry.credits.toLocaleString()}`);
        const spendText = spendParts.length ? ` (${spendParts.join(' • ')})` : '';
        itemRow.textContent = `${entry.itemName} ×${entry.count}${spendText} — ${formatSince(entry.timestamp)}`;
        historyList.appendChild(itemRow);
      }
    }
  };

  statsUnsubscribe = subscribeToStats(renderStats);

  return section;
}

function createNotificationSection(): HTMLElement {
  if (uiState.notificationsSection) {
    return uiState.notificationsSection;
  }

  const section = document.createElement('div');
  section.className = 'qpm-card';
  section.dataset.qpmSection = 'notifications';

  const headerRow = document.createElement('div');
  headerRow.className = 'qpm-card__header';

  const title = document.createElement('div');
  title.className = 'qpm-card__title';
  title.textContent = '🔔 Notifications';

  const controls = document.createElement('div');
  controls.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';

  const collapseButton = btn('', () => {
    setNotificationSectionCollapsed(!notificationSectionCollapsed);
    updateCollapseButton();
  });
  collapseButton.style.fontSize = '10px';

  const detailToggle = btn('', () => {
    notificationDetailExpanded = !notificationDetailExpanded;
    storage.set(NOTIFICATIONS_DETAIL_EXPANDED_KEY, notificationDetailExpanded);
    updateNotificationDetailToggle();
    const selectedEvent = notificationSelectedId
      ? lastNotificationEvents.find((event) => event.id === notificationSelectedId) ?? null
      : null;
    updateNotificationDetailVisibility(selectedEvent);
    refreshNotificationContainerVisibility();
  });
  detailToggle.style.fontSize = '10px';

  const clearButton = btn('Clear', () => {
    clearNotifications();
    resetNotificationFilters();
    notificationSelectedId = null;
    notificationItemElements.clear();
    renderNotificationDetail(null);
    renderNotificationList([]);
    refreshNotificationContainerVisibility();
  });
  clearButton.style.fontSize = '10px';

  controls.append(collapseButton, detailToggle, clearButton);
  headerRow.append(title, controls);
  section.appendChild(headerRow);

  const body = document.createElement('div');
  body.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-top:8px;';
  section.appendChild(body);

  const filterBar = document.createElement('div');
  filterBar.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px';
  body.appendChild(filterBar);

  const listWrapper = document.createElement('div');
  listWrapper.style.cssText = 'max-height:240px;overflow-y:auto;padding-right:4px;';
  body.appendChild(listWrapper);

  const list = document.createElement('div');
  list.style.cssText = 'display:flex;flex-direction:column;gap:8px';
  listWrapper.appendChild(list);

  const emptyState = document.createElement('div');
  emptyState.textContent = 'No notifications yet.';
  emptyState.style.cssText = 'font-size:11px;color:var(--qpm-text-muted);padding:12px;border:1px dashed rgba(255,255,255,0.1);border-radius:6px;text-align:center;';
  body.appendChild(emptyState);

  const detailCard = document.createElement('div');
  detailCard.style.cssText = 'border:1px solid rgba(255,255,255,0.08);background:rgba(10,12,20,0.72);border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:10px;min-height:120px';
  body.appendChild(detailCard);

  const detailPlaceholder = document.createElement('div');
  detailPlaceholder.textContent = 'Select a notification to see full details.';
  detailPlaceholder.style.cssText = 'font-size:11px;color:var(--qpm-text-muted);text-align:center;';
  detailCard.appendChild(detailPlaceholder);

  const detailHeader = document.createElement('div');
  detailHeader.style.cssText = 'display:none;justify-content:space-between;align-items:flex-start;gap:12px;';
  detailCard.appendChild(detailHeader);

  const detailTitle = document.createElement('div');
  detailTitle.style.cssText = 'font-weight:600;font-size:12px;color:#fff;flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;';
  detailHeader.appendChild(detailTitle);

  const detailTimestamp = document.createElement('div');
  detailTimestamp.style.cssText = 'font-size:10px;color:#ccc;white-space:nowrap;';
  detailHeader.appendChild(detailTimestamp);

  const detailMeta = document.createElement('div');
  detailMeta.style.cssText = 'display:none;flex-wrap:wrap;gap:6px;font-size:10px;color:#d7e3ff;';
  detailCard.appendChild(detailMeta);

  const detailMessage = document.createElement('div');
  detailMessage.style.cssText = 'display:none;font-size:11px;line-height:1.5;color:#f5f7ff;white-space:pre-wrap;word-break:break-word;';
  detailCard.appendChild(detailMessage);

  const detailActions = document.createElement('div');
  detailActions.style.cssText = 'display:none;flex-wrap:wrap;gap:6px;';
  detailCard.appendChild(detailActions);

  const detailRaw = document.createElement('pre');
  detailRaw.style.cssText = 'display:none;font-size:10px;color:#9cd2ff;background:rgba(255,255,255,0.05);padding:8px;border-radius:4px;margin:0;max-height:140px;overflow:auto;';
  detailCard.appendChild(detailRaw);

  uiState.notificationsSection = section;
  uiState.notificationsFilterBar = filterBar;
  uiState.notificationsListWrapper = listWrapper;
  uiState.notificationsList = list;
  uiState.notificationsEmpty = emptyState;
  uiState.notificationsDetail = detailCard;
  uiState.notificationsDetailHeader = detailHeader;
  uiState.notificationsDetailTitle = detailTitle;
  uiState.notificationsDetailTimestamp = detailTimestamp;
  uiState.notificationsDetailMeta = detailMeta;
  uiState.notificationsDetailMessage = detailMessage;
  uiState.notificationsDetailActions = detailActions;
  uiState.notificationsDetailRaw = detailRaw;
  uiState.notificationsDetailPlaceholder = detailPlaceholder;
  uiState.notificationsDetailToggle = detailToggle;

  notificationFilters.clear();
  notificationFeatureButtons.clear();
  notificationAllButton = null;
  notificationItemElements.clear();
  notificationSelectedId = null;
  renderNotificationDetail(null);

  uiState.notificationsUnsubscribe?.();
  uiState.notificationsUnsubscribe = onNotifications((events) => {
    lastNotificationEvents = events;
    rebuildNotificationFilterButtons(events);
    renderNotificationList(events);
    if (notificationSelectedId) {
      const matching = events.find((event) => event.id === notificationSelectedId) ?? null;
      if (!matching) {
        renderNotificationDetail(null);
      }
    }
  });

  const updateCollapseButton = (): void => {
    collapseButton.textContent = notificationSectionCollapsed ? 'Expand' : 'Collapse';
    collapseButton.classList.toggle('qpm-button--accent', notificationSectionCollapsed);
  };

  updateCollapseButton();
  updateNotificationDetailToggle();
  setNotificationSectionCollapsed(notificationSectionCollapsed);
  updateNotificationDetailVisibility(null);
  refreshNotificationContainerVisibility();

  return section;
}

function rebuildNotificationFilterButtons(events: NotificationEvent[]): void {
  const filterBar = uiState.notificationsFilterBar;
  if (!filterBar) return;

  const features = Array.from(new Set(events.map(event => event.feature))).sort();
  for (const feature of Array.from(notificationFilters)) {
    if (!features.includes(feature)) {
      notificationFilters.delete(feature);
    }
  }

  filterBar.textContent = '';

  notificationAllButton = createNotificationFilterButton('All', () => {
    resetNotificationFilters();
    renderNotificationList(lastNotificationEvents);
  });
  setNotificationFilterActive(notificationAllButton, notificationFilters.size === 0);
  filterBar.appendChild(notificationAllButton);

  notificationFeatureButtons.clear();
  for (const feature of features) {
    const button = createNotificationFilterButton(formatNotificationFeature(feature), () => {
      toggleNotificationFilter(feature);
    });
    setNotificationFilterActive(button, notificationFilters.has(feature));
    filterBar.appendChild(button);
    notificationFeatureButtons.set(feature, button);
  }
}

function toggleNotificationFilter(feature: string): void {
  if (notificationFilters.has(feature)) {
    notificationFilters.delete(feature);
  } else {
    notificationFilters.add(feature);
  }

  if (notificationFilters.size === 0) {
    setNotificationFilterActive(notificationAllButton, true);
  } else {
    setNotificationFilterActive(notificationAllButton, false);
  }

  for (const [name, button] of notificationFeatureButtons) {
    setNotificationFilterActive(button, notificationFilters.has(name));
  }

  renderNotificationList(lastNotificationEvents);
}

function resetNotificationFilters(): void {
  notificationFilters.clear();
  setNotificationFilterActive(notificationAllButton, true);
  for (const button of notificationFeatureButtons.values()) {
    setNotificationFilterActive(button, false);
  }
  refreshNotificationContainerVisibility();
}

function setNotificationSectionCollapsed(collapsed: boolean): void {
  notificationSectionCollapsed = collapsed;
  try {
    storage.set(NOTIFICATIONS_COLLAPSED_KEY, collapsed);
  } catch (error) {
    console.warn('[qpm] failed to persist notification collapse state', error);
  }
  refreshNotificationContainerVisibility();
}

function updateNotificationDetailToggle(): void {
  const toggle = uiState.notificationsDetailToggle;
  if (!toggle) return;
  toggle.textContent = notificationDetailExpanded ? 'Hide extra info' : 'Show extra info';
  toggle.classList.toggle('qpm-button--positive', notificationDetailExpanded);
}

function updateNotificationDetailVisibility(event: NotificationEvent | null): void {
  const meta = uiState.notificationsDetailMeta;
  const actions = uiState.notificationsDetailActions;
  const raw = uiState.notificationsDetailRaw;
  if (!meta || !actions || !raw) {
    return;
  }

  if (!event) {
    meta.style.display = 'none';
    actions.style.display = 'none';
    raw.style.display = 'none';
    return;
  }

  if (notificationDetailExpanded) {
    meta.style.display = 'flex';
    actions.style.display = actions.childElementCount > 0 ? 'flex' : 'none';
    raw.style.display = 'block';
  } else {
    meta.style.display = 'none';
    actions.style.display = 'none';
    raw.style.display = 'none';
  }
}

function refreshNotificationContainerVisibility(): void {
  const filterBar = uiState.notificationsFilterBar;
  const listWrapper = uiState.notificationsListWrapper;
  const emptyState = uiState.notificationsEmpty;
  const detail = uiState.notificationsDetail;
  const detailToggle = uiState.notificationsDetailToggle;
  const section = uiState.notificationsSection;

  if (section) {
    section.dataset.collapsed = notificationSectionCollapsed ? 'true' : 'false';
  }

  const hasItems = lastNotificationFilteredCount > 0;

  if (filterBar) {
    filterBar.style.display = notificationSectionCollapsed ? 'none' : 'flex';
  }
  if (listWrapper) {
    listWrapper.style.display = notificationSectionCollapsed ? 'none' : hasItems ? 'block' : 'none';
  }
  if (emptyState) {
    emptyState.style.display = notificationSectionCollapsed ? 'none' : hasItems ? 'none' : 'block';
  }
  if (detail) {
    // Only show detail card when NOT collapsed AND detail is expanded
    detail.style.display = notificationSectionCollapsed ? 'none' : (notificationDetailExpanded ? 'flex' : 'none');
  }
  if (detailToggle) {
    detailToggle.style.display = notificationSectionCollapsed ? 'none' : 'inline-flex';
    detailToggle.disabled = !notificationSelectedId;
    detailToggle.style.opacity = detailToggle.disabled ? '0.6' : '1';
  }
}

function renderNotificationList(events: NotificationEvent[]): void {
  lastNotificationEvents = events;
  const list = uiState.notificationsList;
  const emptyState = uiState.notificationsEmpty;
  if (!list || !emptyState) return;

  const filtered = notificationFilters.size > 0
    ? events.filter(event => notificationFilters.has(event.feature))
    : events;

  if (notificationSelectedId && !filtered.some((event) => event.id === notificationSelectedId)) {
    notificationSelectedId = null;
  }

  const ordered = filtered.slice().reverse();
  lastNotificationFilteredCount = ordered.length;

  if (ordered.length > 0 && !notificationSelectedId) {
    notificationSelectedId = ordered[0]?.id ?? null;
  }

  list.textContent = '';
  notificationItemElements.clear();

  if (ordered.length === 0) {
    list.style.display = 'none';
    emptyState.style.display = 'block';
    renderNotificationDetail(null);
    refreshNotificationContainerVisibility();
    return;
  }

  list.style.display = 'flex';
  emptyState.style.display = 'none';

  for (const event of ordered) {
    const item = buildNotificationListItem(event);
    notificationItemElements.set(event.id, item);
    list.appendChild(item);
  }

  applyNotificationSelection();

  const selectedEvent = ordered.find((event) => event.id === notificationSelectedId) ?? null;
  renderNotificationDetail(selectedEvent);
  refreshNotificationContainerVisibility();
}

function buildNotificationListItem(event: NotificationEvent): HTMLButtonElement {
  const accent = NOTIFICATION_LEVEL_COLORS[event.level] || NOTIFICATION_LEVEL_COLORS.info;
  const icon = NOTIFICATION_LEVEL_ICONS[event.level] || NOTIFICATION_LEVEL_ICONS.info;
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.notificationId = event.id;
  button.dataset.accent = accent;
  button.setAttribute('aria-pressed', 'false');

  // Modern card design inspired by Aries mod
  button.style.cssText = `
    text-align: left;
    background: linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01));
    border: 1px solid rgba(255,255,255,0.1);
    border-left: 4px solid ${accent};
    border-radius: 8px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    color: #f8f8f8;
    cursor: pointer;
    transition: all 0.2s ease;
    backdrop-filter: blur(8px);
  `;
  button.addEventListener('click', () => handleNotificationSelection(event));

  // Hover effect
  button.addEventListener('mouseenter', () => {
    if (button.dataset.notificationId !== notificationSelectedId) {
      button.style.background = 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))';
      button.style.borderColor = 'rgba(255,255,255,0.16)';
      button.style.transform = 'translateX(2px)';
    }
  });
  button.addEventListener('mouseleave', () => {
    if (button.dataset.notificationId !== notificationSelectedId) {
      button.style.background = 'linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))';
      button.style.borderColor = 'rgba(255,255,255,0.1)';
      button.style.transform = 'none';
    }
  });

  const headerRow = document.createElement('div');
  headerRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:10px;';

  const headerLeft = document.createElement('div');
  headerLeft.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;flex:1;';

  // Larger, more prominent icon
  const iconBadge = document.createElement('span');
  iconBadge.textContent = icon;
  iconBadge.style.cssText = `
    font-size: 16px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: ${accent}14;
    border-radius: 6px;
    flex-shrink: 0;
  `;
  headerLeft.appendChild(iconBadge);

  // Feature tag with better styling
  const featureTag = document.createElement('span');
  featureTag.textContent = formatNotificationFeature(event.feature);
  featureTag.style.cssText = `
    background: rgba(143,130,255,0.12);
    padding: 3px 8px;
    border-radius: 6px;
    font-size: 11px;
    color: #c7b8ff;
    font-weight: 600;
    letter-spacing: 0.3px;
  `;
  headerLeft.appendChild(featureTag);

  // Level badge (only show for warn/error to reduce clutter)
  if (event.level === 'warn' || event.level === 'error') {
    const levelTag = document.createElement('span');
    levelTag.textContent = event.level.toUpperCase();
    levelTag.style.cssText = `
      padding: 3px 8px;
      border-radius: 6px;
      background: ${accent}20;
      color: ${accent};
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.5px;
    `;
    headerLeft.appendChild(levelTag);
  }

  // Cleaner timestamp
  const time = document.createElement('span');
  time.textContent = formatSince(event.timestamp);
  time.title = new Date(event.timestamp).toLocaleString();
  time.style.cssText = `
    font-size: 11px;
    color: rgba(255,255,255,0.4);
    white-space: nowrap;
    flex-shrink: 0;
    font-weight: 500;
  `;

  headerRow.append(headerLeft, time);
  button.appendChild(headerRow);

  // Message with better readability
  const summaryText = event.message.length > 160 ? `${event.message.slice(0, 160)}…` : event.message;
  const message = document.createElement('div');
  message.textContent = summaryText;
  message.style.cssText = `
    font-size: 12px;
    color: rgba(255,255,255,0.85);
    line-height: 1.6;
    margin-left: 36px;
  `;
  button.appendChild(message);

  // Action hint with icon
  if (Array.isArray(event.actions) && event.actions.length > 0) {
    const hint = document.createElement('div');
    hint.textContent = `⚡ ${event.actions.length} quick action${event.actions.length > 1 ? 's' : ''} available`;
    hint.style.cssText = `
      font-size: 11px;
      color: #90caf9;
      margin-left: 36px;
      font-weight: 500;
    `;
    button.appendChild(hint);
  }

  return button;
}

function handleNotificationSelection(event: NotificationEvent): void {
  notificationSelectedId = event.id;
  applyNotificationSelection();
  renderNotificationDetail(event);
}

function applyNotificationSelection(): void {
  for (const [id, element] of notificationItemElements) {
    const accent = element.dataset.accent ?? NOTIFICATION_LEVEL_COLORS.info;
    if (id === notificationSelectedId) {
      // Modern selected state
      element.style.background = `linear-gradient(135deg, ${accent}14, ${accent}08)`;
      element.style.borderColor = `${accent}`;
      element.style.borderLeftWidth = '4px';
      element.style.boxShadow = `0 4px 12px ${accent}30, inset 0 0 0 1px ${accent}20`;
      element.style.transform = 'translateX(4px)';
      element.setAttribute('aria-pressed', 'true');
    } else {
      element.style.background = 'linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))';
      element.style.borderColor = 'rgba(255,255,255,0.1)';
      element.style.borderLeftWidth = '4px';
      element.style.boxShadow = 'none';
      element.style.transform = 'none';
      element.setAttribute('aria-pressed', 'false');
    }
  }
}

function renderNotificationDetail(event: NotificationEvent | null): void {
  const placeholder = uiState.notificationsDetailPlaceholder;
  const header = uiState.notificationsDetailHeader;
  const title = uiState.notificationsDetailTitle;
  const timestamp = uiState.notificationsDetailTimestamp;
  const meta = uiState.notificationsDetailMeta;
  const message = uiState.notificationsDetailMessage;
  const actions = uiState.notificationsDetailActions;
  const raw = uiState.notificationsDetailRaw;

  if (!placeholder || !header || !title || !timestamp || !meta || !message || !actions || !raw) {
    return;
  }

  if (!event) {
    placeholder.style.display = 'block';
    header.style.display = 'none';
    message.style.display = 'none';
    meta.style.display = 'none';
    actions.style.display = 'none';
    raw.style.display = 'none';
    raw.textContent = '';
    updateNotificationDetailToggle();
    refreshNotificationContainerVisibility();
    return;
  }

  placeholder.style.display = 'none';
  header.style.display = 'flex';
  message.style.display = 'block';

  const absoluteTime = new Date(event.timestamp);
  title.textContent = `${formatNotificationFeature(event.feature)} — ${event.level.toUpperCase()}`;
  title.title = event.message;
  timestamp.textContent = `${formatSince(event.timestamp)} • ${absoluteTime.toLocaleString()}`;

  meta.textContent = '';
  meta.appendChild(createNotificationMetaBadge('ID', event.id));
  meta.appendChild(createNotificationMetaBadge('Feature', formatNotificationFeature(event.feature)));
  meta.appendChild(createNotificationMetaBadge('Level', event.level.toUpperCase()));

  message.textContent = event.message;

  actions.textContent = '';
  if (Array.isArray(event.actions) && event.actions.length > 0) {
    for (const action of event.actions) {
      const actionBtn = document.createElement('button');
      actionBtn.type = 'button';
      actionBtn.textContent = action.label;
      actionBtn.className = 'qpm-button';
      actionBtn.style.fontSize = '10px';
      actionBtn.addEventListener('click', () => {
        try {
          action.onClick();
        } catch (error) {
          console.error('[qpm] notification action error', error);
        }
      });
      actions.appendChild(actionBtn);
    }
  }

  const safeActions = Array.isArray(event.actions)
    ? event.actions.map(({ label }) => ({ label }))
    : undefined;
  const safeEvent = {
    ...event,
    actions: safeActions,
  } satisfies Record<string, unknown>;
  raw.textContent = JSON.stringify(safeEvent, null, 2);
  raw.scrollTop = 0;
  updateNotificationDetailVisibility(event);
  updateNotificationDetailToggle();
  refreshNotificationContainerVisibility();
}

function createNotificationMetaBadge(label: string, value: string): HTMLElement {
  const badge = document.createElement('span');
  badge.style.cssText = 'padding:2px 6px;border-radius:4px;background:rgba(255,255,255,0.08);color:#d7e3ff;display:inline-flex;gap:4px;align-items:center;';

  const labelEl = document.createElement('span');
  labelEl.textContent = `${label}:`;
  labelEl.style.cssText = 'font-weight:600;color:#ffffff;';
  badge.appendChild(labelEl);

  const valueEl = document.createElement('span');
  valueEl.textContent = value;
  badge.appendChild(valueEl);

  return badge;
}

function createNotificationFilterButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.className = 'qpm-button';
  button.style.fontSize = '10px';
  button.addEventListener('click', onClick);
  return button;
}

function setNotificationFilterActive(button: HTMLButtonElement | null, active: boolean): void {
  if (!button) return;
  button.dataset.active = active ? 'true' : 'false';
  if (active) {
    button.classList.add('qpm-button--positive');
  } else {
    button.classList.remove('qpm-button--positive');
  }
}

function formatNotificationFeature(feature: string): string {
  if (!feature) return 'General';
  return feature
    .split(/[^a-zA-Z0-9]+/g)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function createHeaderSegment(row: HTMLElement, label: string): HTMLElement {
  const segment = document.createElement('div');
  segment.style.cssText = 'flex:1;min-width:120px;background:rgba(143,130,255,0.08);border:1px solid rgba(143,130,255,0.25);border-radius:10px;padding:8px 10px;display:flex;flex-direction:column;gap:4px';

  const title = document.createElement('div');
  title.style.cssText = 'font-size:10px;color:var(--qpm-text-muted);text-transform:uppercase;letter-spacing:0.4px';
  title.textContent = label;

  const value = document.createElement('div');
  value.style.cssText = 'font-size:12px;color:var(--qpm-text);line-height:1.25;font-weight:600;word-break:break-word';
  value.textContent = '—';

  segment.append(title, value);
  row.appendChild(segment);
  return value;
}

function refreshHeaderStats(): void {
  if (!uiState.headerAutoFeed || !uiState.headerWeather || !uiState.headerShop) {
    return;
  }

  // Auto feed segment
  let autoEnabled = !!cfg.enabled;
  let totalFeeds = feedCount;
  // TODO: Re-enable when autoFeed feature is implemented
  // let sessionInfo: ReturnType<typeof getSessionStats> | null = null;
  let sessionInfo: any = null;

  // try {
  //   const config = getAutoFeedConfig();
  //   autoEnabled = !!config.enabled;
  // } catch {}

  // try {
  //   const state = getAutoFeedState();
  //   if (typeof state.feedCount === 'number' && !Number.isNaN(state.feedCount)) {
  //     totalFeeds = state.feedCount;
  //   }
  // } catch {}

  // try {
  //   sessionInfo = getSessionStats();
  // } catch {}

  const feedParts: string[] = [];
  feedParts.push(autoEnabled ? 'On' : 'Off');
  feedParts.push(`${totalFeeds} feeds`);

  if (sessionInfo) {
    const feedsPerHourNumber = Number(sessionInfo.feedsPerHour);
    if (Number.isFinite(feedsPerHourNumber)) {
      const tag =
        sessionInfo.feedRateSource === 'events'
          ? 'events'
          : sessionInfo.feedRateSource === 'model'
            ? 'est.'
            : 'est';
      feedParts.push(`${feedsPerHourNumber.toFixed(1)}/h ${tag}`);
    }
  }

  uiState.headerAutoFeed.textContent = feedParts.join(' • ');

  // Weather segment
  let weatherLabel = 'Unknown';
  let lastSwapText = 'never';
  let presetLabel = '—';
  const weatherParts: string[] = [];

  try {
    const snapshot = getWeatherSnapshot();
    weatherLabel = formatWeatherLabel(snapshot.kind);
    // TODO: Re-enable when weatherSwap feature is implemented
    // const info = getWeatherSwapInfo();
    const info: any = { lastSwapAt: null, currentPreset: null, nextWeatherPreset: 'unknown', nextSunnyPreset: 'unknown', cooldownRemainingMs: 0 };

    if (info.lastSwapAt) {
      const since = formatSince(info.lastSwapAt);
      lastSwapText = since === '—' ? 'just now' : since;
    }

    if (info.currentPreset) {
      presetLabel = capitalizeWord(info.currentPreset);
    } else {
      const nextPreset = snapshot.raw === 'weather' ? info.nextWeatherPreset : info.nextSunnyPreset;
      presetLabel = `Next ${capitalizeWord(nextPreset)}`;
    }

    const cooldown = info.cooldownRemainingMs > 0
      ? `CD ${Math.ceil(info.cooldownRemainingMs / 1000)}s`
      : '';

    weatherParts.push(weatherLabel, lastSwapText, presetLabel);
    if (cooldown) {
      weatherParts.push(cooldown);
    }
  } catch {
    weatherParts.push(weatherLabel, lastSwapText, presetLabel);
  }

  if (weatherParts.length === 0) {
    weatherParts.push(weatherLabel, lastSwapText, presetLabel);
  }

  uiState.headerWeather.textContent = weatherParts.join(' • ');

  // Shop segment
  let purchasedTotal = shopBuyCount;
  let spentTotal = 0;

  try {
    // TODO: Re-enable when autoShop feature is implemented
    // const stats = getShopStats();
    const stats: any = { totalPurchasedCount: 0, totalSpent: 0 };
    if (typeof stats.totalPurchasedCount === 'number') {
      purchasedTotal = stats.totalPurchasedCount;
    }
    if (typeof stats.totalSpent === 'number') {
      spentTotal = stats.totalSpent;
    }
  } catch {}

  const shopParts = [`${purchasedTotal} items`, `🪙 ${formatCoins(Math.max(0, Math.round(spentTotal)))}`];
  uiState.headerShop.textContent = shopParts.join(' • ');

  if (uiState.headerMeta) {
    const metaParts: string[] = [];
    if (sessionInfo?.uptime) {
      metaParts.push(`⏱️ ${sessionInfo.uptime}`);
    }

    uiState.headerMeta.textContent = metaParts.join(' • ');
  }
}

function capitalizeWord(value: string | null | undefined): string {
  if (!value) return '—';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatWeatherLabel(kind: string | null | undefined): string {
  if (!kind) return 'Unknown';
  return kind
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatDuration(ms: number): string {
  const safeMs = Math.max(0, Math.floor(ms));
  const totalSeconds = Math.floor(safeMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  }
  return `${seconds}s`;
}

function resetAllStats(): void {
  resetStats();
  feedCount = 0;
  weatherCheckCount = 0;
  shopBuyCount = 0;
  refreshHeaderStats();
  showToast('Stats reset');
}

function createTurtleTimerSection(): HTMLElement {
  const { root, body } = createCard('🐢 Bella\'s Turtle Temple', {
    subtitle: 'Growth, eggs, and support breakdown',
  });
  root.dataset.qpmSection = 'turtle-timer';

  const turtleCfg = ensureTurtleTimerConfig();

  const controls = document.createElement('div');
  controls.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;align-items:center;';

  const enableButton = document.createElement('button');
  enableButton.type = 'button';
  enableButton.className = 'qpm-chip';
  enableButton.style.cssText = 'cursor:pointer;user-select:none;min-width:84px;text-align:center;';
  enableButton.addEventListener('click', () => {
    const nextEnabled = !(cfg.turtleTimer?.enabled ?? true);
    cfg.turtleTimer = {
      ...ensureTurtleTimerConfig(),
      enabled: nextEnabled,
    } satisfies TurtleTimerUIConfig;
    saveCfg();
    setTurtleTimerEnabled(nextEnabled);
  });
  controls.appendChild(enableButton);
  uiState.turtleEnableButtons.push(enableButton);

  // Boardwalk checkbox removed (no longer needed)

  const focusLabel = document.createElement('label');
  focusLabel.style.cssText = 'display:inline-flex;align-items:center;gap:6px;font-size:11px;color:#b2dfdb;';

  const focusSelect = document.createElement('select');
  focusSelect.className = 'qpm-select';
  focusSelect.style.cssText = 'min-width:120px;padding:4px 8px;font-size:11px;';
  focusSelect.addEventListener('click', (event) => event.stopPropagation());

  const latestOption = document.createElement('option');
  latestOption.value = 'latest';
  latestOption.textContent = 'Latest finish';
  const earliestOption = document.createElement('option');
  earliestOption.value = 'earliest';
  earliestOption.textContent = 'Earliest finish';
  const specificOption = document.createElement('option');
  specificOption.value = 'specific';
  specificOption.textContent = 'Specific plant';
  focusSelect.append(latestOption, earliestOption, specificOption);
  focusSelect.value = turtleCfg.focus;

  const targetLabel = document.createElement('label');
  targetLabel.style.cssText = 'display:inline-flex;align-items:center;gap:6px;font-size:11px;color:#b2dfdb;';
  targetLabel.style.display = turtleCfg.focus === 'specific' ? 'inline-flex' : 'none';

  const targetSelect = document.createElement('select');
  targetSelect.className = 'qpm-select';
  targetSelect.style.cssText = 'min-width:180px;padding:4px 8px;font-size:11px;';
  targetSelect.addEventListener('click', (event) => event.stopPropagation());

  focusSelect.addEventListener('change', () => {
    const raw = focusSelect.value;
    const value: TurtleTimerState['focus'] = raw === 'earliest' ? 'earliest' : raw === 'specific' ? 'specific' : 'latest';
    const base = ensureTurtleTimerConfig();
    const nextConfig: TurtleTimerUIConfig = {
      ...base,
      focus: value,
    } satisfies TurtleTimerUIConfig;
    cfg.turtleTimer = nextConfig;
    saveCfg();
    const payload: Parameters<typeof configureTurtleTimer>[0] = { focus: value };
    if (value === 'specific') {
      payload.focusTargetTileId = nextConfig.focusTargetTileId;
      payload.focusTargetSlotIndex = nextConfig.focusTargetSlotIndex;
    }
    configureTurtleTimer(payload);
    targetLabel.style.display = value === 'specific' ? 'inline-flex' : 'none';
  });

  const focusText = document.createElement('span');
  focusText.textContent = 'Focus';
  focusLabel.append(focusText, focusSelect);
  controls.appendChild(focusLabel);
  uiState.turtleFocusSelects.push(focusSelect);
  const targetText = document.createElement('span');
  targetText.textContent = 'Target plant';
  targetLabel.append(targetText, targetSelect);
  controls.appendChild(targetLabel);
  uiState.turtleFocusTargetContainers.push(targetLabel);
  uiState.turtleFocusTargetSelects.push(targetSelect);

  targetSelect.addEventListener('change', () => {
    const { tileId, slotIndex } = parseFocusTargetKey(targetSelect.value);
    const base = ensureTurtleTimerConfig();
    const nextConfig: TurtleTimerUIConfig = {
      ...base,
      focus: 'specific',
      focusTargetTileId: tileId,
      focusTargetSlotIndex: slotIndex,
    } satisfies TurtleTimerUIConfig;
    cfg.turtleTimer = nextConfig;
    saveCfg();
    configureTurtleTimer({
      focus: 'specific',
      focusTargetTileId: tileId,
      focusTargetSlotIndex: slotIndex,
    });
  });

  const eggFocusLabel = document.createElement('label');
  eggFocusLabel.style.cssText = 'display:inline-flex;align-items:center;gap:6px;font-size:11px;color:#bda7f5;';

  const eggFocusSelect = document.createElement('select');
  eggFocusSelect.className = 'qpm-select';
  eggFocusSelect.style.cssText = 'min-width:120px;padding:4px 8px;font-size:11px;';
  eggFocusSelect.addEventListener('click', (event) => event.stopPropagation());

  const eggLatestOption = document.createElement('option');
  eggLatestOption.value = 'latest';
  eggLatestOption.textContent = 'Latest hatch';
  const eggEarliestOption = document.createElement('option');
  eggEarliestOption.value = 'earliest';
  eggEarliestOption.textContent = 'Earliest hatch';
  const eggSpecificOption = document.createElement('option');
  eggSpecificOption.value = 'specific';
  eggSpecificOption.textContent = 'Specific egg';
  eggFocusSelect.append(eggLatestOption, eggEarliestOption, eggSpecificOption);
  eggFocusSelect.value = turtleCfg.eggFocus;

  const eggTargetLabel = document.createElement('label');
  eggTargetLabel.style.cssText = 'display:inline-flex;align-items:center;gap:6px;font-size:11px;color:#bda7f5;';
  eggTargetLabel.style.display = turtleCfg.eggFocus === 'specific' ? 'inline-flex' : 'none';

  const eggTargetSelect = document.createElement('select');
  eggTargetSelect.className = 'qpm-select';
  eggTargetSelect.style.cssText = 'min-width:180px;padding:4px 8px;font-size:11px;';
  eggTargetSelect.addEventListener('click', (event) => event.stopPropagation());

  eggFocusSelect.addEventListener('change', () => {
    const raw = eggFocusSelect.value;
    const value: TurtleTimerState['eggFocus'] = raw === 'earliest' ? 'earliest' : raw === 'specific' ? 'specific' : 'latest';
    const base = ensureTurtleTimerConfig();
    const nextConfig: TurtleTimerUIConfig = {
      ...base,
      eggFocus: value,
    } satisfies TurtleTimerUIConfig;
    cfg.turtleTimer = nextConfig;
    saveCfg();
    const payload: Parameters<typeof configureTurtleTimer>[0] = { eggFocus: value };
    if (value === 'specific') {
      payload.eggFocusTargetTileId = nextConfig.eggFocusTargetTileId;
      payload.eggFocusTargetSlotIndex = nextConfig.eggFocusTargetSlotIndex;
    }
    configureTurtleTimer(payload);
    eggTargetLabel.style.display = value === 'specific' ? 'inline-flex' : 'none';
  });

  const eggFocusText = document.createElement('span');
  eggFocusText.textContent = 'Egg focus';
  eggFocusLabel.append(eggFocusText, eggFocusSelect);
  controls.appendChild(eggFocusLabel);
  uiState.turtleEggFocusSelects.push(eggFocusSelect);

  const eggTargetText = document.createElement('span');
  eggTargetText.textContent = 'Target egg';
  eggTargetLabel.append(eggTargetText, eggTargetSelect);
  controls.appendChild(eggTargetLabel);
  uiState.turtleEggFocusTargetContainers.push(eggTargetLabel);
  uiState.turtleEggFocusTargetSelects.push(eggTargetSelect);

  eggTargetSelect.addEventListener('change', () => {
    const { tileId, slotIndex } = parseFocusTargetKey(eggTargetSelect.value);
    const base = ensureTurtleTimerConfig();
    const nextConfig: TurtleTimerUIConfig = {
      ...base,
      eggFocus: 'specific',
      eggFocusTargetTileId: tileId,
      eggFocusTargetSlotIndex: slotIndex,
    } satisfies TurtleTimerUIConfig;
    cfg.turtleTimer = nextConfig;
    saveCfg();
    configureTurtleTimer({
      eggFocus: 'specific',
      eggFocusTargetTileId: tileId,
      eggFocusTargetSlotIndex: slotIndex,
    });
  });

  body.appendChild(controls);

  const hint = document.createElement('div');
  hint.style.cssText = 'font-size:10px;color:#9acccc;line-height:1.4;';
  hint.textContent = "Change your target plant's with Focus to display the estimated time to mature. The Egg Hatching section displays info on egg maturing. The Food Turtles section displays food drain and restore info.";
  body.appendChild(hint);

  const createSectionCard = (title: string, accentColor: string, icon: string) => {
    const card = document.createElement('div');
    card.style.cssText = `padding:14px;border-radius:12px;border:2px solid ${accentColor};background:linear-gradient(135deg, rgba(10,20,20,0.6), rgba(10,20,20,0.3));display:flex;flex-direction:column;gap:10px;box-shadow: 0 4px 12px rgba(0,0,0,0.3);`;

    // Visual header with progress indicator
    const headerRow = document.createElement('div');
    headerRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:12px;';
    
    const headerLeft = document.createElement('div');
    headerLeft.style.cssText = 'display:flex;align-items:center;gap:10px;';
    
    const iconEl = document.createElement('span');
    iconEl.style.cssText = 'font-size:24px;';
    iconEl.textContent = icon;
    
    const header = document.createElement('div');
    header.style.cssText = 'font-weight:700;font-size:14px;color:#e0f7fa;letter-spacing:0.3px;';
    header.textContent = title;
    
    headerLeft.append(iconEl, header);
    
    const etaEl = document.createElement('div');
    etaEl.style.cssText = 'font-size:14px;font-weight:700;color:#4CAF50;background:rgba(76,175,80,0.15);padding:6px 12px;border-radius:8px;border:1px solid rgba(76,175,80,0.3);';
    headerRow.append(headerLeft, etaEl);
    card.appendChild(headerRow);

    // Stats grid (visual, icon-based)
    const statsGrid = document.createElement('div');
    statsGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;';
    
    const summaryEl = document.createElement('div');
    summaryEl.style.cssText = 'display:flex;flex-direction:column;gap:4px;padding:8px;background:rgba(255,255,255,0.05);border-radius:6px;';
    statsGrid.appendChild(summaryEl);
    
    const totalsEl = document.createElement('div');
    totalsEl.style.cssText = 'display:flex;flex-direction:column;gap:4px;padding:8px;background:rgba(255,255,255,0.05);border-radius:6px;';
    statsGrid.appendChild(totalsEl);
    
    card.appendChild(statsGrid);

    // Simple status line with visual indicators
    const simpleEl = document.createElement('div');
    simpleEl.style.cssText = 'font-size:12px;color:#b2dfdb;line-height:1.6;padding:8px;background:rgba(178,223,219,0.1);border-radius:6px;border-left:3px solid #4CAF50;display:flex;align-items:center;gap:8px;';
    card.appendChild(simpleEl);

    // Luck range (compact visual)
    const luckEl = document.createElement('div');
    luckEl.style.cssText = 'font-size:11px;color:#80CBC4;padding:6px 10px;background:rgba(128,203,196,0.08);border-radius:6px;display:flex;align-items:center;gap:6px;';
    card.appendChild(luckEl);

    // Pets table (cleaner header)
    const tableHeader = document.createElement('div');
    tableHeader.style.cssText = 'display:grid;grid-template-columns:1.4fr 0.7fr 0.6fr 0.8fr;gap:8px;font-size:11px;color:#4CAF50;text-transform:uppercase;letter-spacing:0.6px;font-weight:700;padding:6px 8px;background:rgba(76,175,80,0.1);border-radius:6px;';
    tableHeader.innerHTML = '<span>🐾 Pet</span><span>🍖 Hunger</span><span>⚡ Boost</span><span>✨ XP</span>';
    card.appendChild(tableHeader);

    const tableBody = document.createElement('div');
    tableBody.style.cssText = 'display:flex;flex-direction:column;gap:3px;min-height:18px;max-height:200px;overflow-y:auto;';
    card.appendChild(tableBody);

    return { card, etaEl, summaryEl, totalsEl, simpleEl, luckEl, tableBody } as const;
  };

  const plantCard = createSectionCard('Plant Growth', 'rgba(76,175,80,0.6)', '🌱');
  body.appendChild(plantCard.card);
  uiState.turtlePlantEta = plantCard.etaEl;
  uiState.turtlePlantSummary = plantCard.summaryEl;
  uiState.turtlePlantTotals = plantCard.totalsEl;
  uiState.turtlePlantSimple = plantCard.simpleEl;
  uiState.turtlePlantLuck = plantCard.luckEl;
  uiState.turtlePlantTable = plantCard.tableBody;

  const eggCard = createSectionCard('Egg Hatching', 'rgba(156,39,176,0.6)', '🥚');
  body.appendChild(eggCard.card);
  uiState.turtleEggEta = eggCard.etaEl;
  uiState.turtleEggSummary = eggCard.summaryEl;
  uiState.turtleEggTotals = eggCard.totalsEl;
  uiState.turtleEggSimple = eggCard.simpleEl;
  uiState.turtleEggLuck = eggCard.luckEl;
  uiState.turtleEggTable = eggCard.tableBody;

  const supportCard = document.createElement('div');
  supportCard.style.cssText = 'padding:14px;border-radius:12px;border:2px solid rgba(255,152,0,0.6);background:linear-gradient(135deg, rgba(30,24,12,0.6), rgba(30,24,12,0.3));display:flex;flex-direction:column;gap:10px;box-shadow: 0 4px 12px rgba(0,0,0,0.3);';

  const supportHeaderRow = document.createElement('div');
  supportHeaderRow.style.cssText = 'display:flex;align-items:center;gap:10px;';
  
  const supportIcon = document.createElement('span');
  supportIcon.style.cssText = 'font-size:24px;';
  supportIcon.textContent = '🍽️';
  
  const supportHeader = document.createElement('div');
  supportHeader.style.cssText = 'font-weight:700;font-size:14px;color:#FFB74D;letter-spacing:0.3px;';
  supportHeader.textContent = 'Food Turtles';
  
  supportHeaderRow.append(supportIcon, supportHeader);
  supportCard.appendChild(supportHeaderRow);

  const supportStatsGrid = document.createElement('div');
  supportStatsGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;';
  
  const supportSummary = document.createElement('div');
  supportSummary.style.cssText = 'padding:8px;background:rgba(255,255,255,0.05);border-radius:6px;font-size:11px;color:#FFE082;';
  supportStatsGrid.appendChild(supportSummary);
  
  const supportTotals = document.createElement('div');
  supportTotals.style.cssText = 'padding:8px;background:rgba(255,255,255,0.05);border-radius:6px;font-size:11px;color:#FFE082;';
  supportStatsGrid.appendChild(supportTotals);
  
  supportCard.appendChild(supportStatsGrid);

  const supportSimple = document.createElement('div');
  supportSimple.style.cssText = 'font-size:12px;color:#FFECB3;line-height:1.6;padding:8px;background:rgba(255,236,179,0.1);border-radius:6px;border-left:3px solid #FFB74D;';
  supportCard.appendChild(supportSimple);

  const supportList = document.createElement('div');
  supportList.style.cssText = 'display:flex;flex-direction:column;gap:4px;max-height:180px;overflow-y:auto;';
  supportCard.appendChild(supportList);

  body.appendChild(supportCard);
  uiState.turtleSupportSummary = supportSummary;
  uiState.turtleSupportTotals = supportTotals;
  uiState.turtleSupportSimple = supportSimple;
  uiState.turtleSupportList = supportList;

  // ETA Helper Tool
  const etaHelperCard = document.createElement('div');
  etaHelperCard.style.cssText = 'padding:12px;border-radius:10px;border:1px solid rgba(100,181,246,0.45);background:linear-gradient(135deg, rgba(100,181,246,0.08), rgba(100,181,246,0.03));display:flex;flex-direction:column;gap:10px;';

  const etaHelperHeader = document.createElement('div');
  etaHelperHeader.style.cssText = 'font-weight:700;font-size:13px;color:#64b5f6;letter-spacing:0.3px;';
  etaHelperHeader.textContent = '⏰ Specified ETA Helper';
  etaHelperCard.appendChild(etaHelperHeader);

  const etaHelperHint = document.createElement('div');
  etaHelperHint.style.cssText = 'font-size:10px;color:#90caf9;line-height:1.5;';
  etaHelperHint.textContent = 'Calculate how many watering cans you need to finish a plant by a specific time.';
  etaHelperCard.appendChild(etaHelperHint);

  const turtleWarning = document.createElement('div');
  turtleWarning.style.cssText = 'font-size:10px;color:#ffb74d;line-height:1.5;padding:6px;background:rgba(255,152,0,0.1);border-radius:4px;border-left:3px solid #ffb74d;margin-top:6px;';
  turtleWarning.textContent = '⚠️ Switch to your Plant Growth Turtles before you calculate!';
  turtleWarning.title = 'Calculation uses your CURRENT turtle setup. Make sure you have Plant Growth boost turtles active if you want accurate watering can counts.';
  etaHelperCard.appendChild(turtleWarning);

  const etaHelperInputs = document.createElement('div');
  etaHelperInputs.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;';
  etaHelperCard.appendChild(etaHelperInputs);

  const dateInputWrapper = document.createElement('div');
  dateInputWrapper.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
  const dateLabel = document.createElement('label');
  dateLabel.style.cssText = 'font-size:10px;color:#b3e5fc;font-weight:600;';
  dateLabel.textContent = 'Target Date (DD/MM)';
  const dateInput = document.createElement('input');
  dateInput.type = 'text';
  dateInput.className = 'qpm-input';
  dateInput.placeholder = 'DD/MM';
  dateInput.style.cssText = 'padding:6px 10px;font-size:11px;min-width:80px;max-width:80px;';
  dateInput.addEventListener('keydown', e => e.stopPropagation());
  // Auto-format as user types
  dateInput.addEventListener('input', (e) => {
    let value = dateInput.value.replace(/\D/g, ''); // Remove non-digits
    if (value.length >= 2) {
      value = value.slice(0, 2) + '/' + value.slice(2, 4);
    }
    dateInput.value = value;
  });
  dateInputWrapper.append(dateLabel, dateInput);
  etaHelperInputs.appendChild(dateInputWrapper);

  const timeInputWrapper = document.createElement('div');
  timeInputWrapper.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
  const timeLabel = document.createElement('label');
  timeLabel.style.cssText = 'font-size:10px;color:#b3e5fc;font-weight:600;';
  timeLabel.textContent = 'Target Time';
  const timeInput = document.createElement('input');
  timeInput.type = 'time';
  timeInput.className = 'qpm-input';
  timeInput.style.cssText = 'padding:6px 10px;font-size:11px;min-width:120px;';
  timeInput.addEventListener('keydown', e => e.stopPropagation());
  timeInputWrapper.append(timeLabel, timeInput);
  etaHelperInputs.appendChild(timeInputWrapper);

  const plantSelectWrapper = document.createElement('div');
  plantSelectWrapper.style.cssText = 'display:flex;flex-direction:column;gap:4px;flex:1;min-width:180px;';
  const plantLabel = document.createElement('label');
  plantLabel.style.cssText = 'font-size:10px;color:#b3e5fc;font-weight:600;';
  plantLabel.textContent = 'Select Plant';
  const plantSelect = document.createElement('select');
  plantSelect.className = 'qpm-select';
  plantSelect.style.cssText = 'padding:6px 10px;font-size:11px;';
  plantSelect.addEventListener('click', e => e.stopPropagation());
  const placeholderOption = document.createElement('option');
  placeholderOption.value = '';
  placeholderOption.textContent = 'Choose a growing plant...';
  placeholderOption.disabled = true;
  placeholderOption.selected = true;
  plantSelect.appendChild(placeholderOption);
  plantSelectWrapper.append(plantLabel, plantSelect);
  etaHelperInputs.appendChild(plantSelectWrapper);

  const calculateButton = document.createElement('button');
  calculateButton.type = 'button';
  calculateButton.className = 'qpm-button qpm-button--accent';
  calculateButton.textContent = 'Calculate';
  calculateButton.style.cssText = 'padding:6px 16px;font-size:11px;font-weight:600;align-self:flex-end;';
  etaHelperInputs.appendChild(calculateButton);

  const etaHelperResults = document.createElement('div');
  etaHelperResults.style.cssText = 'display:none;flex-direction:column;gap:6px;padding:10px;background:rgba(10,20,30,0.5);border-radius:8px;border:1px solid rgba(100,181,246,0.2);';
  etaHelperCard.appendChild(etaHelperResults);

  const updatePlantOptions = () => {
    const state = getTurtleTimerState();
    const now = Date.now();

    // Save current selection
    const currentValue = plantSelect.value;

    // Clear existing options except placeholder
    while (plantSelect.options.length > 1) {
      plantSelect.remove(1);
    }

    // Add plant options from plant targets
    let addedCount = 0;
    for (const target of state.plantTargets) {
      if (target.endTime && target.endTime > now) {
        const option = document.createElement('option');
        option.value = target.key;
        option.textContent = `${target.species || 'Unknown'} - ${formatDurationPretty(target.remainingMs || 0)}`;
        option.dataset.endTime = String(target.endTime);
        option.dataset.species = target.species || 'Unknown';
        plantSelect.appendChild(option);
        addedCount++;
      }
    }

    // Show message if no plants available
    if (addedCount === 0) {
      const noPlants = document.createElement('option');
      noPlants.value = '';
      noPlants.textContent = 'No growing plants found';
      noPlants.disabled = true;
      plantSelect.appendChild(noPlants);
    }

    // Restore selection if the plant still exists
    if (currentValue) {
      const matchingOption = Array.from(plantSelect.options).find(opt => opt.value === currentValue);
      if (matchingOption) {
        plantSelect.value = currentValue;
      }
    }
  };

  calculateButton.addEventListener('click', () => {
    const selectedOption = plantSelect.selectedOptions[0];
    if (!selectedOption || !timeInput.value || !dateInput.value) {
      etaHelperResults.style.display = 'none';
      return;
    }

    const endTime = Number(selectedOption.dataset.endTime);
    const species = selectedOption.dataset.species || 'Unknown';
    const now = Date.now();

    // Parse target date (DD/MM format)
    const dateParts = dateInput.value.split('/').map(Number);
    const day = dateParts[0];
    const month = dateParts[1];

    if (!day || !month || day < 1 || day > 31 || month < 1 || month > 12) {
      etaHelperResults.innerHTML = '<div style="color:#ef5350;font-size:11px;">Invalid date! Use DD/MM format (e.g., 15/11)</div>';
      etaHelperResults.style.display = 'flex';
      return;
    }

    // Parse target time
    const timeParts = timeInput.value.split(':').map(Number);
    const hours = timeParts[0] ?? 0;
    const minutes = timeParts[1] ?? 0;

    // Calculate natural completion in days
    const naturalMsRemaining = endTime - now;

    // Build target date from user input
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();

    // Try current year first, then next year if needed
    let targetDate = new Date(currentYear, month - 1, day, hours, minutes, 0, 0);

    // If the date is in the past, try next year
    if (targetDate.getTime() < now) {
      targetDate = new Date(currentYear + 1, month - 1, day, hours, minutes, 0, 0);
    }

    const targetMs = targetDate.getTime();
    const daysAhead = Math.floor((targetMs - now) / (24 * 60 * 60 * 1000));

    const targetMsRemaining = targetMs - now;

    if (targetMsRemaining <= 0) {
      etaHelperResults.innerHTML = '<div style="color:#ef5350;font-size:11px;">Target time is in the past!</div>';
      etaHelperResults.style.display = 'flex';
      return;
    }

    // Get current turtle state
    const state = getTurtleTimerState();
    const turtleRate = state.plant.effectiveRate || 0;
    const adjustedMsRemaining = state.plant.adjustedMsRemaining;

    // Use CURRENT turtle state: if turtles active, use boosted time; otherwise use natural time
    const currentTimeRemaining = (turtleRate > 0 && adjustedMsRemaining) ? adjustedMsRemaining : naturalMsRemaining;
    const hasTurtles = turtleRate > 0 && !!adjustedMsRemaining && adjustedMsRemaining > 0;

    // Calculate watering cans needed (each watering can reduces time by 5 minutes = 300000ms)
    const wateringCanReduction = 5 * 60 * 1000; // 5 minutes per watering can
    const msToSave = Math.max(0, currentTimeRemaining - targetMsRemaining);
    const wateringCansNeeded = Math.ceil(msToSave / wateringCanReduction);

    etaHelperResults.innerHTML = '';

    const resultTitle = document.createElement('div');
    resultTitle.style.cssText = 'font-weight:700;font-size:11px;color:#64b5f6;margin-bottom:4px;';
    resultTitle.textContent = `Results for ${species}`;
    etaHelperResults.appendChild(resultTitle);

    // Show current state info
    const currentStateRow = document.createElement('div');
    currentStateRow.style.cssText = 'font-size:10px;color:#e0e0e0;line-height:1.6;padding:6px;background:rgba(255,255,255,0.05);border-radius:4px;margin-bottom:4px;';
    if (hasTurtles) {
      currentStateRow.innerHTML = `<strong style="color:#81c784;">🐢 Current State (With Turtles):</strong> ${formatDurationPretty(currentTimeRemaining)} • ${formatCompletionTime(currentTimeRemaining)}`;
    } else {
      currentStateRow.innerHTML = `<strong style="color:#90caf9;">Current State (No Turtles):</strong> ${formatDurationPretty(currentTimeRemaining)} • ${formatCompletionTime(currentTimeRemaining)}`;
    }
    etaHelperResults.appendChild(currentStateRow);

    const targetRow = document.createElement('div');
    targetRow.style.cssText = 'font-size:10px;color:#e0e0e0;line-height:1.6;';
    const dateLabel = daysAhead === 0 ? 'today' : daysAhead === 1 ? 'tomorrow' : `in ${daysAhead} days`;
    const targetDateStr = `${dateInput.value} ${timeInput.value}`;
    targetRow.innerHTML = `<strong style="color:#ffb74d;">Target:</strong> ${targetDateStr} (${dateLabel}) • ${formatDurationPretty(targetMsRemaining)} from now`;
    etaHelperResults.appendChild(targetRow);

    const wateringRow = document.createElement('div');
    wateringRow.style.cssText = 'font-size:11px;color:#fff;font-weight:700;padding:8px;background:rgba(100,181,246,0.15);border-radius:6px;margin-top:4px;';

    if (wateringCansNeeded === 0) {
      wateringRow.innerHTML = `✅ <span style="color:#81c784;">No watering cans needed!</span><br><span style="font-size:10px;font-weight:400;color:#b0b0b0;">Plant will finish ${formatDurationPretty(Math.abs(msToSave))} before target time.</span>`;
    } else {
      const stateNote = hasTurtles ? '(based on current turtle boost)' : '(no turtle boost applied)';
      wateringRow.innerHTML = `💧 <span style="color:#64b5f6;">Watering Cans Needed: ${wateringCansNeeded}</span><br><span style="font-size:10px;font-weight:400;color:#b0b0b0;">Each can saves 5 minutes ${stateNote}</span>`;
    }
    etaHelperResults.appendChild(wateringRow);

    etaHelperResults.style.display = 'flex';
  });

  // Update plant options when turtle timer state changes
  const turtleUnsubscribe = onTurtleTimerState(() => {
    updatePlantOptions();
  });

  // Initial update
  updatePlantOptions();

  body.appendChild(etaHelperCard);

  updateTurtleTimerViews(getTurtleTimerState());

  return root;
}

function createTrackersSection(): HTMLElement[] {
  if (uiState.mutationTrackerUnsubscribe) {
    uiState.mutationTrackerUnsubscribe();
    uiState.mutationTrackerUnsubscribe = null;
  }
  if (uiState.mutationTrackerTicker != null) {
    window.clearInterval(uiState.mutationTrackerTicker);
    uiState.mutationTrackerTicker = null;
  }

  if (uiState.trackerAbilityHistoryUnsubscribe) {
    uiState.trackerAbilityHistoryUnsubscribe();
    uiState.trackerAbilityHistoryUnsubscribe = null;
  }
  if (uiState.trackerAbilityTicker != null) {
    window.clearInterval(uiState.trackerAbilityTicker);
    uiState.trackerAbilityTicker = null;
  }

  // ============================================================================
  // OLD TRACKER SECTIONS - COMMENTED OUT
  // These have been replaced by the new Tracker Window (renderTrackersWindow)
  // The old inline trackers (Mutation Tracker, Ability Timer, XP Tracker) are
  // no longer needed and have been removed to clean up the UI.
  // ============================================================================
  /*
  const mutationCard = createCard('🌦️ Mutation Tracker', { subtitle: 'Weather windows & pending fruit', collapsible: true });
  mutationCard.root.dataset.qpmSection = 'trackers-mutation';

  const mutationSummaryEl = document.createElement('div');
  mutationSummaryEl.className = 'qpm-tracker-summary';
  mutationSummaryEl.textContent = 'Waiting for mutation data...';
  mutationCard.body.appendChild(mutationSummaryEl);

  const mutationCountdownEl = document.createElement('div');
  mutationCountdownEl.className = 'qpm-mutation-countdown';
  mutationCountdownEl.textContent = 'Weather window inactive.';
  mutationCountdownEl.dataset.state = 'inactive';
  mutationCard.body.appendChild(mutationCountdownEl);

  const mutationMetaRow = document.createElement('div');
  mutationMetaRow.className = 'qpm-mutation-meta';
  mutationCard.body.appendChild(mutationMetaRow);

  const mutationSourceGroup = document.createElement('div');
  mutationSourceGroup.className = 'qpm-mutation-meta__group';
  mutationMetaRow.appendChild(mutationSourceGroup);

  const mutationSourceLabel = document.createElement('span');
  mutationSourceLabel.className = 'qpm-section-muted';
  mutationSourceLabel.textContent = 'Source';
  mutationSourceGroup.appendChild(mutationSourceLabel);

  const mutationSourceSelect = document.createElement('select');
  mutationSourceSelect.className = 'qpm-select';
  mutationSourceSelect.style.minWidth = '150px';
  mutationSourceSelect.addEventListener('click', (event) => event.stopPropagation());
  mutationSourceGroup.appendChild(mutationSourceSelect);

  const mutationSourceAutoOption = document.createElement('option');
  mutationSourceAutoOption.value = 'auto';
  mutationSourceAutoOption.textContent = 'Auto (best)';
  mutationSourceSelect.appendChild(mutationSourceAutoOption);

  const mutationSourceGardenOption = document.createElement('option');
  mutationSourceGardenOption.value = 'garden';
  mutationSourceGardenOption.textContent = 'Garden snapshot';
  mutationSourceSelect.appendChild(mutationSourceGardenOption);

  const mutationSourceInventoryOption = document.createElement('option');
  mutationSourceInventoryOption.value = 'inventory';
  mutationSourceInventoryOption.textContent = 'Inventory summary';
  mutationSourceSelect.appendChild(mutationSourceInventoryOption);

  const mutationSourceBadge = document.createElement('span');
  mutationSourceBadge.className = 'qpm-mutation-source';
  mutationSourceBadge.textContent = 'Auto (waiting)';
  mutationSourceGroup.appendChild(mutationSourceBadge);

  const mutationActionsGroup = document.createElement('div');
  mutationActionsGroup.className = 'qpm-mutation-meta__group';
  mutationMetaRow.appendChild(mutationActionsGroup);

  const mutationDetailToggle = document.createElement('button');
  mutationDetailToggle.className = 'qpm-button';
  mutationDetailToggle.textContent = 'Detailed view';
  mutationDetailToggle.title = 'Show per-weather breakdown';
  mutationActionsGroup.appendChild(mutationDetailToggle);

  const mutationTotalsEl = document.createElement('div');
  mutationTotalsEl.className = 'qpm-mutation-totals';
  mutationTotalsEl.style.display = 'none';
  mutationCard.body.appendChild(mutationTotalsEl);

  const mutationRatiosEl = document.createElement('div');
  mutationRatiosEl.className = 'qpm-mutation-ratios';
  mutationRatiosEl.style.display = 'none';
  mutationRatiosEl.style.marginTop = '6px';
  mutationCard.body.appendChild(mutationRatiosEl);

  const mutationEmptyEl = document.createElement('div');
  mutationEmptyEl.className = 'qpm-tracker-note';
  mutationEmptyEl.style.display = 'none';
  mutationEmptyEl.textContent = 'Waiting for mutation data...';
  mutationCard.body.appendChild(mutationEmptyEl);

  const mutationDetailEl = document.createElement('div');
  mutationDetailEl.className = 'qpm-mutation-detail';
  mutationCard.body.appendChild(mutationDetailEl);

  const mutationTable = document.createElement('table');
  mutationTable.className = 'qpm-table qpm-table--compact';
  const mutationHeadRow = mutationTable.createTHead().insertRow();
  for (const label of ['Weather', 'Plants', 'Pending fruit', 'Needs snow', 'Share']) {
    const headerCell = document.createElement('th');
    headerCell.textContent = label;
    mutationHeadRow.appendChild(headerCell);
  }
  const mutationTableBody = mutationTable.createTBody();
  mutationDetailEl.appendChild(mutationTable);

  uiState.mutationTrackerCard = mutationCard.root;
  uiState.mutationTrackerSummary = mutationSummaryEl;
  uiState.mutationTrackerTotals = mutationTotalsEl;
  uiState.mutationTrackerRatios = mutationRatiosEl;
  uiState.mutationTrackerCountdown = mutationCountdownEl;
  uiState.mutationTrackerDetail = mutationDetailEl;
  uiState.mutationTrackerTable = mutationTableBody;
  uiState.mutationTrackerSourceSelect = mutationSourceSelect;
  uiState.mutationTrackerDetailToggle = mutationDetailToggle;
  uiState.mutationTrackerSourceBadge = mutationSourceBadge;
  uiState.mutationTrackerEmpty = mutationEmptyEl;

  const abilityCard = createCard('⏱️ Ability Timer', { subtitle: 'Projected proc cadence', collapsible: true });
  abilityCard.root.dataset.qpmSection = 'trackers-ability';

  const abilitySummary = document.createElement('div');
  abilitySummary.className = 'qpm-tracker-summary';
  abilitySummary.textContent = 'Waiting for pet ability data...';
  abilityCard.body.appendChild(abilitySummary);

  const abilityFilterRow = document.createElement('div');
  abilityFilterRow.className = 'qpm-row';
  abilityFilterRow.style.alignItems = 'center';
  abilityFilterRow.style.gap = '8px';
  abilityFilterRow.style.marginBottom = '6px';

  const abilityFilterLabel = document.createElement('span');
  abilityFilterLabel.className = 'qpm-section-muted';
  abilityFilterLabel.textContent = 'Target Ability';
  abilityFilterRow.appendChild(abilityFilterLabel);

  const abilityFilterSelect = document.createElement('select');
  abilityFilterSelect.className = 'qpm-select';
  abilityFilterSelect.style.minWidth = '160px';
  abilityFilterSelect.addEventListener('click', (event) => event.stopPropagation());
  abilityFilterRow.appendChild(abilityFilterSelect);

  const abilityFilterDefaultOption = document.createElement('option');
  abilityFilterDefaultOption.value = 'all';
  abilityFilterDefaultOption.textContent = 'All abilities';
  abilityFilterSelect.appendChild(abilityFilterDefaultOption);

  const abilityFilterHint = document.createElement('span');
  abilityFilterHint.className = 'qpm-section-muted';
  abilityFilterHint.style.fontSize = '10px';
  abilityFilterHint.textContent = 'Filters the ability table';
  abilityFilterRow.appendChild(abilityFilterHint);

  abilityCard.body.appendChild(abilityFilterRow);

  const abilityTable = document.createElement('table');
  abilityTable.className = 'qpm-table qpm-table--compact';
  const abilityHeadRow = abilityTable.createTHead().insertRow();
  for (const label of ['Ability', 'Pet', 'Procs/hr', 'ETA', 'Effect/proc', 'Effect/hr']) {
    const headerCell = document.createElement('th');
    headerCell.textContent = label;
    abilityHeadRow.appendChild(headerCell);
  }
  const abilityTableBody = abilityTable.createTBody();
  abilityCard.body.appendChild(abilityTable);

  const abilityUnknown = document.createElement('div');
  abilityUnknown.className = 'qpm-tracker-note';
  abilityUnknown.style.display = 'none';
  abilityCard.body.appendChild(abilityUnknown);

  const xpCard = createCard('📈 XP Tracker', { subtitle: 'Ability-driven experience', collapsible: true });
  xpCard.root.dataset.qpmSection = 'trackers-xp';

  const xpSummary = document.createElement('div');
  xpSummary.className = 'qpm-tracker-summary';
  xpSummary.textContent = 'Waiting for XP abilities...';
  xpCard.body.appendChild(xpSummary);

  const xpTargetModeRow = document.createElement('div');
  xpTargetModeRow.className = 'qpm-row';
  xpTargetModeRow.style.alignItems = 'center';
  xpTargetModeRow.style.gap = '8px';

  const xpTargetModeLabel = document.createElement('span');
  xpTargetModeLabel.className = 'qpm-section-muted';
  xpTargetModeLabel.textContent = 'Target XP';
  xpTargetModeRow.appendChild(xpTargetModeLabel);

  const xpTargetModeSelect = document.createElement('select');
  xpTargetModeSelect.className = 'qpm-select';
  xpTargetModeSelect.style.minWidth = '120px';
  xpTargetModeSelect.addEventListener('click', (event) => event.stopPropagation());

  const xpModeNextOption = document.createElement('option');
  xpModeNextOption.value = 'next';
  xpModeNextOption.textContent = 'Next Level';
  xpTargetModeSelect.appendChild(xpModeNextOption);

  const xpModeMaxOption = document.createElement('option');
  xpModeMaxOption.value = 'max';
  xpModeMaxOption.textContent = 'Max Level';
  xpTargetModeSelect.appendChild(xpModeMaxOption);

  xpTargetModeRow.appendChild(xpTargetModeSelect);

  const xpTargetModeHint = document.createElement('span');
  xpTargetModeHint.className = 'qpm-section-muted';
  xpTargetModeHint.style.fontSize = '10px';
  xpTargetModeHint.textContent = 'Controls per-pet ETA';
  xpTargetModeRow.appendChild(xpTargetModeHint);

  xpCard.body.appendChild(xpTargetModeRow);

  const xpTargetPetRow = document.createElement('div');
  xpTargetPetRow.className = 'qpm-row';
  xpTargetPetRow.style.alignItems = 'center';
  xpTargetPetRow.style.gap = '8px';

  const xpTargetPetLabel = document.createElement('span');
  xpTargetPetLabel.className = 'qpm-section-muted';
  xpTargetPetLabel.textContent = 'Target Pets';
  xpTargetPetRow.appendChild(xpTargetPetLabel);

  const xpTargetPetSelect = document.createElement('select');
  xpTargetPetSelect.className = 'qpm-select';
  xpTargetPetSelect.style.minWidth = '160px';
  xpTargetPetSelect.addEventListener('click', (event) => event.stopPropagation());
  xpTargetPetRow.appendChild(xpTargetPetSelect);

  const xpTargetPetHint = document.createElement('span');
  xpTargetPetHint.className = 'qpm-section-muted';
  xpTargetPetHint.style.fontSize = '10px';
  xpTargetPetHint.textContent = 'Filters the per-pet table';
  xpTargetPetRow.appendChild(xpTargetPetHint);

  xpCard.body.appendChild(xpTargetPetRow);

  const xpAbilityTable = document.createElement('table');
  xpAbilityTable.className = 'qpm-table qpm-table--compact';
  const xpAbilityHeadRow = xpAbilityTable.createTHead().insertRow();
  for (const label of ['Ability', 'Pet', 'Procs/hr', 'XP/proc', 'XP/hr']) {
    const headerCell = document.createElement('th');
    headerCell.textContent = label;
    xpAbilityHeadRow.appendChild(headerCell);
  }
  const xpAbilityBody = xpAbilityTable.createTBody();
  xpCard.body.appendChild(xpAbilityTable);

  const xpPerPetTable = document.createElement('table');
  xpPerPetTable.className = 'qpm-table qpm-table--compact';
  const xpPerPetHeadRow = xpPerPetTable.createTHead().insertRow();
  for (const label of ['Pet', 'Species', 'Current XP', 'Target XP', 'XP needed', 'XP/hr', 'ETA']) {
    const headerCell = document.createElement('th');
    headerCell.textContent = label;
    xpPerPetHeadRow.appendChild(headerCell);
  }
  const xpPerPetBody = xpPerPetTable.createTBody();
  xpCard.body.appendChild(xpPerPetTable);

  uiState.trackerAbilitySummary = abilitySummary;
  uiState.trackerAbilityFilterSelect = abilityFilterSelect;
  uiState.trackerAbilityTable = abilityTableBody;
  uiState.trackerAbilityUnknown = abilityUnknown;
  uiState.trackerXpSummary = xpSummary;
  uiState.trackerXpAbilityTable = xpAbilityBody;
  uiState.trackerXpPerPetTable = xpPerPetBody;
  uiState.trackerXpTargetModeSelect = xpTargetModeSelect;
  uiState.trackerXpTargetPetSelect = xpTargetPetSelect;

  const renderPlaceholder = (tbody: HTMLTableSectionElement, colSpan: number, message: string) => {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = colSpan;
    cell.textContent = message;
    cell.style.textAlign = 'center';
    cell.style.color = 'var(--qpm-text-muted)';
    row.appendChild(cell);
    tbody.appendChild(row);
  };

  type MutationTrackerSourcePreference = 'auto' | MutationSummarySource;
  type MutationTrackerDetailMode = 'summary' | 'detail';

  const mutationSummaries: Partial<Record<MutationSummarySource, MutationSummary>> = {
    ...getAllMutationSummaries(),
  };

  const storedMutationSource = storage.get<string>(MUTATION_TRACKER_SOURCE_KEY, 'auto') ?? 'auto';
  let mutationSourcePreference: MutationTrackerSourcePreference = storedMutationSource === 'garden' || storedMutationSource === 'inventory'
    ? storedMutationSource
    : 'auto';
  mutationSourceSelect.value = mutationSourcePreference;

  const storedMutationDetail = storage.get<string>(MUTATION_TRACKER_DETAIL_KEY, 'summary') ?? 'summary';
  let mutationDetailMode: MutationTrackerDetailMode = storedMutationDetail === 'detail' ? 'detail' : 'summary';

  interface ResolvedMutationState {
    summary: MutationSummary | null;
    resolvedSource: MutationSummarySource | null;
    fallback: boolean;
  }

  let latestResolvedMutationState: ResolvedMutationState = {
    summary: null,
    resolvedSource: null,
    fallback: false,
  };

  const describeMutationSource = (source: MutationSummarySource): string => (source === 'garden' ? 'Garden snapshot' : 'Inventory summary');

  const updateMutationDetailMode = (): void => {
    const showDetail = mutationDetailMode === 'detail';
    mutationDetailToggle.textContent = showDetail ? 'Summary view' : 'Detailed view';
    mutationDetailToggle.title = showDetail ? 'Show compact summary view' : 'Show per-weather breakdown';
    mutationDetailToggle.classList.toggle('qpm-button--accent', showDetail);
    mutationDetailEl.style.display = showDetail ? '' : 'none';
  };

  const updateMutationSourceOptions = (): void => {
    const hasGarden = Boolean(mutationSummaries.garden);
    const hasInventory = Boolean(mutationSummaries.inventory);
    mutationSourceGardenOption.textContent = hasGarden ? 'Garden snapshot' : 'Garden snapshot (waiting)';
    mutationSourceInventoryOption.textContent = hasInventory ? 'Inventory summary' : 'Inventory summary (waiting)';
  };

  const resolveActiveMutationSummary = (): ResolvedMutationState => {
    const gardenSummary = mutationSummaries.garden ?? null;
    const inventorySummary = mutationSummaries.inventory ?? null;

    if (mutationSourcePreference === 'garden') {
      if (gardenSummary) {
        return { summary: gardenSummary, resolvedSource: 'garden', fallback: false };
      }
      if (inventorySummary) {
        return { summary: inventorySummary, resolvedSource: 'inventory', fallback: true };
      }
      return { summary: null, resolvedSource: null, fallback: false };
    }

    if (mutationSourcePreference === 'inventory') {
      if (inventorySummary) {
        return { summary: inventorySummary, resolvedSource: 'inventory', fallback: false };
      }
      if (gardenSummary) {
        return { summary: gardenSummary, resolvedSource: 'garden', fallback: true };
      }
      return { summary: null, resolvedSource: null, fallback: false };
    }

    if (gardenSummary && inventorySummary) {
      return gardenSummary.timestamp >= inventorySummary.timestamp
        ? { summary: gardenSummary, resolvedSource: 'garden', fallback: false }
        : { summary: inventorySummary, resolvedSource: 'inventory', fallback: false };
    }
    if (gardenSummary) {
      return { summary: gardenSummary, resolvedSource: 'garden', fallback: false };
    }
    if (inventorySummary) {
      return { summary: inventorySummary, resolvedSource: 'inventory', fallback: false };
    }
    return { summary: null, resolvedSource: null, fallback: false };
  };

  const updateMutationSourceBadge = (state: ResolvedMutationState): void => {
    const availableSources: MutationSummarySource[] = [];
    if (mutationSummaries.garden) availableSources.push('garden');
    if (mutationSummaries.inventory) availableSources.push('inventory');

    if (state.resolvedSource) {
      const label = describeMutationSource(state.resolvedSource);
      if (mutationSourcePreference === 'auto') {
        mutationSourceBadge.textContent = `Auto → ${label}`;
      } else if (state.fallback) {
        mutationSourceBadge.textContent = `${label} (fallback)`;
      } else {
        mutationSourceBadge.textContent = label;
      }

      const availability = availableSources
        .map((source) => describeMutationSource(source))
        .join(', ');
      const updatedAgo = state.summary ? formatSince(state.summary.timestamp) : '';
      const availabilityText = availability ? `Available: ${availability}.` : '';
      const updatedText = updatedAgo ? ` Updated ${updatedAgo}.` : '';
      const badgeTitle = `${availabilityText}${updatedText}`.trim();
      mutationSourceBadge.title = badgeTitle.length > 0 ? badgeTitle : 'Using latest mutation summary.';
      return;
    }

    const preferredLabel = mutationSourcePreference === 'auto'
      ? 'Auto'
      : describeMutationSource(mutationSourcePreference);
    mutationSourceBadge.textContent = `${preferredLabel} (waiting)`;
    if (availableSources.length > 0) {
      const fallbackLabel = availableSources
        .map((source) => describeMutationSource(source))
        .join(', ');
      mutationSourceBadge.title = `Available data: ${fallbackLabel}. Waiting for preferred source.`;
    } else {
      mutationSourceBadge.title = 'No mutation summaries received yet.';
    }
  };

  const updateMutationCountdown = (): void => {
    const countdownEl = mutationCountdownEl;
    const { summary } = latestResolvedMutationState;
    const windowInfo = summary?.weatherWindow ?? null;

    if (!summary || !windowInfo) {
      countdownEl.textContent = 'Weather window inactive.';
      countdownEl.dataset.state = 'inactive';
      countdownEl.title = mutationSourcePreference === 'auto'
        ? 'Waiting for weather data.'
        : `Waiting for ${mutationSourcePreference === 'garden' ? 'garden' : 'inventory'} weather data.`;
      return;
    }

    const weatherLabel = formatWeatherLabel(windowInfo.weather);
    const remainingMs = windowInfo.remainingMs;
    const durationMs = windowInfo.durationMs;

    if (remainingMs != null && remainingMs > 0) {
      const remainingText = formatRestockCountdown(remainingMs);
      const durationText = durationMs != null ? formatRestockCountdown(durationMs) : null;
      countdownEl.textContent = durationText
        ? `${weatherLabel} window • ${remainingText} remaining (${durationText} total)`
        : `${weatherLabel} window • ${remainingText} remaining`;
      countdownEl.dataset.state = 'active';
      const startedText = windowInfo.startedAt != null ? `Started ${formatSince(windowInfo.startedAt)}` : '';
      const endText = windowInfo.expectedEndAt != null ? `Ends ${formatSince(windowInfo.expectedEndAt)}` : '';
      const countdownTitle = [startedText, endText].filter(Boolean).join(' • ');
      countdownEl.title = countdownTitle.length > 0 ? countdownTitle : `${weatherLabel} weather active.`;
      return;
    }

    countdownEl.textContent = `${weatherLabel} window expired`;
    countdownEl.dataset.state = 'expired';
    countdownEl.title = windowInfo.expectedEndAt != null ? `Expired ${formatSince(windowInfo.expectedEndAt)}` : `${weatherLabel} window expired.`;
  };

  const renderMutationSection = (): void => {
    updateMutationSourceOptions();
    const state = resolveActiveMutationSummary();
    latestResolvedMutationState = state;
    mutationSourceSelect.value = mutationSourcePreference;
    updateMutationSourceBadge(state);

    const summary = state.summary;
    const hasAnySummary = Boolean(mutationSummaries.garden ?? mutationSummaries.inventory);

    if (!summary) {
      mutationSummaryEl.textContent = hasAnySummary ? 'Waiting for preferred mutation data...' : 'Waiting for mutation data...';
      mutationSummaryEl.title = '';
      mutationTotalsEl.innerHTML = '';
      mutationTotalsEl.style.display = 'none';
      mutationRatiosEl.innerHTML = '';
      mutationRatiosEl.style.display = 'none';
      mutationTableBody.innerHTML = '';
      mutationEmptyEl.style.display = 'block';
      mutationEmptyEl.textContent = hasAnySummary ? 'Waiting for preferred mutation data...' : 'No mutation summaries yet.';
      updateMutationCountdown();
      return;
    }

    const totalPending = Math.max(0, summary.overallPendingFruitCount);
    const totalPlants = Math.max(0, summary.overallEligiblePlantCount);
    const totalsArray = Object.entries(summary.totals)
      .map(([weather, totals]) => ({ weather, totals }))
      .filter(({ totals }) => totals.plantCount > 0 || totals.pendingFruitCount > 0 || (totals.needsSnowFruitCount ?? 0) > 0)
      .sort((a, b) => b.totals.pendingFruitCount - a.totals.pendingFruitCount);

    const needsSnowTotal = totalsArray.reduce((sum, entry) => sum + (entry.totals.needsSnowFruitCount ?? 0), 0);

    const summaryParts: string[] = [];
    if (totalPending > 0) {
      summaryParts.push(`${totalPending.toLocaleString()} fruit waiting`);
    }
    if (totalPlants > 0) {
      summaryParts.push(`${totalPlants.toLocaleString()} plants ready`);
    }
    if (needsSnowTotal > 0) {
      summaryParts.push(`${needsSnowTotal.toLocaleString()} need snow`);
    }
    if (summary.activeWeather && summary.activeWeather !== 'sunny' && summary.activeWeather !== 'unknown') {
      summaryParts.push(`${formatWeatherLabel(summary.activeWeather)} weather`);
    }
    if (summaryParts.length === 0) {
      summaryParts.push('No mutation actions needed right now.');
    }

    mutationSummaryEl.textContent = summaryParts.join(' • ');
    const updatedAgo = formatSince(summary.timestamp);
    const sourceLabel = state.resolvedSource ? describeMutationSource(state.resolvedSource) : 'Unknown source';
    const fallbackNote = state.fallback ? ' (fallback)' : '';
    mutationSummaryEl.title = `Updated ${updatedAgo} • Source: ${sourceLabel}${fallbackNote}`;

    const gcd = (a: number, b: number): number => {
      let x = Math.abs(a);
      let y = Math.abs(b);
      while (y !== 0) {
        const temp = y;
        y = x % y;
        x = temp;
      }
      return x === 0 ? 1 : x;
    };

    type RatioEntry = { label: string; value: string; title: string };
    const buildRatioEntry = (
      labelText: string,
      leftLabel: string,
      leftValue: number,
      rightLabel: string,
      rightValue: number,
      basis: string,
    ): RatioEntry => {
      const left = Math.max(0, Math.round(leftValue));
      const right = Math.max(0, Math.round(rightValue));
      const title = `${leftLabel}: ${left.toLocaleString()} • ${rightLabel}: ${right.toLocaleString()} (${basis})`;
      if (left === 0 && right === 0) {
        return {
          label: labelText,
          value: `No ${basis}`,
          title,
        };
      }
      if (left === 0 || right === 0) {
        const dominantLabel = left > 0 ? leftLabel : rightLabel;
        const dominantValue = left > 0 ? left : right;
        return {
          label: labelText,
          value: `${dominantLabel} only (${dominantValue.toLocaleString()} ${basis})`,
          title,
        };
      }
      const divisor = gcd(left, right);
      const simplifiedLeft = Math.max(1, Math.round(left / divisor));
      const simplifiedRight = Math.max(1, Math.round(right / divisor));
      const dominance = left === right
        ? 'Balanced'
        : left > right
          ? `${leftLabel} ${(left / right).toFixed(2)}x ${rightLabel}`
          : `${rightLabel} ${(right / left).toFixed(2)}x ${leftLabel}`;
      return {
        label: labelText,
        value: `${simplifiedLeft} : ${simplifiedRight} (${dominance})`,
        title,
      };
    };

    const ratioEntries: RatioEntry[] = [];
    ratioEntries.push(
      buildRatioEntry(
        'Dawn vs Amber',
        'Dawn',
        summary.totals.dawn.pendingFruitCount,
        'Amber',
        summary.totals.amber.pendingFruitCount,
        'pending fruit',
      ),
    );

    const overallMutatedPlantCount = Math.max(
      0,
      summary.overallTrackedPlantCount - summary.overallEligiblePlantCount,
    );
    const lunarMutatedPlantCount = Math.max(0, summary.lunar.mutatedPlantCount);
    const nonLunarMutatedPlantCount = Math.max(
      0,
      overallMutatedPlantCount - lunarMutatedPlantCount,
    );
    ratioEntries.push(
      buildRatioEntry(
        'Lunar mutated vs non-lunar',
        'Lunar',
        lunarMutatedPlantCount,
        'Non-lunar',
        nonLunarMutatedPlantCount,
        'mutated plants',
      ),
    );

    mutationRatiosEl.innerHTML = '';
    ratioEntries.forEach((entry) => {
      const row = document.createElement('div');
      row.className = 'qpm-mutation-ratio';
      row.title = entry.title;
      row.style.display = 'flex';
      row.style.justifyContent = 'space-between';
      row.style.alignItems = 'center';
      row.style.gap = '8px';
      row.style.fontSize = '12px';

      const labelSpan = document.createElement('span');
      labelSpan.className = 'qpm-mutation-ratio__label qpm-section-muted';
      labelSpan.textContent = entry.label;
      row.appendChild(labelSpan);

      const valueSpan = document.createElement('span');
      valueSpan.className = 'qpm-mutation-ratio__value';
      valueSpan.style.fontWeight = '600';
      valueSpan.textContent = entry.value;
      row.appendChild(valueSpan);

      mutationRatiosEl.appendChild(row);
    });
    mutationRatiosEl.style.display = ratioEntries.length > 0 ? '' : 'none';

    mutationTotalsEl.innerHTML = '';
    if (totalsArray.length > 0) {
      totalsArray.forEach(({ weather, totals }) => {
        const chip = document.createElement('div');
        chip.className = 'qpm-mutation-chip';
        if (weather === summary.activeWeather) {
          chip.classList.add('qpm-mutation-chip--active');
        }

        const label = document.createElement('span');
        label.className = 'qpm-mutation-chip__label';
        label.textContent = formatWeatherLabel(weather);
        chip.appendChild(label);

        const meta = document.createElement('span');
        meta.className = 'qpm-mutation-chip__meta';
        const metaParts: string[] = [];
        metaParts.push(`${totals.pendingFruitCount.toLocaleString()} fruit`);
        metaParts.push(`${totals.plantCount.toLocaleString()} plants`);
        if ((totals.needsSnowFruitCount ?? 0) > 0) {
          metaParts.push(`${(totals.needsSnowFruitCount ?? 0).toLocaleString()} need snow`);
        }
        if (totalPending > 0 && totals.pendingFruitCount > 0) {
          const sharePct = Math.round((totals.pendingFruitCount / totalPending) * 100);
          metaParts.push(`${sharePct}% share`);
        }
        meta.textContent = metaParts.join(' • ');
        chip.appendChild(meta);

        const chipTitleParts = [`Pending ${totals.pendingFruitCount.toLocaleString()} fruit across ${totals.plantCount.toLocaleString()} plants.`];
        if ((totals.needsSnowFruitCount ?? 0) > 0) {
          chipTitleParts.push(`${(totals.needsSnowFruitCount ?? 0).toLocaleString()} fruit require snow.`);
        }
        chip.title = chipTitleParts.join(' ');

        mutationTotalsEl.appendChild(chip);
      });
      mutationTotalsEl.style.display = '';
    } else {
      mutationTotalsEl.style.display = 'none';
    }

    mutationTableBody.innerHTML = '';
    if (totalsArray.length > 0) {
      totalsArray.forEach(({ weather, totals }) => {
        const row = document.createElement('tr');

        const weatherCell = document.createElement('td');
        weatherCell.textContent = formatWeatherLabel(weather);
        row.appendChild(weatherCell);

        const plantsCell = document.createElement('td');
        plantsCell.textContent = totals.plantCount.toLocaleString();
        row.appendChild(plantsCell);

        const fruitCell = document.createElement('td');
        fruitCell.textContent = totals.pendingFruitCount.toLocaleString();
        row.appendChild(fruitCell);

        const needsSnowCell = document.createElement('td');
        const needsSnow = totals.needsSnowFruitCount ?? 0;
        needsSnowCell.textContent = needsSnow > 0 ? needsSnow.toLocaleString() : '—';
        row.appendChild(needsSnowCell);

        const shareCell = document.createElement('td');
        if (totalPending > 0 && totals.pendingFruitCount > 0) {
          const pct = Math.round((totals.pendingFruitCount / totalPending) * 100);
          shareCell.textContent = `${pct}%`;
        } else {
          shareCell.textContent = '—';
        }
        row.appendChild(shareCell);

        mutationTableBody.appendChild(row);
      });
    } else if (mutationDetailMode === 'detail') {
      renderPlaceholder(mutationTableBody, 5, 'No per-weather breakdown yet.');
    }

    if (totalsArray.length === 0) {
      mutationEmptyEl.style.display = 'block';
      mutationEmptyEl.textContent = 'No plants matched the current weather window.';
    } else {
      mutationEmptyEl.style.display = 'none';
      mutationEmptyEl.textContent = '';
    }

    updateMutationCountdown();
  };

  updateMutationDetailMode();

  mutationSourceSelect.addEventListener('change', () => {
    const value = mutationSourceSelect.value;
    mutationSourcePreference = value === 'garden' || value === 'inventory' ? value : 'auto';
    storage.set(MUTATION_TRACKER_SOURCE_KEY, mutationSourcePreference);
    renderMutationSection();
  });

  mutationDetailToggle.addEventListener('click', () => {
    mutationDetailMode = mutationDetailMode === 'detail' ? 'summary' : 'detail';
    storage.set(MUTATION_TRACKER_DETAIL_KEY, mutationDetailMode);
    updateMutationDetailMode();
    renderMutationSection();
  });

  uiState.mutationTrackerUnsubscribe = onMutationSummary((envelope) => {
    mutationSummaries[envelope.source] = envelope.summary;
    renderMutationSection();
  });

  renderMutationSection();
  uiState.mutationTrackerTicker = window.setInterval(() => {
    updateMutationCountdown();
  }, 1000);

  let trackerAbilityFilter = storage.get<string>(TRACKER_ABILITY_FILTER_KEY, 'all') ?? 'all';
  if (typeof trackerAbilityFilter !== 'string' || trackerAbilityFilter.trim().length === 0) {
    trackerAbilityFilter = 'all';
  }

  const storedMode = storage.get<string>(TRACKER_TARGET_MODE_KEY, 'nextLevel');
  let trackerTargetMode: TrackerTargetMode = storedMode === 'maxLevel' ? 'maxLevel' : 'nextLevel';
  xpTargetModeSelect.value = trackerTargetMode === 'maxLevel' ? 'max' : 'next';

  let trackerTargetPetKey = storage.get<string>(TRACKER_TARGET_PET_KEY, 'all') ?? 'all';
  if (typeof trackerTargetPetKey !== 'string' || trackerTargetPetKey.trim().length === 0) {
    trackerTargetPetKey = 'all';
  }
  const loadingPetOption = document.createElement('option');
  loadingPetOption.value = 'all';
  loadingPetOption.textContent = 'All Pets';
  xpTargetPetSelect.appendChild(loadingPetOption);
  xpTargetPetSelect.value = trackerTargetPetKey === 'all' ? 'all' : '';

  const XP_DELTA_MARKERS = ['remain', 'remaining', 'need', 'needed', 'left', 'until', 'togo', 'tolevel', 'tolvl'];
  const XP_IGNORE_MARKERS = ['current', 'curr', 'have', 'progress', 'gained', 'gain', 'perhour', 'per_hour', 'permin', 'per_min'];
  const XP_NEXT_HINTS = ['next', 'target', 'goal', 'level', 'lvl', 'remain', 'needed', 'until', 'left'];
  const XP_MAX_HINTS = ['max', 'cap', 'limit', 'final', 'total'];

  type XpCandidate = {
    path: string[];
    absolute: number;
  };

  const parseNumericCandidate = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const cleaned = value.replace(/[^0-9.-]/g, '');
      if (!cleaned) {
        return null;
      }
      const parsed = Number(cleaned);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };

  const collectPetXpCandidates = (info: ActivePetInfo, currentXp: number | null): XpCandidate[] => {
    const sources: unknown[] = [];
    if (info.raw && typeof info.raw === 'object') {
      sources.push(info.raw);
    } else {
      sources.push(info);
    }

    const candidates: XpCandidate[] = [];
    const seen = new Set<unknown>();
    const queue: Array<{ node: unknown; path: string[] }> = sources.map((node) => ({ node, path: [] }));

    while (queue.length) {
      const { node, path } = queue.shift()!;
      if (node == null) {
        continue;
      }

      if (typeof node === 'number' || typeof node === 'string') {
        const numeric = parseNumericCandidate(node);
        if (numeric == null) {
          continue;
        }
        const normalizedPath = path.map((segment) => segment.toLowerCase());
        if (!normalizedPath.some((segment) => segment.includes('xp'))) {
          continue;
        }
        if (normalizedPath.some((segment) => XP_IGNORE_MARKERS.some((hint) => segment.includes(hint)))) {
          continue;
        }
        const isDelta = normalizedPath.some((segment) => XP_DELTA_MARKERS.some((hint) => segment.includes(hint)));
        const absolute = isDelta ? (currentXp != null ? currentXp + numeric : null) : numeric;
        if (absolute != null && Number.isFinite(absolute)) {
          candidates.push({ path: normalizedPath, absolute });
        }
        continue;
      }

      if (typeof node === 'object') {
        if (seen.has(node)) {
          continue;
        }
        seen.add(node);

        if (Array.isArray(node)) {
          node.forEach((child, index) => {
            queue.push({ node: child, path: path.concat(String(index)) });
          });
          continue;
        }

        if (node instanceof Map) {
          node.forEach((child, key) => {
            queue.push({ node: child, path: path.concat(String(key)) });
          });
          continue;
        }

        if (node instanceof Set) {
          let idx = 0;
          node.forEach((child) => {
            queue.push({ node: child, path: path.concat(String(idx++)) });
          });
          continue;
        }

        for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
          queue.push({ node: child, path: path.concat(key) });
        }
      }
    }

    return candidates;
  };

  const matchesHints = (segments: string[], hints: readonly string[]): boolean =>
    segments.some((segment) => hints.some((hint) => segment.includes(hint)));

  type XpTargetResolution = {
    value: number | null;
    source: 'hint-next' | 'hint-max' | 'observed-final' | 'observed-partial' | 'current' | 'none';
    detail: string;
  };

  const createResolution = (value: number | null, source: XpTargetResolution['source'], detail: string): XpTargetResolution => ({
    value,
    source,
    detail,
  });

  const resolvePetXpTarget = (info: ActivePetInfo, mode: TrackerTargetMode): XpTargetResolution => {
    const currentXp = typeof info.xp === 'number' && Number.isFinite(info.xp) ? info.xp : null;
    const candidates = collectPetXpCandidates(info, currentXp);

    const pick = (hints: readonly string[], prefer: 'smallestAbove' | 'largest'): number | null => {
      const filtered = candidates.filter((candidate) => matchesHints(candidate.path, hints));
      if (!filtered.length) {
        return null;
      }
      if (prefer === 'largest') {
        const sorted = [...filtered].sort((a, b) => b.absolute - a.absolute);
        const chosen = sorted[0];
        if (!chosen) return null;
        return Math.max(0, Math.round(chosen.absolute));
      }
      const baseline = currentXp ?? 0;
      const above = currentXp != null ? filtered.filter((candidate) => candidate.absolute > baseline) : filtered;
      const pool = above.length > 0 ? above : filtered;
      const sorted = [...pool].sort((a, b) => a.absolute - b.absolute);
      const chosen = sorted[0];
      if (!chosen) {
        return null;
      }
      const resolved = Math.max(0, Math.round(chosen.absolute));
      if (currentXp != null && resolved <= currentXp) {
        return Math.max(0, Math.round(currentXp));
      }
      return resolved;
    };

    const nextTarget = pick(XP_NEXT_HINTS, 'smallestAbove');
    const maxTarget = pick(XP_MAX_HINTS, 'largest');

    if (mode === 'maxLevel') {
      if (maxTarget != null) {
        return createResolution(maxTarget, 'hint-max', 'Target XP parsed from pet data (max-level hint).');
      }
      if (nextTarget != null) {
        return createResolution(nextTarget, 'hint-next', 'Target XP parsed from pet data (next-level hint).');
      }
    } else {
      if (nextTarget != null) {
        return createResolution(nextTarget, 'hint-next', 'Target XP parsed from pet data (next-level hint).');
      }
      if (maxTarget != null) {
        return createResolution(maxTarget, 'hint-max', 'Target XP parsed from pet data (max-level hint).');
      }
    }

    const observed = estimatePetXpTarget(info.species ?? null, info.level ?? null, mode);
    if (observed) {
      const source = observed.confidence === 'level-up' ? 'observed-final' : 'observed-partial';
      const samples = observed.samples > 1 ? `, ${observed.samples} samples` : '';
      const seen = observed.observedAt ? ` (seen ${formatSince(observed.observedAt)})` : '';
      const detail = `Observed ${observed.value.toLocaleString()} xp for ${observed.displayName} level ${observed.level}${samples}${seen}.`;
      return createResolution(observed.value, source, detail);
    }

    if (currentXp != null) {
      const rounded = Math.max(0, Math.round(currentXp));
      return createResolution(rounded, 'current', 'Falling back to current XP until target data is observed.');
    }
    return createResolution(null, 'none', 'No XP target data available yet.');
  };

  const getTrackerPetOptionKey = (info: ActivePetInfo, index: number): string => {
    if (info.petId && info.petId.trim().length > 0) {
      return `pet:${info.petId}`;
    }
    if (info.slotId && info.slotId.trim().length > 0) {
      return `slot:${info.slotId}`;
    }
    if (typeof info.slotIndex === 'number' && Number.isFinite(info.slotIndex)) {
      return `slotIndex:${Math.max(0, Math.round(info.slotIndex))}`;
    }
    return `index:${index}`;
  };

  const syncPetSelector = (infos: ActivePetInfo[]): void => {
    const previous = trackerTargetPetKey;
    xpTargetPetSelect.innerHTML = '';

    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = 'All Pets';
    xpTargetPetSelect.appendChild(allOption);

    let hasSelection = previous === 'all';

    infos.forEach((info, index) => {
      const value = getTrackerPetOptionKey(info, index);
      const option = document.createElement('option');
      option.value = value;
      option.textContent = getPetDisplayName(info);
      xpTargetPetSelect.appendChild(option);
      if (value === previous) {
        hasSelection = true;
      }
    });

    if (!hasSelection) {
      if (trackerTargetPetKey !== 'all') {
        trackerTargetPetKey = 'all';
        storage.set(TRACKER_TARGET_PET_KEY, trackerTargetPetKey);
      } else {
        trackerTargetPetKey = 'all';
      }
    }

    xpTargetPetSelect.value = trackerTargetPetKey;
  };

  const syncAbilityFilterOptions = (groups: AbilityGroup[]): void => {
    const select = uiState.trackerAbilityFilterSelect;
    if (!select) {
      return;
    }

    const previous = trackerAbilityFilter;
    select.innerHTML = '';

    const defaultOption = document.createElement('option');
    defaultOption.value = 'all';
    defaultOption.textContent = 'All abilities';
    select.appendChild(defaultOption);

    const seen = new Set<string>();
    let hasSelection = previous === 'all';
    groups.forEach((group) => {
      const id = group.definition.id;
      if (!id || seen.has(id)) {
        return;
      }
      seen.add(id);
      const option = document.createElement('option');
      option.value = id;
      const petCount = group.entries.length;
      option.textContent = `${group.definition.name} (${petCount})`;
      select.appendChild(option);
      if (id === previous) {
        hasSelection = true;
      }
    });

    if (!hasSelection && previous !== 'all') {
      const definition = getAbilityDefinition(previous);
      const fallbackOption = document.createElement('option');
      fallbackOption.value = previous;
      fallbackOption.textContent = definition ? `${definition.name} (inactive)` : 'Selected ability (inactive)';
      select.appendChild(fallbackOption);
      hasSelection = true;
    }

    if (!hasSelection) {
      trackerAbilityFilter = 'all';
      storage.set(TRACKER_ABILITY_FILTER_KEY, trackerAbilityFilter);
    }

    select.value = trackerAbilityFilter;
  };

  let latestInfos: ActivePetInfo[] = [];
  let latestAnalysis: AbilityAnalysis = createEmptyAbilityAnalysis();

  const renderAbilitySection = (analysis: AbilityAnalysis) => {
    syncAbilityFilterOptions(analysis.groups);

    const groupsToRender = trackerAbilityFilter === 'all'
      ? analysis.groups
      : analysis.groups.filter((group) => group.definition.id === trackerAbilityFilter);

    const selectedAbilityName = trackerAbilityFilter !== 'all'
      ? analysis.groups.find((group) => group.definition.id === trackerAbilityFilter)?.definition.name
          ?? getAbilityDefinition(trackerAbilityFilter)?.name
          ?? null
      : null;

    const aggregateTotals = (groups: AbilityGroup[]): AbilityTotals =>
      groups.reduce<AbilityTotals>((acc, group) => {
        switch (group.definition.category) {
          case 'xp':
            acc.xpPerHour += group.effectPerHour;
            break;
          case 'plantGrowth':
            acc.plantMinutesPerHour += group.effectPerHour;
            break;
          case 'eggGrowth':
            acc.eggMinutesPerHour += group.effectPerHour;
            break;
          case 'coins':
            acc.coinsPerHour += group.effectPerHour;
            break;
        }
        return acc;
      }, {
        xpPerHour: 0,
        plantMinutesPerHour: 0,
        eggMinutesPerHour: 0,
        coinsPerHour: 0,
      });

    const summaryTotals = trackerAbilityFilter === 'all' ? analysis.totals : aggregateTotals(groupsToRender);

    const summaryParts: string[] = [];
    if (summaryTotals.plantMinutesPerHour > 0) {
      summaryParts.push(`Plant growth ≈ ${summaryTotals.plantMinutesPerHour.toFixed(1)} min/h saved`);
    }
    if (summaryTotals.eggMinutesPerHour > 0) {
      summaryParts.push(`Egg growth ≈ ${summaryTotals.eggMinutesPerHour.toFixed(1)} min/h saved`);
    }
    if (summaryTotals.xpPerHour > 0) {
      summaryParts.push(`XP boost ≈ ${Math.round(summaryTotals.xpPerHour).toLocaleString()} xp/h`);
    }
    if (summaryTotals.coinsPerHour > 0) {
      summaryParts.push(`Coins ≈ ${formatCoins(summaryTotals.coinsPerHour)} coins/h`);
    }

    if (summaryParts.length) {
      abilitySummary.textContent = summaryParts.join(' • ');
    } else if (groupsToRender.length > 0) {
      const petCount = groupsToRender.reduce((sum, group) => sum + group.entries.length, 0);
      const procsPerHourTotal = groupsToRender.reduce((sum, group) => sum + group.totalProcsPerHour, 0);
      const abilityLabel = trackerAbilityFilter === 'all'
        ? `${analysis.groups.length} tracked ${analysis.groups.length === 1 ? 'ability' : 'abilities'}`
        : (selectedAbilityName ?? 'Selected ability');
      const procsText = procsPerHourTotal > 0 ? `${procsPerHourTotal.toFixed(2)} procs/hr` : 'no proc rate yet';
      abilitySummary.textContent = `${abilityLabel} • ${petCount} pet${petCount === 1 ? '' : 's'} • ${procsText}`;
    } else if (analysis.groups.length > 0 && trackerAbilityFilter !== 'all') {
      abilitySummary.textContent = `No ability data for selected filter${selectedAbilityName ? ` (${selectedAbilityName})` : ''} yet.`;
    } else if (analysis.groups.length > 0) {
      const abilityLabel = analysis.groups.length === 1 ? 'ability' : 'abilities';
      abilitySummary.textContent = `Tracking ${analysis.groups.length} ${abilityLabel} (effects pending)`;
    } else {
      abilitySummary.textContent = 'No tracked abilities detected yet.';
    }

    abilityTableBody.innerHTML = '';
    if (groupsToRender.length === 0) {
      const placeholderMessage = analysis.groups.length === 0
        ? 'No ability procs observed yet.'
        : trackerAbilityFilter === 'all'
          ? 'No ability procs observed yet.'
          : `No ability data for selected filter${selectedAbilityName ? ` (${selectedAbilityName})` : ''} yet.`;
      renderPlaceholder(abilityTableBody, 6, placeholderMessage);
    } else {
      groupsToRender.forEach((group) => {
        const sectionRow = document.createElement('tr');
        sectionRow.className = 'qpm-ability-section';
        const sectionCell = document.createElement('td');
        sectionCell.colSpan = 6;

        const sectionContent = document.createElement('div');
        sectionContent.className = 'qpm-ability-section__content';

        const sectionTitle = document.createElement('span');
        sectionTitle.className = 'qpm-ability-section__title';
        sectionTitle.textContent = group.definition.name;

        const sectionMeta = document.createElement('span');
        sectionMeta.className = 'qpm-ability-section__meta';
        const metaParts = [
          `${group.entries.length} pet${group.entries.length === 1 ? '' : 's'}`,
          `Procs/hr ${group.totalProcsPerHour.toFixed(2)}`,
        ];
        if (group.effectPerHour > 0) {
          metaParts.push(`Effect/hr ${formatAbilityEffect(group.definition, group.effectPerHour)}`);
        }
        sectionMeta.textContent = metaParts.join(' • ');

        sectionContent.append(sectionTitle, sectionMeta);
        sectionCell.appendChild(sectionContent);
        sectionRow.appendChild(sectionCell);
        abilityTableBody.appendChild(sectionRow);

        const sortedEntries = [...group.entries].sort((a, b) => b.procsPerHour - a.procsPerHour);
        sortedEntries.forEach((entry) => {
          const row = document.createElement('tr');

          const abilityCell = document.createElement('td');
          abilityCell.textContent = group.definition.name;
          row.appendChild(abilityCell);

          const petCell = document.createElement('td');
          const petSprite = renderCompactPetSprite({
            species: entry.displayName
          });
          petCell.innerHTML = `<div style="display:flex;align-items:center;gap:6px;">${petSprite}<span>${entry.displayName}</span></div>`;
          row.appendChild(petCell);

          const procsCell = document.createElement('td');
          const procsText = entry.procsPerHour > 0 ? entry.procsPerHour.toFixed(2) : '0.00';
          procsCell.textContent = procsText;
          if (entry.procsPerHourSource === 'observed') {
            const count = entry.sampleCount;
            procsCell.title = count > 0 ? `Observed from ${count} sample${count === 1 ? '' : 's'}` : 'Observed from ability log';
          } else {
            procsCell.title = 'Estimated from ability definition';
          }
          row.appendChild(procsCell);

          const etaCell = document.createElement('td');
          const etaText = entry.expectedMinutesBetween != null ? formatMinutesPretty(entry.expectedMinutesBetween) : '—';
          etaCell.textContent = etaText;
          etaCell.title = entry.lastProcAt != null ? `Last proc ${formatSince(entry.lastProcAt)}` : 'No proc observed yet';
          row.appendChild(etaCell);

          const effectPerProcCell = document.createElement('td');
          effectPerProcCell.textContent = formatAbilityEffectPerProc(group.definition, entry.effectPerProc);
          if (entry.effectSource === 'observed') {
            const count = entry.sampleCount;
            effectPerProcCell.title = count > 0 ? `Observed average (${count} sample${count === 1 ? '' : 's'})` : 'Observed average';
          } else if (entry.effectSource === 'computed') {
            effectPerProcCell.title = entry.effectDetail ?? 'Computed from live garden snapshot.';
          } else {
            effectPerProcCell.title = entry.effectDetail ?? 'Using ability definition effect per proc';
          }
          row.appendChild(effectPerProcCell);

          const effectCell = document.createElement('td');
          effectCell.textContent = formatAbilityEffect(group.definition, entry.effectPerHour);
          if (entry.effectPerProc != null) {
            const perProcText = formatAbilityEffectPerProc(group.definition, entry.effectPerProc);
            if (entry.effectSource === 'computed') {
              effectCell.title = `${entry.effectDetail ?? 'Computed from live garden snapshot.'} Per proc: ${perProcText}`;
            } else if (entry.effectSource === 'observed') {
              effectCell.title = `Per proc: ${perProcText}`;
            } else {
              effectCell.title = `${entry.effectDetail ?? 'Using ability definition effect per proc.'} Per proc: ${perProcText}`;
            }
          } else {
            effectCell.title = 'Awaiting effect data';
          }
          row.appendChild(effectCell);

          abilityTableBody.appendChild(row);
        });

        const totalRow = document.createElement('tr');
        totalRow.classList.add('qpm-ability-total');

        const totalAbilityCell = document.createElement('td');
        totalAbilityCell.textContent = `${group.definition.name} (total)`;
        totalRow.appendChild(totalAbilityCell);

        const totalPetCell = document.createElement('td');
        totalPetCell.textContent = sortedEntries.length > 1 ? 'All tracked pets' : (sortedEntries[0]?.displayName ?? '—');
        totalRow.appendChild(totalPetCell);

        const totalProcsCell = document.createElement('td');
        totalProcsCell.textContent = group.totalProcsPerHour > 0 ? group.totalProcsPerHour.toFixed(2) : '0.00';
        totalProcsCell.title = group.totalSamples > 0 ? `Combined from ${group.totalSamples} sample${group.totalSamples === 1 ? '' : 's'}` : 'Estimated from ability definition';
        totalRow.appendChild(totalProcsCell);

        const totalEtaCell = document.createElement('td');
        totalEtaCell.textContent = group.combinedEtaMinutes != null ? formatMinutesPretty(group.combinedEtaMinutes) : '—';
        totalEtaCell.title = group.lastProcAt != null ? `Latest proc ${formatSince(group.lastProcAt)}` : 'No proc observed yet';
        totalRow.appendChild(totalEtaCell);

        const totalEffectPerProcCell = document.createElement('td');
        totalEffectPerProcCell.textContent = formatAbilityEffectPerProc(group.definition, group.averageEffectPerProc);
        if (group.totalSamples > 0) {
          totalEffectPerProcCell.title = `Average per proc (${group.totalSamples} sample${group.totalSamples === 1 ? '' : 's'})`;
        } else {
          const referenceEntry = sortedEntries.find((entry) => entry.effectSource === 'computed');
          if (referenceEntry) {
            totalEffectPerProcCell.title = referenceEntry.effectDetail ?? 'Computed from live garden snapshot.';
          } else {
            totalEffectPerProcCell.title = 'Using ability definition';
          }
        }
        totalRow.appendChild(totalEffectPerProcCell);

        const totalEffectCell = document.createElement('td');
        totalEffectCell.textContent = formatAbilityEffect(group.definition, group.effectPerHour);
        if (group.averageEffectPerProc != null) {
          const perProcText = formatAbilityEffectPerProc(group.definition, group.averageEffectPerProc);
          const referenceEntry = sortedEntries.find((entry) => entry.effectSource === 'computed');
          if (referenceEntry) {
            totalEffectCell.title = `${referenceEntry.effectDetail ?? 'Computed from live garden snapshot.'} Per proc avg: ${perProcText}`;
          } else {
            totalEffectCell.title = `Per proc avg: ${perProcText}`;
          }
        } else {
          totalEffectCell.title = 'Awaiting effect data';
        }
        totalRow.appendChild(totalEffectCell);

        abilityTableBody.appendChild(totalRow);
      });
    }

    if (analysis.unknown.length > 0) {
      const grouped = new Map<string, Set<string>>();
      for (const entry of analysis.unknown) {
        const key = entry.abilityName.trim();
        if (!grouped.has(key)) {
          grouped.set(key, new Set());
        }
        grouped.get(key)?.add(getPetDisplayName(entry.pet));
      }
      const entries: string[] = [];
      for (const [ability, pets] of grouped) {
        const petList = Array.from(pets.values()).join(', ');
        entries.push(`${ability}${petList ? ` (${petList})` : ''}`);
      }
      abilityUnknown.textContent = `Missing ability data for ${entries.join(' • ')}`;
      abilityUnknown.style.display = 'block';
    } else {
      abilityUnknown.style.display = 'none';
      abilityUnknown.textContent = '';
    }
  };

  const renderXpSection = (analysis: AbilityAnalysis, infos: ActivePetInfo[]) => {
    syncPetSelector(infos);

    const xpGroups = analysis.groups.filter((group) => group.definition.category === 'xp');
    const totalXpPerHour = analysis.totals.xpPerHour;

    const xpEffectByPetKey = new Map<string, number>();
    xpGroups.forEach((group) => {
      group.entries.forEach((entry) => {
        const key = getTrackerPetOptionKey(entry.pet, entry.petIndex);
        const previous = xpEffectByPetKey.get(key) ?? 0;
        xpEffectByPetKey.set(key, previous + entry.effectPerHour);
      });
    });

    const infoEntries = infos.map((info, index) => ({ info, index }));
    const displayedEntries = trackerTargetPetKey === 'all'
      ? infoEntries
      : infoEntries.filter(({ info, index }) => getTrackerPetOptionKey(info, index) === trackerTargetPetKey);
    const targetedEntries = displayedEntries.length > 0 ? displayedEntries : infoEntries;

    const targetedTotalXpPerHour = targetedEntries.reduce((sum, { info, index }) => {
      const key = getTrackerPetOptionKey(info, index);
      return sum + (xpEffectByPetKey.get(key) ?? 0);
    }, 0);
    const perPetAverage = targetedEntries.length > 0 ? targetedTotalXpPerHour / targetedEntries.length : 0;

    if (xpGroups.length === 0) {
      xpSummary.textContent = 'No XP boost abilities detected yet.';
      xpSummary.title = '';
    } else {
      const totalText = Math.round(totalXpPerHour).toLocaleString();
      const perPetText = perPetAverage > 0 ? Math.round(perPetAverage).toLocaleString() : '0';
      const perPetSubject = trackerTargetPetKey === 'all' ? 'active pet' : 'selected pet';
      xpSummary.textContent = `Projected ${totalText} xp/h (~${perPetText} xp/h per ${perPetSubject})`;
      if (targetedEntries.length > 0) {
        const shareCount = targetedEntries.length;
        xpSummary.title = `Filtered pets total ${Math.round(targetedTotalXpPerHour).toLocaleString()} xp/h across ${shareCount} pet${shareCount === 1 ? '' : 's'}. Overall boost: ${Math.round(totalXpPerHour).toLocaleString()} xp/h.`;
      } else {
        xpSummary.title = '';
      }
    }

    xpAbilityBody.innerHTML = '';
    if (xpGroups.length === 0) {
      renderPlaceholder(xpAbilityBody, 5, 'No XP abilities detected.');
    } else {
      for (const group of xpGroups) {
        const sortedEntries = [...group.entries].sort((a, b) => b.procsPerHour - a.procsPerHour);
        const xpPerProc = group.definition.effectValuePerProc ?? 0;

        for (const entry of sortedEntries) {
          const row = document.createElement('tr');

          const abilityCell = document.createElement('td');
          abilityCell.textContent = group.definition.name;
          row.appendChild(abilityCell);

          const petCell = document.createElement('td');
          petCell.textContent = entry.displayName;
          row.appendChild(petCell);

          const procsHrCell = document.createElement('td');
          procsHrCell.textContent = entry.procsPerHour.toFixed(2);
          row.appendChild(procsHrCell);

          const xpProcCell = document.createElement('td');
          xpProcCell.textContent = xpPerProc > 0 ? Math.round(xpPerProc).toLocaleString() : '—';
          row.appendChild(xpProcCell);

          const xpHourCell = document.createElement('td');
          xpHourCell.textContent = entry.effectPerHour > 0 ? Math.round(entry.effectPerHour).toLocaleString() : '—';
          row.appendChild(xpHourCell);

          xpAbilityBody.appendChild(row);
        }

        const totalRow = document.createElement('tr');
        totalRow.style.fontWeight = '600';

        const totalAbilityCell = document.createElement('td');
        totalAbilityCell.textContent = `${group.definition.name} (total)`;
        totalRow.appendChild(totalAbilityCell);

        const totalPetCell = document.createElement('td');
        totalPetCell.textContent = sortedEntries.length > 1 ? 'All tracked pets' : (sortedEntries[0]?.displayName ?? '—');
        totalRow.appendChild(totalPetCell);

        const totalProcsCell = document.createElement('td');
        totalProcsCell.textContent = group.totalProcsPerHour.toFixed(2);
        totalRow.appendChild(totalProcsCell);

        const totalXpProcCell = document.createElement('td');
        totalXpProcCell.textContent = xpPerProc > 0 ? Math.round(xpPerProc).toLocaleString() : '—';
        totalRow.appendChild(totalXpProcCell);

        const totalXpHourCell = document.createElement('td');
        totalXpHourCell.textContent = group.effectPerHour > 0 ? Math.round(group.effectPerHour).toLocaleString() : '—';
        totalRow.appendChild(totalXpHourCell);

        xpAbilityBody.appendChild(totalRow);
      }
    }

    xpPerPetBody.innerHTML = '';
    if (targetedEntries.length === 0) {
      const message = infos.length === 0 ? 'No active pets detected yet.' : 'No matching pets for current filter.';
      renderPlaceholder(xpPerPetBody, 7, message);
      return;
    }

  for (const { info, index } of targetedEntries) {
      const row = document.createElement('tr');

      const nameCell = document.createElement('td');
      nameCell.textContent = getPetDisplayName(info);
      row.appendChild(nameCell);

      const speciesCell = document.createElement('td');
      speciesCell.textContent = info.species && info.species.trim().length > 0 ? info.species : '—';
      row.appendChild(speciesCell);

      const currentXpValue = typeof info.xp === 'number' && Number.isFinite(info.xp) ? Math.max(0, Math.round(info.xp)) : null;
      const currentXpCell = document.createElement('td');
      currentXpCell.textContent = currentXpValue != null ? currentXpValue.toLocaleString() : '—';
      row.appendChild(currentXpCell);

  const targetXpResolution = resolvePetXpTarget(info, trackerTargetMode);
  const targetXpValue = targetXpResolution.value;
      const targetXpCell = document.createElement('td');
      targetXpCell.textContent = targetXpValue != null ? targetXpValue.toLocaleString() : '—';
  targetXpCell.title = targetXpResolution.detail;
      row.appendChild(targetXpCell);

      const xpNeededValue = currentXpValue != null && targetXpValue != null ? Math.max(0, targetXpValue - currentXpValue) : null;
      const xpNeededCell = document.createElement('td');
      xpNeededCell.textContent = xpNeededValue != null ? xpNeededValue.toLocaleString() : '—';
      row.appendChild(xpNeededCell);

  const xpRateCell = document.createElement('td');
  const petKey = getTrackerPetOptionKey(info, index);
  const xpRate = xpEffectByPetKey.get(petKey) ?? 0;
      xpRateCell.textContent = xpRate > 0 ? Math.round(xpRate).toLocaleString() : '—';
      row.appendChild(xpRateCell);

      const etaCell = document.createElement('td');
      const hoursToTarget = xpNeededValue != null && xpRate > 0 ? xpNeededValue / xpRate : null;
      etaCell.textContent = formatHoursPretty(hoursToTarget);
      row.appendChild(etaCell);

      xpPerPetBody.appendChild(row);
    }
  };

  const rerender = () => {
    renderAbilitySection(latestAnalysis);
    renderXpSection(latestAnalysis, latestInfos);
  };

  const refresh = (infos: ActivePetInfo[]) => {
    latestInfos = infos;
    latestAnalysis = analyzeActivePetAbilities(infos);
    rerender();
  };

  abilityFilterSelect.addEventListener('change', () => {
    const value = abilityFilterSelect.value;
    trackerAbilityFilter = typeof value === 'string' && value !== 'all' ? value : 'all';
    storage.set(TRACKER_ABILITY_FILTER_KEY, trackerAbilityFilter);
    renderAbilitySection(latestAnalysis);
  });

  xpTargetModeSelect.addEventListener('change', () => {
    trackerTargetMode = xpTargetModeSelect.value === 'max' ? 'maxLevel' : 'nextLevel';
    storage.set(TRACKER_TARGET_MODE_KEY, trackerTargetMode);
    renderXpSection(latestAnalysis, latestInfos);
  });

  xpTargetPetSelect.addEventListener('change', () => {
    const value = xpTargetPetSelect.value;
    trackerTargetPetKey = typeof value === 'string' && value.trim().length > 0 ? value : 'all';
    storage.set(TRACKER_TARGET_PET_KEY, trackerTargetPetKey);
    renderXpSection(latestAnalysis, latestInfos);
  });

  onActivePetInfos(refresh);
  refresh([]);

  if (!uiState.trackerAbilityHistoryUnsubscribe) {
    uiState.trackerAbilityHistoryUnsubscribe = onAbilityHistoryUpdate(() => {
      latestAnalysis = analyzeActivePetAbilities(latestInfos);
      rerender();
    });
  }

  void startAbilityTriggerStore().catch((error) => {
    log('⚠️ Failed to start ability trigger store', error);
  });

  uiState.trackerAbilityTicker = window.setInterval(() => {
    renderAbilitySection(latestAnalysis);
  }, 15000);

  return [windowButton, mutationCard.root, abilityCard.root, xpCard.root];
  */
  // END OLD TRACKER SECTIONS
  // ============================================================================

  // Tracker buttons removed - now accessible via tab buttons instead
  return [];
}

// Track the latest pet analysis for the modal window
let modalLatestAnalysis: AbilityAnalysis = createEmptyAbilityAnalysis();
let modalLatestInfos: ActivePetInfo[] = [];

// Tracker window settings
interface TrackerSettings {
  detailedView: boolean;
  filterCoinOnly: boolean;
  selectedAbilities: string[]; // Specific ability IDs to show (empty = show all)
}

const DEFAULT_TRACKER_SETTINGS: TrackerSettings = {
  detailedView: false,
  filterCoinOnly: false,
  selectedAbilities: [],
};

let currentTrackerSettings: TrackerSettings = { ...DEFAULT_TRACKER_SETTINGS };

/**
 * Create a toggle option for the settings panel
 */
function createToggleOption(
  label: string,
  description: string,
  initialValue: boolean,
  onChange: (enabled: boolean) => void,
): HTMLElement {
  const container = document.createElement('div');
  container.style.cssText = 'display: flex; align-items: center; gap: 10px; padding: 8px; background: rgba(0, 0, 0, 0.2); border-radius: 4px;';

  const labelContainer = document.createElement('div');
  labelContainer.style.cssText = 'flex: 1; display: flex; flex-direction: column; gap: 2px;';

  const labelText = document.createElement('div');
  labelText.textContent = label;
  labelText.style.cssText = 'font-size: 12px; color: rgba(255, 255, 255, 0.9); font-weight: 500;';
  labelContainer.appendChild(labelText);

  const descText = document.createElement('div');
  descText.textContent = description;
  descText.style.cssText = 'font-size: 11px; color: rgba(255, 255, 255, 0.6);';
  labelContainer.appendChild(descText);

  container.appendChild(labelContainer);

  const toggle = document.createElement('button');
  toggle.style.cssText = `
    width: 48px;
    height: 24px;
    border-radius: 12px;
    border: none;
    cursor: pointer;
    position: relative;
    transition: background 0.2s;
    background: ${initialValue ? 'var(--qpm-accent)' : 'rgba(255, 255, 255, 0.2)'};
  `;

  const toggleKnob = document.createElement('div');
  toggleKnob.style.cssText = `
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: white;
    position: absolute;
    top: 3px;
    left: ${initialValue ? '27px' : '3px'};
    transition: left 0.2s;
  `;
  toggle.appendChild(toggleKnob);

  let enabled = initialValue;
  toggle.addEventListener('click', () => {
    enabled = !enabled;
    toggle.style.background = enabled ? 'var(--qpm-accent)' : 'rgba(255, 255, 255, 0.2)';
    toggleKnob.style.left = enabled ? '27px' : '3px';
    onChange(enabled);
  });

  container.appendChild(toggle);
  return container;
}

/**
 * Render function for the trackers modal window
 */
function renderTrackersWindow(root: HTMLElement): void {
  // Load saved settings
  const savedSettings = storage.get<TrackerSettings>('qpm-tracker-settings');
  if (savedSettings) {
    currentTrackerSettings = { ...DEFAULT_TRACKER_SETTINGS, ...savedSettings };
  }

  root.style.cssText = 'display: flex; flex-direction: column; gap: 12px; min-width: 900px; max-width: 1200px;';

  // Header with stats summary
  const header = document.createElement('div');
  header.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    background: var(--qpm-surface-2);
    border-radius: 6px;
    border: 1px solid var(--qpm-border);
  `;

  const summaryText = document.createElement('div');
  summaryText.className = 'tracker-summary';
  summaryText.style.cssText = 'font-size: 13px; color: var(--qpm-text); font-weight: 500;';
  summaryText.textContent = 'Loading pet data...';
  header.appendChild(summaryText);

  // Settings panel container (hidden by default)
  const settingsPanel = document.createElement('div');
  settingsPanel.className = 'tracker-settings-panel';
  settingsPanel.style.cssText = 'display: none;';

  const configButton = document.createElement('button');
  configButton.className = 'qpm-button qpm-button--secondary';
  configButton.textContent = '⚙️ Filters';
  configButton.style.cssText = 'padding: 6px 12px; font-size: 12px;';
  configButton.title = 'Show filter options';
  configButton.addEventListener('click', () => {
    const isHidden = settingsPanel.style.display === 'none';
    settingsPanel.style.display = isHidden ? '' : 'none';
    configButton.textContent = isHidden ? '⚙️ Hide Filters' : '⚙️ Filters';
  });
  header.appendChild(configButton);

  root.appendChild(header);

  // Settings panel
  settingsPanel.style.cssText = `
    display: none;
    padding: 16px;
    background: var(--qpm-surface-2);
    border-radius: 6px;
    border: 1px solid var(--qpm-border);
    margin-bottom: 12px;
    gap: 16px;
  `;

  const settingsTitle = document.createElement('div');
  settingsTitle.textContent = '⚙️ Display Options';
  settingsTitle.style.cssText = 'font-weight: 600; color: var(--qpm-accent); margin-bottom: 12px; font-size: 13px;';
  settingsPanel.appendChild(settingsTitle);

  const settingsGrid = document.createElement('div');
  settingsGrid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;';

  // Detailed View toggle
  const detailedViewContainer = createToggleOption(
    '📊 Detailed View',
    'Show additional statistics and context',
    currentTrackerSettings.detailedView,
    (enabled) => {
      currentTrackerSettings.detailedView = enabled;
      storage.set('qpm-tracker-settings', currentTrackerSettings);
      updateTrackerWindow({ summaryText, tbody, footer, abilityCheckboxGrid });
    },
  );
  settingsGrid.appendChild(detailedViewContainer);

  // Coin-only filter
  const coinOnlyContainer = createToggleOption(
    '💰 Coin Abilities Only',
    'Show only coin-generating abilities',
    currentTrackerSettings.filterCoinOnly,
    (enabled) => {
      currentTrackerSettings.filterCoinOnly = enabled;
      storage.set('qpm-tracker-settings', currentTrackerSettings);
      updateTrackerWindow({ summaryText, tbody, footer, abilityCheckboxGrid });
    },
  );
  settingsGrid.appendChild(coinOnlyContainer);

  // Ability filter - will be populated with actual abilities
  const abilityFilterContainer = document.createElement('div');
  abilityFilterContainer.className = 'ability-filter-container';
  abilityFilterContainer.style.cssText = 'grid-column: 1 / -1; display: flex; flex-direction: column; gap: 8px;';

  const abilityFilterLabel = document.createElement('div');
  abilityFilterLabel.textContent = '✨ Filter by Ability';
  abilityFilterLabel.style.cssText = 'font-size: 12px; color: rgba(255, 255, 255, 0.9); font-weight: 500;';
  abilityFilterContainer.appendChild(abilityFilterLabel);

  const abilityCheckboxGrid = document.createElement('div');
  abilityCheckboxGrid.className = 'ability-checkbox-grid';
  abilityCheckboxGrid.style.cssText = `
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 6px;
    max-height: 200px;
    overflow-y: auto;
    padding: 8px;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 4px;
  `;
  abilityFilterContainer.appendChild(abilityCheckboxGrid);
  settingsGrid.appendChild(abilityFilterContainer);

  settingsPanel.appendChild(settingsGrid);
  root.appendChild(settingsPanel);

  // Main table container
  const tableContainer = document.createElement('div');
  tableContainer.style.cssText = `
    overflow-x: auto;
    background: var(--qpm-surface-1);
    border-radius: 6px;
    border: 1px solid var(--qpm-border);
    max-height: 60vh;
    overflow-y: auto;
  `;

  const table = document.createElement('table');
  table.className = 'tracker-detail-table';
  table.style.cssText = `
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  `;

  // Table header
  const thead = table.createTHead();
  thead.style.cssText = 'position: sticky; top: 0; z-index: 10; background: var(--qpm-surface-1);';
  const headerRow = thead.insertRow();
  headerRow.style.cssText = `
    background: var(--qpm-surface-2);
    border-bottom: 2px solid var(--qpm-border);
  `;

  const headers = [
    { text: '🐾 Pet', tooltip: 'Pet name or species' },
    { text: '✨ Ability', tooltip: 'Pet ability name' },
    { text: '🎲 Chance %', tooltip: 'Calculated proc chance per minute (baseProbability × STR)' },
    { text: '⚡ Procs/Hr', tooltip: 'Expected procs per hour' },
    { text: '💰 Per Proc', tooltip: 'Coins earned per successful proc' },
    { text: '💸 Per Hour', tooltip: 'Total coins per hour from this ability' },
    { text: '⏱️ Next ETA', tooltip: 'Live countdown to next expected proc' },
  ];

  headers.forEach(({ text, tooltip }) => {
    const th = document.createElement('th');
    th.textContent = text;
    th.title = tooltip;
    th.style.cssText = `
      padding: 10px 12px;
      text-align: left;
      font-weight: 600;
      color: var(--qpm-accent);
      white-space: nowrap;
      border-bottom: 1px solid var(--qpm-border);
      cursor: help;
    `;
    headerRow.appendChild(th);
  });

  // Table body
  const tbody: HTMLTableSectionElement = table.createTBody();
  tbody.className = 'tracker-tbody';

  tableContainer.appendChild(table);
  root.appendChild(tableContainer);

  // Footer with totals
  const footer = document.createElement('div');
  footer.className = 'tracker-footer';
  footer.style.cssText = `
    padding: 12px 16px;
    background: var(--qpm-surface-2);
    border-radius: 6px;
    border: 1px solid var(--qpm-border);
    font-size: 13px;
    font-weight: 600;
    color: var(--qpm-accent);
  `;
  footer.textContent = 'Total: Loading...';
  root.appendChild(footer);

  // Store references for updates
  const trackerState = {
    root,
    summaryText,
    tbody,
    footer,
    abilityCheckboxGrid,
    updateInterval: null as number | null,
  };

  // Subscribe to pet updates
  onActivePetInfos((infos) => {
    modalLatestInfos = infos;
    modalLatestAnalysis = analyzeActivePetAbilities(infos);
    updateTrackerWindow(trackerState);
  });

  // Initial render
  updateTrackerWindow(trackerState);

  // Auto-update every second for live countdowns
  trackerState.updateInterval = window.setInterval(() => {
    updateTrackerWindowCountdowns(trackerState.tbody);
  }, 1000);

  // Cleanup on window close
  const observer = new MutationObserver(() => {
    if (!document.body.contains(root)) {
      if (trackerState.updateInterval !== null) {
        clearInterval(trackerState.updateInterval);
      }
      observer.disconnect();
      log('Tracker window cleanup: interval cleared');
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  log('Trackers window rendered with live updates');
}

/**
 * Update ability filter checkboxes based on available abilities
 */
function updateAbilityFilterCheckboxes(container: HTMLElement, analysis: AbilityAnalysis): void {
  // Get unique abilities from analysis
  const abilities = analysis.groups.map((g) => ({
    id: g.definition.id,
    name: g.definition.name,
    count: g.entries.length,
  }));

  // Only update if abilities have changed
  const currentAbilityIds = abilities.map((a) => a.id).sort().join(',');
  const previousAbilityIds = container.dataset.abilityIds || '';

  if (currentAbilityIds === previousAbilityIds && container.children.length > 0) {
    return; // No changes, skip update
  }

  container.dataset.abilityIds = currentAbilityIds;
  container.innerHTML = '';

  if (abilities.length === 0) {
    const emptyText = document.createElement('div');
    emptyText.textContent = 'No abilities available';
    emptyText.style.cssText = 'padding: 8px; color: rgba(255, 255, 255, 0.5); font-size: 11px;';
    container.appendChild(emptyText);
    return;
  }

  // Create dropdown select
  const selectWrapper = document.createElement('div');
  selectWrapper.style.cssText = 'display: flex; align-items: center; gap: 8px;';

  const label = document.createElement('span');
  label.textContent = 'Filter Ability:';
  label.style.cssText = 'font-size: 12px; color: var(--qpm-text-muted);';
  selectWrapper.appendChild(label);

  const select = document.createElement('select');
  select.className = 'qpm-select';
  select.style.cssText = 'flex: 1; min-width: 200px; padding: 6px 8px; font-size: 12px;';

  // Add "All abilities" option
  const allOption = document.createElement('option');
  allOption.value = '';
  allOption.textContent = 'All abilities';
  select.appendChild(allOption);

  // Add option for each ability
  abilities.forEach(({ id, name, count }) => {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = `${name} (${count})`;
    select.appendChild(option);
  });

  // Set current value
  if (currentTrackerSettings.selectedAbilities.length === 1) {
    select.value = currentTrackerSettings.selectedAbilities[0] || '';
  } else {
    select.value = '';
  }

  // Handle selection change
  select.addEventListener('change', () => {
    if (select.value === '') {
      // Show all abilities
      currentTrackerSettings.selectedAbilities = [];
    } else {
      // Show only selected ability
      currentTrackerSettings.selectedAbilities = [select.value];
    }
    storage.set('qpm-tracker-settings', currentTrackerSettings);
    updateTrackerWindow({
      summaryText: container.closest('.qpm-modal-window')?.querySelector('.tracker-summary') as HTMLElement,
      tbody: container.closest('.qpm-modal-window')?.querySelector('.tracker-tbody') as HTMLTableSectionElement,
      footer: container.closest('.qpm-modal-window')?.querySelector('.tracker-footer') as HTMLElement,
      abilityCheckboxGrid: container,
    });
  });

  selectWrapper.appendChild(select);
  container.appendChild(selectWrapper);
}

/**
 * Update tracker window with current pet data
 */
function updateTrackerWindow(state: {
  summaryText: HTMLElement;
  tbody: HTMLTableSectionElement;
  footer: HTMLElement;
  abilityCheckboxGrid: HTMLElement;
}): void {
  const analysis = modalLatestAnalysis;
  const infos = modalLatestInfos;

  // Update ability filter checkboxes
  updateAbilityFilterCheckboxes(state.abilityCheckboxGrid, analysis);

  // Save baseline timestamps for estimated countdowns before clearing
  const savedBaselines = new Map<string, number>();
  const savedGroupBaselines = new Map<string, number>();
  const countdownCells = state.tbody.querySelectorAll('.eta-countdown[data-is-estimate="true"]');
  countdownCells.forEach((cell) => {
    if (!(cell instanceof HTMLElement)) return;
    const lastProc = cell.dataset.lastProc;
    const row = cell.closest('tr');
    const petIndex = row?.dataset.petIndex;
    const abilityId = row?.dataset.abilityId;
    const isGroupRow = row?.dataset.isGroupRow === 'true';

    if (lastProc && abilityId) {
      if (isGroupRow) {
        // Group total row
        const key = `group:${abilityId}`;
        savedGroupBaselines.set(key, parseInt(lastProc, 10));
      } else if (petIndex !== undefined) {
        // Individual ability row
        const key = `${petIndex}:${abilityId}`;
        savedBaselines.set(key, parseInt(lastProc, 10));
      }
    }
  });

  // Clear table
  state.tbody.innerHTML = '';

  if (analysis.groups.length === 0) {
    const emptyRow = state.tbody.insertRow();
    const emptyCell = emptyRow.insertCell();
    emptyCell.colSpan = 7;
    emptyCell.style.cssText = 'padding: 40px; text-align: center; color: rgba(255, 255, 255, 0.5);';
    emptyCell.innerHTML = `
      <div style="font-size: 48px; margin-bottom: 12px;">🐢</div>
      <div style="font-size: 14px; font-weight: 600; margin-bottom: 6px;">No Active Pet Abilities</div>
      <div style="font-size: 12px; opacity: 0.7;">Make sure pets are active and assigned in your garden</div>
    `;
    state.footer.textContent = '📊 Total: No data';
    state.summaryText.textContent = '🐾 No Active Pets';
    return;
  }

  // Apply filters from settings
  let filteredGroups = analysis.groups;

  // Filter by coin-only
  if (currentTrackerSettings.filterCoinOnly) {
    filteredGroups = filteredGroups.filter((g) => g.definition.effectUnit === 'coins' || g.definition.category === 'coins');
  }

  // Filter by selected abilities
  if (currentTrackerSettings.selectedAbilities.length > 0) {
    filteredGroups = filteredGroups.filter((g) => currentTrackerSettings.selectedAbilities.includes(g.definition.id));
  }

  // Update summary with more detail
  const activePets = infos.length;
  const totalAbilities = analysis.groups.length;
  const filteredAbilities = filteredGroups.length;
  const coinAbilitiesCount = filteredGroups.filter((g) => g.definition.effectUnit === 'coins' || g.definition.category === 'coins').length;

  let summaryParts = [`🐾 ${activePets} Active Pet${activePets !== 1 ? 's' : ''}`];

  if (currentTrackerSettings.filterCoinOnly || currentTrackerSettings.selectedAbilities.length > 0) {
    summaryParts.push(`📊 ${filteredAbilities}/${totalAbilities} Abilities (filtered)`);
  } else {
    summaryParts.push(`📊 ${totalAbilities} Abilit${totalAbilities !== 1 ? 'ies' : 'y'}`);
  }

  if (coinAbilitiesCount > 0) {
    summaryParts.push(`💰 ${coinAbilitiesCount} Coin-Generating`);
  }

  state.summaryText.textContent = summaryParts.join(' • ');

  let totalProcsPerHour = 0;
  let totalChancePerMinute = 0;
  let totalCoinsPerHour = 0;
  let rowCount = 0;

  // Check if filters resulted in no matches
  if (filteredGroups.length === 0) {
    const emptyRow = state.tbody.insertRow();
    const emptyCell = emptyRow.insertCell();
    emptyCell.colSpan = 7;
    emptyCell.style.cssText = 'padding: 40px; text-align: center; color: rgba(255, 255, 255, 0.5);';
    emptyCell.innerHTML = `
      <div style="font-size: 48px; margin-bottom: 12px;">🔍</div>
      <div style="font-size: 14px; font-weight: 600; margin-bottom: 6px;">No Abilities Match Filter</div>
      <div style="font-size: 12px; opacity: 0.7;">Try adjusting your filter settings above</div>
    `;
    state.footer.innerHTML = `<strong>📊 Total:</strong> 0 abilities (filtered)`;
    return;
  }

  // Render each ability group (prioritize coin-generating, then show others)
  const coinAbilities = filteredGroups.filter((g) => g.definition.effectUnit === 'coins' || g.definition.category === 'coins');
  const otherAbilities = filteredGroups.filter((g) => g.definition.effectUnit !== 'coins' && g.definition.category !== 'coins');

  [...coinAbilities, ...otherAbilities].forEach((group) => {
    for (const entry of group.entries) {
      createAbilityRow(entry, group.definition.name, state.tbody, currentTrackerSettings.detailedView, savedBaselines);

      // Calculate effective rates (accounting for Rainbow/Gold waste)
      const { effective: effectiveProcsPerHour } = calculateEffectiveProcRate(entry.procsPerHour, entry.definition.id);
      const effectiveCoinsPerHour = effectiveProcsPerHour * (entry.effectPerProc ?? 0);

      totalProcsPerHour += effectiveProcsPerHour;
      totalChancePerMinute += entry.chancePerMinute;
      // Include all abilities with coin effects, not just those in 'coins' category
      if ((group.definition.effectUnit === 'coins' || group.definition.category === 'coins') && entry.effectPerProc && entry.effectPerProc > 0) {
        totalCoinsPerHour += effectiveCoinsPerHour;
      }
      rowCount++;
    }

    // Add total row for this group if it has 2+ pets
    createAbilityGroupTotalRow(group, state.tbody, currentTrackerSettings.detailedView, savedGroupBaselines);
  });

  // Totals row
  if (rowCount > 0) {
    const totalRow = state.tbody.insertRow();
    totalRow.style.cssText = `
      background: var(--qpm-surface-2);
      border-top: 2px solid var(--qpm-border);
      font-weight: 600;
      position: sticky;
      bottom: 0;
      z-index: 5;
    `;

    const totalLabelCell = totalRow.insertCell();
    totalLabelCell.textContent = '📊 TOTAL';
    totalLabelCell.colSpan = 2;
    totalLabelCell.style.cssText = 'padding: 12px; color: var(--qpm-accent); font-weight: 700; font-size: 13px; text-transform: uppercase;';

    const totalChanceCell = totalRow.insertCell();
    totalChanceCell.textContent = `${totalChancePerMinute.toFixed(2)}%/min`;
    totalChanceCell.style.cssText = 'padding: 12px; text-align: right; color: var(--qpm-accent); font-family: monospace;';

    const totalProcsCell = totalRow.insertCell();
    totalProcsCell.textContent = totalProcsPerHour.toFixed(2);
    totalProcsCell.style.cssText = 'padding: 12px; text-align: right; color: var(--qpm-accent); font-family: monospace;';

    const totalCoinsPerProcCell = totalRow.insertCell();
    totalCoinsPerProcCell.textContent = '—';
    totalCoinsPerProcCell.style.cssText = 'padding: 12px; text-align: right; color: rgba(255, 255, 255, 0.5);';

    const totalCoinsPerHourCell = totalRow.insertCell();
    totalCoinsPerHourCell.textContent = formatCoins(totalCoinsPerHour);
    totalCoinsPerHourCell.style.cssText = 'padding: 12px; text-align: right; color: #ffa500; font-family: monospace; font-weight: 700; font-size: 14px;';

    const totalEtaCell = totalRow.insertCell();
    totalEtaCell.textContent = '—';
    totalEtaCell.style.cssText = 'padding: 12px; text-align: right; color: rgba(255, 255, 255, 0.5);';

    // Update footer
    const coinAbilityCount = coinAbilities.reduce((sum, g) => sum + g.entries.length, 0);
    const footerParts = [`<strong>📊 Total:</strong> ${rowCount} abilit${rowCount !== 1 ? 'ies' : 'y'}`];

    // Calculate total session earnings from coin ability events
    if (coinAbilityCount > 0) {
      let sessionEarnings = 0;
      for (const group of coinAbilities) {
        for (const entry of group.entries) {
          // Get recent events for this ability
          const history = findAbilityHistoryForIdentifiers(group.definition.id, {
            petId: entry.pet.petId,
            slotId: entry.pet.slotId,
            slotIndex: typeof entry.pet.slotIndex === 'number' && Number.isFinite(entry.pet.slotIndex) ? entry.pet.slotIndex : null,
            fallbackKeys: [],
          });
          if (history) {
            const recent = getRecentAbilityEvents(history);
            for (const event of recent) {
              const effect = extractAbilityEventEffect(group.definition, event);
              if (effect != null && Number.isFinite(effect) && effect > 0) {
                sessionEarnings += effect;
              }
            }
          }
        }
      }
      if (sessionEarnings > 0) {
        footerParts.push(`<span style="color: #ffd700;">💰 ${formatCoins(sessionEarnings)} earned</span>`);
      } else {
        footerParts.push(`<span style="color: #ffd700;">💰 ${coinAbilityCount} coin</span>`);
      }
    }

    if (totalCoinsPerHour > 0) {
      footerParts.push(`<span style="color: #ffa500; font-size: 14px; font-weight: 700;">💸 ${formatCoins(totalCoinsPerHour)}/hr</span>`);
    }

    if (totalProcsPerHour > 0) {
      footerParts.push(`<span style="color: var(--qpm-accent); font-size: 12px;">⚡ ${totalProcsPerHour.toFixed(1)} procs/hr</span>`);
    }

    state.footer.innerHTML = footerParts.join(' • ');
  }
}

/**
 * Update only the countdown cells (called every second)
 */
function updateTrackerWindowCountdowns(tbody: HTMLTableSectionElement): void {
  const countdownCells = tbody.querySelectorAll('.eta-countdown');
  countdownCells.forEach((cell) => {
    if (!(cell instanceof HTMLElement)) return;

    const lastProc = parseInt(cell.dataset.lastProc || '0', 10);
    const effectiveRate = parseFloat(cell.dataset.effectiveRate || '0');
    const normalColor = cell.dataset.normalColor || 'var(--qpm-positive)';

    // Only update cells with actual proc history (have data attributes)
    if (!lastProc || !effectiveRate || lastProc === 0 || effectiveRate === 0) {
      return;
    }

    const expectedMinutesBetween = effectiveRate > 0 ? 60 / effectiveRate : null;
    const etaResult = calculateLiveETA(lastProc, expectedMinutesBetween, effectiveRate);
    cell.textContent = etaResult.text;
    cell.style.color = etaResult.isOverdue ? 'var(--qpm-danger)' : normalColor;
  });
}

/**
 * Render function for the turtle timer modal window
 */
function renderTurtleTimerWindow(root: HTMLElement): void {
  root.style.cssText = 'display: flex; flex-direction: column; gap: 16px; min-width: 600px;';

  const turtleSection = createTurtleTimerSection();
  turtleSection.style.margin = '0';
  root.appendChild(turtleSection);
}

/**
 * Render function for the shop history modal window
 */
async function renderShopHistoryWindow(root: HTMLElement): Promise<void> {
  root.style.cssText = 'display: flex; flex-direction: column; gap: 12px; min-width: 800px; max-width: 1000px;';

  const { getStatsSnapshot } = await import('../store/stats');
  const stats = getStatsSnapshot();

  // Header with summary
  const header = document.createElement('div');
  header.style.cssText = 'display: flex; justify-content: space-between; align-items: flex-start; padding: 12px 16px; background: linear-gradient(135deg, rgba(255, 152, 0, 0.15), rgba(255, 152, 0, 0.05)); border-radius: 8px; border: 1px solid rgba(255, 152, 0, 0.3);';

  const summaryLeft = document.createElement('div');
  summaryLeft.style.cssText = 'display: flex; flex-direction: column; gap: 6px;';

  const totalPurchasesRow = document.createElement('div');
  totalPurchasesRow.style.cssText = 'font-size: 13px; font-weight: 600; color: #4CAF50;';
  totalPurchasesRow.textContent = `✅ Total Purchases: ${stats.shop.totalPurchases}`;
  summaryLeft.appendChild(totalPurchasesRow);

  const totalFailuresRow = document.createElement('div');
  totalFailuresRow.style.cssText = 'font-size: 13px; font-weight: 600; color: #ef5350;';
  totalFailuresRow.textContent = `❌ Total Failures: ${stats.shop.totalFailures || 0}`;
  summaryLeft.appendChild(totalFailuresRow);

  const summaryRight = document.createElement('div');
  summaryRight.style.cssText = 'display: flex; flex-direction: column; gap: 4px; text-align: right;';

  const coinsRow = document.createElement('div');
  coinsRow.style.cssText = 'font-size: 12px; color: #FFD700;';
  coinsRow.textContent = `💰 ${stats.shop.totalSpentCoins.toLocaleString()} coins spent`;
  summaryRight.appendChild(coinsRow);

  if (stats.shop.totalSpentCredits > 0) {
    const creditsRow = document.createElement('div');
    creditsRow.style.cssText = 'font-size: 12px; color: #64B5F6;';
    creditsRow.textContent = `💎 ${stats.shop.totalSpentCredits.toLocaleString()} credits spent`;
    summaryRight.appendChild(creditsRow);
  }

  header.append(summaryLeft, summaryRight);
  root.appendChild(header);

  // Category breakdown
  const categoryBreakdown = document.createElement('div');
  categoryBreakdown.style.cssText = 'display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;';

  const categories: Array<{ key: ShopCategoryKey; icon: string; label: string }> = [
    { key: 'seeds', icon: '🌱', label: 'Seeds' },
    { key: 'eggs', icon: '🥚', label: 'Eggs' },
    { key: 'tools', icon: '🔧', label: 'Tools' },
    { key: 'decor', icon: '🎨', label: 'Decor' },
  ];

  for (const cat of categories) {
    const catCard = document.createElement('div');
    catCard.style.cssText = 'padding: 8px; background: rgba(255, 255, 255, 0.05); border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.1);';

    const catHeader = document.createElement('div');
    catHeader.style.cssText = 'font-size: 11px; font-weight: 600; color: #ccc; margin-bottom: 4px;';
    catHeader.textContent = `${cat.icon} ${cat.label}`;

    const catPurchases = document.createElement('div');
    catPurchases.style.cssText = 'font-size: 10px; color: #4CAF50;';
    catPurchases.textContent = `✓ ${stats.shop.purchasesByCategory[cat.key] || 0} purchases`;

    const catFailures = document.createElement('div');
    catFailures.style.cssText = 'font-size: 10px; color: #ef5350;';
    catFailures.textContent = `✗ ${stats.shop.failuresByCategory?.[cat.key] || 0} failures`;

    catCard.append(catHeader, catPurchases, catFailures);
    categoryBreakdown.appendChild(catCard);
  }
  root.appendChild(categoryBreakdown);

  // History table with toggle for full history
  const historySection = document.createElement('div');
  historySection.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

  // Header row with title and toggle button
  const historyHeaderRow = document.createElement('div');
  historyHeaderRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding-bottom: 4px; border-bottom: 2px solid rgba(255, 152, 0, 0.3);';

  const historyHeader = document.createElement('div');
  historyHeader.style.cssText = 'font-size: 13px; font-weight: 700; color: #FF9800;';
  historyHeader.textContent = 'Recent Purchase History';

  // Toggle button for full history
  let showFullHistory = false;
  const toggleButton = document.createElement('button');
  toggleButton.style.cssText = 'padding: 4px 12px; font-size: 11px; font-weight: 600; background: rgba(255, 152, 0, 0.2); color: #FF9800; border: 1px solid rgba(255, 152, 0, 0.4); border-radius: 4px; cursor: pointer; transition: all 0.2s;';
  toggleButton.textContent = 'Show Full History';
  toggleButton.onmouseover = () => {
    toggleButton.style.background = 'rgba(255, 152, 0, 0.3)';
    toggleButton.style.borderColor = 'rgba(255, 152, 0, 0.6)';
  };
  toggleButton.onmouseout = () => {
    toggleButton.style.background = 'rgba(255, 152, 0, 0.2)';
    toggleButton.style.borderColor = 'rgba(255, 152, 0, 0.4)';
  };

  historyHeaderRow.append(historyHeader, toggleButton);
  historySection.appendChild(historyHeaderRow);

  const historyList = document.createElement('div');
  historyList.style.cssText = 'display: flex; flex-direction: column; gap: 6px; max-height: 400px; overflow-y: auto; padding-right: 8px;';

  function renderHistoryEntries() {
    // Clear existing entries
    historyList.innerHTML = '';

    if (!stats.shop.history || stats.shop.history.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.style.cssText = 'font-size: 11px; color: #888; font-style: italic; padding: 16px; text-align: center;';
      emptyMsg.textContent = 'No purchase history yet.';
      historyList.appendChild(emptyMsg);
      return;
    }

    // Show history in reverse order (most recent first)
    const sortedHistory = [...stats.shop.history].reverse();
    const displayHistory = showFullHistory ? sortedHistory : sortedHistory.slice(0, 12);

    for (const entry of displayHistory) {
      const entryCard = document.createElement('div');
      entryCard.style.cssText = `
        padding: 10px;
        background: ${entry.success ? 'rgba(76, 175, 80, 0.08)' : 'rgba(239, 83, 80, 0.08)'};
        border-left: 3px solid ${entry.success ? '#4CAF50' : '#ef5350'};
        border-radius: 4px;
        font-size: 11px;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
      `;

      const entryLeft = document.createElement('div');
      entryLeft.style.cssText = 'flex: 1; display: flex; flex-direction: column; gap: 4px;';

      const itemRow = document.createElement('div');
      itemRow.style.cssText = 'font-weight: 600; color: #fff;';
      const statusIcon = entry.success ? '✅' : '❌';
      const categoryIcons: Record<string, string> = { seeds: '🌱', eggs: '🥚', tools: '🔧', decor: '🎨' };
      itemRow.textContent = `${statusIcon} ${categoryIcons[entry.category] || ''} ${entry.itemName}`;

      const detailRow = document.createElement('div');
      detailRow.style.cssText = 'color: #bbb; font-size: 10px;';
      if (entry.success) {
        const parts = [`×${entry.count}`];
        if (entry.coins > 0) parts.push(`💰 ${entry.coins.toLocaleString()} coins`);
        if (entry.credits > 0) parts.push(`💎 ${entry.credits.toLocaleString()} credits`);
        detailRow.textContent = parts.join(' • ');
      } else {
        detailRow.textContent = `Reason: ${entry.failureReason || 'Unknown'}`;
        detailRow.style.color = '#ff8a80';
      }

      entryLeft.append(itemRow, detailRow);

      const entryRight = document.createElement('div');
      entryRight.style.cssText = 'text-align: right; font-size: 10px; color: #888;';
      const date = new Date(entry.timestamp);
      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const dateStr = date.toLocaleDateString();
      entryRight.textContent = `${timeStr}\n${dateStr}`;
      entryRight.style.whiteSpace = 'pre-line';

      entryCard.append(entryLeft, entryRight);
      historyList.appendChild(entryCard);
    }

    // Update header to show count when in full history mode
    if (showFullHistory && sortedHistory.length > 12) {
      historyHeader.textContent = `Full Purchase History (${sortedHistory.length} entries)`;
    } else {
      historyHeader.textContent = 'Recent Purchase History';
    }
  }

  // Toggle button click handler
  toggleButton.onclick = () => {
    showFullHistory = !showFullHistory;
    toggleButton.textContent = showFullHistory ? 'Show Recent Only' : 'Show Full History';
    renderHistoryEntries();
  };

  // Initial render
  renderHistoryEntries();

  historySection.appendChild(historyList);
  root.appendChild(historySection);
}

/**
 * Render function for the reminders modal window
 */
function renderRemindersWindow(root: HTMLElement): void{
  root.style.cssText = 'display: flex; flex-direction: column; gap: 16px; min-width: 600px;';

  const mutationSection = createMutationSection();
  mutationSection.style.margin = '0';
  root.appendChild(mutationSection);
}

/**
 * Render function for the locker modal window
 */
function renderLockerWindow(root: HTMLElement): void {
  root.style.cssText = 'display: flex; flex-direction: column; gap: 16px; min-width: 600px;';

  const syncMode = getCropLockConfig().syncModeEnabled !== false;

  const lockerSection = createInventoryLockerSection(syncMode);
  lockerSection.style.margin = '0';
  root.appendChild(lockerSection);
}

function createInventoryLockerSection(initialSyncMode: boolean): HTMLElement {
  const statusChip = document.createElement('span');
  statusChip.className = 'qpm-chip';
  statusChip.textContent = initialSyncMode ? 'Sync Mode' : 'Basic Mode';

  const { root, body } = createCard('🔒 Inventory Locker', {
    collapsible: true,
    startCollapsed: true,
    subtitleElement: statusChip,
  });
  root.dataset.qpmSection = 'inventory-locker';

  const status = document.createElement('div');
  status.className = 'qpm-section-muted';
  status.style.marginBottom = '8px';

  const updateStatus = (enabled: boolean) => {
    status.textContent = enabled
      ? 'Unlock keeps manual favorites; only locker-added favorites are removed.'
      : 'Unlock toggles every favorite for the selected crop species.';
    statusChip.textContent = enabled ? 'Sync Mode' : 'Basic Mode';
  };

  updateStatus(initialSyncMode);
  body.appendChild(status);

  const infoBox = document.createElement('div');
  infoBox.innerHTML = '💡 <strong>How it works:</strong><br>• Open inventory to lock species<br>• Locked species are favorited automatically<br>• Sync mode preserves manual favorites<br>• Basic mode toggles all favorites';
  infoBox.style.cssText = 'background:#333;padding:8px;border-radius:4px;margin-bottom:8px;font-size:10px;line-height:1.5;border-left:3px solid #FFCA28';
  body.appendChild(infoBox);

  const syncToggle = createCheckboxOption('Sync mode (preserve manual favorites)', initialSyncMode, (checked) => {
    if (!cfg.inventoryLocker) {
      cfg.inventoryLocker = { syncMode: checked };
    } else {
      cfg.inventoryLocker.syncMode = checked;
    }
    setCropLockSyncMode(checked);
    saveCfg();
    updateStatus(checked);
    showToast(checked ? 'Inventory locker sync mode enabled' : 'Inventory locker sync mode disabled');
  });
  body.appendChild(syncToggle);

  const helper = document.createElement('div');
  helper.textContent = 'Tip: open inventory to lock species. Sync mode avoids unfavoriting crops you already starred.';
  helper.style.cssText = 'font-size:10px;color:#A5D6A7;line-height:1.4;margin-top:8px;';
  body.appendChild(helper);

  return root;
}

function createMutationSection(): HTMLElement {
  const statusChip = document.createElement('span');
  statusChip.className = 'qpm-chip';
  statusChip.textContent = cfg.mutationReminder?.enabled ? 'Enabled' : 'Disabled';

  const { root, body } = createCard('🧬 Mutation Reminder', {
    collapsible: true,
    startCollapsed: true,
    subtitleElement: statusChip,
  });
  root.dataset.qpmSection = 'mutation-reminder';

  const mStatus = document.createElement('div');
  mStatus.textContent = 'Monitoring weather...';
  mStatus.className = 'qpm-section-muted';
  body.appendChild(mStatus);

  const infoBox = document.createElement('div');
  infoBox.innerHTML = '💡 <strong>How it works:</strong><br>• Detects weather events (Rain/Snow/Dawn/Amber)<br>• Scans your plant inventory for mutations (F/W/C/D/A)<br>• Notifies which plants to place for mutations<br>• Example: Wet plant + Snow → Frozen mutation!';
  infoBox.style.cssText = 'background:#333;padding:8px;border-radius:4px;font-size:10px;line-height:1.5;border-left:3px solid #9C27B0';
  body.appendChild(infoBox);

  const mToggle = btn(cfg.mutationReminder?.enabled ? '✓ Reminders Enabled' : '✗ Reminders Disabled', async () => {
    if (!cfg.mutationReminder) return;
    cfg.mutationReminder.enabled = !cfg.mutationReminder.enabled;
    mToggle.textContent = cfg.mutationReminder.enabled ? '✓ Reminders Enabled' : '✗ Reminders Disabled';
    mToggle.classList.toggle('qpm-button--positive', cfg.mutationReminder.enabled);
    mToggle.classList.toggle('qpm-button--accent', cfg.mutationReminder.enabled);
    statusChip.textContent = cfg.mutationReminder.enabled ? 'Enabled' : 'Disabled';
    saveCfg();

    // Actually enable/disable the mutation reminder system
    const { setMutationReminderEnabled } = await import('../features/mutationReminder');
    setMutationReminderEnabled(cfg.mutationReminder.enabled);
  });
  mToggle.style.width = '100%';
  if (cfg.mutationReminder?.enabled) {
    mToggle.classList.add('qpm-button--positive', 'qpm-button--accent');
  }
  body.appendChild(mToggle);

  // Add "Check Now" button
  const checkBtn = btn('🔍 Check Now', async () => {
    checkBtn.disabled = true;
    checkBtn.textContent = '⏳ Checking...';
    try {
      const { checkForMutations } = await import('../features/mutationReminder');
      await checkForMutations();
      checkBtn.textContent = '✅ Done!';
      setTimeout(() => {
        checkBtn.textContent = '🔍 Check Now';
        checkBtn.disabled = false;
      }, 2000);
    } catch (error) {
      checkBtn.textContent = '❌ Error';
      log('Error checking mutations:', error);
      setTimeout(() => {
        checkBtn.textContent = '🔍 Check Now';
        checkBtn.disabled = false;
      }, 2000);
    }
  });
  checkBtn.style.width = '100%';
  checkBtn.style.background = '#9C27B0';
  checkBtn.title = 'Manually check for mutation opportunities';
  body.appendChild(checkBtn);

  // Debug: Weather simulator buttons
  const debugSection = document.createElement('div');
  debugSection.style.cssText = 'margin-top:8px;padding:8px;background:#2a1a3a;border-radius:4px;border:1px dashed #9C27B0';
  
  const debugTitle = document.createElement('div');
  debugTitle.textContent = '🧪 Debug: Simulate Weather';
  debugTitle.style.cssText = 'font-size:10px;color:#aaa;margin-bottom:6px;font-weight:bold';
  
  const weatherButtons = document.createElement('div');
  weatherButtons.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:4px';
  
  const weatherTypes = [
    { emoji: '🌧️', name: 'Rain', type: 'rain' },
    { emoji: '❄️', name: 'Snow', type: 'snow' },
    { emoji: '🌅', name: 'Dawn', type: 'dawn' },
    { emoji: '🌆', name: 'Amber', type: 'amber' },
  ];
  
  for (const weather of weatherTypes) {
    const weatherBtn = btn(`${weather.emoji} ${weather.name}`, async () => {
      weatherBtn.disabled = true;
      try {
        const { simulateWeather } = await import('../features/mutationReminder');
        await simulateWeather(weather.type as any);
        weatherBtn.textContent = `✅ ${weather.name}`;
        setTimeout(() => {
          weatherBtn.textContent = `${weather.emoji} ${weather.name}`;
          weatherBtn.disabled = false;
        }, 2000);
      } catch (error) {
        log('Error simulating weather:', error);
        weatherBtn.textContent = `❌ ${weather.name}`;
        setTimeout(() => {
          weatherBtn.textContent = `${weather.emoji} ${weather.name}`;
          weatherBtn.disabled = false;
        }, 2000);
      }
    });
    weatherBtn.style.cssText = 'padding:4px 8px;font-size:10px;background:#333;border:1px solid #555';
    weatherBtn.title = `Simulate ${weather.name} weather for testing`;
    weatherButtons.appendChild(weatherBtn);
  }
  
  debugSection.append(debugTitle, weatherButtons);
  body.appendChild(debugSection);

  uiState.mutationStatus = mStatus;

  return root;
}

function createCheckboxOption(label: string, checked: boolean, onChange: CheckboxChangeHandler): HTMLElement {
  const wrapper = document.createElement('label');
  wrapper.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:11px;color:#ddd';

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.style.cssText = 'width:14px;height:14px;cursor:pointer';
  input.addEventListener('click', event => event.stopPropagation());
  input.addEventListener('change', () => {
    onChange(input.checked);
  });

  const text = document.createElement('span');
  text.textContent = label;
  text.style.cssText = 'flex:1';

  wrapper.append(input, text);
  wrapper.addEventListener('click', event => event.stopPropagation());
  return wrapper;
}

function createNumberOption(label: string, value: number, config: NumberOptionConfig): HTMLElement {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:11px;color:#ddd';

  const text = document.createElement('span');
  text.textContent = label;
  text.style.cssText = 'flex:1';

  const input = document.createElement('input');
  input.type = 'number';
  if (config.min != null) input.min = String(config.min);
  if (config.max != null) input.max = String(config.max);
  if (config.step != null) input.step = String(config.step);
  input.value = String(value);
  input.style.cssText = 'width:70px;padding:3px 6px;border:1px solid #555;background:#333;color:#fff;border-radius:4px';
  input.addEventListener('keydown', event => event.stopPropagation());
  input.addEventListener('click', event => event.stopPropagation());
  input.addEventListener('input', () => {
    const parsed = parseFloat(input.value);
    if (Number.isNaN(parsed)) return;
    const result = config.onChange(parsed);
    if (typeof result === 'number' && !Number.isNaN(result) && result !== parsed) {
      input.value = String(result);
    }
  });

  row.append(text, input);

  if (config.suffix) {
    const suffix = document.createElement('span');
    suffix.textContent = config.suffix;
    suffix.style.cssText = 'color:#aaa;font-size:10px';
    row.appendChild(suffix);
  }

  row.addEventListener('click', event => event.stopPropagation());
  return row;
}

function showToast(message: string): void {
  ensureToastStyle();
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#2e7d32;color:#fff;padding:8px 12px;border-radius:6px;font-size:12px;z-index:2147483647;opacity:0.95;animation:qpm-toast-in 0.3s ease';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

function ensureToastStyle(): void {
  if (document.getElementById(TOAST_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = TOAST_STYLE_ID;
  style.textContent = '@keyframes qpm-toast-in { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 0.95; } }';
  document.head.appendChild(style);
}

function btn(text: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = text;
  b.style.cssText = 'padding:6px 10px;font-size:12px;cursor:pointer;border:none;border-radius:4px;background:#555;color:#fff;transition:background 0.2s';
  
  b.onmouseover = () => {
    if (!b.disabled) b.style.background = '#777';
  };
  
  b.onmouseout = () => {
    if (b.disabled) return;
    if (b.textContent?.includes('✓')) b.style.background = '#4CAF50';
    else b.style.background = '#555';
  };
  
  b.onclick = onClick;
  return b;
}

// Update functions
export function updateUIStatus(text: string): void {
  if (uiState.status) uiState.status.textContent = text;
  updateDashboardFeedDisplay(text);
}

export function updateWeatherUI(text: string): void {
  if (uiState.weatherStatus) uiState.weatherStatus.textContent = `Current: ${text}`;
}

export function updateShopStatus(text: string): void {
  if (uiState.shopStatus) uiState.shopStatus.textContent = text;
}

export function updateFeedCount(count: number): void {
  feedCount = count;
  refreshHeaderStats();
}

export function updateWeatherCheckCount(count: number): void {
  weatherCheckCount = count;
  refreshHeaderStats();
}

export function updateShopBuyCount(count: number): void {
  shopBuyCount = count;
  refreshHeaderStats();
}

export function setCfg(newCfg: any): void {
  cfg = newCfg;
}

function saveCfg(): void {
  try {
    localStorage.setItem('quinoa-pet-manager', JSON.stringify(cfg));
  } catch {}
}
