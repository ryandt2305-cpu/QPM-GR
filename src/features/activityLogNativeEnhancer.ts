import { addStyle } from '../utils/dom';
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
  listObserver: MutationObserver;
  refreshQueued: boolean;
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
const FAST_REPLAY_INITIAL_BATCH = 450;
const FAST_REPLAY_DELAY_MS = 24;
const FULL_REPLAY_DELAY_MS = 220;
const HYDRATION_STEPS = [1200, 2500, 4000, 5000] as const;
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

let modalObserver: MutationObserver | null = null;
let modalSyncTimer: number | null = null;
let modalHandles: ModalHandles | null = null;
let myDataUnsubscribe: (() => void) | null = null;
let lastSnapshot: ActivityLogEntry[] = [];

let replayQueued = false;
let replayInFlight = false;
let suppressIngestUntil = 0;
let writeSupported: boolean | null = null;
let replayMode: 'unknown' | 'write' | 'read_patch' | 'none' = 'unknown';
let fullReplayTimer: number | null = null;

let patchedMyDataAtom: any | null = null;
let patchedMyDataReadKey: string | null = null;
let patchedMyDataReadOriginal: ((...args: any[]) => unknown) | null = null;

const petIconCache = new Map<string, string | null>();
const plantIconCache = new Map<string, string | null>();
const eggIconCache = new Map<string, string | null>();

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
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
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
  const pets = buildPetLookupEntries();
  const plants = buildPlantLookupEntries();
  const context = buildHistorySpeciesContext(pets, plants);
  const rows = getEntryElements(list);
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
  const source = kind === 'pet'
    ? buildPetLookupEntries()
    : buildPlantLookupEntries();

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

function getOrderedHistory(order: OrderFilter): ActivityLogEntry[] {
  const sorted = history
    .slice()
    .sort((a, b) => (order === 'oldest' ? a.timestamp - b.timestamp : b.timestamp - a.timestamp));
  return sorted.map((entry) => deepClone(entry));
}

function buildDisplayLogsWithHistory(realLogs: ActivityLogEntry[]): ActivityLogEntry[] {
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
  merged.sort((a, b) => (filters.order === 'oldest' ? a.timestamp - b.timestamp : b.timestamp - a.timestamp));
  return merged.map((entry) => deepClone(entry));
}

function uninstallMyDataReadPatch(): void {
  if (!patchedMyDataAtom || !patchedMyDataReadKey || !patchedMyDataReadOriginal) return;
  try {
    patchedMyDataAtom[patchedMyDataReadKey] = patchedMyDataReadOriginal;
  } catch {}
  patchedMyDataAtom = null;
  patchedMyDataReadKey = null;
  patchedMyDataReadOriginal = null;
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
    const mergedLogs = buildDisplayLogsWithHistory(realLogs);
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
    meta.row.style.display = visible ? '' : 'none';
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

function refreshModalUI(handles: ModalHandles): void {
  const metadata = buildRowMetadata(handles.list);

  const petOptions = buildSpeciesOptions('pet');
  const plantOptions = buildSpeciesOptions('plant');
  const nextPetFilter = normalizeSpeciesFilterValue(petOptions, filters.petSpecies);
  const nextPlantFilter = normalizeSpeciesFilterValue(plantOptions, filters.plantSpecies);
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

  handles.petDropdown.setOptions(petOptions);
  handles.plantDropdown.setOptions(plantOptions);
  handles.petDropdown.setValue(filters.petSpecies);
  handles.plantDropdown.setValue(filters.plantSpecies);

  const totalRows = metadata.length;
  const visibleRows = applyFiltersToRows(metadata);
  updateSummary(handles, visibleRows, totalRows);
}

function scheduleModalRefresh(handles: ModalHandles): void {
  if (handles.refreshQueued) return;
  handles.refreshQueued = true;
  requestAnimationFrame(() => {
    handles.refreshQueued = false;
    if (!modalHandles) return;
    refreshModalUI(modalHandles);
  });
}

function nextHydrationTarget(currentCount: number, totalCount: number): number {
  const total = Math.max(0, Math.floor(totalCount));
  if (total <= 0) return 0;
  const current = Math.max(0, Math.floor(currentCount));
  for (const step of HYDRATION_STEPS) {
    if (current < step) {
      return Math.min(total, step);
    }
  }
  return total;
}

function scheduleDeferredFullReplay(baseReason: string, maxEntries: number): void {
  if (fullReplayTimer != null) {
    clearTimeout(fullReplayTimer);
    fullReplayTimer = null;
  }
  const limit = Math.max(1, Math.floor(maxEntries));
  fullReplayTimer = window.setTimeout(() => {
    fullReplayTimer = null;
    if (!started || !modalHandles) return;
    void replayHistoryToModal({
      preserveScroll: false,
      reason: `${baseReason}-full`,
      maxEntries: limit,
    });
  }, FULL_REPLAY_DELAY_MS);
}

async function replayHistoryToModal(opts?: {
  preserveScroll?: boolean;
  reason?: string;
  maxEntries?: number;
}): Promise<void> {
  if (!started) return;
  if (replayInFlight) return;
  if (writeSupported === false) {
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
  const list = modalHandles?.list ?? null;
  const preserveScroll = opts?.preserveScroll !== false;
  const beforeScroll = preserveScroll && list ? list.scrollTop : 0;
  const ordered = getOrderedHistory(filters.order);
  const orderedTotal = ordered.length;
  const maxEntries = Number(opts?.maxEntries);
  const useLimitedPayload = Number.isFinite(maxEntries) && maxEntries > 0 && orderedTotal > maxEntries;
  const payload = useLimitedPayload ? ordered.slice(0, Math.max(1, Math.floor(maxEntries))) : ordered;

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
    uninstallMyDataReadPatch();
    if (modalHandles) {
      modalHandles.orderSelect.disabled = false;
      modalHandles.orderSelect.title = 'Sort order';
    }
    if (useLimitedPayload) {
      const nextTarget = nextHydrationTarget(payload.length, orderedTotal);
      if (nextTarget > payload.length) {
        scheduleDeferredFullReplay(opts?.reason ?? 'replay', nextTarget);
      }
    }
  } catch (error) {
    writeSupported = false;
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
    if (preserveScroll && list) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const maxScrollable = Math.max(0, list.scrollHeight - list.clientHeight);
          list.scrollTop = Math.min(Math.max(0, beforeScroll), maxScrollable);
        });
      });
    }
    if (modalHandles) {
      scheduleModalRefresh(modalHandles);
    }
  }
}

