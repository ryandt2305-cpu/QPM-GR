import { addStyle } from '../utils/dom';
import { visibleInterval } from '../utils/timerManager';
import { getAtomByLabel, readAtomValue, subscribeAtom, writeAtomValue } from '../core/jotaiBridge';
import { storage } from '../utils/storage';
import { log } from '../utils/logger';
import {
  getAllEggTypes,
  getAllPetSpecies,
  getAllPlantSpecies,
  getEggType,
  getPetSpecies,
  getPlantSpecies,
} from '../catalogs/gameCatalogs';
import {
  getAnySpriteDataUrl,
  getCropSpriteDataUrlWithMutations,
  getPetSpriteDataUrlWithMutations,
  getProduceSpriteDataUrlWithMutations,
} from '../sprite-v2/compat';

type UnknownRecord = Record<string, unknown>;

type ActivityLogEntry = {
  timestamp: number;
  action?: string | null;
  parameters?: unknown;
  [key: string]: unknown;
};

type ActionKey =
  | 'all'
  | 'found'
  | 'buy'
  | 'sell'
  | 'harvest'
  | 'plant'
  | 'feed'
  | 'hatch'
  | 'water'
  | 'coinFinder'
  | 'seedFinder'
  | 'double'
  | 'eggGrowth'
  | 'plantGrowth'
  | 'granter'
  | 'kisser'
  | 'refund'
  | 'boost'
  | 'remove'
  | 'storage'
  | 'travel'
  | 'other'
  | string;

type TypeFilter =
  | 'all'
  | 'purchase'
  | 'sell'
  | 'feed'
  | 'plant'
  | 'harvest'
  | 'hatch'
  | 'boost'
  | 'travel'
  | 'storage'
  | 'other';

type OrderFilter = 'newest' | 'oldest';

interface FilterState {
  action: ActionKey;
  type: TypeFilter;
  order: OrderFilter;
  petSpecies: string;
  plantSpecies: string;
}

interface ModalRef {
  root: HTMLElement;
  content: HTMLElement;
  list: HTMLElement;
}

interface ModalHandles extends ModalRef {
  toolbar: HTMLElement;
  typeSelect: HTMLSelectElement;
  orderSelect: HTMLSelectElement;
  petDropdown: SpeciesDropdownHandle;
  plantDropdown: SpeciesDropdownHandle;
  summary: HTMLElement;
  ariesFilterPresent: boolean;
  scrollHost: HTMLElement;
  scrollTargets: HTMLElement[];
  listObserver: MutationObserver;
  listScrollListener: EventListener;
  listClickCaptureListener: EventListener;
  refreshQueued: boolean;
  refreshTimer: number | null;
  speciesOptionsReady: boolean;
}

interface SpeciesDropdownHandle {
  root: HTMLElement;
  button: HTMLButtonElement;
  menu: HTMLElement;
  setValue(value: string): void;
  getValue(): string;
  setOptions(options: SpeciesDropdownOption[]): void;
  destroy(): void;
}

interface SpeciesDropdownOption {
  value: string;
  label: string;
  iconUrl: string | null;
}

interface RowMetadata {
  row: HTMLElement;
  action: ActionKey;
  type: TypeFilter;
  petFilterKey: string | null;
  plantFilterKey: string | null;
}

const HISTORY_STORAGE_KEY = 'qpm.activityLog.history.v1';
const HISTORY_BACKUP_STORAGE_KEY = 'qpm.activityLog.history.backup.v1';
const HISTORY_META_STORAGE_KEY = 'qpm.activityLog.history.meta.v1';
const FILTER_ACTION_STORAGE_KEY = 'qpm.activityLog.filter.action.v1';
const FILTER_TYPE_STORAGE_KEY = 'qpm.activityLog.filter.type.v1';
const FILTER_ORDER_STORAGE_KEY = 'qpm.activityLog.filter.order.v1';
const FILTER_PET_SPECIES_STORAGE_KEY = 'qpm.activityLog.filter.petSpecies.v1';
const FILTER_PLANT_SPECIES_STORAGE_KEY = 'qpm.activityLog.filter.plantSpecies.v1';
const MIGRATION_STORAGE_KEY = 'qpm.activityLog.migration.v1';
const SUMMARY_DEBUG_STORAGE_KEY = 'qpm.activityLog.debug.summary.v1';
const ARIES_IMPORT_STORAGE_KEY = 'qpm.activityLog.ariesImport.v1';
const ACTIVITY_LOG_ENABLED_STORAGE_KEY = 'qpm.activityLog.enabled.v1';

const LEGACY_STORAGE_KEYS = [
  'qpm.activityLogEnhanced.entries.v3',
  'qpm.activityLogEnhanced.entries.v2',
  'qpm.activityLogEnhanced.entries.v1',
] as const;

const HISTORY_LIMIT = 5000;
const FAST_REPLAY_DELAY_MS = 24;
const VIRTUAL_WINDOW_SIZE = 60;
const VIRTUAL_SCROLL_THROTTLE_MS = 96;
const VIRTUAL_DEFAULT_ROW_HEIGHT = 46;
const VIRTUAL_SPACER_ATTR = 'data-qpm-activity-virtual-spacer';
const VIRTUAL_SPACER_TOP = 'top';
const VIRTUAL_SPACER_BOTTOM = 'bottom';
const VIRTUAL_HIDDEN_LOAD_ATTR = 'data-qpm-activity-virtual-hidden-load';
const VIRTUAL_CUSTOM_LOAD_ATTR = 'data-qpm-activity-virtual-load-button';
const VIRTUAL_HYDRATE_CHUNK_MIN = 8;
const VIRTUAL_HYDRATE_CHUNK_MAX = 40;
const VIRTUAL_HYDRATE_NEAR_BOTTOM_PX = 260;
const LARGE_LIST_REFRESH_THRESHOLD = 450;
const LARGE_LIST_REFRESH_DELAY_MS = 72;
const STYLE_ID = 'qpm-activity-log-native-style';
const TOOLBAR_ATTR = 'data-qpm-activity-toolbar';
const TITLE_SELECTOR = 'p.chakra-text';
const NATIVE_LIST_SELECTOR = 'div.McFlex.css-iek5kf > div.McFlex';

const ACTION_ORDER: ActionKey[] = [
  'all',
  'found',
  'buy',
  'sell',
  'harvest',
  'plant',
  'feed',
  'hatch',
  'water',
  'coinFinder',
  'seedFinder',
  'double',
  'eggGrowth',
  'plantGrowth',
  'granter',
  'kisser',
  'refund',
  'boost',
  'remove',
  'storage',
  'travel',
  'other',
];

const ACTION_LABELS: Record<string, string> = {
  all: 'All',
  found: 'Finds',
  buy: 'Purchases',
  sell: 'Sold',
  harvest: 'Harvests',
  plant: 'Planted',
  feed: 'Feed',
  hatch: 'Hatch',
  water: 'Water',
  coinFinder: 'Coin Finder',
  seedFinder: 'Seed Finder',
  double: 'Double',
  eggGrowth: 'Egg Growth',
  plantGrowth: 'Plant Growth',
  granter: 'Granters',
  kisser: 'Kissers',
  refund: 'Refunds',
  boost: 'Boosts',
  remove: 'Remove',
  storage: 'Storage',
  travel: 'Travel',
  other: 'Other',
};

const ACTION_MAP: Record<string, ActionKey> = {
  purchaseDecor: 'buy',
  purchaseSeed: 'buy',
  purchaseEgg: 'buy',
  purchaseTool: 'buy',
  waterPlant: 'water',
  plantSeed: 'plant',
  plantGardenPlant: 'plant',
  potPlant: 'plant',
  removeGardenObject: 'remove',
  harvest: 'harvest',
  feedPet: 'feed',
  plantEgg: 'hatch',
  hatchEgg: 'hatch',
  instaGrow: 'boost',
  customRestock: 'boost',
  spinSlotMachine: 'boost',
  sellAllCrops: 'sell',
  sellPet: 'sell',
  logItems: 'boost',
  mutationPotion: 'boost',
  ProduceScaleBoost: 'boost',
  ProduceScaleBoostII: 'boost',
  DoubleHarvest: 'double',
  DoubleHatch: 'double',
  ProduceEater: 'boost',
  SellBoostI: 'boost',
  SellBoostII: 'boost',
  SellBoostIII: 'boost',
  SellBoostIV: 'boost',
  ProduceRefund: 'boost',
  PlantGrowthBoost: 'plantGrowth',
  PlantGrowthBoostII: 'plantGrowth',
  SnowyPlantGrowthBoost: 'plantGrowth',
  HungerRestore: 'boost',
  HungerRestoreII: 'boost',
  SnowyHungerRestore: 'boost',
  GoldGranter: 'granter',
  RainbowGranter: 'granter',
  RainDance: 'granter',
  SnowGranter: 'granter',
  FrostGranter: 'granter',
  PetXpBoost: 'boost',
  PetXpBoostII: 'boost',
  SnowyPetXpBoost: 'boost',
  SnowyEggGrowthBoost: 'eggGrowth',
  EggGrowthBoost: 'eggGrowth',
  EggGrowthBoostII_NEW: 'eggGrowth',
  EggGrowthBoostII: 'eggGrowth',
  PetAgeBoost: 'boost',
  PetAgeBoostII: 'boost',
  CoinFinderI: 'coinFinder',
  CoinFinderII: 'coinFinder',
  CoinFinderIII: 'coinFinder',
  SnowyCoinFinder: 'coinFinder',
  SnowyCropSizeBoost: 'boost',
  SnowyHungerBoost: 'boost',
  SeedFinderI: 'seedFinder',
  SeedFinderII: 'seedFinder',
  SeedFinderIII: 'seedFinder',
  SeedFinderIV: 'seedFinder',
  PetHatchSizeBoost: 'boost',
  PetHatchSizeBoostII: 'boost',
  MoonKisser: 'kisser',
  DawnKisser: 'kisser',
  PetRefund: 'refund',
  PetRefundII: 'refund',
};

const ACTION_MAP_LOWER: Record<string, ActionKey> = Object.fromEntries(
  Object.entries(ACTION_MAP).map(([key, value]) => [key.toLowerCase(), value]),
) as Record<string, ActionKey>;

const TYPE_OPTIONS: Array<{ value: TypeFilter; label: string }> = [
  { value: 'all', label: 'Type: All' },
  { value: 'purchase', label: 'Type: Purchase' },
  { value: 'sell', label: 'Type: Sell' },
  { value: 'feed', label: 'Type: Feed' },
  { value: 'plant', label: 'Type: Plant' },
  { value: 'harvest', label: 'Type: Harvest' },
  { value: 'hatch', label: 'Type: Hatch' },
  { value: 'boost', label: 'Type: Boost' },
  { value: 'travel', label: 'Type: Travel' },
  { value: 'storage', label: 'Type: Storage' },
  { value: 'other', label: 'Type: Other' },
];

const ORDER_OPTIONS: Array<{ value: OrderFilter; label: string }> = [
  { value: 'newest', label: 'Order: Newest' },
  { value: 'oldest', label: 'Order: Oldest' },
];

const PATTERNS: Array<{ key: ActionKey; re: RegExp }> = [
  { key: 'found', re: /\bfound\b/i },
  { key: 'buy', re: /\b(bought|purchas(e|ed))\b/i },
  { key: 'sell', re: /\bsold\b/i },
  { key: 'harvest', re: /harvest/i },
  { key: 'water', re: /water(ed)?/i },
  { key: 'plant', re: /planted|potted/i },
  { key: 'feed', re: /\bfed\b/i },
  { key: 'hatch', re: /\bhatched?\b/i },
  { key: 'remove', re: /\b(remove|removed|delete)\b/i },
  { key: 'storage', re: /\b(storage|stored|retrieve|retrieved)\b/i },
  { key: 'travel', re: /\b(travel|teleport)\b/i },
  { key: 'coinFinder', re: /\b(coin\s*finder|coins?\s+found)\b/i },
  { key: 'seedFinder', re: /\b(seed\s*finder|seeds?\s+found)\b/i },
  { key: 'double', re: /\b(double\s+(harvest|hatch)|extra\s+(crop|pet))\b/i },
  { key: 'eggGrowth', re: /\b(egg\s*growth|hatch\s*time|hatch\s*speed)\b/i },
  { key: 'plantGrowth', re: /\b((plant|crop)\s*growth)\b/i },
  { key: 'granter', re: /\b(granter|granted|granting)\b/i },
  { key: 'kisser', re: /\b(kisser|kissed)\b/i },
  { key: 'refund', re: /\b(refund|refunded)\b/i },
  { key: 'boost', re: /\b(boost|potion|growth|restock|spin)\b/i },
];

let started = false;
let history: ActivityLogEntry[] = loadHistory();
let filters: FilterState = loadFilters();
let showSummaryInDebug = loadSummaryDebugPreference();
let enhancerEnabled = loadEnabledPreference();

let modalPollStop: (() => void) | null = null;
let modalSyncTimer: number | null = null;
let modalHandles: ModalHandles | null = null;
let myDataUnsubscribe: (() => void) | null = null;
let lastSnapshot: ActivityLogEntry[] = [];

let replayQueued = false;
let replayInFlight = false;
let suppressIngestUntil = 0;
let writeSupported: boolean | null = null;
let replayMode: 'unknown' | 'write' | 'read_patch' | 'none' = 'unknown';
let replayHydrationTimer: number | null = null;
let replayHydratedCount = 0;
let readPatchMaxEntries: number | null = null;
let readPatchStartIndex = 0;
let readPatchOrder: OrderFilter = 'newest';
let virtualMode: 'collapsed' | 'virtual-expanded' = 'collapsed';
let virtualWindowStart = 0;
let virtualWindowEnd = 0;
let virtualTotalFiltered = 0;
let virtualTopSpacerPx = 0;
let virtualBottomSpacerPx = 0;
let virtualAvgRowHeight = VIRTUAL_DEFAULT_ROW_HEIGHT;
let virtualLastScrollUpdateAt = 0;
let virtualIgnoreScrollUntil = 0;
let virtualFilteredCacheKey = '';
let virtualFilteredCache: ActivityLogEntry[] = [];
let virtualSpacerTopEl: HTMLDivElement | null = null;
let virtualSpacerBottomEl: HTMLDivElement | null = null;
let virtualListLayoutApplied = false;
let virtualListPrevJustifyContent = '';
let virtualListPrevAlignContent = '';
let virtualListPrevAlignItems = '';
let virtualPendingWindowStart: number | null = null;
let virtualPendingReason = '';
let virtualPendingPreserveScroll = false;
let virtualHydratedCount = 0;
let virtualReplayDurationMs = 0;
let virtualLoadMoreButton: HTMLButtonElement | null = null;
let virtualLoadButtonClassName = '';

