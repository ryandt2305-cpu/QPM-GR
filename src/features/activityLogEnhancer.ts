import { getAtomByLabel, subscribeAtom } from '../core/jotaiBridge';
import { pageWindow } from '../core/pageContext';
import {
  getAnySpriteDataUrl,
  getCropSpriteDataUrlWithMutations,
  getPetSpriteDataUrlWithMutations,
  getProduceSpriteDataUrlWithMutations,
} from '../sprite-v2/compat';
import { getInventoryItems, type InventoryItem } from '../store/inventory';
import { getActivePetInfos, type ActivePetInfo } from '../store/pets';
import { getAbilityDefinition, computeAbilityStats } from '../data/petAbilities';
import { buildAbilityValuationContext, resolveDynamicAbilityEffect } from './abilityValuation';
import { log } from '../utils/logger';
import { storage } from '../utils/storage';

type UnknownMap = Record<string, unknown>;

type ActivitySource = 'native' | 'fallback';
type ActivityOrigin = 'native_dom' | 'atom' | 'ws_pending';
type EntryQuality = 'native' | 'rich' | 'formatted' | 'pending';
type TemplateFamily =
  | 'purchase'
  | 'sell'
  | 'feed'
  | 'plant'
  | 'harvest'
  | 'hatch'
  | 'boost'
  | 'storage'
  | 'travel'
  | 'other_supported';
type ActivityCategory =
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

type SortMode = 'time_desc' | 'time_asc' | 'action_asc' | 'action_desc';
type SourceFilter = 'all' | ActivitySource;
type CategoryFilter = 'all' | ActivityCategory;

const TEMPLATE_FAMILIES: TemplateFamily[] = [
  'purchase',
  'sell',
  'feed',
  'plant',
  'harvest',
  'hatch',
  'boost',
  'storage',
  'travel',
  'other_supported',
];

interface ActivityEntry {
  id: string;
  timestamp: number;
  action: string;
  abilityId: string | null;
  message: string;
  rawMessage: string;
  fingerprint: string;
  family: TemplateFamily;
  quality: EntryQuality;
  qualityReason: string | null;
  origin: ActivityOrigin;
  renderable: boolean;
  supersededBy: string | null;
  resolvedAt: number | null;
  quantity: number | null;
  priceCoins: number | null;
  source: ActivitySource;
  category: ActivityCategory;
  petSpecies: string | null;
  plantSpecies: string | null;
  itemLabel: string | null;
  secondaryLabel: string | null;
  iconHints: string[];
}

interface FilterState {
  search: string;
  source: SourceFilter;
  category: CategoryFilter;
  petSpecies: string;
  plantSpecies: string;
  sort: SortMode;
}

interface PendingAction {
  id: string;
  createdAt: number;
  expiresAt: number;
  action: string;
  message: string | null;
  rawMessage: string | null;
  family: TemplateFamily;
  category: ActivityCategory;
  itemLabel: string | null;
  petLabel: string | null;
  secondaryLabel: string | null;
  quantity: number | null;
  priceCoins: number | null;
  petSpecies: string | null;
  plantSpecies: string | null;
  iconHints: string[];
  tokens: string[];
}

interface MergeCandidateFields {
  itemLabel?: string | null;
  secondaryLabel?: string | null;
  petSpecies?: string | null;
  plantSpecies?: string | null;
  quantity?: number | null;
  priceCoins?: number | null;
  abilityId?: string | null;
  iconHints?: string[];
}

interface BuiltActionData {
  action: string;
  family: TemplateFamily;
  category: ActivityCategory;
  message: string | null;
  rawMessage: string | null;
  itemLabel: string | null;
  secondaryLabel: string | null;
  quantity: number | null;
  priceCoins: number | null;
  petSpecies: string | null;
  plantSpecies: string | null;
  iconHints: string[];
}

interface RoomConnectionLike {
  sendMessage: (payload: unknown) => unknown;
}

interface PageWindowWithRoomConnection extends Window {
  MagicCircle_RoomConnection?: RoomConnectionLike;
}

interface ModalHandles {
  root: HTMLElement;
  header: HTMLElement;
  content: HTMLElement;
  list: HTMLElement;
  toolbar: HTMLElement;
  summary: HTMLElement;
  controls: {
    category: HTMLSelectElement;
    sort: HTMLSelectElement;
  };
  listObserver: MutationObserver;
  onListClick: (event: Event) => void;
  rowTemplates: Partial<Record<ActivityCategory, NativeRowTemplate>>;
  nativeRowsByEntryId: Map<string, HTMLElement>;
}

interface NativeRowTemplate {
  rowClass: string;
  textWrapClass: string;
  messageClass: string;
  timeWrapClass: string;
  timeClass: string;
  iconWrapClass: string;
  iconInnerClass: string;
  highlightClass: string;
  iconHTML: string;
}

function createPresetRowTemplate(): NativeRowTemplate {
  return {
    rowClass: 'McGrid qpm-activity-row',
    textWrapClass: 'qpm-activity-row-text',
    messageClass: 'qpm-activity-row-message',
    timeWrapClass: 'qpm-activity-row-time-wrap',
    timeClass: 'qpm-activity-row-time',
    iconWrapClass: 'qpm-activity-row-icon-wrap',
    iconInnerClass: 'qpm-activity-row-icon-slot',
    highlightClass: 'qpm-activity-highlight',
    iconHTML: '',
  };
}

const PRESET_ROW_TEMPLATES: Record<ActivityCategory | 'other', NativeRowTemplate> = {
  purchase: createPresetRowTemplate(),
  sell: createPresetRowTemplate(),
  feed: createPresetRowTemplate(),
  plant: createPresetRowTemplate(),
  harvest: createPresetRowTemplate(),
  hatch: createPresetRowTemplate(),
  boost: createPresetRowTemplate(),
  travel: createPresetRowTemplate(),
  storage: createPresetRowTemplate(),
  other: createPresetRowTemplate(),
};

const STORAGE_KEY_ENTRIES = 'qpm.activityLogEnhanced.entries.v3';
const STORAGE_KEY_ENTRIES_V2 = 'qpm.activityLogEnhanced.entries.v2';
const STORAGE_KEY_ENTRIES_LEGACY = 'qpm.activityLogEnhanced.entries.v1';
const STORAGE_KEY_FILTERS = 'qpm.activityLogEnhanced.filters.v1';

const MAX_ENTRIES = 5000;
const MAX_RENDERED_ENTRIES = 180;
const PENDING_TIMEOUT_MS = 5000;
const DUPLICATE_WINDOW_MS = 30_000;
const ACTION_SWEEP_INTERVAL_MS = 1000;
const CONNECTION_PATCH_INTERVAL_MS = 1500;
const STYLE_ID = 'qpm-activity-log-enhancer-style';

const NATIVE_LIST_SELECTOR = 'div.McFlex.css-iek5kf > div.McFlex';
const TITLE_SELECTOR = 'p.chakra-text';
const ENHANCED_ROW_ATTR = 'data-qpm-enhanced-row';
const HIDDEN_NATIVE_ATTR = 'data-qpm-native-hidden';
const PREV_DISPLAY_ATTR = 'data-qpm-prev-display';
const NATIVE_ENTRY_ID_ATTR = 'data-qpm-native-entry-id';

const DEFAULT_FILTERS: FilterState = {
  search: '',
  source: 'all',
  category: 'all',
  petSpecies: '',
  plantSpecies: '',
  sort: 'time_desc',
};

const CATEGORY_OPTIONS: Array<{ value: CategoryFilter; label: string }> = [
  { value: 'all', label: 'All Categories' },
  { value: 'purchase', label: 'Purchase' },
  { value: 'sell', label: 'Sell' },
  { value: 'feed', label: 'Feed' },
  { value: 'plant', label: 'Plant' },
  { value: 'harvest', label: 'Harvest' },
  { value: 'hatch', label: 'Hatch' },
  { value: 'boost', label: 'Boost' },
  { value: 'travel', label: 'Travel' },
  { value: 'storage', label: 'Storage' },
  { value: 'other', label: 'Other' },
];

const IGNORED_ACTION_TYPES = new Set<string>([
  'PlayerPosition',
  'CheckFriendBonus',
]);

const TRACKED_ACTION_PATTERNS = [
  /purchase/i,
  /sell/i,
  /feed/i,
  /plant/i,
  /harvest/i,
  /hatch/i,
  /teleport/i,
  /storage/i,
  /swap/i,
];

const RESOLVER_CACHE_TTL_MS = 1500;
const UUID_TOKEN_RE = /\b[0-9a-f]{8}(?:[-\s]?[0-9a-f]{4}){3}[-\s]?[0-9a-f]{12}\b/i;
const RAW_ACTION_TOKEN_RE = /^[a-z]+(?:[A-Z][a-z0-9]*)+[A-Za-z0-9]*$/;

let started = false;
let entryCounter = 0;
let entries: ActivityEntry[] = [];
let filters: FilterState = loadFiltersFromStorage();
let pendingActions: PendingAction[] = [];

let modalHandles: ModalHandles | null = null;
let modalObserver: MutationObserver | null = null;
let actionSweepTimer: number | null = null;
let connectionPatchTimer: number | null = null;
let saveEntriesTimer: number | null = null;
let saveFiltersTimer: number | null = null;
let renderQueued = false;
let modalSyncTimer: number | null = null;
let showAllAfterNativeLoadMore = false;

let myDataUnsubscribe: (() => void) | null = null;

let patchedConnection: RoomConnectionLike | null = null;
let originalSendMessage: ((payload: unknown) => unknown) | null = null;
let isApplyingListRender = false;

const seenStableKeys = new Map<string, number>();
const entryByFingerprint = new Map<string, ActivityEntry>();
const nativeRowSignatures = new WeakMap<HTMLElement, string>();

interface ResolverSnapshot {
  builtAt: number;
  activePets: ActivePetInfo[];
  inventoryItems: InventoryItem[];
  petsByKey: Map<string, ActivePetInfo>;
  inventoryByKey: Map<string, InventoryItem[]>;
}

let resolverSnapshotCache: ResolverSnapshot | null = null;