function queueReplay(reason: string): void {
  if (fullReplayTimer != null) {
    clearTimeout(fullReplayTimer);
    fullReplayTimer = null;
  }
  if (replayQueued) return;
  replayQueued = true;
  const fastInitial = reason === 'modal-open' && history.length > FAST_REPLAY_INITIAL_BATCH;
  const delay = fastInitial ? FAST_REPLAY_DELAY_MS : 90;
  window.setTimeout(() => {
    replayQueued = false;
    void replayHistoryToModal({
      preserveScroll: true,
      reason,
      maxEntries: fastInitial ? FAST_REPLAY_INITIAL_BATCH : undefined,
    });
  }, delay);
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
    if (writeSupported === false) {
      if (modalHandles) {
        scheduleModalRefresh(modalHandles);
      }
      return;
    }
    queueReplay('order-change');
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

  const handles: ModalHandles = {
    ...modal,
    toolbar,
    typeSelect,
    orderSelect,
    petDropdown,
    plantDropdown,
    summary,
    ariesFilterPresent,
    listObserver: new MutationObserver(() => {
      if (!modalHandles) return;
      scheduleModalRefresh(modalHandles);
    }),
    refreshQueued: false,
  };

  handles.listObserver.observe(modal.list, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  modalHandles = handles;
  scheduleModalRefresh(handles);
  queueReplay('modal-open');
}

function detachModal(): void {
  if (!modalHandles) return;
  if (fullReplayTimer != null) {
    clearTimeout(fullReplayTimer);
    fullReplayTimer = null;
  }
  try {
    modalHandles.listObserver.disconnect();
  } catch {}
  try {
    modalHandles.petDropdown.destroy();
    modalHandles.plantDropdown.destroy();
  } catch {}
  try {
    modalHandles.toolbar.remove();
  } catch {}
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
  if (modalObserver) return;
  modalObserver = new MutationObserver(() => {
    queueModalSync();
  });
  modalObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
  syncModalMount();
}

function stopModalObserver(): void {
  if (modalObserver) {
    modalObserver.disconnect();
    modalObserver = null;
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
    queueReplay('snapshot-change');
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
    history = loadHistory();
    filters = loadFilters();
    showSummaryInDebug = loadSummaryDebugPreference();
    runLegacyMigrationOnce();
    const ariesMerged = importAriesHistory();
    history = loadHistory();

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
  if (fullReplayTimer != null) {
    clearTimeout(fullReplayTimer);
    fullReplayTimer = null;
  }
  uninstallMyDataReadPatch();

  saveHistory(history);
  persistFilters();
  saveSummaryDebugPreference();
  saveEnabledPreference();
  log('[ActivityLogNative] stopped');
}