let patchedMyDataAtom: any | null = null;
let patchedMyDataReadKey: string | null = null;
let patchedMyDataReadOriginal: ((...args: any[]) => unknown) | null = null;

const petIconCache = new Map<string, string | null>();
const plantIconCache = new Map<string, string | null>();
const eggIconCache = new Map<string, string | null>();
let petLookupEntriesCache: SpeciesLookupEntry[] | null = null;
let plantLookupEntriesCache: SpeciesLookupEntry[] | null = null;
let petSpeciesOptionsCache: SpeciesDropdownOption[] | null = null;
let plantSpeciesOptionsCache: SpeciesDropdownOption[] | null = null;
let orderedHistoryCacheKey = '';
let orderedHistoryNewestCache: ActivityLogEntry[] | null = null;
let orderedHistoryOldestCache: ActivityLogEntry[] | null = null;
let historyRevision = 0;
let historyFilterMetaCacheRevision = -1;
const historyFilterMetaCache = new Map<string, {
  action: ActionKey;
  type: TypeFilter;
  petFilterKey: string | null;
  plantFilterKey: string | null;
}>();

function invalidateVirtualCaches(): void {
  virtualFilteredCacheKey = '';
  virtualFilteredCache = [];
  historyFilterMetaCacheRevision = -1;
  historyFilterMetaCache.clear();
}

function resetVirtualMode(): void {
  virtualMode = 'collapsed';
  virtualWindowStart = 0;
  virtualWindowEnd = 0;
  virtualTotalFiltered = 0;
  virtualTopSpacerPx = 0;
  virtualBottomSpacerPx = 0;
  virtualAvgRowHeight = VIRTUAL_DEFAULT_ROW_HEIGHT;
  virtualLastScrollUpdateAt = 0;
  virtualIgnoreScrollUntil = 0;
  readPatchStartIndex = 0;
  readPatchMaxEntries = null;
  virtualSpacerTopEl = null;
  virtualSpacerBottomEl = null;
  virtualListLayoutApplied = false;
  virtualListPrevJustifyContent = '';
  virtualListPrevAlignContent = '';
  virtualListPrevAlignItems = '';
  virtualPendingWindowStart = null;
  virtualPendingReason = '';
  virtualPendingPreserveScroll = false;
  virtualHydratedCount = 0;
  virtualReplayDurationMs = 0;
  virtualLoadMoreButton = null;
  virtualLoadButtonClassName = '';
  invalidateVirtualCaches();
}

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === 'object';
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeToken(value: string): string {
  return normalizeWhitespace(value).toLowerCase();
}

function normalizeSpeciesKey(value: string): string {
  return normalizeToken(value).replace(/[^a-z0-9]/g, '');
}

function titleizeSpecies(value: string): string {
  const cleaned = normalizeWhitespace(value);
  if (!cleaned) return '';
  return cleaned
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeTimestamp(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  if (numeric <= 0) return null;
  if (numeric < 1_000_000_000_000) {
    return Math.round(numeric * 1000);
  }
  return Math.round(numeric);
}

function deepClone<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}

function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();

  const walk = (input: unknown): unknown => {
    if (input === null) return null;
    if (typeof input !== 'object') return input;
    if (seen.has(input as object)) return '__CYCLE__';
    seen.add(input as object);
    if (Array.isArray(input)) {
      return input.map((entry) => walk(entry));
    }
    const out: Record<string, unknown> = {};
    const keys = Object.keys(input as UnknownRecord).sort();
    for (const key of keys) {
      out[key] = walk((input as UnknownRecord)[key]);
    }
    return out;
  };

  try {
    return JSON.stringify(walk(value));
  } catch {
    return '';
  }
}

function findAtomReadKey(atom: any): string | null {
  if (atom && typeof atom.read === 'function') return 'read';
  for (const key of Object.keys(atom || {})) {
    const value = (atom as Record<string, unknown>)[key];
    if (typeof value !== 'function') continue;
    if (key === 'write' || key === 'onMount' || key === 'toString') continue;
    const arity = (value as Function).length;
    if (arity === 1 || arity === 2) {
      return key;
    }
  }
  return null;
}

function extractActivityArray(value: unknown): unknown[] {
  if (!isRecord(value)) return [];

  const state = isRecord(value.state) ? value.state : null;
  const user = isRecord(value.user) ? value.user : null;
  const candidates = [
    value.activityLogs,
    value.activityLog,
    state?.activityLogs,
    state?.activityLog,
    user?.activityLogs,
    user?.activityLog,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }

  return [];
}

function normalizeEntry(raw: unknown): ActivityLogEntry | null {
  if (!isRecord(raw)) return null;
  const timestamp = normalizeTimestamp(
    raw.timestamp
    ?? raw.performedAt
    ?? raw.createdAt
    ?? raw.loggedAt
    ?? raw.time,
  );
  if (!timestamp) return null;

  const action = readString(raw.action) ?? readString(raw.type) ?? readString(raw.event) ?? null;
  const base: ActivityLogEntry = {
    ...raw,
    timestamp,
  };
  if (action) {
    base.action = action;
  }

  const parameters = isRecord(raw.parameters) ? raw.parameters : null;
  if (parameters) {
    const pet = isRecord(parameters.pet) ? parameters.pet : null;
    const petId = readString(parameters.petId) ?? readString(pet?.id);
    if (petId && !readString(parameters.petId)) {
      base.parameters = {
        ...parameters,
        petId,
      };
    }
  }

  return base;
}

function normalizeList(logs: unknown): ActivityLogEntry[] {
  if (!Array.isArray(logs)) return [];
  const out: ActivityLogEntry[] = [];
  for (const entry of logs) {
    const normalized = normalizeEntry(entry);
    if (normalized) out.push(normalized);
  }
  return out;
}

function readEntryMessage(entry: ActivityLogEntry): string {
  const direct = readString(entry.message) ?? readString(entry.text) ?? readString(entry.description);
  if (direct) return direct;
  const parameters = isRecord(entry.parameters) ? entry.parameters : null;
  return readString(parameters?.message) ?? '';
}

function entryIdentity(entry: ActivityLogEntry): string | null {
  const parameters = isRecord(entry.parameters) ? entry.parameters : null;
  const pet = isRecord(parameters?.pet) ? parameters.pet : null;
  const candidates = [
    parameters?.id,
    pet?.id,
    parameters?.petId,
    parameters?.playerId,
    parameters?.userId,
    parameters?.objectId,
    parameters?.slotId,
    parameters?.itemId,
    parameters?.cropId,
    parameters?.seedId,
    parameters?.decorId,
    parameters?.toolId,
    parameters?.targetId,
    parameters?.abilityId,
  ];
  for (const candidate of candidates) {
    const id = readString(candidate);
    if (id) return id;
  }
  return null;
}

function entryKey(entry: ActivityLogEntry): string {
  const ts = normalizeTimestamp(entry.timestamp) ?? 0;
  const action = readString(entry.action) ?? '';
  const identity = entryIdentity(entry);
  const message = normalizeToken(readEntryMessage(entry));
  return `${ts}|${action}|${identity ?? `msg:${message || '__none__'}`}`;
}

function entriesEqual(a: ActivityLogEntry, b: ActivityLogEntry): boolean {
  return stableStringify(a) === stableStringify(b);
}

function isReplaySafeEntry(entry: ActivityLogEntry): boolean {
  const timestamp = normalizeTimestamp(entry.timestamp);
  if (!timestamp) return false;

  const action = readString(entry.action);
  if (!action) return false;

  const parameters = entry.parameters;
  if (!isRecord(parameters)) return false;

  // Legacy migration records are for history/debug only and can crash native row renderers.
  if (parameters.qpmMigrated === true) return false;

  return true;
}

function trimAndSortHistory(entries: ActivityLogEntry[]): ActivityLogEntry[] {
  const sorted = entries
    .slice()
    .sort((a, b) => (a.timestamp - b.timestamp));
  if (sorted.length > HISTORY_LIMIT) {
    sorted.splice(0, sorted.length - HISTORY_LIMIT);
  }
  return sorted;
}

type HistoryEnvelope = {
  version: 1;
  savedAt: number;
  count: number;
  firstTimestamp: number;
  lastTimestamp: number;
  checksum: number;
  entries: ActivityLogEntry[];
};