function isRecord(value: unknown): value is UnknownMap {
  return !!value && typeof value === 'object';
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function stripTrailingAgeLabel(value: string): string {
  return normalizeWhitespace(value).replace(/\s*(just\s*now|\d+\s*[smhd]\s*ago)\s*$/i, '').trim();
}

function normalizeToken(value: string): string {
  return normalizeWhitespace(value).toLowerCase();
}

function normalizeLookupKey(value: string): string {
  return normalizeToken(value).replace(/[^a-z0-9]/g, '');
}

function isUuidLikeToken(value: string): boolean {
  const compact = value.replace(/[^0-9a-f]/gi, '');
  return compact.length === 32 && /^[0-9a-f]{32}$/i.test(compact);
}

function containsUuidLikeToken(value: string): boolean {
  if (!value) return false;
  if (UUID_TOKEN_RE.test(value)) return true;
  return value
    .split(/\s+/)
    .some((token) => isUuidLikeToken(token));
}

function isRawActionTokenMessage(value: string): boolean {
  if (/^\s*you\s+/i.test(value)) return false;
  const compact = value.replace(/\s+/g, '');
  if (!compact) return false;
  if (RAW_ACTION_TOKEN_RE.test(compact)) {
    return !compact.toLowerCase().startsWith('you');
  }
  return false;
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = normalizeWhitespace(value);
  return normalized.length > 0 ? normalized : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toTimestamp(value: unknown, fallbackNow = Date.now()): number {
  const numeric = readNumber(value);
  if (numeric == null) return fallbackNow;
  if (numeric > 1e12) return Math.floor(numeric);
  if (numeric > 1e9) return Math.floor(numeric * 1000);
  return fallbackNow;
}

function makeEntryId(): string {
  entryCounter += 1;
  return `qpm-activity-${Date.now()}-${entryCounter}`;
}

function parseRelativeTimestamp(label: string, now = Date.now()): number {
  const normalized = normalizeToken(label);
  if (normalized === 'just now') return now;

  const minSecMatch = normalized.match(/^(\d+)\s*m\s*(\d+)\s*s\s*ago$/);
  if (minSecMatch) {
    const minutes = Number(minSecMatch[1] ?? 0);
    const seconds = Number(minSecMatch[2] ?? 0);
    const raw = now - (minutes * 60 + seconds) * 1000;
    return Math.floor(raw / 1000) * 1000;
  }

  const singleMatch = normalized.match(/^(\d+)\s*(s|m|h|d|w|mo|y)\s*ago$/);
  if (!singleMatch) return now;

  const amount = Number(singleMatch[1] ?? 0);
  const unit = singleMatch[2] ?? 's';
  const unitMs: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
    mo: 2_592_000_000,
    y: 31_536_000_000,
  };
  const ms = unitMs[unit] ?? 1000;
  const raw = now - amount * ms;
  return Math.floor(raw / ms) * ms;
}

function splitMessageAndTime(rawText: string): { message: string; timeLabel: string | null } {
  const text = normalizeWhitespace(rawText);
  const match = text.match(/(just now|\d+\s*m\s*\d+\s*s\s*ago|\d+\s*(?:s|m|h|d|w|mo|y)\s*ago)$/i);
  if (!match) {
    return { message: text, timeLabel: null };
  }

  const timeLabel = match[1] ?? null;
  if (!timeLabel) {
    return { message: text, timeLabel: null };
  }

  const message = normalizeWhitespace(text.slice(0, Math.max(0, text.length - timeLabel.length)));
  return { message, timeLabel };
}

function inferCategory(action: string, message: string): ActivityCategory {
  const haystack = `${action} ${message}`.toLowerCase();
  if (haystack.includes('harvest')) return 'harvest';
  if (haystack.includes('plant')) return 'plant';
  if (haystack.includes('feed')) return 'feed';
  if (haystack.includes('purchase')) return 'purchase';
  if (haystack.includes('sold') || haystack.includes('sell')) return 'sell';
  if (haystack.includes('hatch')) return 'hatch';
  if (haystack.includes('boost') || haystack.includes('sped up')) return 'boost';
  if (haystack.includes('teleport') || haystack.includes('travel')) return 'travel';
  if (haystack.includes('storage') || haystack.includes('putiteminstorage') || haystack.includes('retrieveitemfromstorage')) {
    return 'storage';
  }
  return 'other';
}

function normalizeActionType(action: string): string {
  return action
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
}

function toTitleCase(value: string): string {
  if (/[+()]/.test(value)) return normalizeWhitespace(value);
  return normalizeWhitespace(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      if (lower === 'xp') return 'XP';
      if (/^\d+[smhd]$/.test(lower)) return part;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

function isLikelyPetInventoryItem(item: InventoryItem): boolean {
  if (typeof item.itemType === 'string' && /pet/i.test(item.itemType)) return true;
  if (Array.isArray(item.abilities) && item.abilities.length > 0) return true;
  if (typeof item.strength === 'number' && Number.isFinite(item.strength)) return true;
  return false;
}

function pushInventoryIndex(map: Map<string, InventoryItem[]>, key: string | null | undefined, item: InventoryItem): void {
  const clean = readString(key);
  if (!clean) return;
  const normalized = normalizeLookupKey(clean);
  if (!normalized) return;
  const current = map.get(normalized);
  if (!current) {
    map.set(normalized, [item]);
    return;
  }
  if (!current.includes(item)) {
    current.push(item);
  }
}

function pushPetIndex(map: Map<string, ActivePetInfo>, key: string | null | undefined, pet: ActivePetInfo): void {
  const clean = readString(key);
  if (!clean) return;
  const normalized = normalizeLookupKey(clean);
  if (!normalized) return;
  if (!map.has(normalized)) {
    map.set(normalized, pet);
  }
}

function buildResolverSnapshot(): ResolverSnapshot {
  const activePets = getActivePetInfos();
  const inventoryItems = getInventoryItems();
  const petsByKey = new Map<string, ActivePetInfo>();
  const inventoryByKey = new Map<string, InventoryItem[]>();

  for (const pet of activePets) {
    pushPetIndex(petsByKey, pet.petId, pet);
    pushPetIndex(petsByKey, pet.slotId, pet);
    pushPetIndex(petsByKey, pet.species, pet);
    pushPetIndex(petsByKey, pet.name, pet);
  }

  for (const item of inventoryItems) {
    pushInventoryIndex(inventoryByKey, item.id, item);
    pushInventoryIndex(inventoryByKey, item.itemId, item);
    pushInventoryIndex(inventoryByKey, item.species, item);
    pushInventoryIndex(inventoryByKey, item.name, item);
    pushInventoryIndex(inventoryByKey, item.displayName, item);
  }

  return {
    builtAt: Date.now(),
    activePets,
    inventoryItems,
    petsByKey,
    inventoryByKey,
  };
}

function getResolverSnapshot(): ResolverSnapshot {
  const now = Date.now();
  if (!resolverSnapshotCache || now - resolverSnapshotCache.builtAt > RESOLVER_CACHE_TTL_MS) {
    resolverSnapshotCache = buildResolverSnapshot();
  }
  return resolverSnapshotCache;
}

function pickInventoryItemForRole(items: InventoryItem[], expectPet: boolean): InventoryItem | null {
  if (!items.length) return null;
  if (expectPet) {
    const pet = items.find((item) => isLikelyPetInventoryItem(item));
    return pet ?? items[0] ?? null;
  }
  const nonPet = items.find((item) => !isLikelyPetInventoryItem(item));
  return nonPet ?? items[0] ?? null;
}

function resolveInventoryItem(candidate: string | null | undefined, expectPet: boolean): InventoryItem | null {
  const clean = readString(candidate);
  if (!clean) return null;
  const snapshot = getResolverSnapshot();
  const normalized = normalizeLookupKey(clean);
  if (!normalized) return null;
  const items = snapshot.inventoryByKey.get(normalized) ?? [];
  return pickInventoryItemForRole(items, expectPet);
}

function resolveInventoryDisplayLabel(item: InventoryItem | null): string | null {
  if (!item) return null;
  return readString(item.displayName)
    ?? readString(item.name)
    ?? readString(item.species)
    ?? readString(item.itemId)
    ?? null;
}

function normalizeMutationLabel(value: unknown): string | null {
  const clean = readString(value);
  if (!clean) return null;
  const normalized = normalizeToken(clean).replace(/[^a-z]/g, '');
  if (!normalized) return null;
  switch (normalized) {
    case 'gold':
    case 'golden':
      return 'Gold';
    case 'rainbow':
      return 'Rainbow';
    case 'wet':
      return 'Wet';
    case 'chilled':
      return 'Chilled';
    case 'frozen':
      return 'Frozen';
    case 'dawnlit':
      return 'Dawnlit';
    case 'dawnbound':
      return 'Dawnbound';
    case 'amberlit':
      return 'Amberlit';
    case 'amberbound':
      return 'Amberbound';
    default:
      return toTitleCase(clean);
  }
}

function dedupeMutationList(mutations: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const mutation of mutations) {
    const normalized = normalizeMutationLabel(mutation);
    if (!normalized) continue;
    const key = normalizeToken(normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

function inferGranterMutationsFromAbilities(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const out: string[] = [];
  for (const ability of values) {
    const id = normalizeToken(
      readString(ability)
      ?? (isRecord(ability) ? readString(ability.id) : null)
      ?? (isRecord(ability) ? readString(ability.name) : null)
      ?? '',
    );
    if (!id) continue;
    if (id.includes('rainbowgranter')) out.push('Rainbow');
    if (id.includes('goldgranter')) out.push('Gold');
  }
  return out;
}

function extractMutationsFromUnknown(value: unknown): string[] {
  if (!isRecord(value)) return [];
  const base = Array.isArray(value.mutations) ? value.mutations : [];
  const nested = isRecord(value.pet) && Array.isArray(value.pet.mutations) ? value.pet.mutations : [];
  const asStrings = [...base, ...nested]
    .filter((mutation): mutation is string => typeof mutation === 'string');
  return dedupeMutationList(asStrings);
}

interface ResolvedPetAppearance {
  displayName: string | null;
  species: string | null;
  mutations: string[];
}

function resolvePetAppearanceFromCandidate(candidate: string | null | undefined): ResolvedPetAppearance | null {
  const clean = readString(candidate);
  if (!clean) return null;

  const snapshot = getResolverSnapshot();
  const normalized = normalizeLookupKey(clean);
  if (!normalized) return null;

  const directPet = snapshot.petsByKey.get(normalized);
  if (directPet) {
    const mutations = dedupeMutationList([
      ...directPet.mutations,
      ...inferGranterMutationsFromAbilities(directPet.abilities),
    ]);
    return {
      displayName: readString(directPet.name) ?? readString(directPet.species) ?? clean,
      species: readString(directPet.species)?.toLowerCase() ?? null,
      mutations,
    };
  }

  const invPet = resolveInventoryItem(clean, true);
  if (invPet) {
    const species = readString(invPet.species)?.toLowerCase() ?? null;
    const mutations = dedupeMutationList([
      ...extractMutationsFromUnknown(invPet.raw),
      ...inferGranterMutationsFromAbilities(invPet.abilities),
    ]);
    return {
      displayName: resolveInventoryDisplayLabel(invPet) ?? clean,
      species,
      mutations,
    };
  }

  if (isUuidLikeToken(clean)) {
    return null;
  }

  return {
    displayName: clean,
    species: readString(clean)?.toLowerCase() ?? null,
    mutations: [],
  };
}

function resolvePetFromCandidate(candidate: string | null | undefined): { displayName: string | null; species: string | null } | null {
  const resolved = resolvePetAppearanceFromCandidate(candidate);
  if (!resolved) return null;
  return {
    displayName: resolved.displayName,
    species: resolved.species,
  };
}

function resolveItemLabelFromCandidate(candidate: string | null | undefined, expectPet = false): string | null {
  const clean = readString(candidate);
  if (!clean) return null;
  const item = resolveInventoryItem(clean, expectPet);
  const label = resolveInventoryDisplayLabel(item);
  if (label) return label;
  if (isUuidLikeToken(clean)) return null;
  return clean;
}

function resolveAbilityIdFromEntry(entry: ActivityEntry): string | null {
  const candidates = [
    entry.abilityId,
    stripTrailingAgeLabel(entry.action),
    stripTrailingAgeLabel(entry.rawMessage),
    stripTrailingAgeLabel(entry.message),
  ];
  for (const candidate of candidates) {
    const cleaned = readString(candidate);
    if (!cleaned) continue;
    const definition = getAbilityDefinition(cleaned);
    if (definition) return definition.id;
  }
  return null;
}

function formatCoins(value: number): string {
  return Math.max(0, Math.round(value)).toLocaleString('en-US');
}

function templateFamilyForCategory(category: ActivityCategory): TemplateFamily {
  if (category === 'other') return 'other_supported';
  return category;
}

function isTemplateFamily(value: unknown): value is TemplateFamily {
  return typeof value === 'string' && TEMPLATE_FAMILIES.includes(value as TemplateFamily);
}

const QUALITY_SCORE: Record<EntryQuality, number> = {
  pending: 0,
  formatted: 1,
  rich: 2,
  native: 3,
};

const ORIGIN_PRIORITY: Record<ActivityOrigin, number> = {
  ws_pending: 1,
  atom: 2,
  native_dom: 3,
};

function scoreEntry(entry: ActivityEntry): number {
  return ORIGIN_PRIORITY[entry.origin] * 10 + QUALITY_SCORE[entry.quality];
}

function markSuperseded(entry: ActivityEntry, supersededBy: string): void {
  entry.supersededBy = supersededBy;
  entry.renderable = false;
}

function isNearDuplicatePayload(existing: ActivityEntry, incoming: ActivityEntry): boolean {
  return (
    existing.origin === incoming.origin
    && existing.category === incoming.category
    && normalizeToken(existing.message) === normalizeToken(incoming.message)
    && Math.abs(existing.timestamp - incoming.timestamp) <= DUPLICATE_WINDOW_MS
  );
}

function isLowFidelityTokenMessage(message: string): boolean {
  const normalized = normalizeActionType(message);
  return /^(sell pet|hatch egg|plant egg|purchase egg|purchase seed|insta grow|feed pet|harvest|purchase tool)$/.test(normalized);
}

function parseStructuredFieldsFromMessage(message: string): {
  quantity: number | null;
  priceCoins: number | null;
  itemLabel: string | null;
  petLabel: string | null;
  secondaryLabel: string | null;
  iconHints: string[];
} {
  const parsedMessage = stripTrailingAgeLabel(message);
  const iconHints: string[] = [];
  let quantity: number | null = null;
  let priceCoins: number | null = null;
  let itemLabel: string | null = null;
  let petLabel: string | null = null;
  let secondaryLabel: string | null = null;

  const soldMatch = parsedMessage.match(/^you sold your\s+(.+?)\s+for\s+([\d,]+)/i);
  if (soldMatch) {
    petLabel = readString(soldMatch[1]);
    priceCoins = readNumber((soldMatch[2] ?? '').replace(/,/g, ''));
  }

  const buyMatch = parsedMessage.match(/^you purchased\s+(\d+)\s+(.+?)\s+for\s+([\d,]+)/i);
  if (buyMatch) {
    quantity = readNumber(buyMatch[1]);
    itemLabel = readString(buyMatch[2]);
    priceCoins = readNumber((buyMatch[3] ?? '').replace(/,/g, ''));
  }

  const feedMatch = parsedMessage.match(/^you fed(?: your)?\s+(.+?)\s+(\d+)\s+(.+)$/i);
  if (feedMatch) {
    petLabel = readString(feedMatch[1]);
    quantity = readNumber(feedMatch[2]);
    itemLabel = readString(feedMatch[3]);
    secondaryLabel = petLabel;
  }

  const hatchMatch = parsedMessage.match(/^you hatched your\s+(.+?)\s+and got\s+\d+\s+(.+)$/i);
  if (hatchMatch) {
    itemLabel = readString(hatchMatch[1]);
    petLabel = readString(hatchMatch[2]);
    secondaryLabel = petLabel;
  }

  const plantMatch = parsedMessage.match(/^you planted\s+(\d+)\s+(.+)$/i);
  if (plantMatch) {
    quantity = readNumber(plantMatch[1]);
    itemLabel = readString(plantMatch[2]);
  }

  const harvestMatch = parsedMessage.match(/^you harvested\s+(\d+)\s+(.+)$/i);
  if (harvestMatch) {
    quantity = readNumber(harvestMatch[1]);
    itemLabel = readString(harvestMatch[2]);
  }

  if (itemLabel) iconHints.push(itemLabel);
  if (petLabel) iconHints.push(petLabel);
  if (secondaryLabel) iconHints.push(secondaryLabel);

  return { quantity, priceCoins, itemLabel, petLabel, secondaryLabel, iconHints };
}

function computeEntryFingerprint(entry: {
  timestamp: number;
  family: TemplateFamily;
  category: ActivityCategory;
  abilityId?: string | null;
  itemLabel: string | null;
  petSpecies: string | null;
  plantSpecies: string | null;
  petLabel: string | null;
  quantity: number | null;
}): string {
  const bucket = Math.round(entry.timestamp / 8_000);
  const entity = normalizeToken(
    entry.petSpecies
      ?? entry.petLabel
      ?? entry.itemLabel
      ?? entry.plantSpecies
      ?? '',
  );
  const qty = entry.quantity ?? 1;
  const ability = normalizeToken(entry.abilityId ?? '');
  return `${entry.family}:${entry.category}:${ability}:${entity}:${qty}:${bucket}`;
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const rounded = Math.round(value * 100) / 100;
  if (Math.abs(rounded - Math.round(rounded)) < 0.01) {
    return String(Math.round(rounded));
  }
  return rounded.toFixed(2).replace(/\.?0+$/, '');
}

function pickPetForAbility(entry: ActivityEntry, abilityId: string): ActivePetInfo | null {
  const snapshot = getResolverSnapshot();
  const normalizedAbility = normalizeLookupKey(abilityId);
  if (!normalizedAbility) return null;

  const entryCandidates = [
    entry.secondaryLabel,
    entry.itemLabel,
    entry.petSpecies,
    ...entry.iconHints,
  ]
    .map((value) => readString(value))
    .filter((value): value is string => Boolean(value));

  for (const candidate of entryCandidates) {
    const resolved = resolvePetFromCandidate(candidate);
    const speciesKey = normalizeLookupKey(resolved?.species ?? '');
    const nameKey = normalizeLookupKey(resolved?.displayName ?? '');
    for (const pet of snapshot.activePets) {
      const petSpeciesKey = normalizeLookupKey(pet.species ?? '');
      const petNameKey = normalizeLookupKey(pet.name ?? '');
      if (speciesKey && speciesKey === petSpeciesKey) {
        return pet;
      }
      if (nameKey && nameKey === petNameKey) {
        return pet;
      }
    }
  }

  const candidates = snapshot.activePets.filter((pet) => (
    pet.abilities.some((ability) => {
      const abilityDefinition = getAbilityDefinition(ability);
      const abilityCandidate = abilityDefinition?.id ?? ability;
      return normalizeLookupKey(abilityCandidate) === normalizedAbility;
    })
  ));
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    const strengthA = a.strength ?? -1;
    const strengthB = b.strength ?? -1;
    if (strengthA !== strengthB) return strengthB - strengthA;
    return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
  });
  return candidates[0] ?? null;
}

function buildAbilityProcMessage(entry: ActivityEntry): { message: string; petSpecies: string | null; petLabel: string | null; iconHints: string[] } | null {
  const abilityId = resolveAbilityIdFromEntry(entry);
  if (!abilityId) return null;
  const definition = getAbilityDefinition(abilityId);
  if (!definition) return null;

  const pet = pickPetForAbility(entry, definition.id);
  if (!pet) return null;

  const petLabel = readString(pet.name) ?? readString(pet.species);
  const petSpecies = readString(pet.species)?.toLowerCase() ?? null;
  if (!petLabel || !petSpecies) return null;

  const stats = computeAbilityStats(definition, pet.strength);
  if (definition.id === 'ProduceScaleBoost' || definition.id === 'ProduceScaleBoostII') {
    const context = buildAbilityValuationContext();
    const dynamic = resolveDynamicAbilityEffect(definition.id, context, pet.strength);
    const eligiblePlants = context.crops.filter((crop) => crop.isMature && crop.sizePercent < 99.99);
    const impactedCount = eligiblePlants.length;
    if (impactedCount <= 0) return null;

    const basePercent = definition.effectBaseValue ?? (definition.id === 'ProduceScaleBoostII' ? 10 : 6);
    const appliedPercent = basePercent * stats.multiplier;
    const message = `Your ${toTitleCase(petLabel)} boosted the size of ${impactedCount} crops by ${formatPercent(appliedPercent)}%`;
    const iconHints = [petLabel, pet.species ?? '', ...entry.iconHints];
    if (dynamic?.detail) {
      return { message, petSpecies, petLabel, iconHints };
    }
    return { message, petSpecies, petLabel, iconHints };
  }

  if (definition.id === 'GoldGranter' || definition.id === 'RainbowGranter') {
    const mutation = definition.id === 'GoldGranter' ? 'Gold' : 'Rainbow';
    const message = `Your ${toTitleCase(petLabel)} granted ${mutation} to 1 crop`;
    return { message, petSpecies, petLabel, iconHints: [petLabel, mutation, ...entry.iconHints] };
  }

  return null;
}

function resolveEntryLabels(entry: ActivityEntry): void {
  if (entry.family === 'feed') {
    const petCandidate = entry.secondaryLabel ?? entry.petSpecies ?? entry.itemLabel;
    const cropCandidate = entry.itemLabel ?? entry.plantSpecies;
    const resolvedPet = resolvePetFromCandidate(petCandidate);
    const resolvedCrop = resolveItemLabelFromCandidate(cropCandidate, false);
    const cropSpecies = readString(resolveInventoryItem(cropCandidate, false)?.species)?.toLowerCase()
      ?? readString(resolvedCrop)?.toLowerCase()
      ?? null;

    if (resolvedPet?.displayName) entry.secondaryLabel = resolvedPet.displayName;
    if (resolvedPet?.species) entry.petSpecies = resolvedPet.species;
    if (resolvedCrop) entry.itemLabel = resolvedCrop;
    if (cropSpecies) entry.plantSpecies = cropSpecies;
    return;
  }

  if (entry.family === 'sell') {
    const resolvedPet = resolvePetFromCandidate(entry.itemLabel ?? entry.secondaryLabel ?? entry.petSpecies);
    if (resolvedPet?.displayName) entry.itemLabel = resolvedPet.displayName;
    if (resolvedPet?.species) entry.petSpecies = resolvedPet.species;
    return;
  }

  if (entry.family === 'hatch') {
    const resolvedPet = resolvePetFromCandidate(entry.secondaryLabel ?? entry.petSpecies);
    if (resolvedPet?.displayName) entry.secondaryLabel = resolvedPet.displayName;
    if (resolvedPet?.species) entry.petSpecies = resolvedPet.species;
    const resolvedEgg = resolveItemLabelFromCandidate(entry.itemLabel, false);
    if (resolvedEgg) entry.itemLabel = resolvedEgg;
    return;
  }

  const resolvedItem = resolveItemLabelFromCandidate(entry.itemLabel, false);
  if (resolvedItem) entry.itemLabel = resolvedItem;
}

function normalizeIconHints(entry: ActivityEntry): void {
  const deduped: string[] = [];
  const push = (value: string | null | undefined): void => {
    const clean = readString(value);
    if (!clean) return;
    if (containsUuidLikeToken(clean)) return;
    if (!deduped.some((existing) => normalizeToken(existing) === normalizeToken(clean))) {
      deduped.push(clean);
    }
  };

  push(entry.itemLabel);
  push(entry.secondaryLabel);
  push(entry.petSpecies);
  push(entry.plantSpecies);
  for (const hint of entry.iconHints) {
    push(hint);
  }
  entry.iconHints = deduped.slice(0, 8);
}

function enrichEntry(entry: ActivityEntry): ActivityEntry {
  resolveEntryLabels(entry);

  if (entry.family === 'boost') {
    const abilityDetails = buildAbilityProcMessage(entry);
    if (abilityDetails) {
      entry.message = abilityDetails.message;
      entry.rawMessage = abilityDetails.message;
      entry.secondaryLabel = abilityDetails.petLabel;
      entry.petSpecies = abilityDetails.petSpecies;
      entry.abilityId = resolveAbilityIdFromEntry(entry);
      entry.iconHints = abilityDetails.iconHints;
    } else {
      entry.abilityId = resolveAbilityIdFromEntry(entry);
    }
  }

  normalizeIconHints(entry);
  entry.resolvedAt = Date.now();
  return entry;
}

function isMissingOrUuid(value: string | null | undefined): boolean {
  const clean = readString(value);
  if (!clean) return true;
  return isUuidLikeToken(clean) || containsUuidLikeToken(clean);
}

function mergeMissingEntryFields(entry: ActivityEntry, source: MergeCandidateFields): boolean {
  let changed = false;
  const setStringIfMissing = (
    getter: () => string | null | undefined,
    setter: (value: string) => void,
    candidate: string | null | undefined,
    disallowUuid = false,
  ): void => {
    const current = getter();
    const next = readString(candidate);
    if (!next) return;
    if (disallowUuid && isMissingOrUuid(next)) return;
    if (!isMissingOrUuid(current)) return;
    setter(next);
    changed = true;
  };

  setStringIfMissing(() => entry.itemLabel, (value) => { entry.itemLabel = value; }, source.itemLabel, true);
  setStringIfMissing(() => entry.secondaryLabel, (value) => { entry.secondaryLabel = value; }, source.secondaryLabel, true);
  setStringIfMissing(() => entry.petSpecies, (value) => { entry.petSpecies = value.toLowerCase(); }, source.petSpecies, true);
  setStringIfMissing(() => entry.plantSpecies, (value) => { entry.plantSpecies = value.toLowerCase(); }, source.plantSpecies, true);
  setStringIfMissing(() => entry.abilityId, (value) => { entry.abilityId = value; }, source.abilityId, false);

  if (entry.quantity == null && source.quantity != null && Number.isFinite(source.quantity)) {
    entry.quantity = Math.max(1, Math.round(source.quantity));
    changed = true;
  }
  if (entry.priceCoins == null && source.priceCoins != null && Number.isFinite(source.priceCoins)) {
    entry.priceCoins = Math.max(0, Math.round(source.priceCoins));
    changed = true;
  }

  const iconHints = Array.isArray(source.iconHints) ? source.iconHints : [];
  for (const hint of iconHints) {
    const clean = readString(hint);
    if (!clean || containsUuidLikeToken(clean)) continue;
    if (!entry.iconHints.some((existing) => normalizeToken(existing) === normalizeToken(clean))) {
      entry.iconHints.push(clean);
      changed = true;
    }
  }

  if (changed) {
    enrichEntry(entry);
    applyQualityGate(entry);
  }
  return changed;
}

function findBestPendingForEntry(entry: ActivityEntry): PendingAction | null {
  if (!pendingActions.length) return null;
  const nativeTokens = tokenizeForMatch(entry.message);
  const nativeEntity = normalizeToken(entry.itemLabel ?? entry.secondaryLabel ?? entry.petSpecies ?? entry.plantSpecies ?? '');

  let best: PendingAction | null = null;
  let bestScore = -1;
  for (const pending of pendingActions) {
    if (pending.category !== entry.category) continue;
    const ageDelta = Math.abs(pending.createdAt - entry.timestamp);
    if (ageDelta > PENDING_TIMEOUT_MS + 180_000) continue;

    let score = 0;
    const overlap = pending.tokens.filter((token) => nativeTokens.includes(token)).length;
    score += overlap * 4;

    const pendingEntity = normalizeToken(
      pending.itemLabel
      ?? pending.secondaryLabel
      ?? pending.petSpecies
      ?? pending.plantSpecies
      ?? '',
    );
    if (nativeEntity && pendingEntity && nativeEntity === pendingEntity) {
      score += 6;
    }
    if (pending.category === 'feed' && pending.secondaryLabel && !isMissingOrUuid(pending.secondaryLabel)) {
      score += 2;
    }
    if (pending.category === 'feed' && pending.itemLabel && !isMissingOrUuid(pending.itemLabel)) {
      score += 2;
    }
    score -= Math.floor(ageDelta / 10_000);

    if (score > bestScore) {
      bestScore = score;
      best = pending;
    }
  }

  return bestScore > 0 ? best : null;
}

function consumePendingAction(pendingId: string): void {
  pendingActions = pendingActions.filter((pending) => pending.id !== pendingId);
}

function buildMessageFromTemplate(entry: ActivityEntry): string | null {
  const qty = entry.quantity ?? 1;
  const qtyLabel = String(Math.max(1, Math.round(qty)));
  const item = readString(entry.itemLabel) ?? readString(entry.plantSpecies) ?? null;
  const price = typeof entry.priceCoins === 'number' ? formatCoins(entry.priceCoins) : null;

  switch (entry.family) {
    case 'sell':
      {
        const pet = readString(entry.itemLabel) ?? readString(entry.secondaryLabel) ?? readString(entry.petSpecies);
        if (!pet || !price) return null;
        return `You sold your ${toTitleCase(pet)} for ${price}`;
      }
    case 'purchase':
      if (!item || !price) return null;
      return `You purchased ${qtyLabel} ${toTitleCase(item)}${qty > 1 ? '(s)' : ''} for ${price}`;
    case 'feed':
      {
        const pet = readString(entry.secondaryLabel) ?? readString(entry.petSpecies);
        if (!pet || !item) return null;
        const cleanItem = toTitleCase(item);
        const mutItem = /\|/.test(cleanItem) ? cleanItem : cleanItem;
        return `You fed your ${toTitleCase(pet)} ${qtyLabel} ${mutItem}`;
      }
    case 'plant':
      if (!item) return null;
      return `You planted ${qtyLabel} ${toTitleCase(item)}${qty > 1 ? '(s)' : ''}`;
    case 'hatch':
      {
        const pet = readString(entry.secondaryLabel) ?? readString(entry.petSpecies);
        if (!item || !pet) return null;
        return `You hatched your ${toTitleCase(item)} and got 1 ${toTitleCase(pet)}`;
      }
    case 'harvest':
      if (!item) return null;
      return `You harvested ${qtyLabel} ${toTitleCase(item)}`;
    case 'storage': {
      const normalized = normalizeActionType(entry.action);
      if (normalized.includes('retrieve')) {
        if (!item) return null;
        return `You retrieved ${toTitleCase(item)} from storage`;
      }
      if (!item) return null;
      return `You stored ${toTitleCase(item)} in storage`;
    }
    case 'boost': {
      return null;
    }
    case 'travel':
      return null;
    case 'other_supported':
    default:
      return null;
  }
}

function applyQualityGate(entry: ActivityEntry): ActivityEntry {
  const raw = normalizeWhitespace(entry.rawMessage || entry.message);
  const nativeLike = entry.origin === 'native_dom';
  let nextMessage = stripTrailingAgeLabel(entry.message || '');

  const shouldTemplate = !nativeLike || entry.family === 'feed';
  if (shouldTemplate) {
    const templated = buildMessageFromTemplate(entry);
    if (templated) nextMessage = templated;
  }
  if (entry.family === 'feed' && /^you fed\s+/i.test(nextMessage) && !/^you fed your\s+/i.test(nextMessage)) {
    nextMessage = nextMessage.replace(/^you fed\s+/i, 'You fed your ');
  }

  let quality: EntryQuality = entry.quality;
  let renderable = entry.renderable;
  let qualityReason: string | null = null;

  const hasUuid = !nativeLike && (containsUuidLikeToken(nextMessage) || containsUuidLikeToken(raw));
  const looksLikeActionToken = !nativeLike && (isRawActionTokenMessage(nextMessage) || isRawActionTokenMessage(raw));
  const unsupportedFamily = !nativeLike && (entry.family === 'travel' || entry.family === 'other_supported');
  const hasCompleteBoostMessage = /^your\s+[a-z0-9'()+ _-]+\s+/i.test(nextMessage)
    || /^[a-z0-9'()+ _-]{2,}\s+sped up\s+/i.test(nextMessage);
  const hasIncompleteBoost = !nativeLike && entry.family === 'boost' && !hasCompleteBoostMessage;

  if (!nextMessage || isLowFidelityTokenMessage(nextMessage)) {
    quality = 'pending';
    renderable = false;
    qualityReason = 'missing-template-message';
  } else if (unsupportedFamily) {
    quality = 'pending';
    renderable = false;
    qualityReason = 'unsupported-family-hidden';
  } else if (hasUuid) {
    quality = 'pending';
    renderable = false;
    qualityReason = 'unresolved-uuid-label';
  } else if (looksLikeActionToken) {
    quality = 'pending';
    renderable = false;
    qualityReason = 'raw-action-token';
  } else if (hasIncompleteBoost) {
    quality = 'pending';
    renderable = false;
    qualityReason = 'incomplete-ability-proc';
  } else if (nativeLike) {
    quality = 'native';
    renderable = true;
    qualityReason = null;
  } else {
    quality = entry.priceCoins != null || entry.family === 'feed' || entry.family === 'hatch' || entry.family === 'plant' || entry.family === 'harvest'
      ? 'rich'
      : 'formatted';
    renderable = true;
    qualityReason = null;
    if ((entry.family === 'sell' || entry.family === 'purchase') && entry.priceCoins == null) {
      renderable = false;
      quality = 'pending';
      qualityReason = 'missing-price';
    }
  }

  entry.message = nextMessage;
  entry.quality = quality;
  entry.qualityReason = qualityReason;
  entry.renderable = renderable;
  return entry;
}

function extractPetSpecies(message: string): string | null {
  const checks = [
    /you fed your\s+([a-z][a-z0-9' -]*)/i,
    /your\s+([a-z][a-z0-9' -]*)\s+boosted/i,
    /your\s+([a-z][a-z0-9' -]*)\s+found/i,
    /got\s+\d+\s+([a-z][a-z0-9' -]*)/i,
  ];
  for (const pattern of checks) {
    const match = message.match(pattern);
    const candidate = readString(match?.[1]);
    if (candidate) return candidate.toLowerCase();
  }
  return null;
}

function extractPlantSpecies(message: string): string | null {
  const checks = [
    /you harvested\s+\d+\s+([a-z][a-z0-9' -]*)/i,
    /you planted\s+\d+\s+([a-z][a-z0-9' -]*)/i,
    /you purchased\s+\d+\s+([a-z][a-z0-9' -]*)\s+seed/i,
    /you purchased\s+\d+\s+([a-z][a-z0-9' -]*)\s+egg/i,
  ];
  for (const pattern of checks) {
    const match = message.match(pattern);
    const candidate = readString(match?.[1]);
    if (candidate) return candidate.toLowerCase();
  }
  return null;
}

function stableKeyForEntry(entry: ActivityEntry): string {
  const roundedTs = Math.round(entry.timestamp / 60_000);
  return `${entry.source}:${entry.family}:${normalizeToken(entry.message)}:${roundedTs}`;
}

function pruneSeenStableKeys(now = Date.now()): void {
  for (const [key, seenAt] of seenStableKeys.entries()) {
    if (now - seenAt > DUPLICATE_WINDOW_MS) {
      seenStableKeys.delete(key);
    }
  }
}

function shouldSkipDuplicate(entry: ActivityEntry, stableKey: string): boolean {
  pruneSeenStableKeys(entry.timestamp);
  const seenAt = seenStableKeys.get(stableKey);
  if (seenAt && Math.abs(entry.timestamp - seenAt) <= DUPLICATE_WINDOW_MS) {
    return true;
  }
  seenStableKeys.set(stableKey, entry.timestamp);
  return false;
}

function queueEntriesSave(): void {
  if (saveEntriesTimer != null) return;
  saveEntriesTimer = window.setTimeout(() => {
    saveEntriesTimer = null;
    storage.set(STORAGE_KEY_ENTRIES, entries);
  }, 300);
}

function queueFiltersSave(): void {
  if (saveFiltersTimer != null) return;
  saveFiltersTimer = window.setTimeout(() => {
    saveFiltersTimer = null;
    storage.set(STORAGE_KEY_FILTERS, filters);
  }, 250);
}

function parseStoredEntry(value: unknown): ActivityEntry | null {
  if (!isRecord(value)) return null;
  const id = readString(value.id);
  const message = readString(value.message);
  const action = readString(value.action);
  const source = value.source === 'native' || value.source === 'fallback' ? value.source : null;
  const origin = value.origin === 'native_dom' || value.origin === 'atom' || value.origin === 'ws_pending'
    ? value.origin
    : (source === 'fallback' ? 'ws_pending' : 'atom');
  const quality = value.quality === 'native' || value.quality === 'rich' || value.quality === 'formatted' || value.quality === 'pending'
    ? value.quality
    : (origin === 'native_dom' ? 'native' : 'pending');
  const category = CATEGORY_OPTIONS.some((option) => option.value === value.category)
    ? (value.category as ActivityCategory)
    : 'other';
  if (!id || !action || !source) return null;

  const timestamp = toTimestamp(value.timestamp, Date.now());
  const petSpecies = readString(value.petSpecies)?.toLowerCase() ?? null;
  const plantSpecies = readString(value.plantSpecies)?.toLowerCase() ?? null;
  const family = isTemplateFamily(value.family)
    ? value.family
    : templateFamilyForCategory(category);

  const rawMessage = readString(value.rawMessage) ?? message ?? action;
  const parsed = parseStructuredFieldsFromMessage(rawMessage);
  const itemLabel = readString(value.itemLabel) ?? parsed.itemLabel;
  const secondaryLabel = readString(value.secondaryLabel) ?? parsed.secondaryLabel;
  const quantity = readNumber(value.quantity) ?? parsed.quantity;
  const priceCoins = readNumber(value.priceCoins) ?? parsed.priceCoins;
  const iconHintsRaw = Array.isArray(value.iconHints) ? value.iconHints : [];
  const iconHints = iconHintsRaw
    .filter((hint): hint is string => typeof hint === 'string')
    .map((hint) => normalizeWhitespace(hint))
    .filter(Boolean);
  if (!iconHints.length) {
    iconHints.push(...parsed.iconHints);
  }

  const base: ActivityEntry = {
    id,
    timestamp,
    action,
    abilityId: readString(value.abilityId),
    message: message ?? rawMessage,
    rawMessage,
    fingerprint: readString(value.fingerprint)
      ?? computeEntryFingerprint({
        timestamp,
        family,
        category,
        abilityId: readString(value.abilityId),
        itemLabel,
        petSpecies,
        plantSpecies,
        petLabel: secondaryLabel,
        quantity,
      }),
    family,
    quality,
    qualityReason: readString(value.qualityReason),
    origin,
    renderable: Boolean(value.renderable ?? true),
    supersededBy: readString(value.supersededBy),
    resolvedAt: readNumber(value.resolvedAt),
    quantity,
    priceCoins,
    source,
    category,
    petSpecies,
    plantSpecies,
    itemLabel,
    secondaryLabel,
    iconHints,
  };

  return applyQualityGate(enrichEntry(base));
}

function normalizeLoadedEntries(rawEntries: ActivityEntry[]): ActivityEntry[] {
  if (!rawEntries.length) return [];
  const ordered = [...rawEntries].sort((a, b) => a.timestamp - b.timestamp);
  const activeByFingerprint = new Map<string, ActivityEntry>();

  for (const entry of ordered) {
    entry.supersededBy = null;
    const existing = activeByFingerprint.get(entry.fingerprint);
    if (!existing) {
      activeByFingerprint.set(entry.fingerprint, entry);
      continue;
    }

    const existingScore = scoreEntry(existing);
    const nextScore = scoreEntry(entry);

    if (nextScore > existingScore) {
      markSuperseded(existing, entry.id);
      activeByFingerprint.set(entry.fingerprint, entry);
      continue;
    }

    if (nextScore === existingScore) {
      const nextIsNative = entry.origin === 'native_dom';
      const existingIsNative = existing.origin === 'native_dom';
      if (nextIsNative && !existingIsNative) {
        markSuperseded(existing, entry.id);
        activeByFingerprint.set(entry.fingerprint, entry);
        continue;
      }
      if (!nextIsNative && existingIsNative) {
        markSuperseded(entry, existing.id);
        continue;
      }
      if (entry.timestamp > existing.timestamp) {
        markSuperseded(existing, entry.id);
        activeByFingerprint.set(entry.fingerprint, entry);
        continue;
      }
    }

    markSuperseded(entry, existing.id);
  }

  return ordered;
}

function suppressSemanticDuplicates(rawEntries: ActivityEntry[]): void {
  const ordered = [...rawEntries].sort((a, b) => a.timestamp - b.timestamp);
  const activeByMessage = new Map<string, ActivityEntry[]>();
  const SEMANTIC_WINDOW_MS = 90_000;

  for (const entry of ordered) {
    if (entry.supersededBy) continue;
    const messageKey = normalizeToken(stripTrailingAgeLabel(entry.message));
    if (!messageKey) continue;

    const group = activeByMessage.get(messageKey) ?? [];
    let matched: ActivityEntry | null = null;
    for (let index = group.length - 1; index >= 0; index -= 1) {
      const candidate = group[index];
      if (!candidate || candidate.supersededBy) continue;
      if (entry.timestamp - candidate.timestamp > SEMANTIC_WINDOW_MS) break;
      if (Math.abs(candidate.timestamp - entry.timestamp) <= SEMANTIC_WINDOW_MS) {
        matched = candidate;
        break;
      }
    }

    if (!matched) {
      group.push(entry);
      activeByMessage.set(messageKey, group);
      continue;
    }

    const existingScore = scoreEntry(matched);
    const nextScore = scoreEntry(entry);
    const keepIncoming = nextScore > existingScore
      || (nextScore === existingScore && entry.timestamp > matched.timestamp);

    if (keepIncoming) {
      markSuperseded(matched, entry.id);
      const idx = group.findIndex((candidate) => candidate.id === matched.id);
      if (idx >= 0) {
        group[idx] = entry;
      }
      continue;
    }

    markSuperseded(entry, matched.id);
  }
}

function loadEntriesFromStorage(): ActivityEntry[] {
  const rawV3 = storage.get<unknown>(STORAGE_KEY_ENTRIES, []);
  const rawV2 = storage.get<unknown>(STORAGE_KEY_ENTRIES_V2, []);
  const raw = Array.isArray(rawV3) && rawV3.length
    ? rawV3
    : (Array.isArray(rawV2) && rawV2.length
      ? rawV2
      : storage.get<unknown>(STORAGE_KEY_ENTRIES_LEGACY, []));
  if (!Array.isArray(raw)) return [];

  const parsed: ActivityEntry[] = [];
  for (const item of raw) {
    const entry = parseStoredEntry(item);
    if (!entry) continue;
    parsed.push(entry);
  }

  const deduped = normalizeLoadedEntries(parsed);
  const normalized = deduped.length > MAX_ENTRIES
    ? deduped.slice(deduped.length - MAX_ENTRIES)
    : deduped;
  storage.set(STORAGE_KEY_ENTRIES, normalized);
  return normalized;
}

function rebuildEntryFingerprintIndex(): void {
  entryByFingerprint.clear();
  for (const entry of entries) {
    if (!entry || entry.supersededBy) continue;
    const current = entryByFingerprint.get(entry.fingerprint);
    if (!current || scoreEntry(entry) >= scoreEntry(current)) {
      entryByFingerprint.set(entry.fingerprint, entry);
    }
  }
}

function trimEntriesToLimit(): void {
  if (entries.length <= MAX_ENTRIES) return;
  entries = entries.slice(entries.length - MAX_ENTRIES);
  rebuildEntryFingerprintIndex();
}

function loadFiltersFromStorage(): FilterState {
  const raw = storage.get<unknown>(STORAGE_KEY_FILTERS, DEFAULT_FILTERS);
  if (!isRecord(raw)) return { ...DEFAULT_FILTERS };

  const source = raw.source === 'all' || raw.source === 'native' || raw.source === 'fallback'
    ? raw.source
    : DEFAULT_FILTERS.source;
  const category = CATEGORY_OPTIONS.some((option) => option.value === raw.category)
    ? (raw.category as CategoryFilter)
    : DEFAULT_FILTERS.category;
  const sort = raw.sort === 'time_desc' || raw.sort === 'time_asc' || raw.sort === 'action_asc' || raw.sort === 'action_desc'
    ? raw.sort
    : DEFAULT_FILTERS.sort;

  return {
    search: readString(raw.search) ?? '',
    source,
    category,
    petSpecies: readString(raw.petSpecies) ?? '',
    plantSpecies: readString(raw.plantSpecies) ?? '',
    sort,
  };
}

function formatAge(timestamp: number): string {
  const elapsed = Math.max(1, Math.floor((Date.now() - timestamp) / 1000));
  if (elapsed < 60) return `${elapsed}s ago`;
  if (elapsed < 3600) return `${Math.floor(elapsed / 60)}m ago`;
  if (elapsed < 86_400) return `${Math.floor(elapsed / 3600)}h ago`;
  return `${Math.floor(elapsed / 86_400)}d ago`;
}

function actionFromMessage(message: string): string {
  const normalized = normalizeWhitespace(message);
  if (normalized.length <= 60) return normalized;
  return `${normalized.slice(0, 60)}...`;
}

function addEntry(entry: ActivityEntry, stableKey?: string): ActivityEntry | null {
  enrichEntry(entry);
  applyQualityGate(entry);
  entry.fingerprint = computeEntryFingerprint({
    timestamp: entry.timestamp,
    family: entry.family,
    category: entry.category,
    abilityId: entry.abilityId,
    itemLabel: entry.itemLabel,
    petSpecies: entry.petSpecies,
    plantSpecies: entry.plantSpecies,
    petLabel: entry.secondaryLabel,
    quantity: entry.quantity,
  });

  const existing = entryByFingerprint.get(entry.fingerprint);
  if (existing) {
    mergeMissingEntryFields(existing, {
      itemLabel: entry.itemLabel,
      secondaryLabel: entry.secondaryLabel,
      petSpecies: entry.petSpecies,
      plantSpecies: entry.plantSpecies,
      quantity: entry.quantity,
      priceCoins: entry.priceCoins,
      abilityId: entry.abilityId,
      iconHints: entry.iconHints,
    });

    if (isNearDuplicatePayload(existing, entry)) {
      return existing;
    }

    const existingScore = scoreEntry(existing);
    const nextScore = scoreEntry(entry);
    if (nextScore < existingScore) return null;
    if (nextScore === existingScore) {
      if ((existing.renderable ? 1 : 0) > (entry.renderable ? 1 : 0)) return null;
      const nextIsNative = entry.origin === 'native_dom';
      const existingIsNative = existing.origin === 'native_dom';
      if (existingIsNative && !nextIsNative) return null;
      if (existing.timestamp >= entry.timestamp) return null;
    }

    markSuperseded(existing, entry.id);
    entries.push(entry);
    entryByFingerprint.set(entry.fingerprint, entry);
    trimEntriesToLimit();
    queueEntriesSave();
    scheduleRender();
    if (entry.source === 'native') {
      matchPendingWithNative(entry);
    }
    return entry;
  }

  const key = stableKey ?? stableKeyForEntry(entry);
  if (shouldSkipDuplicate(entry, key)) return null;

  entries.push(entry);
  entryByFingerprint.set(entry.fingerprint, entry);
  trimEntriesToLimit();

  queueEntriesSave();
  scheduleRender();
  if (entry.source === 'native') {
    matchPendingWithNative(entry);
  }
  return entry;
}

function makeEntry(params: {
  timestamp: number;
  action: string;
  message: string | null;
  rawMessage?: string | null;
  source: ActivitySource;
  origin: ActivityOrigin;
  category?: ActivityCategory;
  family?: TemplateFamily;
  petSpecies?: string | null;
  plantSpecies?: string | null;
  itemLabel?: string | null;
  secondaryLabel?: string | null;
  quantity?: number | null;
  priceCoins?: number | null;
  iconHints?: string[];
}): ActivityEntry {
  const rawMessage = readString(params.rawMessage)
    ?? readString(params.message)
    ?? params.action;
  const category = params.category ?? inferCategory(params.action, rawMessage);
  const family = params.family ?? templateFamilyForCategory(category);
  const parsed = parseStructuredFieldsFromMessage(rawMessage);
  const petSpecies = params.petSpecies ?? extractPetSpecies(rawMessage);
  const plantSpecies = params.plantSpecies ?? extractPlantSpecies(rawMessage);
  const itemLabel = params.itemLabel ?? parsed.itemLabel;
  const secondaryLabel = params.secondaryLabel ?? parsed.secondaryLabel ?? parsed.petLabel;
  const quantity = params.quantity ?? parsed.quantity;
  const priceCoins = params.priceCoins ?? parsed.priceCoins;
  const iconHints = (params.iconHints && params.iconHints.length ? params.iconHints : parsed.iconHints)
    .map((hint) => normalizeWhitespace(hint))
    .filter(Boolean);

  const entry: ActivityEntry = {
    id: makeEntryId(),
    timestamp: params.timestamp,
    action: params.action,
    abilityId: null,
    message: readString(params.message) ?? rawMessage,
    rawMessage,
    fingerprint: '',
    family,
    quality: params.origin === 'native_dom' ? 'native' : 'pending',
    qualityReason: null,
    origin: params.origin,
    renderable: false,
    supersededBy: null,
    resolvedAt: null,
    quantity: quantity == null ? null : Math.max(1, Math.round(quantity)),
    priceCoins: typeof priceCoins === 'number' ? Math.max(0, Math.round(priceCoins)) : null,
    source: params.source,
    category,
    petSpecies: petSpecies ? petSpecies.toLowerCase() : null,
    plantSpecies: plantSpecies ? plantSpecies.toLowerCase() : null,
    itemLabel,
    secondaryLabel,
    iconHints,
  };
  enrichEntry(entry);
  entry.fingerprint = computeEntryFingerprint({
    timestamp: entry.timestamp,
    family: entry.family,
    category: entry.category,
    abilityId: entry.abilityId,
    itemLabel: entry.itemLabel,
    petSpecies: entry.petSpecies,
    plantSpecies: entry.plantSpecies,
    petLabel: entry.secondaryLabel,
    quantity: entry.quantity,
  });
  return applyQualityGate(entry);
}

function extractActivityArray(value: unknown): unknown[] {
  if (!isRecord(value)) return [];
  const candidates: unknown[] = [
    value.activityLogs,
    value.activityLog,
    isRecord(value.state) ? value.state.activityLogs : undefined,
    isRecord(value.state) ? value.state.activityLog : undefined,
    isRecord(value.user) ? value.user.activityLogs : undefined,
    isRecord(value.user) ? value.user.activityLog : undefined,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }
  return [];
}

function parseAtomLogItem(item: unknown): ActivityEntry | null {
  if (!isRecord(item)) return null;

  const action = readString(item.action) ?? readString(item.type) ?? readString(item.event) ?? readString(item.name) ?? 'Activity';
  const fallbackMessage = readString(item.message)
    ?? readString(item.text)
    ?? readString(item.description)
    ?? readString(item.title)
    ?? null;
  const parameters = isRecord(item.parameters) ? item.parameters : item;
  const built = buildPendingMessage(action, parameters);

  const timestamp = toTimestamp(
    item.timestamp
    ?? item.performedAt
    ?? item.createdAt
    ?? item.time
    ?? item.loggedAt,
    Date.now(),
  );

  const petSpecies = readString(item.petSpecies)?.toLowerCase()
    ?? readString(parameters.petSpecies)?.toLowerCase()
    ?? built.petSpecies;
  const plantSpecies = readString(item.plantSpecies)?.toLowerCase()
    ?? readString(parameters.plantSpecies)?.toLowerCase()
    ?? built.plantSpecies;
  const rawMessage = fallbackMessage ?? built.rawMessage ?? action;

  return makeEntry({
    timestamp,
    action,
    message: built.message ?? fallbackMessage,
    rawMessage,
    source: 'native',
    origin: 'atom',
    category: built.category,
    family: built.family,
    itemLabel: built.itemLabel,
    secondaryLabel: built.secondaryLabel,
    quantity: built.quantity,
    priceCoins: built.priceCoins,
    iconHints: built.iconHints,
    petSpecies,
    plantSpecies,
  });
}

function ingestActivityLogsFromAtom(value: unknown): void {
  const logs = extractActivityArray(value);
  if (!logs.length) return;

  for (const item of logs) {
    const entry = parseAtomLogItem(item);
    if (!entry) continue;
    const key = `atom:${entry.fingerprint}`;
    addEntry(entry, key);
  }
}

function parseNativeRow(row: HTMLElement, orderHint = 0, baseNow = Date.now()): ActivityEntry | null {
  if (row.getAttribute(ENHANCED_ROW_ATTR) === '1') return null;
  const parts = resolveRowParts(row);
  const messageText = normalizeWhitespace(parts.messageElement?.textContent || '');
  const timeLabelText = normalizeWhitespace(parts.timeElement?.textContent || '');
  const rawText = normalizeWhitespace(row.innerText || row.textContent || '');
  if (!rawText || /load\s+\d+\s+more/i.test(rawText)) return null;

  const parsed = splitMessageAndTime(rawText);
  let message = messageText || parsed.message;
  const timeLabel = timeLabelText || parsed.timeLabel;
  if (timeLabel && message) {
    const compactTime = timeLabel.replace(/\s+/g, '');
    if (compactTime) {
      const escaped = escapeRegExp(compactTime);
      message = message.replace(new RegExp(`${escaped}$`, 'i'), '').trim();
    }
    message = stripTrailingAgeLabel(message);
  }
  if (!message) return null;

  const anchor = baseNow - Math.max(0, orderHint);
  const parsedTs = timeLabel ? parseRelativeTimestamp(timeLabel, baseNow) : baseNow;
  const timestamp = Math.max(0, Math.min(parsedTs, anchor));
  const action = actionFromMessage(message);

  const entry = makeEntry({
    timestamp,
    action,
    message,
    rawMessage: rawText,
    source: 'native',
    origin: 'native_dom',
  });
  const pending = findBestPendingForEntry(entry);
  if (pending) {
    mergeMissingEntryFields(entry, {
      itemLabel: pending.itemLabel,
      secondaryLabel: pending.secondaryLabel ?? pending.petLabel,
      petSpecies: pending.petSpecies,
      plantSpecies: pending.plantSpecies,
      quantity: pending.quantity,
      priceCoins: pending.priceCoins,
      iconHints: pending.iconHints,
    });
    consumePendingAction(pending.id);
  }
  return entry;
}

function findMatchingExistingEntry(entry: ActivityEntry): ActivityEntry | null {
  const byFingerprint = entryByFingerprint.get(entry.fingerprint);
  if (byFingerprint) return byFingerprint;
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const existing = entries[index];
    if (!existing) continue;
    if (existing.family !== entry.family) continue;
    if (existing.category !== entry.category) continue;
    if (normalizeToken(existing.petSpecies ?? existing.itemLabel ?? '') !== normalizeToken(entry.petSpecies ?? entry.itemLabel ?? '')) continue;
    if (Math.abs(existing.timestamp - entry.timestamp) > 120_000) continue;
    return existing;
  }
  return null;
}

function ingestNativeRows(list: HTMLElement, explicitRows?: HTMLElement[]): void {
  const rows = explicitRows ?? Array.from(list.children).filter((node): node is HTMLElement => node instanceof HTMLElement);
  const now = Date.now();
  for (let index = 0; index < rows.length; index += 1) {
    const child = rows[index];
    if (!child) continue;
    if (child.tagName.toLowerCase() === 'button') continue;
    if (!isRealNativeRow(child)) continue;

    const rawText = normalizeWhitespace(child.innerText || child.textContent || '');
    if (!rawText || /load\s+\d+\s+more/i.test(rawText)) continue;
    const parsed = splitMessageAndTime(rawText);
    const signature = normalizeToken(stripTrailingAgeLabel(parsed.message || rawText));
    const existingSignature = nativeRowSignatures.get(child);
    if (existingSignature === signature) {
      const existingEntryId = child.getAttribute(NATIVE_ENTRY_ID_ATTR);
      if (existingEntryId && modalHandles) {
        modalHandles.nativeRowsByEntryId.set(existingEntryId, child);
      }
      continue;
    }
    nativeRowSignatures.set(child, signature);

    const entry = parseNativeRow(child, index, now);
    if (!entry) continue;
    const key = stableKeyForEntry(entry);
    const addedEntry = addEntry(entry, key);
    const resolved = addedEntry ?? findMatchingExistingEntry(entry);
    if (!resolved) continue;
    child.setAttribute(NATIVE_ENTRY_ID_ATTR, resolved.id);
    if (modalHandles) {
      modalHandles.nativeRowsByEntryId.set(resolved.id, child);
    }
  }
}

function tokenizeForMatch(value: string): string[] {
  return normalizeToken(value)
    .split(' ')
    .map((part) => part.trim())
    .filter((part) => part.length >= 3)
    .filter((part) => !['you', 'your', 'for', 'and', 'the', 'with'].includes(part))
    .slice(0, 8);
}

function readPayloadPetSpecies(payload: UnknownMap): string | null {
  const pet = isRecord(payload.pet) ? payload.pet : null;
  return readString(payload.petSpecies)
    ?? readString(payload.species)
    ?? readString(pet?.species)
    ?? readString(pet?.petSpecies)
    ?? null;
}

function buildPendingMessage(type: string, payload: UnknownMap): BuiltActionData {
  const action = type;
  const normalizedType = normalizeActionType(type);

  const itemId = readString(payload.itemId)
    ?? readString(payload.seedId)
    ?? readString(payload.eggId)
    ?? readString(payload.cropId);
  const cropItemId = readString(payload.cropItemId);
  const petItemId = readString(payload.petItemId)
    ?? readString(payload.petId)
    ?? readString((isRecord(payload.pet) ? payload.pet.id : null));
  const toolId = readString(payload.toolId);
  const storageId = readString(payload.storageId);

  const seedIds = Array.isArray(payload.seedIds) ? payload.seedIds : [];
  const eggIds = Array.isArray(payload.eggIds) ? payload.eggIds : [];
  const crops = Array.isArray(payload.crops) ? payload.crops : [];
  const firstSeedId = readString(seedIds[0]);
  const firstEggId = readString(eggIds[0]);
  const firstCropSpecies = readString((isRecord(crops[0]) ? crops[0].species : null));

  const quantity = readNumber(payload.quantity)
    ?? readNumber(payload.count)
    ?? readNumber(payload.amount)
    ?? readNumber(payload.cropCount)
    ?? (seedIds.length > 0 ? seedIds.length : null)
    ?? (eggIds.length > 0 ? eggIds.length : null)
    ?? (crops.length > 0 ? crops.length : null)
    ?? 1;
  const qty = Math.max(1, Math.round(quantity));

  const purchasePrice = readNumber(payload.purchasePrice)
    ?? readNumber(payload.price)
    ?? readNumber(payload.coins)
    ?? readNumber(payload.totalPrice)
    ?? readNumber(payload.value);
  const sellPrice = readNumber(payload.sellPrice)
    ?? readNumber(payload.priceCoins)
    ?? readNumber(payload.coins);

  const rawMessage = readString(payload.message)
    ?? readString(payload.text)
    ?? readString(payload.description)
    ?? readString(payload.title)
    ?? null;

  const data: BuiltActionData = {
    action,
    family: 'other_supported',
    category: 'other',
    message: null,
    rawMessage,
    itemLabel: null,
    secondaryLabel: null,
    quantity: qty,
    priceCoins: null,
    petSpecies: null,
    plantSpecies: null,
    iconHints: [],
  };
  const payloadPetSpecies = readPayloadPetSpecies(payload);

  if (normalizedType.includes('teleport') || normalizedType.includes('travel')) {
    data.family = 'travel';
    data.category = 'travel';
    data.message = null;
    return data;
  }

  if (normalizedType === 'put item in storage' || normalizedType === 'retrieve item from storage') {
    const label = resolveItemLabelFromCandidate(itemId ?? firstSeedId ?? firstEggId ?? firstCropSpecies, false)
      ?? itemId
      ?? firstSeedId
      ?? firstEggId
      ?? firstCropSpecies;
    data.family = 'storage';
    data.category = 'storage';
    data.itemLabel = label;
    data.plantSpecies = label ? label.toLowerCase() : null;
    if (label) data.iconHints.push(label);
    if (normalizedType.includes('retrieve')) {
      data.message = label ? `You retrieved ${toTitleCase(label)} from storage` : null;
    } else {
      data.message = label ? `You stored ${toTitleCase(label)} in storage` : null;
    }
    return data;
  }

  if (normalizedType.includes('purchase')) {
    data.family = 'purchase';
    data.category = 'purchase';
    const rawLabel = itemId
      ?? firstSeedId
      ?? firstEggId
      ?? toolId
      ?? readString(payload.itemName)
      ?? readString(payload.seedType)
      ?? readString(payload.eggType);
    const label = resolveItemLabelFromCandidate(rawLabel, false) ?? rawLabel;
    data.itemLabel = label;
    data.plantSpecies = label ? label.toLowerCase() : null;
    data.priceCoins = purchasePrice;
    if (label) data.iconHints.push(label);
    if (purchasePrice != null && label) {
      data.message = `You purchased ${qty} ${toTitleCase(label)}${qty > 1 ? '(s)' : ''} for ${formatCoins(purchasePrice)}`;
    }
    return data;
  }

  if (normalizedType.includes('sell pet')) {
    data.family = 'sell';
    data.category = 'sell';
    const resolvedPet = resolvePetFromCandidate(payloadPetSpecies ?? itemId ?? petItemId);
    const label = resolvedPet?.displayName ?? payloadPetSpecies ?? itemId ?? petItemId;
    data.itemLabel = label;
    data.petSpecies = resolvedPet?.species ?? (label ? label.toLowerCase() : null);
    data.priceCoins = sellPrice;
    if (label) data.iconHints.push(label);
    if (sellPrice != null && label) {
      data.message = `You sold your ${toTitleCase(label)} for ${formatCoins(sellPrice)}`;
    }
    return data;
  }

  if (normalizedType.includes('feed pet')) {
    data.family = 'feed';
    data.category = 'feed';
    const resolvedPet = resolvePetFromCandidate(payloadPetSpecies ?? petItemId);
    const pet = resolvedPet?.displayName ?? payloadPetSpecies ?? petItemId;
    const cropCandidate = cropItemId ?? itemId ?? readString(payload.cropSpecies);
    const crop = resolveItemLabelFromCandidate(cropCandidate, false) ?? cropCandidate;
    data.itemLabel = crop;
    data.secondaryLabel = pet;
    data.petSpecies = resolvedPet?.species ?? (pet ? pet.toLowerCase() : null);
    data.plantSpecies = readString(resolveInventoryItem(cropCandidate, false)?.species)?.toLowerCase()
      ?? (crop ? crop.toLowerCase() : null);
    if (pet) data.iconHints.push(pet);
    if (crop) data.iconHints.push(crop);
    if (pet && crop) {
      data.message = `You fed your ${toTitleCase(pet)} ${qty} ${toTitleCase(crop)}`;
    }
    return data;
  }

  if (normalizedType.includes('plant seed') || normalizedType.includes('plant egg')) {
    data.family = 'plant';
    data.category = 'plant';
    const rawLabel = itemId ?? firstSeedId ?? firstEggId;
    const label = resolveItemLabelFromCandidate(rawLabel, false) ?? rawLabel;
    data.itemLabel = label;
    data.plantSpecies = label ? label.toLowerCase() : null;
    if (label) data.iconHints.push(label);
    if (label) {
      data.message = `You planted ${qty} ${toTitleCase(label)}${qty > 1 ? '(s)' : ''}`;
    }
    return data;
  }

  if (normalizedType === 'hatch egg') {
    data.family = 'hatch';
    data.category = 'hatch';
    const eggRaw = itemId ?? firstEggId ?? readString(payload.eggType);
    const egg = resolveItemLabelFromCandidate(eggRaw, false) ?? eggRaw;
    const resolvedPet = resolvePetFromCandidate(payloadPetSpecies ?? petItemId);
    const pet = resolvedPet?.displayName ?? payloadPetSpecies;
    data.itemLabel = egg;
    data.secondaryLabel = pet;
    data.petSpecies = resolvedPet?.species ?? (pet ? pet.toLowerCase() : null);
    data.plantSpecies = egg ? egg.toLowerCase() : null;
    if (pet) data.iconHints.push(pet);
    if (egg) data.iconHints.push(egg);
    if (egg && pet) {
      data.message = `You hatched your ${toTitleCase(egg)} and got 1 ${toTitleCase(pet)}`;
    }
    return data;
  }

  if (normalizedType === 'harvest') {
    data.family = 'harvest';
    data.category = 'harvest';
    const cropRaw = itemId ?? firstCropSpecies ?? readString(payload.species);
    const crop = resolveItemLabelFromCandidate(cropRaw, false) ?? cropRaw;
    data.itemLabel = crop;
    data.plantSpecies = crop ? crop.toLowerCase() : null;
    if (crop) data.iconHints.push(crop);
    if (crop) {
      data.message = `You harvested ${qty} ${toTitleCase(crop)}`;
    }
    return data;
  }

  if (normalizedType.includes('grow') || normalizedType.includes('boost') || normalizedType.includes('restock') || normalizedType.includes('spin')) {
    data.family = 'boost';
    data.category = 'boost';
    if (rawMessage && !isLowFidelityTokenMessage(rawMessage) && !isRawActionTokenMessage(rawMessage)) {
      data.message = normalizeWhitespace(rawMessage);
    }
    return data;
  }

  if (rawMessage && !isLowFidelityTokenMessage(rawMessage)) {
    data.family = templateFamilyForCategory(inferCategory(action, rawMessage));
    data.category = inferCategory(action, rawMessage);
    data.message = normalizeWhitespace(rawMessage);
  }

  return data;
}

function parsePendingAction(payload: unknown): PendingAction | null {
  if (!isRecord(payload)) return null;
  const type = readString(payload.type);
  if (!type || IGNORED_ACTION_TYPES.has(type)) return null;
  const shouldTrack = TRACKED_ACTION_PATTERNS.some((pattern) => pattern.test(type));
  if (!shouldTrack) return null;

  const info = buildPendingMessage(type, payload);
  return {
    id: makeEntryId(),
    createdAt: Date.now(),
    expiresAt: Date.now() + PENDING_TIMEOUT_MS,
    action: info.action,
    message: info.message,
    rawMessage: info.rawMessage,
    family: info.family,
    category: info.category,
    itemLabel: info.itemLabel,
    petLabel: info.secondaryLabel ?? info.itemLabel,
    secondaryLabel: info.secondaryLabel,
    quantity: info.quantity,
    priceCoins: info.priceCoins,
    petSpecies: info.petSpecies,
    plantSpecies: info.plantSpecies,
    iconHints: info.iconHints,
    tokens: tokenizeForMatch(`${info.action} ${info.message ?? ''} ${info.itemLabel ?? ''} ${info.secondaryLabel ?? ''}`),
  };
}

function registerPendingAction(payload: unknown): void {
  const pending = parsePendingAction(payload);
  if (!pending) return;
  pendingActions.push(pending);
}

function matchPendingWithNative(nativeEntry: ActivityEntry): void {
  if (!pendingActions.length) return;
  const now = Date.now();
  const nativeTokens = tokenizeForMatch(nativeEntry.message);
  const nativeEntity = normalizeToken(nativeEntry.petSpecies ?? nativeEntry.itemLabel ?? nativeEntry.plantSpecies ?? '');

  pendingActions = pendingActions.filter((pending) => {
    if (now - pending.createdAt > PENDING_TIMEOUT_MS + 2000) {
      return false;
    }
    if (pending.category !== nativeEntry.category) {
      return true;
    }

    if (pending.petSpecies && nativeEntry.petSpecies && pending.petSpecies === nativeEntry.petSpecies) {
      return false;
    }
    if (pending.plantSpecies && nativeEntry.plantSpecies && pending.plantSpecies === nativeEntry.plantSpecies) {
      return false;
    }
    if (nativeEntity.length > 0) {
      const pendingEntity = normalizeToken(
        pending.petSpecies
          ?? pending.itemLabel
          ?? pending.plantSpecies
          ?? pending.secondaryLabel
          ?? '',
      );
      if (pendingEntity.length > 0 && pendingEntity === nativeEntity) {
        return false;
      }
    }

    const overlap = pending.tokens.filter((token) => nativeTokens.includes(token)).length;
    return overlap < 1;
  });
}

function flushExpiredPendingActions(): void {
  if (!pendingActions.length) return;
  const now = Date.now();
  const stillPending: PendingAction[] = [];

  for (const pending of pendingActions) {
    if (now <= pending.expiresAt) {
      stillPending.push(pending);
      continue;
    }

    const entry = makeEntry({
      timestamp: pending.createdAt,
      action: pending.action,
      message: pending.message,
      rawMessage: pending.rawMessage ?? pending.action,
      source: 'fallback',
      origin: 'ws_pending',
      category: pending.category,
      family: pending.family,
      itemLabel: pending.itemLabel,
      secondaryLabel: pending.secondaryLabel,
      quantity: pending.quantity,
      priceCoins: pending.priceCoins,
      iconHints: pending.iconHints,
      petSpecies: pending.petSpecies,
      plantSpecies: pending.plantSpecies,
    });
    addEntry(entry, `fallback:${pending.id}`);
  }

  pendingActions = stillPending;
}

function getRenderDedupeKey(entry: ActivityEntry): string {
  const message = normalizeToken(stripTrailingAgeLabel(entry.message));
  return `${entry.category}:${message}`;
}

function getFilteredEntries(): ActivityEntry[] {
  const search = normalizeToken(filters.search);
  const petSpeciesFilter = normalizeToken(filters.petSpecies);
  const plantSpeciesFilter = normalizeToken(filters.plantSpecies);

  const filtered = entries.filter((entry) => {
    if (!entry.renderable) return false;
    if (entry.supersededBy) return false;
    const cleanMessage = stripTrailingAgeLabel(entry.message);
    if (isLowFidelityTokenMessage(cleanMessage)) return false;
    if (isRawActionTokenMessage(cleanMessage)) return false;
    if (filters.source !== 'all' && entry.source !== filters.source) return false;
    if (filters.category !== 'all' && entry.category !== filters.category) return false;

    if (search.length > 0) {
      const haystack = normalizeToken(`${entry.message} ${entry.action}`);
      if (!haystack.includes(search)) return false;
    }

    if (petSpeciesFilter.length > 0) {
      const value = normalizeToken(entry.petSpecies ?? '');
      if (!value.includes(petSpeciesFilter)) return false;
    }

    if (plantSpeciesFilter.length > 0) {
      const value = normalizeToken(entry.plantSpecies ?? '');
      if (!value.includes(plantSpeciesFilter)) return false;
    }

    return true;
  });

  const DEDUPE_WINDOW_MS = 120_000;
  const orderedByTime = [...filtered].sort((a, b) => b.timestamp - a.timestamp);
  const groups = new Map<string, ActivityEntry[]>();
  const deduped: ActivityEntry[] = [];
  const entryIndex = new Map<string, number>();

  for (const entry of orderedByTime) {
    const key = getRenderDedupeKey(entry);
    const group = groups.get(key) ?? [];

    let matched: ActivityEntry | null = null;
    for (const candidate of group) {
      if (Math.abs(candidate.timestamp - entry.timestamp) <= DEDUPE_WINDOW_MS) {
        matched = candidate;
        break;
      }
    }

    if (!matched) {
      group.push(entry);
      groups.set(key, group);
      entryIndex.set(entry.id, deduped.length);
      deduped.push(entry);
      continue;
    }

    const existing = matched;
    const existingScore = scoreEntry(existing);
    const nextScore = scoreEntry(entry);
    const existingNative = existing.origin === 'native_dom';
    const nextNative = entry.origin === 'native_dom';

    let takeIncoming = false;
    if (nextNative && !existingNative) {
      takeIncoming = true;
    } else if (!nextNative && existingNative) {
      takeIncoming = false;
    } else if (nextScore > existingScore) {
      takeIncoming = true;
    } else if (nextScore < existingScore) {
      takeIncoming = false;
    } else if (entry.timestamp > existing.timestamp) {
      takeIncoming = true;
    }

    if (takeIncoming) {
      const idx = entryIndex.get(existing.id);
      if (typeof idx === 'number' && idx >= 0 && idx < deduped.length) {
        deduped[idx] = entry;
        entryIndex.delete(existing.id);
        entryIndex.set(entry.id, idx);
      }
      const groupIdx = group.findIndex((candidate) => candidate.id === existing.id);
      if (groupIdx >= 0) {
        group[groupIdx] = entry;
      }
    }
  }

  deduped.sort((a, b) => {
    switch (filters.sort) {
      case 'time_asc':
        return a.timestamp - b.timestamp;
      case 'action_asc':
        return a.action.localeCompare(b.action);
      case 'action_desc':
        return b.action.localeCompare(a.action);
      case 'time_desc':
      default:
        return b.timestamp - a.timestamp;
    }
  });

  return deduped;
}

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .qpm-activity-toolbar {
      margin: 4px 0 8px;
      padding: 0;
      border: 0;
      background: transparent;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .qpm-activity-controls {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
      margin: 0;
    }
    .qpm-activity-control {
      min-height: 24px;
      border: 1px solid rgba(138, 150, 168, 0.45);
      border-radius: 999px;
      padding: 2px 10px;
      font-size: 11px;
      line-height: 1.2;
      background: rgba(247, 248, 250, 0.82);
      color: #2f3a4a;
      box-sizing: border-box;
      cursor: pointer;
    }
    .qpm-activity-control:focus {
      outline: none;
      border-color: rgba(110, 124, 146, 0.72);
    }
    .qpm-activity-summary {
      font-size: 11px;
      color: #3f4a5e;
      font-weight: 600;
      margin-left: auto;
      white-space: nowrap;
    }
    @media (max-width: 780px) {
      .qpm-activity-summary {
        width: 100%;
        margin-left: 0;
        white-space: normal;
      }
    }
    .qpm-activity-fallback-badge {
      margin-left: 6px;
      display: inline-block;
      border: 1px solid rgba(196, 74, 20, 0.45);
      border-radius: 999px;
      padding: 1px 6px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      color: #9a3412;
      background: rgba(255, 237, 213, 0.9);
      vertical-align: middle;
    }
    .qpm-activity-inline-coin {
      width: 16px;
      height: 16px;
      vertical-align: -2px;
      margin-left: 2px;
      display: inline-block !important;
      image-rendering: pixelated;
    }
    .qpm-activity-row {
      margin-bottom: 4px;
      min-height: 68px;
      border-radius: 10px;
      background: #e6d8b5;
      border: 1px solid rgba(140, 112, 70, 0.22);
      display: grid;
      grid-template-columns: 1fr 56px;
      gap: 10px;
      align-items: center;
      padding: 10px 10px 8px;
      box-sizing: border-box;
    }
    .qpm-activity-row-text {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .qpm-activity-row-message {
      color: #2e2a24;
      font-size: 18px;
      line-height: 1.25;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .qpm-activity-row-time-wrap {
      display: flex;
      align-items: center;
      min-height: 16px;
    }
    .qpm-activity-row-time {
      margin: 0;
      color: #595246;
      font-size: 11px;
      line-height: 1.2;
      font-weight: 500;
    }
    .qpm-activity-row-icon-wrap {
      height: 100%;
      min-height: 48px;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 4px;
    }
    .qpm-activity-row-icon-slot {
      width: 42px;
      height: 42px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
    }
    .qpm-activity-highlight {
      color: #c2502a;
      font-weight: 700;
    }
    .qpm-activity-icon-img {
      width: 100%;
      height: 100%;
      max-width: 100%;
      max-height: 100%;
      display: block;
      image-rendering: pixelated;
      object-fit: contain;
      pointer-events: none;
    }
  `;
  document.head.appendChild(style);
}

function findActivityModal(): { root: HTMLElement; header: HTMLElement; content: HTMLElement; list: HTMLElement } | null {
  const titles = Array.from(document.querySelectorAll(TITLE_SELECTOR));
  const title = titles.find((node) => /activity\s*log/i.test(node.textContent ?? ''));
  if (!(title instanceof HTMLElement)) return null;

  const root = title.closest('div.McGrid');
  if (!(root instanceof HTMLElement)) return null;

  const header = root.querySelector('div.McFlex.css-2tfeb0')
    ?? title.closest('div.McFlex')
    ?? root.firstElementChild;
  if (!(header instanceof HTMLElement)) return null;

  const content = root.querySelector('div.McFlex.css-iek5kf')
    ?? root.querySelectorAll('div.McFlex')[1];
  if (!(content instanceof HTMLElement)) return null;

  const list = (
    content.querySelector(NATIVE_LIST_SELECTOR)
    ?? Array.from(content.children).find((child) => (
      child instanceof HTMLElement
      && child.classList.contains('McFlex')
      && child.getAttribute('data-qpm-toolbar') !== '1'
    ))
  );
  if (!(list instanceof HTMLElement)) return null;

  return { root, header, content, list };
}

function createSelect<T extends string>(
  options: Array<{ value: T; label: string }>,
  currentValue: T,
): HTMLSelectElement {
  const select = document.createElement('select');
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

function buildToolbar(): Omit<ModalHandles, 'root' | 'header' | 'content' | 'list' | 'listObserver' | 'onListClick' | 'rowTemplates' | 'nativeRowsByEntryId'> {
  const toolbar = document.createElement('div');
  toolbar.className = 'qpm-activity-toolbar';
  toolbar.setAttribute('data-qpm-toolbar', '1');

  const controls = document.createElement('div');
  controls.className = 'qpm-activity-controls';

  const normalizedSort: SortMode = filters.sort === 'time_asc' ? 'time_asc' : 'time_desc';
  const shouldResetHiddenFilters = Boolean(filters.search || filters.petSpecies || filters.plantSpecies || filters.source !== 'all');
  if (filters.sort !== normalizedSort || shouldResetHiddenFilters) {
    filters = {
      ...filters,
      sort: normalizedSort,
      search: '',
      source: 'all',
      petSpecies: '',
      plantSpecies: '',
    };
    queueFiltersSave();
  }

  const categorySelect = createSelect(
    [
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
    ],
    filters.category,
  );
  categorySelect.className = 'qpm-activity-control';
  categorySelect.title = 'Filter by activity type';

  const sortSelect = createSelect<SortMode>(
    [
      { value: 'time_desc', label: 'Order: Newest' },
      { value: 'time_asc', label: 'Order: Oldest' },
    ],
    normalizedSort,
  );
  sortSelect.className = 'qpm-activity-control';
  sortSelect.title = 'Sort order';

  controls.append(
    categorySelect,
    sortSelect,
  );

  const summary = document.createElement('div');
  summary.className = 'qpm-activity-summary';

  toolbar.append(controls, summary);

  return {
    toolbar,
    summary,
    controls: {
      category: categorySelect,
      sort: sortSelect,
    },
  };
}

function scheduleRender(): void {
  if (!modalHandles) return;
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    renderInjectedRows();
  });
}

function wireControlEvents(handles: ModalHandles): void {
  const { controls } = handles;
  const syncAndRender = () => {
    filters = {
      search: '',
      source: 'all',
      category: controls.category.value as CategoryFilter,
      petSpecies: '',
      plantSpecies: '',
      sort: controls.sort.value as SortMode,
    };
    queueFiltersSave();
    scheduleRender();
  };

  controls.category.addEventListener('change', syncAndRender);
  controls.sort.addEventListener('change', syncAndRender);
}

function isRealNativeRow(element: Element): element is HTMLElement {
  return element instanceof HTMLElement
    && element.tagName.toLowerCase() !== 'button'
    && element.getAttribute(ENHANCED_ROW_ATTR) !== '1';
}

function clearEnhancedRows(list: HTMLElement): void {
  const rows = list.querySelectorAll<HTMLElement>(`[${ENHANCED_ROW_ATTR}="1"]`);
  for (const row of rows) {
    row.remove();
  }
}

function hideNativeRows(list: HTMLElement): void {
  for (const child of Array.from(list.children)) {
    if (!isRealNativeRow(child)) continue;
    if (child.getAttribute(HIDDEN_NATIVE_ATTR) !== '1') {
      child.setAttribute(PREV_DISPLAY_ATTR, child.style.display ?? '');
      child.setAttribute(HIDDEN_NATIVE_ATTR, '1');
    }
    child.style.display = 'none';
  }
}

function restoreNativeRows(list: HTMLElement): void {
  const nativeRows = list.querySelectorAll<HTMLElement>(`[${HIDDEN_NATIVE_ATTR}="1"]`);
  for (const row of nativeRows) {
    const prevDisplay = row.getAttribute(PREV_DISPLAY_ATTR);
    row.style.display = prevDisplay ?? '';
    row.removeAttribute(HIDDEN_NATIVE_ATTR);
    row.removeAttribute(PREV_DISPLAY_ATTR);
  }
}

function resolveRowParts(row: HTMLElement): {
  textWrap: HTMLElement | null;
  messageElement: HTMLElement | null;
  timeWrap: HTMLElement | null;
  timeElement: HTMLElement | null;
  iconWrap: HTMLElement | null;
  iconInner: HTMLElement | null;
  highlightClass: string;
} {
  const textWrap = row.firstElementChild as HTMLElement | null;
  const messageElement = textWrap?.querySelector<HTMLElement>('div.css-1kqmvgm')
    ?? textWrap?.querySelector<HTMLElement>('div')
    ?? null;
  const timeElement = textWrap?.querySelector<HTMLElement>('p.chakra-text, p') ?? null;
  const timeWrap = (timeElement?.parentElement as HTMLElement | null) ?? null;
  const iconWrap = row.children.item(1) as HTMLElement | null;
  const iconInner = iconWrap?.firstElementChild as HTMLElement | null;
  const highlightSpan = messageElement?.querySelector<HTMLElement>('span.chakra-text, span');
  const highlightClass = highlightSpan?.className || 'chakra-text';
  return {
    textWrap,
    messageElement,
    timeWrap,
    timeElement,
    iconWrap,
    iconInner,
    highlightClass,
  };
}

function captureNativeRowTemplateFromRow(sourceRow: HTMLElement): NativeRowTemplate | null {
  const parts = resolveRowParts(sourceRow);
  if (!parts.messageElement || !parts.iconWrap) return null;
  return {
    rowClass: sourceRow.className || 'McGrid',
    textWrapClass: parts.textWrap?.className || 'McGrid',
    messageClass: parts.messageElement.className || 'css-1kqmvgm',
    timeWrapClass: parts.timeWrap?.className || 'McFlex',
    timeClass: parts.timeElement?.className || 'chakra-text',
    iconWrapClass: parts.iconWrap.className || 'McFlex',
    iconInnerClass: parts.iconInner?.className || 'McFlex',
    highlightClass: parts.highlightClass,
    iconHTML: parts.iconWrap.innerHTML,
  };
}

function captureNativeRowTemplates(list: HTMLElement): Partial<Record<ActivityCategory, NativeRowTemplate>> {
  void list;
  return { ...PRESET_ROW_TEMPLATES };
}

function resolveTemplateForEntry(entry: ActivityEntry): NativeRowTemplate | null {
  return PRESET_ROW_TEMPLATES[entry.category] ?? PRESET_ROW_TEMPLATES.other;
}

function toPascalCase(value: string): string {
  return value
    .replace(/\(s\)/gi, '')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractItemLabelFromMessage(message: string): string | null {
  const checks = [
    /you purchased\s+\d+\s+(.+?)\s+for\s+[\d,]+/i,
    /you planted\s+\d+\s+(.+?)$/i,
    /you harvested\s+\d+\s+(.+?)$/i,
    /you fed(?: your)?\s+.+?\s+\d+\s+(.+?)$/i,
    /you hatched your\s+(.+?)\s+and got\s+\d+\s+.+$/i,
  ];
  for (const pattern of checks) {
    const match = message.match(pattern);
    const candidate = readString(match?.[1]);
    if (candidate) return candidate;
  }
  return null;
}

function collectHighlightTokens(entry: ActivityEntry): string[] {
  const tokens: string[] = [];
  const pushToken = (value: string | null | undefined): void => {
    const clean = readString(value);
    if (!clean) return;
    if (!tokens.some((existing) => existing.toLowerCase() === clean.toLowerCase())) {
      tokens.push(clean);
    }
  };

  pushToken(entry.petSpecies);
  pushToken(entry.plantSpecies);
  pushToken(extractItemLabelFromMessage(entry.message));

  const buyMatch = entry.message.match(/you purchased\s+\d+\s+(.+?)\s+for/i);
  pushToken(readString(buyMatch?.[1]));
  const sellMatch = entry.message.match(/you sold your\s+(.+?)\s+for/i);
  pushToken(readString(sellMatch?.[1]));
  const feedMatch = entry.message.match(/you fed(?: your)?\s+(.+?)\s+\d+\s+(.+?)$/i);
  pushToken(readString(feedMatch?.[1]));
  pushToken(readString(feedMatch?.[2]));

  return tokens;
}

let coinSpriteUrlCache: string | null | undefined;
let placeholderIconUrlCache: string | null | undefined;
const itemIconUrlCache = new Map<string, string | null>();
const petIconUrlCache = new Map<string, string | null>();
function getCoinSpriteUrl(): string | null {
  if (coinSpriteUrlCache !== undefined) return coinSpriteUrlCache;
  const primary = getAnySpriteDataUrl('sprite/ui/Coin');
  const fallback = primary || getAnySpriteDataUrl('ui/Coin');
  coinSpriteUrlCache = fallback || null;
  return coinSpriteUrlCache;
}

function getPlaceholderIconUrl(): string | null {
  if (placeholderIconUrlCache !== undefined) return placeholderIconUrlCache;
  const candidates = [
    'egg/Common',
    'seed/Carrot',
    'pet/Worm',
    'sprite/ui/Coin',
    'ui/Coin',
  ];
  placeholderIconUrlCache = tryResolveAnySprite(candidates);
  return placeholderIconUrlCache;
}

function renderEnhancedMessage(messageElement: HTMLElement, entry: ActivityEntry, template: NativeRowTemplate): void {
  const message = normalizeWhitespace(entry.message);
  messageElement.replaceChildren();
  if (!message) return;

  const highlights = collectHighlightTokens(entry)
    .filter((token) => token.length >= 2)
    .sort((a, b) => b.length - a.length);
  const uniqueHighlights: string[] = [];
  for (const token of highlights) {
    if (uniqueHighlights.some((existing) => existing.toLowerCase() === token.toLowerCase())) continue;
    uniqueHighlights.push(token);
  }

  if (!uniqueHighlights.length) {
    messageElement.textContent = message;
  } else {
    const pattern = new RegExp(uniqueHighlights.map((token) => escapeRegExp(token)).join('|'), 'ig');
    let cursor = 0;
    let match = pattern.exec(message);
    while (match) {
      const index = match.index ?? 0;
      if (index > cursor) {
        messageElement.appendChild(document.createTextNode(message.slice(cursor, index)));
      }
      const highlighted = document.createElement('span');
      highlighted.className = template.highlightClass;
      highlighted.textContent = message.slice(index, index + match[0].length);
      messageElement.appendChild(highlighted);
      cursor = index + match[0].length;
      match = pattern.exec(message);
    }
    if (cursor < message.length) {
      messageElement.appendChild(document.createTextNode(message.slice(cursor)));
    }
  }

  const hasCoinAmount = /\bfor\s+[\d,]+$/i.test(message) || /\bfound\s+[\d,]+$/i.test(message);
  if (hasCoinAmount) {
    const coinUrl = getCoinSpriteUrl();
    if (coinUrl) {
      messageElement.appendChild(document.createTextNode('\u00A0'));
      const coin = document.createElement('img');
      coin.className = 'qpm-activity-inline-coin';
      coin.alt = 'coin';
      coin.src = coinUrl;
      messageElement.appendChild(coin);
    }
  }
}

function tryResolveAnySprite(candidates: string[]): string | null {
  for (const candidate of candidates) {
    const url = getAnySpriteDataUrl(candidate);
    if (url) return url;
  }
  return null;
}

function resolveItemIconUrl(entry: ActivityEntry): string | null {
  const hinted = readString(entry.itemLabel)
    ?? readString(entry.secondaryLabel)
    ?? readString(entry.iconHints[0] ?? null)
    ?? extractItemLabelFromMessage(entry.message);
  const normalized = hinted ? toPascalCase(hinted) : '';
  if (!normalized) return null;
  const inventoryMatch = resolveInventoryItem(hinted, false);
  const resolveMutations = (text: string): string[] => {
    const hits: string[] = [];
    const patterns: Array<{ label: string; regex: RegExp }> = [
      { label: 'Rainbow', regex: /\brainbow\b/i },
      { label: 'Gold', regex: /\bgold(?:en)?\b/i },
      { label: 'Wet', regex: /\bwet\b/i },
      { label: 'Chilled', regex: /\bchilled\b/i },
      { label: 'Frozen', regex: /\bfrozen\b/i },
      { label: 'Dawnlit', regex: /\bdawnlit\b/i },
      { label: 'Dawnbound', regex: /\bdawnbound\b/i },
      { label: 'Amberlit', regex: /\bamberlit\b/i },
      { label: 'Amberbound', regex: /\bamberbound\b/i },
    ];
    for (const pattern of patterns) {
      if (pattern.regex.test(text)) hits.push(pattern.label);
    }
    return hits;
  };
  const mutationHints = dedupeMutationList([
    ...resolveMutations(entry.message),
    ...resolveMutations(entry.rawMessage),
    ...entry.iconHints.flatMap((hint) => resolveMutations(hint)),
    ...resolveMutations(entry.itemLabel ?? ''),
    ...extractMutationsFromUnknown(inventoryMatch?.raw),
  ]);
  const mutationKey = mutationHints.map((mutation) => normalizeToken(mutation)).sort().join(',');
  const cacheKey = `${normalized.toLowerCase()}::${mutationKey}`;
  if (itemIconUrlCache.has(cacheKey)) {
    return itemIconUrlCache.get(cacheKey) ?? null;
  }

  const produceWithMutations = getProduceSpriteDataUrlWithMutations(normalized, mutationHints);
  if (produceWithMutations) {
    itemIconUrlCache.set(cacheKey, produceWithMutations);
    return produceWithMutations;
  }
  const cropWithMutations = getCropSpriteDataUrlWithMutations(normalized, mutationHints);
  if (cropWithMutations) {
    itemIconUrlCache.set(cacheKey, cropWithMutations);
    return cropWithMutations;
  }

  const singular = normalized.replace(/Seeds$/i, 'Seed').replace(/Eggs$/i, 'Egg').replace(/s$/i, '');
  const eggBase = singular.replace(/Egg$/i, '');
  const seedBase = singular.replace(/Seed$/i, '');

  const candidates = [
    `item/${normalized}`,
    `item/${singular}`,
    `produce/${normalized}`,
    `produce/${singular}`,
    `seed/${normalized}`,
    `seed/${singular}`,
    `seed/${seedBase}`,
    `egg/${normalized}`,
    `egg/${singular}`,
    `egg/${eggBase}`,
    `pet/${normalized}`,
    `pet/${singular}`,
    `decor/${normalized}`,
    `decor/${singular}`,
    `tool/${normalized}`,
    `tool/${singular}`,
    `sprite/item/${normalized}`,
    `sprite/item/${singular}`,
    `sprite/produce/${normalized}`,
    `sprite/produce/${singular}`,
    `sprite/seed/${normalized}`,
    `sprite/seed/${singular}`,
    `sprite/seed/${seedBase}`,
    `sprite/egg/${normalized}`,
    `sprite/egg/${singular}`,
    `sprite/egg/${eggBase}`,
    `sprite/pet/${normalized}`,
    `sprite/pet/${singular}`,
  ];

  const resolved = tryResolveAnySprite(candidates);
  itemIconUrlCache.set(cacheKey, resolved);
  return resolved;
}

function resolvePetIconUrl(species: string | null, hint: string | null = null): string | null {
  const candidate = readString(species) ?? readString(hint);
  if (!candidate) return null;
  const appearance = resolvePetAppearanceFromCandidate(candidate);
  const normalizedSpecies = normalizeToken(appearance?.species ?? candidate);
  if (!normalizedSpecies) return null;
  const mutationKey = (appearance?.mutations ?? []).map((mutation) => normalizeToken(mutation)).sort().join(',');
  const cacheKey = `${normalizedSpecies}::${mutationKey}`;
  if (petIconUrlCache.has(cacheKey)) {
    return petIconUrlCache.get(cacheKey) ?? null;
  }
  try {
    const url = getPetSpriteDataUrlWithMutations(normalizedSpecies, appearance?.mutations ?? []);
    const resolved = url || null;
    petIconUrlCache.set(cacheKey, resolved);
    return resolved;
  } catch {
    petIconUrlCache.set(cacheKey, null);
    return null;
  }
}

function resolveEntryIconUrls(entry: ActivityEntry): string[] {
  const out: string[] = [];
  const push = (url: string | null): void => {
    if (!url) return;
    if (!out.includes(url)) out.push(url);
  };
  const normalizedMessage = normalizeToken(stripTrailingAgeLabel(entry.message));
  const isPetFindCoins = /\byour\s+.+\s+found\s+[\d,]+\b/.test(normalizedMessage);

  if (isPetFindCoins) {
    push(resolvePetIconUrl(entry.petSpecies, entry.secondaryLabel ?? entry.itemLabel));
    return out.slice(0, 1);
  }

  if (entry.category === 'feed') {
    push(resolveItemIconUrl(entry));
    push(resolvePetIconUrl(entry.petSpecies, entry.secondaryLabel));
    return out;
  }

  if (entry.category === 'sell' || entry.category === 'hatch' || entry.category === 'boost') {
    push(resolvePetIconUrl(entry.petSpecies, entry.secondaryLabel ?? entry.itemLabel));
  }
  if (entry.category === 'hatch') {
    push(resolveItemIconUrl(entry));
  }

  if (entry.category === 'purchase' || entry.category === 'plant' || entry.category === 'harvest' || entry.category === 'storage') {
    push(resolveItemIconUrl(entry));
  }

  if (!out.length) {
    push(resolveItemIconUrl(entry));
    push(resolvePetIconUrl(entry.petSpecies, entry.secondaryLabel ?? entry.itemLabel));
  }

  return out.slice(0, 2);
}

function renderEnhancedIcons(iconWrap: HTMLElement, entry: ActivityEntry, template: NativeRowTemplate): void {
  void template;
  const iconUrls = resolveEntryIconUrls(entry);
  iconWrap.replaceChildren();

  if (!iconUrls.length) {
    const placeholder = getPlaceholderIconUrl();
    if (placeholder) {
      iconUrls.push(placeholder);
    }
  }
  if (!iconUrls.length) {
    return;
  }

  for (let index = 0; index < iconUrls.length; index += 1) {
    const url = iconUrls[index];
    if (!url) {
      continue;
    }
    const slot = document.createElement('div');
    slot.className = 'qpm-activity-row-icon-slot';
    const img = document.createElement('img');
    img.className = 'qpm-activity-icon-img';
    img.alt = '';
    img.src = url;
    slot.appendChild(img);
    iconWrap.appendChild(slot);
  }
}

function createEnhancedRow(entry: ActivityEntry, template: NativeRowTemplate): HTMLElement {
  const row = document.createElement('div');
  row.className = template.rowClass;
  row.setAttribute(ENHANCED_ROW_ATTR, '1');
  row.setAttribute('data-qpm-source', entry.source);
  row.setAttribute('data-qpm-category', entry.category);

  const textWrap = document.createElement('div');
  textWrap.className = template.textWrapClass;

  const message = document.createElement('div');
  message.className = template.messageClass;
  renderEnhancedMessage(message, entry, template);

  const timeWrap = document.createElement('div');
  timeWrap.className = template.timeWrapClass;

  const time = document.createElement('p');
  time.className = template.timeClass;
  time.textContent = formatAge(entry.timestamp);
  timeWrap.appendChild(time);

  textWrap.append(message, timeWrap);
  row.appendChild(textWrap);

  const iconWrap = document.createElement('div');
  iconWrap.className = template.iconWrapClass;
  renderEnhancedIcons(iconWrap, entry, template);
  row.appendChild(iconWrap);

  return row;
}

function renderInjectedRows(): void {
  if (!modalHandles) return;
  const previousScrollTop = modalHandles.list.scrollTop;
  const filtered = getFilteredEntries();
  const renderLimit = showAllAfterNativeLoadMore ? filtered.length : MAX_RENDERED_ENTRIES;
  const rendered = filtered.slice(0, Math.max(0, renderLimit));
  const renderableCount = entries.filter((entry) => entry.renderable && !entry.supersededBy).length;
  const filteredCount = filtered.length;
  const filteredOutCount = Math.max(0, renderableCount - filteredCount);
  const expandedSuffix = showAllAfterNativeLoadMore ? ', expanded via Load more' : '';
  modalHandles.summary.textContent = `Enhanced logs: ${rendered.length} shown (${filteredCount} matched, ${filteredOutCount} filtered out, ${renderableCount} renderable, ${entries.length} saved, max ${MAX_ENTRIES}${expandedSuffix})`;

  if (!Object.keys(modalHandles.rowTemplates).length) {
    modalHandles.rowTemplates = captureNativeRowTemplates(modalHandles.list);
  }

  clearEnhancedRows(modalHandles.list);
  hideNativeRows(modalHandles.list);

  modalHandles.listObserver.disconnect();
  isApplyingListRender = true;
  try {
    const fragment = document.createDocumentFragment();
    for (const entry of rendered) {
      const template = resolveTemplateForEntry(entry);
      if (!template) continue;
      fragment.appendChild(createEnhancedRow(entry, template));
    }

    const loadButton = Array.from(modalHandles.list.children).find((child) => child.tagName.toLowerCase() === 'button');
    if (loadButton) {
      modalHandles.list.insertBefore(fragment, loadButton);
    } else {
      modalHandles.list.appendChild(fragment);
    }
  } finally {
    const maxScrollable = Math.max(0, modalHandles.list.scrollHeight - modalHandles.list.clientHeight);
    modalHandles.list.scrollTop = Math.min(Math.max(0, previousScrollTop), maxScrollable);
    isApplyingListRender = false;
    modalHandles.listObserver.observe(modalHandles.list, { childList: true, subtree: true, characterData: true });
  }
}

function detachModal(): void {
  if (!modalHandles) return;
  try {
    modalHandles.listObserver.disconnect();
  } catch {}

  try {
    modalHandles.list.removeEventListener('click', modalHandles.onListClick, true);
  } catch {}

  try {
    clearEnhancedRows(modalHandles.list);
    restoreNativeRows(modalHandles.list);
    for (const row of modalHandles.nativeRowsByEntryId.values()) {
      row.removeAttribute(NATIVE_ENTRY_ID_ATTR);
    }
    modalHandles.toolbar.remove();
  } catch {}

  modalHandles = null;
  showAllAfterNativeLoadMore = false;
}

function attachModal(modal: { root: HTMLElement; header: HTMLElement; content: HTMLElement; list: HTMLElement }): void {
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
  showAllAfterNativeLoadMore = false;

  const built = buildToolbar();
  modal.content.insertBefore(built.toolbar, modal.content.firstChild);

  const listObserver = new MutationObserver((records) => {
    if (isApplyingListRender) return;
    if (!modalHandles) return;

    const addedRows: HTMLElement[] = [];
    let sawRelevantMutation = false;
    for (const record of records) {
      if (record.type === 'characterData') {
        sawRelevantMutation = true;
        continue;
      }
      for (const node of Array.from(record.addedNodes)) {
        if (!(node instanceof HTMLElement)) {
          continue;
        }
        if (node.getAttribute(ENHANCED_ROW_ATTR) === '1') continue;
        if (isRealNativeRow(node)) {
          addedRows.push(node);
          sawRelevantMutation = true;
        }
      }
      for (const node of Array.from(record.removedNodes)) {
        if (!(node instanceof HTMLElement)) {
          continue;
        }
        if (node.getAttribute(ENHANCED_ROW_ATTR) === '1') continue;
        sawRelevantMutation = true;
      }
    }
    if (!sawRelevantMutation) return;

    if (addedRows.length > 0) {
      ingestNativeRows(modal.list, addedRows);
    }
    modalHandles.rowTemplates = captureNativeRowTemplates(modal.list);
    for (const [entryId, row] of Array.from(modalHandles.nativeRowsByEntryId.entries())) {
      if (!row.isConnected || row.parentElement !== modal.list) {
        modalHandles.nativeRowsByEntryId.delete(entryId);
      }
    }
    scheduleRender();
  });
  listObserver.observe(modal.list, { childList: true, subtree: true, characterData: true });

  const onListClick = (event: Event) => {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest('button');
    if (!(button instanceof HTMLButtonElement)) return;
    const label = normalizeToken(button.textContent ?? '');
    if (!/^load\s+\d+\s+more$/.test(label) && !label.startsWith('load ')) return;
    showAllAfterNativeLoadMore = true;
    window.setTimeout(() => {
      scheduleRender();
    }, 0);
  };
  modal.list.addEventListener('click', onListClick, true);

  modalHandles = {
    root: modal.root,
    header: modal.header,
    content: modal.content,
    list: modal.list,
    toolbar: built.toolbar,
    summary: built.summary,
    controls: built.controls,
    listObserver,
    onListClick,
    rowTemplates: captureNativeRowTemplates(modal.list),
    nativeRowsByEntryId: new Map<string, HTMLElement>(),
  };

  wireControlEvents(modalHandles);
  ingestNativeRows(modal.list);
  renderInjectedRows();
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
  }, 120);
}

function startModalObserver(): void {
  if (modalObserver) return;
  modalObserver = new MutationObserver(() => {
    queueModalSync();
  });
  modalObserver.observe(document.body, { childList: true, subtree: true });
  syncModalMount();
}

function stopModalObserver(): void {
  if (!modalObserver) return;
  modalObserver.disconnect();
  modalObserver = null;
  if (modalSyncTimer != null) {
    clearTimeout(modalSyncTimer);
    modalSyncTimer = null;
  }
  detachModal();
}

function restoreConnectionPatch(): void {
  if (!patchedConnection || !originalSendMessage) return;
  try {
    patchedConnection.sendMessage = originalSendMessage;
  } catch {}
  patchedConnection = null;
  originalSendMessage = null;
}

function ensureConnectionPatched(): void {
  const room = (pageWindow as PageWindowWithRoomConnection).MagicCircle_RoomConnection;
  if (!room || typeof room.sendMessage !== 'function') return;
  if (patchedConnection === room) return;

  restoreConnectionPatch();

  const original = room.sendMessage.bind(room);
  const wrapped = (payload: unknown) => {
    const result = original(payload);
    queueMicrotask(() => {
      try { registerPendingAction(payload); } catch {}
    });
    return result;
  };

  try {
    room.sendMessage = wrapped;
    patchedConnection = room;
    originalSendMessage = original;
  } catch {
    patchedConnection = null;
    originalSendMessage = null;
  }
}

function startConnectionPatchLoop(): void {
  if (connectionPatchTimer != null) return;
  ensureConnectionPatched();
  connectionPatchTimer = window.setInterval(() => {
    ensureConnectionPatched();
  }, CONNECTION_PATCH_INTERVAL_MS);
}

function stopConnectionPatchLoop(): void {
  if (connectionPatchTimer != null) {
    clearInterval(connectionPatchTimer);
    connectionPatchTimer = null;
  }
  restoreConnectionPatch();
}

function startPendingSweepLoop(): void {
  if (actionSweepTimer != null) return;
  actionSweepTimer = window.setInterval(() => {
    flushExpiredPendingActions();
  }, ACTION_SWEEP_INTERVAL_MS);
}

function stopPendingSweepLoop(): void {
  if (actionSweepTimer != null) {
    clearInterval(actionSweepTimer);
    actionSweepTimer = null;
  }
}

async function startMyDataActivitySubscription(): Promise<void> {
  if (myDataUnsubscribe) return;
  const atom = getAtomByLabel('myDataAtom');
  if (!atom) return;

  try {
    myDataUnsubscribe = await subscribeAtom<unknown>(atom, (value) => {
      ingestActivityLogsFromAtom(value);
    });
  } catch (error) {
    myDataUnsubscribe = null;
    log('[ActivityLogEnhancer] Failed to subscribe to myDataAtom', error);
  }
}

function stopMyDataActivitySubscription(): void {
  if (!myDataUnsubscribe) return;
  try {
    myDataUnsubscribe();
  } catch {}
  myDataUnsubscribe = null;
}

function triggerExportJson(entriesToExport: ActivityEntry[]): number {
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

export function listActivityLogEnhancerEntries(): unknown[] {
  return entries.map((entry) => ({
    ...entry,
    iconHints: [...entry.iconHints],
  }));
}

export function exportActivityLogEnhancerEntries(): number {
  return triggerExportJson(getFilteredEntries());
}

export function clearActivityLogEnhancerEntries(): number {
  const removed = entries.length;
  entries = [];
  pendingActions = [];
  seenStableKeys.clear();
  entryByFingerprint.clear();
  storage.set(STORAGE_KEY_ENTRIES, entries);
  storage.remove(STORAGE_KEY_ENTRIES_V2);
  storage.remove(STORAGE_KEY_ENTRIES_LEGACY);
  scheduleRender();
  return removed;
}

export async function startActivityLogEnhancer(): Promise<void> {
  if (started) return;
  started = true;

  try {
    resolverSnapshotCache = null;
    entries = loadEntriesFromStorage();
    suppressSemanticDuplicates(entries);
    queueEntriesSave();
    rebuildEntryFingerprintIndex();
    startModalObserver();
    startPendingSweepLoop();
    startConnectionPatchLoop();
    await startMyDataActivitySubscription();
    log(`[ActivityLogEnhancer] started (${entries.length} restored entries)`);
  } catch (error) {
    stopActivityLogEnhancer();
    throw error;
  }
}

export function stopActivityLogEnhancer(): void {
  if (!started) return;
  started = false;

  stopMyDataActivitySubscription();
  stopConnectionPatchLoop();
  stopPendingSweepLoop();
  stopModalObserver();

  if (saveEntriesTimer != null) {
    clearTimeout(saveEntriesTimer);
    saveEntriesTimer = null;
  }
  if (saveFiltersTimer != null) {
    clearTimeout(saveFiltersTimer);
    saveFiltersTimer = null;
  }

  storage.set(STORAGE_KEY_ENTRIES, entries);
  storage.set(STORAGE_KEY_FILTERS, filters);
  resolverSnapshotCache = null;
  log('[ActivityLogEnhancer] stopped');
}