function computeHistoryChecksum(entries: ActivityLogEntry[]): number {
  let hash = 2166136261 >>> 0;
  for (const entry of entries) {
    const key = entryKey(entry);
    for (let index = 0; index < key.length; index += 1) {
      hash ^= key.charCodeAt(index);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    hash ^= entry.timestamp >>> 0;
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

function buildHistoryEnvelope(entries: ActivityLogEntry[]): HistoryEnvelope {
  const normalized = trimAndSortHistory(entries);
  return {
    version: 1,
    savedAt: Date.now(),
    count: normalized.length,
    firstTimestamp: normalized[0]?.timestamp ?? 0,
    lastTimestamp: normalized[normalized.length - 1]?.timestamp ?? 0,
    checksum: computeHistoryChecksum(normalized),
    entries: normalized,
  };
}

function parseHistoryEnvelope(raw: unknown): HistoryEnvelope | null {
  if (!isRecord(raw)) return null;
  if (Number(raw.version) !== 1) return null;
  if (!Array.isArray(raw.entries)) return null;
  const entries = trimAndSortHistory(normalizeList(raw.entries));
  const count = Number(raw.count);
  const checksum = Number(raw.checksum);
  const firstTimestamp = Number(raw.firstTimestamp);
  const lastTimestamp = Number(raw.lastTimestamp);
  if (!Number.isFinite(count) || count !== entries.length) return null;
  if (!Number.isFinite(firstTimestamp) || firstTimestamp !== (entries[0]?.timestamp ?? 0)) return null;
  if (!Number.isFinite(lastTimestamp) || lastTimestamp !== (entries[entries.length - 1]?.timestamp ?? 0)) return null;
  if (!Number.isFinite(checksum) || checksum !== computeHistoryChecksum(entries)) return null;
  const savedAt = Number(raw.savedAt);
  return {
    version: 1,
    savedAt: Number.isFinite(savedAt) ? savedAt : 0,
    count: entries.length,
    firstTimestamp: entries[0]?.timestamp ?? 0,
    lastTimestamp: entries[entries.length - 1]?.timestamp ?? 0,
    checksum: checksum >>> 0,
    entries,
  };
}

function parseHistorySource(raw: unknown): HistoryEnvelope | null {
  if (Array.isArray(raw)) {
    const entries = trimAndSortHistory(normalizeList(raw));
    return buildHistoryEnvelope(entries);
  }
  return parseHistoryEnvelope(raw);
}

function persistHistoryEnvelope(envelope: HistoryEnvelope): void {
  storage.set(HISTORY_STORAGE_KEY, envelope);
  storage.set(HISTORY_BACKUP_STORAGE_KEY, envelope);
  storage.set(HISTORY_META_STORAGE_KEY, {
    version: envelope.version,
    savedAt: envelope.savedAt,
    count: envelope.count,
    checksum: envelope.checksum,
    firstTimestamp: envelope.firstTimestamp,
    lastTimestamp: envelope.lastTimestamp,
  });
}

function writeHistoryWithBackup(entries: ActivityLogEntry[]): void {
  const envelope = buildHistoryEnvelope(entries);
  history = envelope.entries;
  historyRevision += 1;
  invalidateVirtualCaches();
  persistHistoryEnvelope(envelope);
}

function loadHistory(): ActivityLogEntry[] {
  const primaryRaw = storage.get<unknown>(HISTORY_STORAGE_KEY, null);
  const backupRaw = storage.get<unknown>(HISTORY_BACKUP_STORAGE_KEY, null);
  const primary = parseHistorySource(primaryRaw);
  const backup = parseHistorySource(backupRaw);

  if (primary && backup) {
    const chosen = primary.savedAt >= backup.savedAt ? primary : backup;
    const stale = chosen === primary ? backup : primary;
    if (
      stale.savedAt !== chosen.savedAt
      || stale.count !== chosen.count
      || stale.checksum !== chosen.checksum
    ) {
      persistHistoryEnvelope(chosen);
    }
    return chosen.entries;
  }

  if (primary) {
    persistHistoryEnvelope(primary);
    return primary.entries;
  }

  if (backup) {
    persistHistoryEnvelope(backup);
    return backup.entries;
  }

  const empty = trimAndSortHistory([]);
  persistHistoryEnvelope(buildHistoryEnvelope(empty));
  return empty;
}

function saveHistory(entries: ActivityLogEntry[]): void {
  writeHistoryWithBackup(entries);
}

function tryReadLocalStorageJson(key: string): unknown {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function importAriesHistory(): number {
  const imported = new Map<string, ActivityLogEntry>();

  const collect = (candidate: unknown): void => {
    const entries = normalizeList(candidate);
    for (const entry of entries) {
      imported.set(entryKey(entry), entry);
    }
  };

  const ariesRoot = tryReadLocalStorageJson('aries_mod');
  if (isRecord(ariesRoot)) {
    const activityLog = isRecord(ariesRoot.activityLog) ? ariesRoot.activityLog : null;
    if (activityLog) {
      collect(activityLog.history);
    }
  }

  collect(tryReadLocalStorageJson('activityLog.history'));
  collect(tryReadLocalStorageJson('qws:activityLogs:history:v1'));

  if (!imported.size) return 0;

  const map = new Map<string, ActivityLogEntry>();
  for (const entry of history) {
    map.set(entryKey(entry), entry);
  }

  let mergedCount = 0;
  for (const [key, entry] of imported.entries()) {
    const existing = map.get(key);
    if (!existing || !entriesEqual(existing, entry)) {
      map.set(key, entry);
      mergedCount += 1;
    }
  }

  if (mergedCount > 0) {
    saveHistory(Array.from(map.values()));
  }

  storage.set(ARIES_IMPORT_STORAGE_KEY, {
    lastImportedAt: Date.now(),
    mergedCount,
    candidateCount: imported.size,
    totalHistory: history.length,
  });

  return mergedCount;
}

function normalizeAbilityAction(raw: string): ActionKey | null {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  let key = trimmed.replace(/^Snowy/i, '');
  key = key.replace(/_NEW$/i, '');
  key = key.replace(/(?:[_-]?(?:I|II|III|IV|V|VI|VII|VIII|IX|X)|\d+)$/i, '');
  key = key.replace(/[_-]+$/g, '');
  return key ? (key as ActionKey) : null;
}

function normalizeAction(raw: string): ActionKey {
  const lowered = raw.toLowerCase();
  const mapped = ACTION_MAP[raw];
  const mappedLower = ACTION_MAP_LOWER[lowered];
  const abilityKey = normalizeAbilityAction(raw);
  if (mapped) {
    if (mapped === 'boost' && abilityKey) return abilityKey;
    return mapped;
  }
  if (mappedLower) {
    if (mappedLower === 'boost' && abilityKey) return abilityKey;
    return mappedLower;
  }
  if (abilityKey) return abilityKey;
  for (const { key, re } of PATTERNS) {
    if (re.test(lowered)) return key;
  }
  return lowered || 'other';
}

function inferActionFromMessage(message: string): ActionKey {
  for (const { key, re } of PATTERNS) {
    if (re.test(message)) return key;
  }
  return 'other';
}

function actionToType(action: ActionKey, text: string): TypeFilter {
  switch (action) {
    case 'buy':
      return 'purchase';
    case 'sell':
      return 'sell';
    case 'feed':
      return 'feed';
    case 'plant':
      return 'plant';
    case 'harvest':
      return 'harvest';
    case 'hatch':
      return 'hatch';
    case 'travel':
      return 'travel';
    case 'storage':
      return 'storage';
    case 'water':
    case 'coinFinder':
    case 'seedFinder':
    case 'double':
    case 'eggGrowth':
    case 'plantGrowth':
    case 'granter':
    case 'kisser':
    case 'refund':
    case 'boost':
    case 'remove':
      return 'boost';
    default:
      break;
  }

  if (/\b(travel|teleport)\b/i.test(text)) return 'travel';
  if (/\b(storage|stored|retrieve|retrieved)\b/i.test(text)) return 'storage';
  return 'other';
}

function getEntryElements(list: HTMLElement): HTMLElement[] {
  return Array.from(list.children).filter((child): child is HTMLElement => {
    if (!(child instanceof HTMLElement)) return false;
    if (child.tagName.toLowerCase() === 'button') return false;
    if (child.getAttribute(TOOLBAR_ATTR) === '1') return false;
    const text = child.textContent || '';
    return /\bago\b/i.test(text) || !!child.querySelector('p.chakra-text, p');
  });
}

function classifyEntry(row: HTMLElement): ActionKey {
  const cachedAction = readString(row.dataset.qpmAction);
  if (cachedAction) return cachedAction;

  const preset =
    row.dataset.action
    || row.getAttribute('data-action')
    || row.getAttribute('data-activity')
    || row.getAttribute('data-mg-action');

  if (preset) {
    const normalized = normalizeAction(String(preset).trim());
    row.dataset.qpmAction = normalized;
    return normalized;
  }

  const text = normalizeWhitespace(row.textContent || '');
  const action = inferActionFromMessage(text);
  row.dataset.qpmAction = action;
  return action;
}

function classifyType(row: HTMLElement): TypeFilter {
  const cachedType = readString(row.dataset.qpmType) as TypeFilter | null;
  if (cachedType) return cachedType;

  const action = classifyEntry(row);
  const text = normalizeWhitespace(row.textContent || '');
  const type = actionToType(action, text);
  row.dataset.qpmType = type;
  return type;
}

function mergeActions(actions: ActionKey[]): ActionKey[] {
  const seen = new Set<ActionKey>();
  const ordered: ActionKey[] = [];

  for (const key of ACTION_ORDER) {
    if (key === 'all') continue;
    if (actions.includes(key) && !seen.has(key)) {
      seen.add(key);
      ordered.push(key);
    }
  }

  for (const action of actions) {
    if (action === 'all') continue;
    if (!seen.has(action)) {
      seen.add(action);
      ordered.push(action);
    }
  }

  return ordered;
}

function getActionLabel(action: ActionKey): string {
  const preset = ACTION_LABELS[action];
  if (preset) return preset;
  const spaced = String(action || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!spaced) return String(action || '');
  return spaced
    .split(' ')
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ');
}

function toPascalCase(value: string): string {
  return value
    .replace(/\(s\)/gi, '')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function formatDisplayLabel(raw: string): string {
  const cleaned = normalizeWhitespace(raw);
  if (!cleaned) return '';
  const withSpaces = cleaned
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return titleizeSpecies(withSpaces);
}

function resolvePetIcon(species: string): string | null {
  const key = normalizeSpeciesKey(species);
  if (!key) return null;
  if (petIconCache.has(key)) return petIconCache.get(key) ?? null;

  const label = readString(species) ?? '';
  const compact = label.replace(/\s+/g, '');
  const url = getPetSpriteDataUrlWithMutations(label, [])
    || getPetSpriteDataUrlWithMutations(compact, [])
    || null;
  petIconCache.set(key, url);
  return url;
}

function resolvePlantIcon(species: string): string | null {
  const key = normalizeSpeciesKey(species);
  if (!key) return null;
  if (plantIconCache.has(key)) return plantIconCache.get(key) ?? null;

  const label = readString(species) ?? '';
  const compact = label.replace(/\s+/g, '');
  const url = getCropSpriteDataUrlWithMutations(label, [])
    || getCropSpriteDataUrlWithMutations(compact, [])
    || getProduceSpriteDataUrlWithMutations(label, [])
    || getProduceSpriteDataUrlWithMutations(compact, [])
    || null;
  plantIconCache.set(key, url);
  return url;
}

function resolveEggIcon(eggIdOrLabel: string): string | null {
  const key = normalizeSpeciesKey(eggIdOrLabel);
  if (!key) return null;
  if (eggIconCache.has(key)) return eggIconCache.get(key) ?? null;

  const raw = readString(eggIdOrLabel) ?? '';
  const formatted = formatDisplayLabel(raw);
  const pascalRaw = toPascalCase(raw);
  const pascalFormatted = toPascalCase(formatted);
  const noSpaceRaw = raw.replace(/\s+/g, '');
  const noSpaceFormatted = formatted.replace(/\s+/g, '');

  const candidates = [
    raw,
    formatted,
    pascalRaw,
    pascalFormatted,
    noSpaceRaw,
    noSpaceFormatted,
    raw.endsWith('Egg') ? raw : `${raw}Egg`,
    formatted.endsWith('Egg') ? formatted : `${formatted}Egg`,
    `egg/${pascalRaw}`,
    `egg/${pascalFormatted}`,
    `egg/${noSpaceRaw}`,
    `egg/${noSpaceFormatted}`,
    `sprite/egg/${pascalRaw}`,
    `sprite/egg/${pascalFormatted}`,
    `sprite/egg/${noSpaceRaw}`,
    `sprite/egg/${noSpaceFormatted}`,
  ];

  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    const fromPet = getPetSpriteDataUrlWithMutations(candidate, []);
    if (fromPet) {
      eggIconCache.set(key, fromPet);
      return fromPet;
    }
    const url = getAnySpriteDataUrl(candidate);
    if (url) {
      eggIconCache.set(key, url);
      return url;
    }
  }

  eggIconCache.set(key, null);
  return null;
}

interface SpeciesLookupEntry {
  value: string;
  label: string;
  matchKey: string;
  matchKeys: string[];
  iconUrl: string | null;
  categoryRank: number;
  rarityRank: number;
  priceRank: number;
  shopRank: number;
}

function buildMatchKeys(...values: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    const key = normalizeSpeciesKey(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

const RARITY_ORDER: Record<string, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  legendary: 3,
  mythic: 4,
  mythical: 4,
  divine: 5,
  celestial: 6,
};

function toNumberOr(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function getRarityRank(value: unknown): number {
  const normalized = normalizeToken(String(value ?? ''));
  return RARITY_ORDER[normalized] ?? 99;
}

function compareSpeciesLookupEntry(a: SpeciesLookupEntry, b: SpeciesLookupEntry): number {
  if (a.categoryRank !== b.categoryRank) return a.categoryRank - b.categoryRank;
  if (a.rarityRank !== b.rarityRank) return a.rarityRank - b.rarityRank;
  if (a.priceRank !== b.priceRank) return a.priceRank - b.priceRank;
  if (a.shopRank !== b.shopRank) return a.shopRank - b.shopRank;
  return a.label.localeCompare(b.label);
}

function buildPetLookupEntries(): SpeciesLookupEntry[] {
  const map = new Map<string, SpeciesLookupEntry>();
  let petIndex = 0;
  let eggIndex = 0;

  for (const speciesRaw of getAllPetSpecies()) {
    const species = readString(speciesRaw);
    if (!species) continue;
    const petDef = getPetSpecies(species);
    const normalized = normalizeSpeciesKey(species);
    if (!normalized) continue;
    const value = `pet:${normalized}`;
    if (map.has(value)) continue;
    const fallbackShopRank = 100000 + petIndex;
    petIndex += 1;
    const label = readString(petDef?.name) ?? formatDisplayLabel(species);
    const matchKeys = buildMatchKeys(species, label);
    map.set(value, {
      value,
      label,
      matchKey: matchKeys[0] ?? normalized,
      matchKeys,
      iconUrl: resolvePetIcon(species),
      categoryRank: 1,
      rarityRank: getRarityRank(petDef?.rarity),
      priceRank: toNumberOr((petDef as Record<string, unknown> | null)?.coinPrice, Number.POSITIVE_INFINITY),
      shopRank: toNumberOr(
        (petDef as Record<string, unknown> | null)?.shopIndex
        ?? (petDef as Record<string, unknown> | null)?.sortOrder
        ?? (petDef as Record<string, unknown> | null)?.order,
        fallbackShopRank,
      ),
    });
  }

  for (const eggIdRaw of getAllEggTypes()) {
    const eggId = readString(eggIdRaw);
    if (!eggId) continue;
    const eggDef = getEggType(eggId);
    const label = readString(eggDef?.name) ?? formatDisplayLabel(eggId);
    const normalized = normalizeSpeciesKey(label || eggId);
    if (!normalized) continue;
    const value = `egg:${normalized}`;
    if (map.has(value)) continue;
    const fallbackShopRank = eggIndex;
    eggIndex += 1;
    const matchKeys = buildMatchKeys(eggId, label, readString(eggDef?.name));
    map.set(value, {
      value,
      label,
      matchKey: matchKeys[0] ?? normalized,
      matchKeys,
      iconUrl: resolveEggIcon(readString(eggDef?.name) ?? eggId),
      categoryRank: 0,
      rarityRank: getRarityRank((eggDef as Record<string, unknown> | null)?.rarity),
      priceRank: toNumberOr(eggDef?.coinPrice, Number.POSITIVE_INFINITY),
      shopRank: toNumberOr(
        (eggDef as Record<string, unknown> | null)?.shopIndex
        ?? (eggDef as Record<string, unknown> | null)?.sortOrder
        ?? (eggDef as Record<string, unknown> | null)?.order,
        fallbackShopRank,
      ),
    });
  }

  return Array.from(map.values()).sort(compareSpeciesLookupEntry);
}

function buildPlantLookupEntries(): SpeciesLookupEntry[] {
  const map = new Map<string, SpeciesLookupEntry>();
  let plantIndex = 0;
  for (const speciesRaw of getAllPlantSpecies()) {
    const species = readString(speciesRaw);
    if (!species) continue;
    const plantDef = getPlantSpecies(species);
    const seedDef = isRecord(plantDef?.seed) ? plantDef.seed : null;
    const normalized = normalizeSpeciesKey(species);
    if (!normalized) continue;
    const value = `plant:${normalized}`;
    if (map.has(value)) continue;
    const fallbackShopRank = plantIndex;
    plantIndex += 1;
    const label = readString(seedDef?.name) ?? readString(plantDef?.name) ?? formatDisplayLabel(species);
    const matchKeys = buildMatchKeys(species, label, readString(plantDef?.name), readString(seedDef?.name));
    map.set(value, {
      value,
      label,
      matchKey: matchKeys[0] ?? normalized,
      matchKeys,
      iconUrl: resolvePlantIcon(species),
      categoryRank: 0,
      rarityRank: getRarityRank(seedDef?.rarity ?? (plantDef as Record<string, unknown> | null)?.rarity),
      priceRank: toNumberOr(seedDef?.coinPrice, Number.POSITIVE_INFINITY),
      shopRank: toNumberOr(
        seedDef?.shopIndex
        ?? seedDef?.sortOrder
        ?? seedDef?.order
        ?? (plantDef as Record<string, unknown> | null)?.shopIndex
        ?? (plantDef as Record<string, unknown> | null)?.sortOrder
        ?? (plantDef as Record<string, unknown> | null)?.order,
        fallbackShopRank,
      ),
    });
  }
  return Array.from(map.values()).sort(compareSpeciesLookupEntry);
}

function getPetLookupEntriesCached(): SpeciesLookupEntry[] {
  if (petLookupEntriesCache && petLookupEntriesCache.length > 0) return petLookupEntriesCache;
  petLookupEntriesCache = buildPetLookupEntries();
  return petLookupEntriesCache;
}

function getPlantLookupEntriesCached(): SpeciesLookupEntry[] {
  if (plantLookupEntriesCache && plantLookupEntriesCache.length > 0) return plantLookupEntriesCache;
  plantLookupEntriesCache = buildPlantLookupEntries();
  return plantLookupEntriesCache;
}

function detectSpeciesKeyFromText(
  text: string,
  lookup: SpeciesLookupEntry[],
): string | null {
  if (!text || !lookup.length) return null;
  const normalized = normalizeSpeciesKey(text);
  if (!normalized) return null;

  let best: { entry: SpeciesLookupEntry; keyLength: number } | null = null;
  for (const candidate of lookup) {
    const keys = candidate.matchKeys?.length ? candidate.matchKeys : [candidate.matchKey];
    for (const key of keys) {
      if (!key) continue;
      if (!normalized.includes(key)) continue;
      if (!best || key.length > best.keyLength) {
        best = { entry: candidate, keyLength: key.length };
      }
    }
  }

  return best?.entry.value ?? null;
}

function getRowMessageText(row: HTMLElement): string {
  const fullText = normalizeWhitespace(row.textContent || '');
  if (!fullText) return '';
  const timeText = normalizeWhitespace(row.querySelector('p')?.textContent || '');
  if (!timeText) return fullText;
  if (!fullText.endsWith(timeText)) return fullText;
  return normalizeWhitespace(fullText.slice(0, Math.max(0, fullText.length - timeText.length)));
}

function normalizePetNameKey(value: string): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/\(\s*\d+\s*\)/g, ' ')
    .replace(/[^a-z0-9]/g, '');
}

function extractFeedPetAlias(message: string): string | null {
  const match = message.match(/\byou\s+fed\s+(.+?)\s+\d+\s+/i);
  if (!match || !match[1]) return null;
  const normalized = normalizePetNameKey(match[1]);
  return normalized || null;
}

type StringField = {
  path: string;
  value: string;
};

function collectStringFields(
  input: unknown,
  path: string,
  out: StringField[],
  seen: WeakSet<object>,
): void {
  if (out.length >= 320) return;
  if (typeof input === 'string') {
    const value = readString(input);
    if (value) {
      out.push({ path, value });
    }
    return;
  }
  if (!isRecord(input) && !Array.isArray(input)) return;
  if (typeof input === 'object' && input !== null) {
    if (seen.has(input)) return;
    seen.add(input);
  }

  if (Array.isArray(input)) {
    for (let index = 0; index < input.length; index += 1) {
      collectStringFields(input[index], `${path}[${index}]`, out, seen);
      if (out.length >= 320) return;
    }
    return;
  }

  for (const [key, value] of Object.entries(input)) {
    collectStringFields(value, path ? `${path}.${key}` : key, out, seen);
    if (out.length >= 320) return;
  }
}

interface HistorySpeciesContext {
  messageToPet: Map<string, string>;
  messageToPlant: Map<string, string>;
  petNameAliases: Array<{ aliasKey: string; speciesKey: string }>;
}

let historySpeciesContextCacheKey = '';
let historySpeciesContextCache: HistorySpeciesContext | null = null;

function buildHistorySpeciesContext(
  pets: SpeciesLookupEntry[],
  plants: SpeciesLookupEntry[],
): HistorySpeciesContext {
  const key = `${history.length}|${history[0]?.timestamp ?? 0}|${history[history.length - 1]?.timestamp ?? 0}|${pets.length}|${plants.length}`;
  if (historySpeciesContextCache && historySpeciesContextCacheKey === key) {
    return historySpeciesContextCache;
  }

  const petByMatch = new Map<string, string>();
  for (const pet of pets) {
    const keys = pet.matchKeys?.length ? pet.matchKeys : [pet.matchKey];
    for (const key of keys) {
      if (!key) continue;
      petByMatch.set(key, pet.value);
    }
  }

  const plantByMatch = new Map<string, string>();
  for (const plant of plants) {
    const keys = plant.matchKeys?.length ? plant.matchKeys : [plant.matchKey];
    for (const key of keys) {
      if (!key) continue;
      plantByMatch.set(key, plant.value);
    }
  }

  const messageToPet = new Map<string, string>();
  const messageToPlant = new Map<string, string>();
  const petNameToSpecies = new Map<string, string>();

  for (const entry of history) {
    const message = normalizeWhitespace(readEntryMessage(entry));
    const messageKey = normalizeToken(message);
    const strings: StringField[] = [];
    const seen = new WeakSet<object>();
    collectStringFields(entry, '', strings, seen);

    let petSpeciesKey: string | null = null;
    let plantSpeciesKey: string | null = null;
    const petNameHints = new Set<string>();

    for (const field of strings) {
      const fieldKey = normalizeToken(field.path);
      const normalizedSpecies = normalizeSpeciesKey(field.value);
      const petFromField = petByMatch.get(normalizedSpecies) ?? null;
      const plantFromField = plantByMatch.get(normalizedSpecies) ?? null;
      const isPetField = /(pet|fauna|animal|egg)/.test(fieldKey);
      const isPlantField = /(plant|crop|seed|produce|flora)/.test(fieldKey);
      const isPetNameField = /(pet|fauna|animal|nickname|alias|display).*(name)|name.*(pet|fauna|animal|nickname|alias|display)/.test(fieldKey);

      if (petFromField) {
        if (!petSpeciesKey || isPetField || !petSpeciesKey) {
          petSpeciesKey = petFromField;
        }
      }
      if (plantFromField) {
        if (!plantSpeciesKey || isPlantField || !plantSpeciesKey) {
          plantSpeciesKey = plantFromField;
        }
      }

      if (isPetNameField || fieldKey.endsWith('.pet.name') || fieldKey.endsWith('.petname') || fieldKey.endsWith('.nickname')) {
        const aliasKey = normalizePetNameKey(field.value);
        if (aliasKey) petNameHints.add(aliasKey);
      }
    }

    if (!petSpeciesKey && message) {
      petSpeciesKey = detectSpeciesKeyFromText(message, pets);
    }
    if (!plantSpeciesKey && message) {
      plantSpeciesKey = detectSpeciesKeyFromText(message, plants);
    }

    if (petSpeciesKey && message) {
      const aliasFromFeed = extractFeedPetAlias(message);
      if (aliasFromFeed) {
        petNameHints.add(aliasFromFeed);
      }
    }

    if (petSpeciesKey && messageKey && !messageToPet.has(messageKey)) {
      messageToPet.set(messageKey, petSpeciesKey);
    }
    if (plantSpeciesKey && messageKey && !messageToPlant.has(messageKey)) {
      messageToPlant.set(messageKey, plantSpeciesKey);
    }
    if (petSpeciesKey) {
      for (const aliasKey of petNameHints) {
        if (!petNameToSpecies.has(aliasKey)) {
          petNameToSpecies.set(aliasKey, petSpeciesKey);
        }
      }
    }
  }

  const petNameAliases = Array.from(petNameToSpecies.entries())
    .map(([aliasKey, speciesKey]) => ({ aliasKey, speciesKey }))
    .sort((a, b) => b.aliasKey.length - a.aliasKey.length);

  historySpeciesContextCache = {
    messageToPet,
    messageToPlant,
    petNameAliases,
  };
  historySpeciesContextCacheKey = key;
  return historySpeciesContextCache;
}

function createSpeciesDropdown(params: {
  placeholder: string;
  onChange: (value: string) => void;
}): SpeciesDropdownHandle {
  const root = document.createElement('div');
  root.className = 'qpm-activity-species';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'qpm-activity-species-btn';
  button.textContent = params.placeholder;

  const menu = document.createElement('div');
  menu.className = 'qpm-activity-species-menu';
  menu.style.display = 'none';

  root.append(button, menu);

  let isOpen = false;
  let selectedValue = '';
  let options: SpeciesDropdownOption[] = [];

  const closeMenu = (): void => {
    if (!isOpen) return;
    isOpen = false;
    menu.style.display = 'none';
  };

  const openMenu = (): void => {
    if (isOpen) return;
    isOpen = true;
    menu.style.display = 'block';
  };

  const renderButton = (): void => {
    const selected = options.find((option) => option.value === selectedValue) ?? null;
    button.replaceChildren();
    if (selected?.iconUrl) {
      const img = document.createElement('img');
      img.className = 'qpm-activity-species-icon';
      img.src = selected.iconUrl;
      img.alt = '';
      button.appendChild(img);
    }
    const label = document.createElement('span');
    label.textContent = selected?.label ?? params.placeholder;
    button.appendChild(label);
  };

  const renderMenu = (): void => {
    menu.replaceChildren();
    const applySelection = (value: string): void => {
      if (selectedValue === value) {
        closeMenu();
        return;
      }
      selectedValue = value;
      renderButton();
      renderMenu();
      closeMenu();
      params.onChange(selectedValue);
    };

    for (const option of options) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `qpm-activity-species-option${option.value === selectedValue ? ' is-active' : ''}`;
      row.dataset.value = option.value;

      if (option.iconUrl) {
        const img = document.createElement('img');
        img.className = 'qpm-activity-species-icon';
        img.src = option.iconUrl;
        img.alt = '';
        row.appendChild(img);
      }

      const label = document.createElement('span');
      label.textContent = option.label;
      row.appendChild(label);

      row.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        applySelection(option.value);
      });
      row.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        applySelection(option.value);
      });

      menu.appendChild(row);
    }
  };

  const onGlobalPointer = (event: Event): void => {
    const target = event.target instanceof Node ? event.target : null;
    if (!target) return;
    if (root.contains(target)) return;
    closeMenu();
  };

  button.addEventListener('click', () => {
    if (isOpen) closeMenu();
    else openMenu();
  });

  document.addEventListener('pointerdown', onGlobalPointer, true);

  return {
    root,
    button,
    menu,
    setValue(value: string): void {
      selectedValue = value;
      renderButton();
      renderMenu();
    },
    getValue(): string {
      return selectedValue;
    },
    setOptions(nextOptions: SpeciesDropdownOption[]): void {
      options = nextOptions;
      if (!options.some((option) => option.value === selectedValue)) {
        selectedValue = '';
      }
      renderButton();
      renderMenu();
    },
    destroy(): void {
      document.removeEventListener('pointerdown', onGlobalPointer, true);
    },
  };
}

function buildRowMetadata(list: HTMLElement): RowMetadata[] {
  const rows = getEntryElements(list);
  const needsSpeciesFilters = Boolean(filters.petSpecies || filters.plantSpecies);
  if (!needsSpeciesFilters) {
    return rows.map((row) => ({
      row,
      action: classifyEntry(row),
      type: classifyType(row),
      petFilterKey: null,
      plantFilterKey: null,
    }));
  }

  const pets = getPetLookupEntriesCached();
  const plants = getPlantLookupEntriesCached();
  const context = buildHistorySpeciesContext(pets, plants);
  return rows.map((row) => {
    const rowMessage = getRowMessageText(row);
    const fullText = normalizeWhitespace(row.textContent || '');
    const baseText = rowMessage || fullText;
    const action = classifyEntry(row);
    const type = classifyType(row);
    const messageKey = normalizeToken(baseText);
    let petFilterKey = detectSpeciesKeyFromText(baseText, pets);
    let plantFilterKey = detectSpeciesKeyFromText(baseText, plants);

    if (!petFilterKey && messageKey) {
      petFilterKey = context.messageToPet.get(messageKey) ?? null;
    }
    if (!plantFilterKey && messageKey) {
      plantFilterKey = context.messageToPlant.get(messageKey) ?? null;
    }

    if (!petFilterKey) {
      const normalizedNameText = normalizePetNameKey(baseText);
      for (const alias of context.petNameAliases) {
        if (!alias.aliasKey) continue;
        if (!normalizedNameText.includes(alias.aliasKey)) continue;
        petFilterKey = alias.speciesKey;
        break;
      }
    }

    return {
      row,
      action,
      type,
      petFilterKey,
      plantFilterKey,
    };
  });
}

function buildSpeciesOptions(kind: 'pet' | 'plant'): SpeciesDropdownOption[] {
  if (kind === 'pet' && petSpeciesOptionsCache && petSpeciesOptionsCache.length > 1) return petSpeciesOptionsCache;
  if (kind === 'plant' && plantSpeciesOptionsCache && plantSpeciesOptionsCache.length > 1) return plantSpeciesOptionsCache;

  const source = kind === 'pet'
    ? getPetLookupEntriesCached()
    : getPlantLookupEntriesCached();

  const options: SpeciesDropdownOption[] = [];
  options.push({
    value: '',
    label: kind === 'pet' ? 'Pet: All' : 'Plant: All',
    iconUrl: null,
  });

  for (const entry of source) {
    options.push({
      value: entry.value,
      label: entry.label,
      iconUrl: entry.iconUrl,
    });
  }

  if (kind === 'pet') {
    petSpeciesOptionsCache = options.length > 1 ? options : null;
  } else {
    plantSpeciesOptionsCache = options.length > 1 ? options : null;
  }

  return options;
}

function loadFilters(): FilterState {
  const action = readString(storage.get<unknown>(FILTER_ACTION_STORAGE_KEY, 'all')) as ActionKey | null;
  const type = readString(storage.get<unknown>(FILTER_TYPE_STORAGE_KEY, 'all')) as TypeFilter | null;
  const order = readString(storage.get<unknown>(FILTER_ORDER_STORAGE_KEY, 'newest')) as OrderFilter | null;
  const petSpecies = readString(storage.get<unknown>(FILTER_PET_SPECIES_STORAGE_KEY, '')) ?? '';
  const plantSpecies = readString(storage.get<unknown>(FILTER_PLANT_SPECIES_STORAGE_KEY, '')) ?? '';

  return {
    action: action ?? 'all',
    type: type && TYPE_OPTIONS.some((option) => option.value === type) ? type : 'all',
    order: order === 'oldest' ? 'oldest' : 'newest',
    petSpecies,
    plantSpecies,
  };
}

function persistFilters(): void {
  storage.set(FILTER_ACTION_STORAGE_KEY, String(filters.action));
  storage.set(FILTER_TYPE_STORAGE_KEY, String(filters.type));
  storage.set(FILTER_ORDER_STORAGE_KEY, String(filters.order));
  storage.set(FILTER_PET_SPECIES_STORAGE_KEY, String(filters.petSpecies || ''));
  storage.set(FILTER_PLANT_SPECIES_STORAGE_KEY, String(filters.plantSpecies || ''));
}

function loadSummaryDebugPreference(): boolean {
  return Boolean(storage.get(SUMMARY_DEBUG_STORAGE_KEY, false));
}

function saveSummaryDebugPreference(): void {
  storage.set(SUMMARY_DEBUG_STORAGE_KEY, showSummaryInDebug);
}

function loadEnabledPreference(): boolean {
  return Boolean(storage.get<boolean>(ACTIVITY_LOG_ENABLED_STORAGE_KEY, true));
}

function saveEnabledPreference(): void {
  storage.set(ACTIVITY_LOG_ENABLED_STORAGE_KEY, enhancerEnabled);
}

function saveAndRenderFilters(): void {
  persistFilters();
  if (modalHandles) {
    if (virtualMode === 'virtual-expanded') {
      virtualWindowStart = 0;
      virtualHydratedCount = VIRTUAL_WINDOW_SIZE;
      virtualWindowEnd = virtualHydratedCount;
      invalidateVirtualCaches();
      queueReplay('filter-change');
      return;
    }
    refreshModalUI(modalHandles);
  }
}

function normalizeLegacyEntry(raw: unknown): ActivityLogEntry | null {
  if (!isRecord(raw)) return null;
  const timestamp = normalizeTimestamp(raw.timestamp ?? raw.time ?? raw.createdAt ?? raw.loggedAt);
  if (!timestamp) return null;

  const message = readString(raw.message) ?? readString(raw.rawMessage) ?? null;
  const action = readString(raw.action) ?? (message ? String(inferActionFromMessage(message)) : 'Activity');

  const legacyParameters: Record<string, unknown> = {};
  if (message) legacyParameters.message = message;
  const itemLabel = readString(raw.itemLabel);
  const petSpecies = readString(raw.petSpecies);
  const plantSpecies = readString(raw.plantSpecies);
  const secondaryLabel = readString(raw.secondaryLabel);
  const quantity = Number(raw.quantity);
  const priceCoins = Number(raw.priceCoins);
  if (itemLabel) legacyParameters.itemLabel = itemLabel;
  if (petSpecies) legacyParameters.petSpecies = petSpecies;
  if (plantSpecies) legacyParameters.plantSpecies = plantSpecies;
  if (secondaryLabel) legacyParameters.secondaryLabel = secondaryLabel;
  if (Number.isFinite(quantity)) legacyParameters.quantity = quantity;
  if (Number.isFinite(priceCoins)) legacyParameters.priceCoins = priceCoins;
  legacyParameters.qpmMigrated = true;

  return normalizeEntry({
    timestamp,
    action,
    message,
    parameters: legacyParameters,
  });
}

function semanticMigrationKey(entry: ActivityLogEntry): string {
  const action = normalizeToken(readString(entry.action) ?? 'other');
  const message = normalizeToken(readEntryMessage(entry));
  const secondBucket = Math.round(entry.timestamp / 1000);
  return `${action}|${message}|${secondBucket}`;
}

function runLegacyMigrationOnce(): void {
  const marker = storage.get<UnknownRecord | null>(MIGRATION_STORAGE_KEY, null);
  if (marker && marker.done === true) {
    return;
  }

  const imported: ActivityLogEntry[] = [];
  for (const key of LEGACY_STORAGE_KEYS) {
    const parsed = storage.get<unknown>(key, []);
    if (!Array.isArray(parsed)) continue;
    for (const raw of parsed) {
      const converted = normalizeLegacyEntry(raw);
      if (converted) imported.push(converted);
    }
  }

  const map = new Map<string, ActivityLogEntry>();
  for (const entry of history) {
    map.set(entryKey(entry), entry);
  }

  const semanticSeen = new Set<string>();
  for (const entry of imported) {
    const semanticKey = semanticMigrationKey(entry);
    if (semanticSeen.has(semanticKey)) continue;
    semanticSeen.add(semanticKey);
    const key = entryKey(entry);
    if (!map.has(key)) {
      map.set(key, entry);
      continue;
    }
    const current = map.get(key);
    if (current && !entriesEqual(current, entry)) {
      map.set(key, entry);
    }
  }

  const merged = trimAndSortHistory(Array.from(map.values()));
  saveHistory(merged);
  storage.set(MIGRATION_STORAGE_KEY, {
    done: true,
    migratedAt: Date.now(),
    imported: imported.length,
    total: merged.length,
  });
}

function diffSnapshots(prev: ActivityLogEntry[], next: ActivityLogEntry[]): {
  added: ActivityLogEntry[];
  updated: ActivityLogEntry[];
} {
  const prevBuckets = new Map<string, ActivityLogEntry[]>();
  for (const entry of prev) {
    const key = entryKey(entry);
    const bucket = prevBuckets.get(key);
    if (bucket) {
      bucket.push(entry);
    } else {
      prevBuckets.set(key, [entry]);
    }
  }

  const added: ActivityLogEntry[] = [];
  const updated: ActivityLogEntry[] = [];

  for (const entry of next) {
    const key = entryKey(entry);
    const bucket = prevBuckets.get(key);
    const prevEntry = bucket?.shift();
    if (!prevEntry) {
      added.push(entry);
    } else if (!entriesEqual(prevEntry, entry)) {
      updated.push(entry);
    }
    if (bucket && bucket.length === 0) {
      prevBuckets.delete(key);
    }
  }

  return { added, updated };
}

function mergeSnapshots(prevSnapshot: ActivityLogEntry[], nextSnapshot: ActivityLogEntry[]): boolean {
  const { added, updated } = diffSnapshots(prevSnapshot, nextSnapshot);
  if (!added.length && !updated.length) return false;

  const map = new Map<string, ActivityLogEntry>();
  for (const entry of history) {
    map.set(entryKey(entry), entry);
  }

  let changed = false;
  const upsert = (entry: ActivityLogEntry): void => {
    const key = entryKey(entry);
    const current = map.get(key);
    if (!current || !entriesEqual(current, entry)) {
      map.set(key, entry);
      changed = true;
    }
  };

  for (const entry of updated) upsert(entry);
  for (const entry of added) upsert(entry);

  if (!changed) return false;
  saveHistory(Array.from(map.values()));
  return true;
}

function getHistoryOrderCacheKey(): string {
  return `${historyRevision}|${history.length}|${history[0]?.timestamp ?? 0}|${history[history.length - 1]?.timestamp ?? 0}`;
}

function getOrderedHistoryRefs(order: OrderFilter): ActivityLogEntry[] {
  const key = getHistoryOrderCacheKey();
  if (orderedHistoryCacheKey !== key) {
    orderedHistoryCacheKey = key;
    orderedHistoryNewestCache = null;
    orderedHistoryOldestCache = null;
  }

  if (order === 'oldest') {
    if (!orderedHistoryOldestCache) {
      orderedHistoryOldestCache = history.slice().sort((a, b) => a.timestamp - b.timestamp);
    }
    return orderedHistoryOldestCache;
  }

  if (!orderedHistoryNewestCache) {
    orderedHistoryNewestCache = history.slice().sort((a, b) => b.timestamp - a.timestamp);
  }
  return orderedHistoryNewestCache;
}

function getOrderedHistory(order: OrderFilter, maxEntries?: number, startIndex = 0): ActivityLogEntry[] {
  const refs = getOrderedHistoryRefs(order);
  const start = Math.max(0, Math.min(refs.length, Math.floor(startIndex)));
  const limit = Number.isFinite(maxEntries)
    ? Math.max(0, Math.min(refs.length - start, Math.floor(maxEntries as number)))
    : (refs.length - start);
  const out: ActivityLogEntry[] = [];
  for (let index = start; index < start + limit; index += 1) {
    out.push(deepClone(refs[index]!));
  }
  return out;
}

function buildDisplayLogsWithHistory(
  realLogs: ActivityLogEntry[],
  order: OrderFilter,
  maxEntries?: number | null,
  startIndex = 0,
): ActivityLogEntry[] {
  const map = new Map<string, ActivityLogEntry>();
  for (const entry of history) {
    if (!isReplaySafeEntry(entry)) continue;
    map.set(entryKey(entry), entry);
  }
  for (const entry of realLogs) {
    if (!isReplaySafeEntry(entry)) continue;
    const key = entryKey(entry);
    const existing = map.get(key);
    if (!existing || !entriesEqual(existing, entry)) {
      map.set(key, entry);
    }
  }
  const merged = trimAndSortHistory(Array.from(map.values()));
  merged.sort((a, b) => (order === 'oldest' ? a.timestamp - b.timestamp : b.timestamp - a.timestamp));
  const start = Math.max(0, Math.min(merged.length, Math.floor(startIndex)));
  const limit = Number.isFinite(maxEntries)
    ? Math.max(0, Math.min(merged.length - start, Math.floor(maxEntries as number)))
    : (merged.length - start);
  return merged.slice(start, start + limit).map((entry) => deepClone(entry));
}

function entryMatchesFilters(meta: {
  action: ActionKey;
  type: TypeFilter;
  petFilterKey: string | null;
  plantFilterKey: string | null;
}): boolean {
  const matchAction = filters.action === 'all' || meta.action === filters.action;
  const matchType = filters.type === 'all' || meta.type === filters.type;
  const petFilterKey = filters.petSpecies;
  const plantFilterKey = filters.plantSpecies;
  const matchPet = !petFilterKey || meta.petFilterKey === petFilterKey;
  const matchPlant = !plantFilterKey || meta.plantFilterKey === plantFilterKey;
  const matchSpecies = petFilterKey && plantFilterKey
    ? (matchPet || matchPlant)
    : (matchPet && matchPlant);
  return matchAction && matchType && matchSpecies;
}

function getHistoryEntryFilterMetadata(
  entry: ActivityLogEntry,
  context: HistorySpeciesContext | null,
  pets: SpeciesLookupEntry[] | null,
  plants: SpeciesLookupEntry[] | null,
): {
  action: ActionKey;
  type: TypeFilter;
  petFilterKey: string | null;
  plantFilterKey: string | null;
} {
  if (historyFilterMetaCacheRevision !== historyRevision) {
    historyFilterMetaCacheRevision = historyRevision;
    historyFilterMetaCache.clear();
  }

  const key = entryKey(entry);
  const cached = historyFilterMetaCache.get(key);
  if (cached) return cached;

  const message = normalizeWhitespace(readEntryMessage(entry));
  const actionValue = readString(entry.action);
  const action = actionValue ? normalizeAction(actionValue) : inferActionFromMessage(message);
  const type = actionToType(action, message);
  const messageKey = normalizeToken(message);

  let petFilterKey = pets ? detectSpeciesKeyFromText(message, pets) : null;
  let plantFilterKey = plants ? detectSpeciesKeyFromText(message, plants) : null;

  if (context && messageKey) {
    if (!petFilterKey) {
      petFilterKey = context.messageToPet.get(messageKey) ?? null;
    }
    if (!plantFilterKey) {
      plantFilterKey = context.messageToPlant.get(messageKey) ?? null;
    }
    if (!petFilterKey) {
      const normalizedNameText = normalizePetNameKey(message);
      for (const alias of context.petNameAliases) {
        if (!alias.aliasKey) continue;
        if (!normalizedNameText.includes(alias.aliasKey)) continue;
        petFilterKey = alias.speciesKey;
        break;
      }
    }
  }

  const meta = {
    action,
    type,
    petFilterKey,
    plantFilterKey,
  };
  historyFilterMetaCache.set(key, meta);
  return meta;
}

function getFilteredHistoryEntries(order: OrderFilter): ActivityLogEntry[] {
  const cacheKey = `${historyRevision}|${order}|${filters.action}|${filters.type}|${filters.petSpecies}|${filters.plantSpecies}`;
  if (virtualFilteredCacheKey === cacheKey) {
    return virtualFilteredCache;
  }

  const ordered = getOrderedHistoryRefs(order);
  const needsFiltering = filters.action !== 'all'
    || filters.type !== 'all'
    || Boolean(filters.petSpecies)
    || Boolean(filters.plantSpecies);

  const out: ActivityLogEntry[] = [];
  if (!needsFiltering) {
    for (const entry of ordered) {
      if (!isReplaySafeEntry(entry)) continue;
      out.push(entry);
    }
  } else {
    const hasSpeciesFilter = Boolean(filters.petSpecies || filters.plantSpecies);
    const pets = hasSpeciesFilter ? getPetLookupEntriesCached() : null;
    const plants = hasSpeciesFilter ? getPlantLookupEntriesCached() : null;
    const context = hasSpeciesFilter
      ? buildHistorySpeciesContext(pets ?? [], plants ?? [])
      : null;

    for (const entry of ordered) {
      if (!isReplaySafeEntry(entry)) continue;
      const meta = getHistoryEntryFilterMetadata(entry, context, pets, plants);
      if (!entryMatchesFilters(meta)) continue;
      out.push(entry);
    }
  }

  virtualFilteredCacheKey = cacheKey;
  virtualFilteredCache = out;
  virtualTotalFiltered = out.length;
  return out;
}

function uninstallMyDataReadPatch(): void {
  if (!patchedMyDataAtom || !patchedMyDataReadKey || !patchedMyDataReadOriginal) return;
  try {
    patchedMyDataAtom[patchedMyDataReadKey] = patchedMyDataReadOriginal;
  } catch {}
  patchedMyDataAtom = null;
  patchedMyDataReadKey = null;
  patchedMyDataReadOriginal = null;
  readPatchStartIndex = 0;
  readPatchMaxEntries = null;
}

function installMyDataReadPatch(): boolean {
  if (patchedMyDataAtom && patchedMyDataReadKey && patchedMyDataReadOriginal) {
    replayMode = 'read_patch';
    return true;
  }

  const atom = getAtomByLabel('myDataAtom');
  if (!atom) return false;
  const readKey = findAtomReadKey(atom);
  if (!readKey) return false;
  const original = atom[readKey];
  if (typeof original !== 'function') return false;

  const wrapped = function patchedActivityLogRead(get: any): unknown {
    const real = original(get);
    if (!isRecord(real)) return real;
    const realLogs = normalizeList(extractActivityArray(real));
    const mergedLogs = virtualMode === 'virtual-expanded'
      ? (() => {
          const filtered = getFilteredHistoryEntries(readPatchOrder);
          const total = filtered.length;
          const start = Math.max(0, Math.min(total, Math.floor(readPatchStartIndex)));
          const end = Math.max(
            start,
            Math.min(
              total,
              start + Math.max(0, Math.floor(readPatchMaxEntries ?? (total - start))),
            ),
          );
          return filtered.slice(start, end).map((entry) => deepClone(entry));
        })()
      : buildDisplayLogsWithHistory(realLogs, readPatchOrder, readPatchMaxEntries, readPatchStartIndex);
    replayHydratedCount = mergedLogs.length;
    const currentLogs = Array.isArray((real as any).activityLogs) ? (real as any).activityLogs : null;
    if (currentLogs && currentLogs.length === mergedLogs.length) {
      let same = true;
      for (let index = 0; index < mergedLogs.length; index += 1) {
        const a = currentLogs[index];
        const b = mergedLogs[index];
        if (stableStringify(a) !== stableStringify(b)) {
          same = false;
          break;
        }
      }
      if (same) return real;
    }
    return {
      ...real,
      activityLogs: mergedLogs,
    };
  };

  try {
    atom[readKey] = wrapped;
    patchedMyDataAtom = atom;
    patchedMyDataReadKey = readKey;
    patchedMyDataReadOriginal = original;
    replayMode = 'read_patch';
    return true;
  } catch {
    uninstallMyDataReadPatch();
    return false;
  }
}

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const css = `
    .qpm-activity-toolbar {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
      margin: 4px 0 8px;
      padding: 0;
      border: 0;
      background: transparent;
      box-sizing: border-box;
    }
    .qpm-activity-select {
      min-height: 24px;
      border: 1px solid rgba(138, 150, 168, 0.45);
      border-radius: 999px;
      padding: 2px 10px;
      font-size: 11px;
      line-height: 1.2;
      background: rgba(247, 248, 250, 0.86);
      color: #2f3a4a;
      cursor: pointer;
      box-sizing: border-box;
    }
    .qpm-activity-select:focus {
      outline: none;
      border-color: rgba(110, 124, 146, 0.72);
    }
    .qpm-activity-chip-wrap {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-wrap: wrap;
      min-width: 0;
    }
    .qpm-activity-chip {
      border: 1px solid rgba(138, 150, 168, 0.45);
      background: rgba(247, 248, 250, 0.82);
      color: #2f3a4a;
      border-radius: 999px;
      padding: 3px 8px;
      font-size: 11px;
      line-height: 1.2;
      cursor: pointer;
      white-space: nowrap;
    }
    .qpm-activity-chip.is-active {
      border-color: rgba(100, 113, 131, 0.75);
      background: rgba(232, 236, 243, 0.94);
      color: #222e3d;
    }
    .qpm-activity-species {
      position: relative;
      min-width: 150px;
    }
    .qpm-activity-species-btn {
      min-height: 24px;
      width: 100%;
      border: 1px solid rgba(138, 150, 168, 0.45);
      border-radius: 999px;
      padding: 2px 10px;
      font-size: 11px;
      line-height: 1.2;
      background: rgba(247, 248, 250, 0.86);
      color: #2f3a4a;
      cursor: pointer;
      box-sizing: border-box;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      justify-content: flex-start;
      text-align: left;
    }
    .qpm-activity-species-menu {
      position: absolute;
      z-index: 20;
      left: 0;
      right: 0;
      top: calc(100% + 4px);
      max-height: 220px;
      overflow-y: auto;
      border-radius: 10px;
      border: 1px solid rgba(138, 150, 168, 0.45);
      background: rgba(252, 253, 255, 0.98);
      box-shadow: 0 10px 24px rgba(40, 52, 70, 0.18);
      padding: 4px;
      box-sizing: border-box;
    }
    .qpm-activity-species-option {
      width: 100%;
      border: 0;
      background: transparent;
      color: #2f3a4a;
      border-radius: 8px;
      min-height: 28px;
      padding: 5px 8px;
      font-size: 11px;
      line-height: 1.2;
      cursor: pointer;
      text-align: left;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .qpm-activity-species-option:hover {
      background: rgba(233, 238, 247, 0.9);
    }
    .qpm-activity-species-option.is-active {
      background: rgba(221, 231, 247, 0.95);
      color: #1f2c3d;
      font-weight: 600;
    }
    .qpm-activity-species-icon {
      width: 16px;
      height: 16px;
      object-fit: contain;
      image-rendering: pixelated;
      flex: 0 0 16px;
      pointer-events: none;
    }
    .qpm-activity-summary {
      margin-left: auto;
      font-size: 11px;
      color: #3f4a5e;
      font-weight: 600;
      white-space: nowrap;
    }
    .qpm-activity-summary.is-hidden {
      display: none;
    }
    @media (max-width: 780px) {
      .qpm-activity-summary {
        width: 100%;
        margin-left: 0;
        white-space: normal;
      }
    }
  `;
  const style = addStyle(css);
  style.id = STYLE_ID;
}

function findActivityModal(): ModalRef | null {
  const titles = Array.from(document.querySelectorAll(TITLE_SELECTOR));
  const title = titles.find((node) => /activity\s*log/i.test(node.textContent || ''));
  if (!(title instanceof HTMLElement)) return null;

  const root = title.closest('div.McGrid');
  if (!(root instanceof HTMLElement)) return null;

  const content = root.querySelector('div.McFlex.css-iek5kf')
    ?? root.querySelectorAll('div.McFlex')[1];
  if (!(content instanceof HTMLElement)) return null;

  const list = (
    content.querySelector(NATIVE_LIST_SELECTOR)
    ?? Array.from(content.children).find((child) => (
      child instanceof HTMLElement
      && child.classList.contains('McFlex')
      && child.getAttribute(TOOLBAR_ATTR) !== '1'
    ))
  );
  if (!(list instanceof HTMLElement)) return null;

  return {
    root,
    content,
    list,
  };
}

function hasAriesActivityFilter(modal: ModalRef): boolean {
  if (modal.content.querySelector('.mg-activity-log-filter')) return true;
  if (modal.root.hasAttribute('data-mg-activity-log-filter-ready')) return true;
  return false;
}

function resolveScrollHost(modal: ModalRef): HTMLElement {
  const scrollableNodes: HTMLElement[] = [];
  const isScrollable = (node: HTMLElement): boolean => {
    try {
      const style = window.getComputedStyle(node);
      const overflowY = String(style.overflowY || '').toLowerCase();
      if (!(overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay')) return false;
      return (node.scrollHeight - node.clientHeight) > 8;
    } catch {
      return false;
    }
  };

  let cursor: HTMLElement | null = modal.list.parentElement;
  while (cursor) {
    if (cursor.contains(modal.list) && isScrollable(cursor)) {
      scrollableNodes.push(cursor);
    }
    if (cursor === document.body) break;
    cursor = cursor.parentElement;
  }

  if (isScrollable(modal.list)) return modal.list;
  if (scrollableNodes.length > 0) return scrollableNodes[0]!;

  if (isScrollable(modal.content)) return modal.content;
  return modal.list;
}

function collectScrollTargets(scrollHost: HTMLElement, list: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  const seen = new Set<HTMLElement>();
  const push = (node: HTMLElement | null): void => {
    if (!node) return;
    if (seen.has(node)) return;
    seen.add(node);
    out.push(node);
  };

  push(list);
  push(scrollHost);
  let cursor: HTMLElement | null = scrollHost.parentElement;
  while (cursor) {
    if (cursor.contains(list)) {
      push(cursor);
    }
    if (cursor === document.body) break;
    cursor = cursor.parentElement;
  }

  return out;
}

function buildSelect<T extends string>(
  options: Array<{ value: T; label: string }>,
  currentValue: T,
): HTMLSelectElement {
  const select = document.createElement('select');
  select.className = 'qpm-activity-select';
  for (const option of options) {
    const node = document.createElement('option');
    node.value = option.value;
    node.textContent = option.label;
    if (option.value === currentValue) {
      node.selected = true;
    }
    select.appendChild(node);
  }
  return select;
}

function applyFiltersToRows(rows: RowMetadata[]): number {
  let visibleCount = 0;
  for (const meta of rows) {
    const matchAction = true;
    const matchType = filters.type === 'all' || meta.type === filters.type;
    const petFilterKey = filters.petSpecies;
    const plantFilterKey = filters.plantSpecies;
    const matchPet = !petFilterKey || meta.petFilterKey === petFilterKey;
    const matchPlant = !plantFilterKey || meta.plantFilterKey === plantFilterKey;
    const matchSpecies = petFilterKey && plantFilterKey
      ? (matchPet || matchPlant)
      : (matchPet && matchPlant);
    const visible = matchAction && matchType && matchSpecies;
    const nextDisplay = visible ? '' : 'none';
    if (meta.row.style.display !== nextDisplay) {
      meta.row.style.display = nextDisplay;
    }
    if (visible) visibleCount += 1;
  }
  return visibleCount;
}

function normalizeSpeciesFilterValue(options: SpeciesDropdownOption[], value: string): string {
  return options.some((option) => option.value === value) ? value : '';
}

function updateSummary(handles: ModalHandles, visibleCount: number, totalCount: number): void {
  if (!showSummaryInDebug) {
    handles.summary.classList.add('is-hidden');
    handles.summary.textContent = '';
    return;
  }

  handles.summary.classList.remove('is-hidden');
  handles.summary.textContent = `History: ${history.length} saved, ${visibleCount}/${totalCount} visible`;
}

function ensureSpeciesDropdownOptions(handles: ModalHandles): void {
  if (handles.speciesOptionsReady) return;
  const petOptions = buildSpeciesOptions('pet');
  const plantOptions = buildSpeciesOptions('plant');
  const nextPetFilter = normalizeSpeciesFilterValue(petOptions, filters.petSpecies);
  const nextPlantFilter = normalizeSpeciesFilterValue(plantOptions, filters.plantSpecies);

  handles.petDropdown.setOptions(petOptions);
  handles.plantDropdown.setOptions(plantOptions);
  handles.petDropdown.setValue(nextPetFilter);
  handles.plantDropdown.setValue(nextPlantFilter);
  handles.speciesOptionsReady = petOptions.length > 1 && plantOptions.length > 1;

  let shouldPersist = false;
  if (nextPetFilter !== filters.petSpecies) {
    filters.petSpecies = nextPetFilter;
    shouldPersist = true;
  }
  if (nextPlantFilter !== filters.plantSpecies) {
    filters.plantSpecies = nextPlantFilter;
    shouldPersist = true;
  }
  if (filters.action !== 'all') {
    filters.action = 'all';
    shouldPersist = true;
  }
  if (shouldPersist) {
    persistFilters();
  }
}

function refreshModalUI(handles: ModalHandles): void {
  ensureSpeciesDropdownOptions(handles);
  if (virtualMode === 'virtual-expanded') {
    applyVirtualListLayout(handles.list);
    hideNativeLoadMoreButtons(handles.list);
    removeVirtualSpacers(handles.list);
    updateVirtualAverageRowHeight(handles.list);
    ensureVirtualLoadMoreButton(handles);
    const rows = getEntryElements(handles.list);
    updateSummary(handles, rows.length, virtualTotalFiltered);
    return;
  }

  restoreVirtualListLayout(handles.list);
  restoreNativeLoadMoreButtons(handles.list);
  removeVirtualSpacers(handles.list);
  removeVirtualLoadMoreButton(handles.list);
  const metadata = buildRowMetadata(handles.list);

  const totalRows = metadata.length;
  const visibleRows = applyFiltersToRows(metadata);
  updateSummary(handles, visibleRows, totalRows);
}

function scheduleModalRefresh(handles: ModalHandles): void {
  if (handles.refreshQueued) return;
  handles.refreshQueued = true;
  const schedule = (): void => {
    requestAnimationFrame(() => {
      handles.refreshQueued = false;
      handles.refreshTimer = null;
      if (!modalHandles) return;
      refreshModalUI(modalHandles);
    });
  };
  if (handles.list.childElementCount >= LARGE_LIST_REFRESH_THRESHOLD) {
    handles.refreshTimer = window.setTimeout(schedule, LARGE_LIST_REFRESH_DELAY_MS);
    return;
  }
  schedule();
}

function clearReplayHydrationTimer(): void {
  if (replayHydrationTimer == null) return;
  clearTimeout(replayHydrationTimer);
  replayHydrationTimer = null;
}

function resolveReplayStartIndex(totalEntries: number, candidate: number): number {
  const total = Math.max(0, Math.floor(totalEntries));
  if (!Number.isFinite(candidate) || candidate < 0) return 0;
  return Math.max(0, Math.min(total, Math.floor(candidate)));
}

function resolveReplayMaxEntries(totalEntries: number, candidate: number): number | null {
  const total = Math.max(0, Math.floor(totalEntries));
  if (!Number.isFinite(candidate)) return null;
  return Math.max(0, Math.min(total, Math.floor(candidate)));
}

function getLoadMoreButtonFromTarget(target: EventTarget | null): HTMLButtonElement | null {
  if (!(target instanceof Element)) return null;
  const button = target.closest('button');
  if (!(button instanceof HTMLButtonElement)) return null;
  if (!modalHandles?.list.contains(button)) return null;
  if (button.getAttribute(VIRTUAL_CUSTOM_LOAD_ATTR) === '1') return button;
  const text = normalizeWhitespace(button.textContent || '');
  if (!text) return null;
  return /\bload\b/i.test(text) && /\bmore\b/i.test(text)
    ? button
    : null;
}

function hideNativeLoadMoreButtons(list: HTMLElement): void {
  const buttons = Array.from(list.querySelectorAll('button'));
  for (const node of buttons) {
    if (!(node instanceof HTMLButtonElement)) continue;
    if (node.getAttribute(VIRTUAL_CUSTOM_LOAD_ATTR) === '1') continue;
    const text = normalizeWhitespace(node.textContent || '');
    if (!/\bload\b/i.test(text) || !/\bmore\b/i.test(text)) continue;
    if (node.getAttribute(VIRTUAL_HIDDEN_LOAD_ATTR) !== '1') {
      node.setAttribute(VIRTUAL_HIDDEN_LOAD_ATTR, '1');
      node.style.display = 'none';
      node.style.pointerEvents = 'none';
    }
  }
}

function restoreNativeLoadMoreButtons(list: HTMLElement): void {
  const buttons = Array.from(list.querySelectorAll(`button[${VIRTUAL_HIDDEN_LOAD_ATTR}="1"]`));
  for (const node of buttons) {
    if (!(node instanceof HTMLButtonElement)) continue;
    node.removeAttribute(VIRTUAL_HIDDEN_LOAD_ATTR);
    node.style.removeProperty('display');
    node.style.removeProperty('pointer-events');
  }
}

function removeVirtualLoadMoreButton(list: HTMLElement): void {
  if (virtualLoadMoreButton && virtualLoadMoreButton.isConnected) {
    try {
      virtualLoadMoreButton.remove();
    } catch {}
  }
  const existing = list.querySelector(`button[${VIRTUAL_CUSTOM_LOAD_ATTR}="1"]`);
  if (existing instanceof HTMLButtonElement) {
    try {
      existing.remove();
    } catch {}
  }
  virtualLoadMoreButton = null;
}

function getAdaptiveHydrationChunkSize(): number {
  if (!Number.isFinite(virtualReplayDurationMs) || virtualReplayDurationMs <= 0) {
    return 20;
  }
  if (virtualReplayDurationMs > 42) return VIRTUAL_HYDRATE_CHUNK_MIN;
  if (virtualReplayDurationMs > 28) return 12;
  if (virtualReplayDurationMs > 20) return 16;
  if (virtualReplayDurationMs > 12) return 22;
  return VIRTUAL_HYDRATE_CHUNK_MAX;
}

function ensureVirtualLoadMoreButton(handles: ModalHandles): void {
  if (virtualMode !== 'virtual-expanded') {
    removeVirtualLoadMoreButton(handles.list);
    return;
  }

  const remaining = Math.max(0, virtualTotalFiltered - virtualHydratedCount);
  if (remaining <= 0) {
    removeVirtualLoadMoreButton(handles.list);
    return;
  }

  if (!(virtualLoadMoreButton instanceof HTMLButtonElement) || !virtualLoadMoreButton.isConnected) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute(VIRTUAL_CUSTOM_LOAD_ATTR, '1');
    if (virtualLoadButtonClassName) {
      button.className = virtualLoadButtonClassName;
    } else {
      button.className = 'qpm-activity-load-more';
      button.style.marginTop = '8px';
      button.style.minHeight = '30px';
      button.style.alignSelf = 'stretch';
    }
    virtualLoadMoreButton = button;
  }

  virtualLoadMoreButton.textContent = `Load ${remaining} more`;
  if (!handles.list.contains(virtualLoadMoreButton)) {
    handles.list.appendChild(virtualLoadMoreButton);
  }
}

function applyVirtualListLayout(list: HTMLElement): void {
  if (!virtualListLayoutApplied) {
    virtualListPrevJustifyContent = list.style.justifyContent;
    virtualListPrevAlignContent = list.style.alignContent;
    virtualListPrevAlignItems = list.style.alignItems;
    virtualListLayoutApplied = true;
  }
  list.style.justifyContent = 'flex-start';
  list.style.alignContent = 'stretch';
  list.style.alignItems = 'stretch';
}

function restoreVirtualListLayout(list: HTMLElement): void {
  if (!virtualListLayoutApplied) return;
  list.style.justifyContent = virtualListPrevJustifyContent;
  list.style.alignContent = virtualListPrevAlignContent;
  list.style.alignItems = virtualListPrevAlignItems;
  virtualListLayoutApplied = false;
  virtualListPrevJustifyContent = '';
  virtualListPrevAlignContent = '';
  virtualListPrevAlignItems = '';
}

function removeVirtualSpacers(list: HTMLElement): void {
  const spacers = list.querySelectorAll(`[${VIRTUAL_SPACER_ATTR}]`);
  for (const node of spacers) {
    try {
      node.remove();
    } catch {}
  }
  virtualSpacerTopEl = null;
  virtualSpacerBottomEl = null;
}

function ensureVirtualSpacers(list: HTMLElement): { top: HTMLDivElement; bottom: HTMLDivElement } {
  if (!(virtualSpacerTopEl instanceof HTMLDivElement) || !virtualSpacerTopEl.isConnected) {
    virtualSpacerTopEl = document.createElement('div');
    virtualSpacerTopEl.setAttribute(VIRTUAL_SPACER_ATTR, VIRTUAL_SPACER_TOP);
    virtualSpacerTopEl.style.pointerEvents = 'none';
    virtualSpacerTopEl.style.flex = '0 0 auto';
    virtualSpacerTopEl.style.width = '100%';
  }
  if (!(virtualSpacerBottomEl instanceof HTMLDivElement) || !virtualSpacerBottomEl.isConnected) {
    virtualSpacerBottomEl = document.createElement('div');
    virtualSpacerBottomEl.setAttribute(VIRTUAL_SPACER_ATTR, VIRTUAL_SPACER_BOTTOM);
    virtualSpacerBottomEl.style.pointerEvents = 'none';
    virtualSpacerBottomEl.style.flex = '0 0 auto';
    virtualSpacerBottomEl.style.width = '100%';
  }

  if (!list.contains(virtualSpacerTopEl)) {
    list.insertBefore(virtualSpacerTopEl, list.firstChild);
  }
  if (!list.contains(virtualSpacerBottomEl)) {
    list.appendChild(virtualSpacerBottomEl);
  }

  return {
    top: virtualSpacerTopEl,
    bottom: virtualSpacerBottomEl,
  };
}

function updateVirtualSpacers(list: HTMLElement): void {
  if (virtualMode !== 'virtual-expanded') {
    removeVirtualSpacers(list);
    return;
  }
  const { top, bottom } = ensureVirtualSpacers(list);
  top.style.height = `${Math.max(0, Math.floor(virtualTopSpacerPx))}px`;
  bottom.style.height = `${Math.max(0, Math.floor(virtualBottomSpacerPx))}px`;
}

function updateVirtualAverageRowHeight(list: HTMLElement): void {
  const rows = getEntryElements(list);
  if (!rows.length) return;
  let totalHeight = 0;
  for (const row of rows) {
    totalHeight += Math.max(1, Math.round(row.getBoundingClientRect().height || 0));
  }
  if (totalHeight <= 0) return;
  const avg = totalHeight / rows.length;
  if (!Number.isFinite(avg) || avg <= 0) return;
  virtualAvgRowHeight = Math.max(24, Math.min(120, avg));
}

function getScrollOffsetWithinList(handles: ModalHandles): number {
  const host = handles.scrollHost;
  const list = handles.list;
  if (!host || !list) return 0;
  if (host === list) return Math.max(0, list.scrollTop);
  const hostRect = host.getBoundingClientRect();
  const listRect = list.getBoundingClientRect();
  if (!Number.isFinite(hostRect.top) || !Number.isFinite(listRect.top)) {
    return Math.max(0, host.scrollTop);
  }
  return Math.max(0, Math.round(hostRect.top - listRect.top));
}

function resetVirtualScrollToStart(handles: ModalHandles): void {
  const host = handles.scrollHost;
  const list = handles.list;
  if (host === list) {
    list.scrollTop = 0;
    return;
  }
  const offset = getScrollOffsetWithinList(handles);
  if (offset <= 0) return;
  host.scrollTop = Math.max(0, host.scrollTop - offset);
}

async function applyVirtualWindow(
  reason: string,
  preserveScroll: boolean,
): Promise<void> {
  if (!modalHandles) return;
  if (replayInFlight) {
    virtualPendingWindowStart = virtualHydratedCount;
    virtualPendingReason = reason;
    virtualPendingPreserveScroll = virtualPendingPreserveScroll || preserveScroll;
    return;
  }

  const filteredEntries = getFilteredHistoryEntries(filters.order);
  const total = filteredEntries.length;
  virtualTotalFiltered = total;
  if (virtualHydratedCount <= 0) {
    virtualHydratedCount = Math.min(total, VIRTUAL_WINDOW_SIZE);
  } else {
    virtualHydratedCount = Math.max(0, Math.min(total, virtualHydratedCount));
  }
  virtualWindowStart = 0;
  virtualWindowEnd = virtualHydratedCount;
  virtualTopSpacerPx = 0;
  virtualBottomSpacerPx = 0;

  await replayHistoryToModal({
    preserveScroll,
    reason,
    startIndex: 0,
    maxEntries: virtualHydratedCount,
  });
}

function enterVirtualExpandedMode(handles: ModalHandles, sourceButton?: HTMLButtonElement | null): void {
  if (virtualMode === 'virtual-expanded') return;
  virtualMode = 'virtual-expanded';
  virtualWindowStart = 0;
  virtualWindowEnd = VIRTUAL_WINDOW_SIZE;
  virtualTopSpacerPx = 0;
  virtualBottomSpacerPx = 0;
  virtualAvgRowHeight = VIRTUAL_DEFAULT_ROW_HEIGHT;
  virtualLastScrollUpdateAt = 0;
  virtualIgnoreScrollUntil = Date.now() + 220;
  invalidateVirtualCaches();
  const currentRows = getEntryElements(handles.list).length;
  const initialHydrated = Math.max(VIRTUAL_WINDOW_SIZE, currentRows + getAdaptiveHydrationChunkSize());
  virtualHydratedCount = Math.max(0, initialHydrated);
  readPatchOrder = filters.order;
  readPatchStartIndex = 0;
  readPatchMaxEntries = virtualHydratedCount;
  virtualLoadButtonClassName = sourceButton?.className ?? virtualLoadButtonClassName;
  applyVirtualListLayout(handles.list);
  removeVirtualLoadMoreButton(handles.list);
  resetVirtualScrollToStart(handles);
  void applyVirtualWindow('virtual-enter', false);
  scheduleModalRefresh(handles);
}

function hydrateMoreVirtualEntries(): void {
  if (virtualMode !== 'virtual-expanded') return;
  const chunk = getAdaptiveHydrationChunkSize();
  const nextCount = Math.min(virtualTotalFiltered, virtualHydratedCount + chunk);
  if (nextCount <= virtualHydratedCount) return;
  virtualHydratedCount = nextCount;
  virtualWindowStart = 0;
  virtualWindowEnd = virtualHydratedCount;
  virtualIgnoreScrollUntil = Date.now() + 180;
  void applyVirtualWindow('virtual-load-more', false);
}

function maybeUpdateVirtualWindowFromScroll(handles: ModalHandles): void {
  if (virtualMode !== 'virtual-expanded') return;
  const now = Date.now();
  if (now < virtualIgnoreScrollUntil) return;
  if ((now - virtualLastScrollUpdateAt) < VIRTUAL_SCROLL_THROTTLE_MS) return;
  virtualLastScrollUpdateAt = now;

  const remaining = Math.max(0, virtualTotalFiltered - virtualHydratedCount);
  if (remaining <= 0) return;
  const host = handles.scrollHost;
  const distanceToBottom = Math.max(0, host.scrollHeight - (host.scrollTop + host.clientHeight));
  if (distanceToBottom > VIRTUAL_HYDRATE_NEAR_BOTTOM_PX) return;
  virtualIgnoreScrollUntil = Date.now() + 180;
  hydrateMoreVirtualEntries();
}

function queueReplay(reason: string): void {
  clearReplayHydrationTimer();
  if (virtualMode === 'virtual-expanded') {
    void applyVirtualWindow(reason, reason === 'manual' || reason === 'snapshot-change');
    return;
  }
  if (reason !== 'manual' && reason !== 'clear-history') return;
  if (replayQueued) return;
  replayQueued = true;
  window.setTimeout(() => {
    replayQueued = false;
    void replayHistoryToModal({
      preserveScroll: true,
      reason,
      startIndex: 0,
      maxEntries: 10,
    });
  }, FAST_REPLAY_DELAY_MS);
}

function getReplaySourceEntries(order: OrderFilter): ActivityLogEntry[] {
  if (virtualMode === 'virtual-expanded') {
    return getFilteredHistoryEntries(order);
  }
  return getOrderedHistoryRefs(order);
}

async function replayHistoryToModal(opts?: {
  preserveScroll?: boolean;
  reason?: string;
  startIndex?: number;
  maxEntries?: number;
}): Promise<void> {
  if (!started) return;
  if (replayInFlight) return;

  const sourceEntries = getReplaySourceEntries(filters.order);
  const sourceTotal = sourceEntries.length;
  const requestedStartIndex = resolveReplayStartIndex(sourceTotal, Number(opts?.startIndex));
  const requestedMaxEntries = resolveReplayMaxEntries(sourceTotal, Number(opts?.maxEntries));
  const requestedCount = requestedMaxEntries == null
    ? Math.max(0, sourceTotal - requestedStartIndex)
    : requestedMaxEntries;

  if (virtualMode === 'virtual-expanded') {
    readPatchOrder = filters.order;
    readPatchStartIndex = requestedStartIndex;
    readPatchMaxEntries = requestedCount;
  }

  if (writeSupported === false) {
    readPatchOrder = filters.order;
    readPatchStartIndex = requestedStartIndex;
    readPatchMaxEntries = requestedCount;
    replayHydratedCount = requestedCount;
    const patched = installMyDataReadPatch();
    if (!patched) {
      replayMode = 'none';
      if (modalHandles) {
        modalHandles.orderSelect.disabled = true;
        modalHandles.orderSelect.title = 'Order replay unavailable (read-only Jotai store)';
      }
    } else if (modalHandles) {
      modalHandles.orderSelect.disabled = false;
      modalHandles.orderSelect.title = 'Sort order';
      scheduleModalRefresh(modalHandles);
    }
    return;
  }

  const myDataAtom = getAtomByLabel('myDataAtom');
  if (!myDataAtom) {
    writeSupported = false;
    return;
  }

  replayInFlight = true;
  const startedAt = performance.now();
  const scrollElement = (modalHandles?.scrollHost ?? modalHandles?.list) ?? null;
  const preserveScroll = opts?.preserveScroll !== false;
  const beforeScroll = preserveScroll && scrollElement ? scrollElement.scrollTop : 0;
  const payloadEnd = Math.max(
    requestedStartIndex,
    Math.min(sourceTotal, requestedStartIndex + requestedCount),
  );
  const payload = sourceEntries
    .slice(requestedStartIndex, payloadEnd)
    .map((entry) => deepClone(entry));

  suppressIngestUntil = Date.now() + 1200;

  try {
    const current = await readAtomValue<unknown>(myDataAtom);
    if (!isRecord(current)) {
      writeSupported = false;
      return;
    }

    const next = {
      ...current,
      activityLogs: payload,
    };

    await writeAtomValue(myDataAtom, next);
    writeSupported = true;
    replayMode = 'write';
    replayHydratedCount = payload.length;
    readPatchStartIndex = 0;
    readPatchMaxEntries = null;
    uninstallMyDataReadPatch();
    if (modalHandles) {
      modalHandles.orderSelect.disabled = false;
      modalHandles.orderSelect.title = 'Sort order';
    }
    clearReplayHydrationTimer();
  } catch (error) {
    clearReplayHydrationTimer();
    writeSupported = false;
    readPatchOrder = filters.order;
    readPatchStartIndex = requestedStartIndex;
    readPatchMaxEntries = requestedCount;
    replayHydratedCount = requestedCount;
    const patched = installMyDataReadPatch();
    if (modalHandles) {
      if (patched) {
        modalHandles.orderSelect.disabled = false;
        modalHandles.orderSelect.title = 'Sort order';
      } else {
        modalHandles.orderSelect.disabled = true;
        modalHandles.orderSelect.title = 'Order replay unavailable (read-only Jotai store)';
      }
    }
    if (!patched) {
      replayMode = 'none';
    }
    log(`[ActivityLogNative] Replay disabled (${opts?.reason ?? 'unknown'})`, error);
  } finally {
    replayInFlight = false;
    if (virtualMode === 'virtual-expanded') {
      virtualReplayDurationMs = Math.max(0, performance.now() - startedAt);
    }
    if (preserveScroll && scrollElement) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const maxScrollable = Math.max(0, scrollElement.scrollHeight - scrollElement.clientHeight);
          scrollElement.scrollTop = Math.min(Math.max(0, beforeScroll), maxScrollable);
        });
      });
    }
    if (modalHandles) {
      scheduleModalRefresh(modalHandles);
    }

    if (
      virtualMode === 'virtual-expanded'
      && virtualPendingWindowStart != null
      && modalHandles
    ) {
      const pendingStart = virtualPendingWindowStart;
      const pendingReason = virtualPendingReason || 'virtual-pending';
      const pendingPreserve = virtualPendingPreserveScroll;
      virtualPendingWindowStart = null;
      virtualPendingReason = '';
      virtualPendingPreserveScroll = false;
      if (pendingStart !== virtualHydratedCount) {
        virtualHydratedCount = pendingStart;
      }
      void applyVirtualWindow(pendingReason, pendingPreserve);
    }
  }
}

function attachModal(modal: ModalRef): void {
  if (
    modalHandles
    && modalHandles.root === modal.root
    && modalHandles.list === modal.list
    && modalHandles.root.isConnected
  ) {
    return;
  }

  detachModal();
  ensureStyles();
  const ariesFilterPresent = hasAriesActivityFilter(modal);
  const scrollHost = resolveScrollHost(modal);

  const toolbar = document.createElement('div');
  toolbar.className = 'qpm-activity-toolbar';
  toolbar.setAttribute(TOOLBAR_ATTR, '1');

  const typeSelect = buildSelect(TYPE_OPTIONS, filters.type);
  typeSelect.title = 'Filter by type';
  typeSelect.addEventListener('change', () => {
    filters.type = typeSelect.value as TypeFilter;
    saveAndRenderFilters();
  });

  const orderSelect = buildSelect(ORDER_OPTIONS, filters.order);
  orderSelect.title = 'Sort order';
  const replayUnavailable = writeSupported === false && !(patchedMyDataAtom && patchedMyDataReadKey && patchedMyDataReadOriginal);
  if (replayUnavailable) {
    orderSelect.disabled = true;
    orderSelect.title = 'Order replay unavailable (read-only Jotai store)';
  }
  orderSelect.addEventListener('change', () => {
    filters.order = orderSelect.value as OrderFilter;
    persistFilters();
    if (virtualMode === 'virtual-expanded') {
      virtualWindowStart = 0;
      virtualHydratedCount = VIRTUAL_WINDOW_SIZE;
      virtualWindowEnd = virtualHydratedCount;
      invalidateVirtualCaches();
      queueReplay('order-change');
      return;
    }
    if (writeSupported === false && !(patchedMyDataAtom && patchedMyDataReadKey && patchedMyDataReadOriginal)) {
      if (modalHandles) {
        scheduleModalRefresh(modalHandles);
      }
      return;
    }
    if (modalHandles) {
      scheduleModalRefresh(modalHandles);
    }
  });

  const petDropdown = createSpeciesDropdown({
    placeholder: 'Pet: All',
    onChange: (value) => {
      filters.petSpecies = value;
      saveAndRenderFilters();
    },
  });
  petDropdown.setValue(filters.petSpecies);

  const plantDropdown = createSpeciesDropdown({
    placeholder: 'Plant: All',
    onChange: (value) => {
      filters.plantSpecies = value;
      saveAndRenderFilters();
    },
  });
  plantDropdown.setValue(filters.plantSpecies);

  const summary = document.createElement('div');
  summary.className = 'qpm-activity-summary';
  if (!showSummaryInDebug) {
    summary.classList.add('is-hidden');
  }

  toolbar.append(typeSelect, orderSelect, petDropdown.root, plantDropdown.root, summary);
  modal.content.insertBefore(toolbar, modal.content.firstChild);

  const listScrollListener: EventListener = () => {
    if (!modalHandles) return;
    maybeUpdateVirtualWindowFromScroll(modalHandles);
  };

  const listClickCaptureListener: EventListener = (event) => {
    if (!modalHandles) return;
    const loadMoreButton = getLoadMoreButtonFromTarget(event.target);
    if (!loadMoreButton) return;
    if (virtualMode === 'collapsed') {
      window.setTimeout(() => {
        if (!modalHandles) return;
        if (virtualMode !== 'collapsed') return;
        enterVirtualExpandedMode(modalHandles, loadMoreButton);
      }, 0);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    hydrateMoreVirtualEntries();
  };

  const scrollTargets = collectScrollTargets(scrollHost, modal.list);

  const handles: ModalHandles = {
    ...modal,
    toolbar,
    typeSelect,
    orderSelect,
    petDropdown,
    plantDropdown,
    summary,
    ariesFilterPresent,
    scrollHost,
    scrollTargets,
    listObserver: new MutationObserver(() => {
      if (!modalHandles) return;
      scheduleModalRefresh(modalHandles);
    }),
    listScrollListener,
    listClickCaptureListener,
    refreshQueued: false,
    refreshTimer: null,
    speciesOptionsReady: false,
  };

  handles.listObserver.observe(modal.list, {
    childList: true,
    subtree: true,
  });
  for (const target of scrollTargets) {
    target.addEventListener('scroll', listScrollListener, { passive: true });
  }
  modal.list.addEventListener('click', listClickCaptureListener, true);

  modalHandles = handles;
  ensureSpeciesDropdownOptions(handles);
  scheduleModalRefresh(handles);
}

function detachModal(): void {
  if (!modalHandles) return;
  clearReplayHydrationTimer();
  if (modalHandles.refreshTimer != null) {
    clearTimeout(modalHandles.refreshTimer);
    modalHandles.refreshTimer = null;
  }
  try {
    modalHandles.listObserver.disconnect();
  } catch {}
  try {
    for (const target of modalHandles.scrollTargets) {
      target.removeEventListener('scroll', modalHandles.listScrollListener);
    }
  } catch {}
  try {
    modalHandles.list.removeEventListener('click', modalHandles.listClickCaptureListener, true);
  } catch {}
  try {
    restoreNativeLoadMoreButtons(modalHandles.list);
  } catch {}
  try {
    removeVirtualLoadMoreButton(modalHandles.list);
  } catch {}
  try {
    restoreVirtualListLayout(modalHandles.list);
  } catch {}
  try {
    removeVirtualSpacers(modalHandles.list);
  } catch {}
  try {
    modalHandles.petDropdown.destroy();
    modalHandles.plantDropdown.destroy();
  } catch {}
  try {
    modalHandles.toolbar.remove();
  } catch {}
  uninstallMyDataReadPatch();
  resetVirtualMode();
  modalHandles = null;
}

function syncModalMount(): void {
  const modal = findActivityModal();
  if (!modal) {
    detachModal();
    return;
  }
  attachModal(modal);
}

function queueModalSync(): void {
  if (modalSyncTimer != null) return;
  modalSyncTimer = window.setTimeout(() => {
    modalSyncTimer = null;
    syncModalMount();
  }, 100);
}

function startModalObserver(): void {
  if (modalPollStop) return;
  syncModalMount();
  modalPollStop = visibleInterval('qpm-activity-modal-sync', syncModalMount, 250);
}

function stopModalObserver(): void {
  if (modalPollStop) {
    modalPollStop();
    modalPollStop = null;
  }
  if (modalSyncTimer != null) {
    clearTimeout(modalSyncTimer);
    modalSyncTimer = null;
  }
  detachModal();
}

function ingestActivityLogs(value: unknown): void {
  if (Date.now() < suppressIngestUntil) return;

  const nextSnapshot = normalizeList(extractActivityArray(value));
  const prevSnapshot = lastSnapshot;
  lastSnapshot = nextSnapshot;

  if (!prevSnapshot.length && !nextSnapshot.length) return;
  const changed = mergeSnapshots(prevSnapshot, nextSnapshot);
  if (!changed) {
    if (modalHandles) scheduleModalRefresh(modalHandles);
    return;
  }

  if (modalHandles) {
    if (virtualMode === 'virtual-expanded') {
      invalidateVirtualCaches();
      queueReplay('snapshot-change');
    } else {
      scheduleModalRefresh(modalHandles);
    }
  }
}

async function startMyDataActivitySubscription(): Promise<void> {
  if (myDataUnsubscribe) return;
  const atom = getAtomByLabel('myDataAtom');
  if (!atom) {
    replayMode = 'none';
    log('[ActivityLogNative] myDataAtom not found; running in DOM-only mode');
    return;
  }

  try {
    const initial = await readAtomValue<unknown>(atom);
    const snapshot = normalizeList(extractActivityArray(initial));
    mergeSnapshots([], snapshot);
    lastSnapshot = snapshot;
  } catch (error) {
    log('[ActivityLogNative] Failed initial myData read', error);
  }

  try {
    myDataUnsubscribe = await subscribeAtom<unknown>(atom, (next) => {
      ingestActivityLogs(next);
    });
  } catch (error) {
    myDataUnsubscribe = null;
    log('[ActivityLogNative] Failed myData subscription', error);
  }
}

function stopMyDataActivitySubscription(): void {
  if (!myDataUnsubscribe) return;
  try {
    myDataUnsubscribe();
  } catch {}
  myDataUnsubscribe = null;
}

function triggerExportJson(entriesToExport: ActivityLogEntry[]): number {
  const payload = JSON.stringify(entriesToExport, null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  link.href = url;
  link.download = `qpm-activity-log-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return entriesToExport.length;
}

function visibleRowSignature(row: HTMLElement): string {
  const message = normalizeWhitespace(row.querySelector('div')?.textContent || row.textContent || '');
  const time = normalizeWhitespace(row.querySelector('p')?.textContent || '');
  return `${message}|${time}`;
}

export function setActivityLogEnhancerSummaryVisible(enabled?: boolean): boolean {
  if (typeof enabled === 'boolean') {
    showSummaryInDebug = enabled;
    saveSummaryDebugPreference();
    if (modalHandles) {
      scheduleModalRefresh(modalHandles);
    }
  }
  return showSummaryInDebug;
}

export function getActivityLogEnhancerStatus(): {
  enabled: boolean;
  started: boolean;
  historyCount: number;
  replaySafeCount: number;
  order: OrderFilter;
  type: TypeFilter;
  action: ActionKey;
  petSpecies: string;
  plantSpecies: string;
  replaySupported: boolean | null;
  replayMode: 'unknown' | 'write' | 'read_patch' | 'none';
  ariesFilterPresent: boolean;
  mode: 'collapsed' | 'virtual-expanded';
  virtualizationActive: boolean;
  windowStart: number;
  windowEnd: number;
  totalFiltered: number;
  topSpacerPx: number;
  bottomSpacerPx: number;
} {
  const supported = replayMode === 'write' || replayMode === 'read_patch'
    ? true
    : (replayMode === 'none' ? false : null);
  return {
    enabled: enhancerEnabled,
    started,
    historyCount: history.length,
    replaySafeCount: history.filter((entry) => isReplaySafeEntry(entry)).length,
    order: filters.order,
    type: filters.type,
    action: filters.action,
    petSpecies: filters.petSpecies || '',
    plantSpecies: filters.plantSpecies || '',
    replaySupported: supported,
    replayMode,
    ariesFilterPresent: Boolean(modalHandles?.ariesFilterPresent),
    mode: virtualMode,
    virtualizationActive: virtualMode === 'virtual-expanded',
    windowStart: virtualWindowStart,
    windowEnd: virtualWindowEnd,
    totalFiltered: virtualTotalFiltered,
    topSpacerPx: virtualTopSpacerPx,
    bottomSpacerPx: virtualBottomSpacerPx,
  };
}

export function forceActivityLogEnhancerReplay(): boolean {
  if (!started) return false;
  queueReplay('manual');
  return true;
}

export function verifyActivityLogEnhancerEntries(): {
  historyCount: number;
  duplicateEntryKeys: number;
  semanticDuplicateGroups: number;
  visibleRows: number;
  visibleDuplicateRows: number;
} {
  const keyCount = new Map<string, number>();
  const semanticCount = new Map<string, number>();

  for (const entry of history) {
    const key = entryKey(entry);
    keyCount.set(key, (keyCount.get(key) ?? 0) + 1);

    const semantic = `${normalizeToken(readString(entry.action) ?? 'other')}|${normalizeToken(readEntryMessage(entry))}|${Math.round(entry.timestamp / 1000)}`;
    semanticCount.set(semantic, (semanticCount.get(semantic) ?? 0) + 1);
  }

  const duplicateEntryKeys = Array.from(keyCount.values()).filter((count) => count > 1).length;
  const semanticDuplicateGroups = Array.from(semanticCount.values()).filter((count) => count > 1).length;

  const rows = modalHandles ? getEntryElements(modalHandles.list) : [];
  const visibleRows = rows.filter((row) => row.style.display !== 'none').length;
  const rowCount = new Map<string, number>();
  for (const row of rows) {
    if (row.style.display === 'none') continue;
    const signature = visibleRowSignature(row);
    rowCount.set(signature, (rowCount.get(signature) ?? 0) + 1);
  }
  const visibleDuplicateRows = Array.from(rowCount.values()).filter((count) => count > 1).length;

  return {
    historyCount: history.length,
    duplicateEntryKeys,
    semanticDuplicateGroups,
    visibleRows,
    visibleDuplicateRows,
  };
}

export function listActivityLogEnhancerEntries(): unknown[] {
  return history.map((entry) => deepClone(entry));
}

export function exportActivityLogEnhancerEntries(): number {
  return triggerExportJson(getOrderedHistory(filters.order));
}

export function clearActivityLogEnhancerEntries(): number {
  const removed = history.length;
  history = [];
  lastSnapshot = [];
  replayHydratedCount = 0;
  readPatchStartIndex = 0;
  readPatchOrder = filters.order;
  readPatchMaxEntries = null;
  resetVirtualMode();
  clearReplayHydrationTimer();
  saveHistory(history);
  if (modalHandles) {
    queueReplay('clear-history');
    scheduleModalRefresh(modalHandles);
  }
  return removed;
}

export function isActivityLogEnhancerEnabled(): boolean {
  return enhancerEnabled;
}

export async function setActivityLogEnhancerEnabled(enabled: boolean): Promise<boolean> {
  const next = Boolean(enabled);
  if (enhancerEnabled === next) {
    if (next && !started) {
      await startActivityLogEnhancer();
    }
    return enhancerEnabled;
  }

  enhancerEnabled = next;
  saveEnabledPreference();

  if (!next) {
    stopActivityLogEnhancer();
    return enhancerEnabled;
  }

  try {
    await startActivityLogEnhancer();
  } catch (error) {
    enhancerEnabled = false;
    saveEnabledPreference();
    stopActivityLogEnhancer();
    throw error;
  }

  return enhancerEnabled;
}

export async function startActivityLogEnhancer(): Promise<void> {
  enhancerEnabled = loadEnabledPreference();
  if (!enhancerEnabled) {
    log('[ActivityLogNative] disabled by config');
    return;
  }
  if (started) return;
  started = true;

  try {
    replayMode = 'unknown';
    replayHydratedCount = 0;
    readPatchStartIndex = 0;
    readPatchOrder = 'newest';
    readPatchMaxEntries = null;
    resetVirtualMode();
    petLookupEntriesCache = null;
    plantLookupEntriesCache = null;
    petSpeciesOptionsCache = null;
    plantSpeciesOptionsCache = null;
    history = loadHistory();
    historyRevision += 1;
    orderedHistoryCacheKey = '';
    orderedHistoryNewestCache = null;
    orderedHistoryOldestCache = null;
    filters = loadFilters();
    readPatchOrder = filters.order;
    showSummaryInDebug = loadSummaryDebugPreference();
    runLegacyMigrationOnce();
    const ariesMerged = importAriesHistory();
    history = loadHistory();
    historyRevision += 1;

    startModalObserver();
    await startMyDataActivitySubscription();

    if (ariesMerged > 0) {
      log(`[ActivityLogNative] Imported ${ariesMerged} entries from Aries history`);
    }
    log(`[ActivityLogNative] started (${history.length} history entries)`);
  } catch (error) {
    stopActivityLogEnhancer();
    throw error;
  }
}

export function stopActivityLogEnhancer(): void {
  if (!started) return;
  started = false;

  stopMyDataActivitySubscription();
  stopModalObserver();

  replayQueued = false;
  replayInFlight = false;
  suppressIngestUntil = 0;
  writeSupported = null;
  replayMode = 'unknown';
  replayHydratedCount = 0;
  readPatchStartIndex = 0;
  readPatchOrder = filters.order;
  readPatchMaxEntries = null;
  resetVirtualMode();
  petLookupEntriesCache = null;
  plantLookupEntriesCache = null;
  petSpeciesOptionsCache = null;
  plantSpeciesOptionsCache = null;
  orderedHistoryCacheKey = '';
  orderedHistoryNewestCache = null;
  orderedHistoryOldestCache = null;
  clearReplayHydrationTimer();
  uninstallMyDataReadPatch();

  saveHistory(history);
  persistFilters();
  saveSummaryDebugPreference();
  saveEnabledPreference();
  log('[ActivityLogNative] stopped');
}
