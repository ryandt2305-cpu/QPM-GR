// Pet Comparison Hub - rebuilt for clarity and performance

import { log } from '../utils/logger';
import { getActivePetInfos, type ActivePetInfo } from '../store/pets';
import { getAtomByLabel, readAtomValue, findAtomsByLabel } from '../core/jotaiBridge';
import { getDetailedPetStats, type DetailedPetStats, type AbilityStats } from '../utils/petDataTester';
import { getSpeciesXpPerLevel, getSpeciesMaxScale, calculateMaxStrength } from '../store/xpTracker';
import { getInventoryItems } from '../store/inventory';
import { getPetSpriteDataUrl } from '../utils/spriteExtractor';
import { getMutationSpriteDataUrl, type MutationSpriteType } from '../utils/petMutationRenderer';
import { pageWindow, isIsolatedContext, readSharedGlobal } from '../core/pageContext';
import { getPetMetadata } from '../data/petMetadata';
import { getHungerDepletionTime } from '../data/petHungerDepletion';
import { formatNumber, formatCoins } from '../utils/formatters';

function formatAbilityValue(ability: AbilityStats): { valueText: string; procsText: string; probText: string } {
  const probText = ability.effectiveProbability != null ? `${ability.effectiveProbability.toFixed(1)}%` : '—';
  const procsText = ability.procsPerHour != null ? `${ability.procsPerHour.toFixed(2)}/hr` : '—';

  const name = ability.baseName?.toLowerCase() ?? ability.name.toLowerCase();
  const isEggGrowth = name.includes('egg growth');
  const isPlantGrowth = name.includes('plant growth');
  const isGardenValue = name.includes('rainbow') || name.includes('gold') || name.includes('size') || ability.effectUnit === 'coins';
  const isXp = ability.effectUnit === 'xp' || ability.category === 'xp';

  if (isEggGrowth) {
    const minutesPerHour = ability.valuePerHour ?? ability.effectiveValue ?? null;
    const val = minutesPerHour != null ? `${minutesPerHour.toFixed(1)} min/hr` : '—';
    return { valueText: val, procsText, probText };
  }

  if (isPlantGrowth) {
    const minutesPerHour = ability.valuePerHour ?? ability.effectiveValue ?? null;
    const val = minutesPerHour != null ? `${minutesPerHour.toFixed(1)} min/hr` : '—';
    return { valueText: val, procsText, probText };
  }

  if (isGardenValue) {
    const coinVal = ability.valuePerHour != null ? `${formatCoins(ability.valuePerHour)}/hr` : '—';
    return { valueText: coinVal, procsText, probText };
  }

  if (isXp) {
    const xpVal = ability.valuePerHour != null ? `${formatNumber(ability.valuePerHour)} XP/hr` : '—';
    return { valueText: xpVal, procsText, probText };
  }

  if (ability.effectLabel && ability.effectiveValue != null) {
    const eff = `${ability.effectLabel}: ${ability.effectiveValue.toFixed(2)}${ability.effectSuffix ?? ''}`;
    return { valueText: eff, procsText, probText };
  }

  const generic = ability.valuePerHour != null ? `${formatNumber(ability.valuePerHour)}/hr` : '—';
  return { valueText: generic, procsText, probText };
}

function scaleAbilityToMax(ability: AbilityStats, currentStr: number | null, maxStr: number | null): AbilityStats {
  if (!currentStr || !maxStr || currentStr <= 0 || maxStr <= currentStr) return ability;
  const ratio = maxStr / currentStr;
  return {
    ...ability,
    effectiveProbability: ability.effectiveProbability != null ? ability.effectiveProbability * ratio : null,
    procsPerHour: ability.procsPerHour != null ? ability.procsPerHour * ratio : null,
    procsPerDay: ability.procsPerDay != null ? ability.procsPerDay * ratio : null,
    valuePerHour: ability.valuePerHour != null ? ability.valuePerHour * ratio : null,
    valuePerDay: ability.valuePerDay != null ? ability.valuePerDay * ratio : null,
    gardenValuePerProc: ability.gardenValuePerProc != null ? ability.gardenValuePerProc * ratio : null,
    effectiveValue: ability.effectiveValue != null ? ability.effectiveValue * ratio : ability.effectiveValue,
  };
}

function formatWeight(weight: number | null | undefined): string {
  if (weight == null || Number.isNaN(weight)) return '—';
  if (weight >= 1000) return `${(weight / 1000).toFixed(1)} t`;
  if (weight >= 10) return `${weight.toFixed(0)} kg`;
  if (weight >= 1) return `${weight.toFixed(1)} kg`;
  return `${weight.toFixed(2)} kg`;
}

interface AbilityColorInfo {
  base: string;
  glow: string;
  text: string;
  border: string;
  label: string;
}

const ABILITY_COLOR_MAP = {
  plantGrowth: { base: '#2E7D32', glow: 'rgba(46,125,50,0.65)', text: '#C8E6C9', border: 'rgba(200,230,201,0.4)', label: 'Plant Growth' },
  eggGrowth: { base: '#FF7043', glow: 'rgba(255,112,67,0.65)', text: '#FFE0B2', border: 'rgba(255,224,178,0.45)', label: 'Egg Growth' },
  xp: { base: '#7C4DFF', glow: 'rgba(124,77,255,0.65)', text: '#EDE7F6', border: 'rgba(237,231,246,0.45)', label: 'XP' },
  coins: { base: '#FFB300', glow: 'rgba(255,179,0,0.65)', text: '#FFF8E1', border: 'rgba(255,248,225,0.45)', label: 'Coins' },
  misc: { base: '#90A4AE', glow: 'rgba(144,164,174,0.6)', text: '#ECEFF1', border: 'rgba(236,239,241,0.4)', label: 'Ability' },
  hunger: { base: '#26C6DA', glow: 'rgba(38,198,218,0.65)', text: '#E0F7FA', border: 'rgba(224,247,250,0.45)', label: 'Hunger' },
  mutation: { base: '#EC407A', glow: 'rgba(236,64,122,0.6)', text: '#FCE4EC', border: 'rgba(252,228,236,0.45)', label: 'Mutation' },
  rainbow: { base: '#7C4DFF', glow: 'rgba(124,77,255,0.7)', text: '#F3E5F5', border: 'rgba(243,229,245,0.55)', label: 'Rainbow' },
  gold: { base: '#FDD835', glow: 'rgba(253,216,53,0.75)', text: '#FFFDE7', border: 'rgba(255,253,231,0.55)', label: 'Gold' },
  default: { base: '#5E5CE6', glow: 'rgba(94,92,230,0.5)', text: '#E0E7FF', border: 'rgba(224,231,255,0.4)', label: 'Ability' },
} satisfies Record<string, AbilityColorInfo>;

// Exact color mapping from Magic Garden wiki
function getAbilityColorByName(abilityName: string): string {
  const name = (abilityName || '').toLowerCase();

  // Rainbow and Gold special abilities - use gradients
  if (name.includes('rainbow')) {
    return 'linear-gradient(135deg, #FF0000 0%, #FF7F00 16.67%, #FFFF00 33.33%, #00FF00 50%, #0000FF 66.67%, #4B0082 83.33%, #9400D3 100%)';
  }
  if (name.includes('gold') || name.includes('golden')) {
    return 'linear-gradient(135deg, #FFD700 0%, #FFA500 50%, #FFD700 100%)';
  }

  // Crop abilities - Orange/Red tones
  if (name.includes('crop eater')) return '#FF5722';
  if (name.includes('crop refund')) return '#FF5722';
  if (name.includes('crop mutation boost')) return '#E91E63';
  if (name.includes('crop size boost')) return '#4CAF50';

  // Seed abilities - Orange
  if (name.includes('seed finder')) return '#FF9800';

  // Coin abilities - Yellow/Gold
  if (name.includes('coin finder')) return '#FFD700';

  // Egg abilities - Purple/Magenta
  if (name.includes('egg growth boost')) return '#9C27B0';

  // Pet abilities
  if (name.includes('pet refund')) return '#00BCD4';
  if (name.includes('pet mutation boost')) return '#E91E63';

  // Sell abilities - Red
  if (name.includes('sell boost')) return '#F44336';

  // Hunger abilities - Pink
  if (name.includes('hunger restore') || name.includes('hunger boost')) return '#EC407A';

  // XP abilities - Purple/Blue
  if (name.includes('hatch xp boost')) return '#7C4DFF';
  if (name.includes('xp boost')) return '#2196F3';

  // Strength abilities - Purple
  if (name.includes('max strength boost')) return '#673AB7';

  // Plant abilities - Teal/Cyan
  if (name.includes('plant growth boost')) return '#26A69A';

  // Weather/Special abilities - Blue
  if (name.includes('rain dance')) return '#2196F3';
  if (name.includes('double hatch')) return '#5C6BC0';
  if (name.includes('double harvest')) return '#1976D2';

  // Default
  return '#90A4AE';
}

function getAbilityColorInfo(ability: AbilityStats | null): AbilityColorInfo {
  if (!ability) return ABILITY_COLOR_MAP.default;
  const category = ability.category ?? '';
  if (category && Object.prototype.hasOwnProperty.call(ABILITY_COLOR_MAP, category)) {
    return ABILITY_COLOR_MAP[category as keyof typeof ABILITY_COLOR_MAP];
  }
  const normalizedName = (ability.baseName ?? ability.name).toLowerCase();
  if (normalizedName.includes('rainbow')) return ABILITY_COLOR_MAP.rainbow;
  if (normalizedName.includes('gold')) return ABILITY_COLOR_MAP.gold;
  if (normalizedName.includes('hunger')) return ABILITY_COLOR_MAP.hunger;
  if (normalizedName.includes('mutation')) return ABILITY_COLOR_MAP.mutation;
  return ABILITY_COLOR_MAP.default;
}

type DuelSide = 'left' | 'right';

const DUEL_SIDE_STYLES: Record<DuelSide, { border: string; glow: string; text: string; gradient: string; accent: string }> = {
  left: {
    border: 'rgba(64,196,255,0.7)',
    glow: '0 0 22px rgba(64,196,255,0.35)',
    text: '#C9F1FF',
    gradient: 'linear-gradient(135deg, rgba(64,196,255,0.16), rgba(10,23,42,0.75))',
    accent: '#7dd3ff',
  },
  right: {
    border: 'rgba(189,147,249,0.8)',
    glow: '0 0 22px rgba(189,147,249,0.4)',
    text: '#F7E5FF',
    gradient: 'linear-gradient(135deg, rgba(189,147,249,0.18), rgba(25,6,41,0.8))',
    accent: '#e3b7ff',
  },
};

function clampPercentValue(value: number | null | undefined): number | null {
  if (value == null || Number.isNaN(value)) return null;
  return Math.max(0, Math.min(100, value));
}

function renderProgressBar(label: string, pct: number | null, valueLabel: string, accent: string): string {
  const clamped = clampPercentValue(pct);
  const width = clamped != null ? `${clamped}%` : '0%';
  const displayValue = valueLabel || (clamped != null ? `${clamped.toFixed(0)}%` : '—');
  return `
    <div style="display:flex;flex-direction:column;gap:4px;">
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--qpm-text-dim,#9FA6B2);">
        <span>${label}</span>
        <span>${displayValue}</span>
      </div>
      <div style="height:8px;border-radius:999px;background:rgba(255,255,255,0.08);overflow:hidden;">
        <div style="height:100%;width:${width};background:linear-gradient(90deg, ${accent}, rgba(255,255,255,0.35));transition:width 0.3s ease;"></div>
      </div>
    </div>
  `;
}

function formatHours(hours: number | null | undefined): string {
  if (hours == null || Number.isNaN(hours)) return '—';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours >= 24) {
    const days = hours / 24;
    return days >= 1 ? `${days >= 10 ? days.toFixed(0) : days.toFixed(1)}d` : `${hours.toFixed(0)}h`;
  }
  return `${hours >= 10 ? hours.toFixed(0) : hours.toFixed(1)}h`;
}

function renderStatIndicator(label: string, value: string, pct: number | null, accent: string): string {
  const progress = clampPercentValue(pct);
  const width = progress != null ? `${progress}%` : '0%';
  return `
    <div style="display:flex;flex-direction:column;gap:6px;padding:8px 10px;border-radius:12px;background:rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.08);">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:11px;color:rgba(255,255,255,0.75);letter-spacing:0.4px;">${label}</span>
        <span style="font-size:13px;font-weight:700;color:${accent};">${value}</span>
      </div>
      <div style="height:8px;border-radius:999px;background:rgba(255,255,255,0.08);overflow:hidden;">
        <div style="height:100%;width:${width};background:linear-gradient(90deg, ${accent}, rgba(255,255,255,0.65));transition:width 0.3s ease;"></div>
      </div>
    </div>
  `;
}

function renderAbilitySquares(abilities: AbilityStats[]): string {
  if (!abilities.length) return '';
  const displayed = abilities.slice(0, 4);
  const content = displayed
    .map((ability, idx) => {
      const colors = getAbilityColorInfo(ability);
      const initials = (ability.baseName || ability.name)
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part[0])
        .join('');
      return `
        <div title="${ability.name}" data-ability-index="${idx}" style="width:26px;height:26px;border-radius:8px;background:${colors.base};border:1px solid rgba(255,255,255,0.65);box-shadow:0 0 10px ${colors.glow};display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:${colors.text};">
          ${initials || '?'}
        </div>
      `;
    })
    .join('');

  const placeholderCount = Math.max(0, 4 - displayed.length);
  const placeholders = Array.from({ length: placeholderCount })
    .map(
      (_, idx) => `
        <div data-ability-placeholder="${idx}" style="width:26px;height:26px;border-radius:8px;background:rgba(255,255,255,0.05);border:1px dashed rgba(255,255,255,0.2);"></div>
      `,
    )
    .join('');

  return `
    <div style="position:absolute;left:-38px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:8px;">
      ${content}${placeholders}
    </div>
  `;
}

interface PetWithSource {
  stats: DetailedPetStats;
  source: 'active' | 'inventory' | 'hutch';
  petInfo: ActivePetInfo | any;
}

type SlotHighlightMap = {
  str?: boolean;
  maxStr?: boolean;
  xp?: boolean;
  abilities?: boolean;
  mutations?: boolean;
  abilityFocus?: boolean;
};

const MUTATION_DISPLAY_PRIORITY: MutationSpriteType[] = ['rainbow', 'gold'];
const spriteDropdownRegistry = new WeakMap<HTMLSelectElement, () => PetWithSource[]>();
let activeSpriteDropdown: { element: HTMLElement; select: HTMLSelectElement } | null = null;
let spriteDropdownListenersAttached = false;
const SUCCESS_HIGHLIGHT_BG = 'rgba(64, 255, 194, 0.28)';
const SUCCESS_HIGHLIGHT_BORDER = 'rgba(64, 255, 194, 0.9)';

// Performance: Cache sprite URLs to avoid redundant lookups (300+ calls per Aries team apply)
const spriteCache = new Map<string, string | null>();
function getCachedSprite(pet: PetWithSource): string | null {
  const cacheKey = `${pet.stats.species}-${pet.stats.mutations?.join(',') || 'none'}`;
  if (spriteCache.has(cacheKey)) {
    return spriteCache.get(cacheKey)!;
  }
  const sprite = getDisplaySprite(pet.stats);
  spriteCache.set(cacheKey, sprite);
  return sprite;
}

const handleDropdownScroll = (event: Event): void => {
  if (!activeSpriteDropdown) return;
  const target = event.target as Node | null;
  if (target && (activeSpriteDropdown.element.contains(target) || activeSpriteDropdown.select.contains(target))) {
    return;
  }
  closeActiveSpriteDropdown();
};

function getDisplaySprite(stats: DetailedPetStats | null | undefined): string | null {
  if (!stats?.species) {
    return null;
  }
  const speciesKey = stats.species.toLowerCase();
  const mutations = extractKnownMutations(stats);

  for (const mutation of MUTATION_DISPLAY_PRIORITY) {
    if (mutations.has(mutation)) {
      const mutatedSprite = getMutationSpriteDataUrl(speciesKey, mutation);
      if (mutatedSprite) {
        return mutatedSprite;
      }
    }
  }

  return getPetSpriteDataUrl(speciesKey);
}

function extractKnownMutations(stats: DetailedPetStats): Set<MutationSpriteType> {
  const result = new Set<MutationSpriteType>();
  const push = (value: unknown) => {
    const normalized = normalizeMutationName(value);
    if (normalized) {
      result.add(normalized);
    }
  };

  (stats.mutations ?? []).forEach(push);
  if (stats.hasRainbow) push('rainbow');
  if (stats.hasGold) push('gold');

  return result;
}

function normalizeMutationName(value: unknown): MutationSpriteType | null {
  const key = String(value ?? '').toLowerCase();
  if (key === 'rainbow') return 'rainbow';
  if (key === 'gold') return 'gold';
  return null;
}

type AriesTeamSummary = {
  id: string;
  name: string;
  slotIds: (string | null)[];
};

type AriesStatus = 'unknown' | 'unavailable' | 'ready';

interface AriesPetsService {
  getTeams: () => unknown[] | Promise<unknown[]>;
  onTeamsChangeNow?: (
    cb: (teams: unknown[]) => void,
  ) => Promise<(() => void) | void> | (() => void) | void;
}

type AriesTeamsListener = (payload: { status: AriesStatus; teams: AriesTeamSummary[] }) => void;

const ariesTeamsListeners = new Set<AriesTeamsListener>();
let ariesTeamsCache: AriesTeamSummary[] = [];
let ariesStatus: AriesStatus = 'unknown';
let ariesWatcherAttached = false;
let ariesWatcherPromise: Promise<void> | null = null;
let ariesRetryTimer: number | null = null;

function subscribeToAriesTeams(listener: AriesTeamsListener): () => void {
  ariesTeamsListeners.add(listener);
  listener({ status: ariesStatus, teams: ariesTeamsCache });
  ensureAriesTeamsWatcher();
  return () => {
    ariesTeamsListeners.delete(listener);
  };
}

function ensureAriesTeamsWatcher(): void {
  if (ariesWatcherPromise) return;
  ariesWatcherPromise = (async () => {
    const service = getAriesPetsService();
    if (!service) {
      ariesStatus = 'unavailable';
      notifyAriesListeners();
      ariesWatcherPromise = null;
      // Retry detection every 4 seconds (Aries mod might load after QPM)
      // No logging here to avoid spam for users without Aries
      if (ariesRetryTimer == null && ariesTeamsListeners.size > 0) {
        ariesRetryTimer = window.setTimeout(() => {
          ariesRetryTimer = null;
          ensureAriesTeamsWatcher();
        }, 4000);
      }
      return;
    }
    log('[Aries] 🔗 PetsService detected, setting up team sync');
    if (ariesRetryTimer != null) {
      window.clearTimeout(ariesRetryTimer);
      ariesRetryTimer = null;
    }
    if (ariesWatcherAttached) {
      ariesWatcherPromise = null;
      return;
    }
    ariesWatcherAttached = true;
    ariesStatus = 'ready';
    try {
      ariesTeamsCache = await resolveAriesTeams(service);
      log(`[Aries] Loaded ${ariesTeamsCache.length} team(s):`, ariesTeamsCache.map(t => t.name).join(', '));
      notifyAriesListeners();
    } catch (error) {
      log('[Aries] Failed to read Aries teams', error);
    }
    if (typeof service.onTeamsChangeNow === 'function') {
      try {
        await service.onTeamsChangeNow(raw => {
          ariesTeamsCache = normalizeAriesTeams(raw);
          log(`[Aries] Teams updated: ${ariesTeamsCache.length} team(s)`);
          notifyAriesListeners();
        });
        log('[Aries] Successfully subscribed to team changes');
      } catch (error) {
        log('[Aries] Failed to subscribe to Aries teams', error);
      }
    } else {
      log('[Aries] onTeamsChangeNow not available; presets will be static');
    }
    ariesWatcherPromise = null;
  })().catch(error => {
    log('Aries watcher setup failed', error);
    ariesWatcherPromise = null;
  });
}

function notifyAriesListeners(): void {
  const snapshot = { status: ariesStatus, teams: ariesTeamsCache };
  for (const listener of ariesTeamsListeners) {
    try {
      listener(snapshot);
    } catch (error) {
      log('Aries listener failed', error);
    }
  }
}

function getAriesPetsService(): AriesPetsService | null {
  let candidate: AriesPetsService | undefined;

  // Try pageWindow.PetsService
  candidate = (pageWindow as typeof window & { PetsService?: AriesPetsService }).PetsService;
  if (candidate && typeof candidate.getTeams === 'function') {
    log('[Aries] ✅ Found PetsService at pageWindow.PetsService');
    return candidate;
  }

  // Try window.PetsService (isolated context)
  if (isIsolatedContext) {
    candidate = (window as typeof window & { PetsService?: AriesPetsService }).PetsService;
    if (candidate && typeof candidate.getTeams === 'function') {
      log('[Aries] ✅ Found PetsService at window.PetsService');
      return candidate;
    }
  }

  // Try shared global
  candidate = readSharedGlobal<AriesPetsService>('PetsService');
  if (candidate && typeof candidate.getTeams === 'function') {
    log('[Aries] ✅ Found PetsService via readSharedGlobal');
    return candidate;
  }

  // Try QWS.PetsService
  const pageQws = (pageWindow as unknown as Record<string, unknown>).QWS;
  if (pageQws && typeof (pageQws as Record<string, unknown>).PetsService === 'object') {
    candidate = ((pageQws as Record<string, unknown>).PetsService ?? undefined) as AriesPetsService | undefined;
    if (candidate && typeof candidate.getTeams === 'function') {
      log('[Aries] ✅ Found PetsService at pageWindow.QWS.PetsService');
      return candidate;
    }
  }

  const winQws = (window as unknown as Record<string, unknown>).QWS;
  if (winQws && typeof (winQws as Record<string, unknown>).PetsService === 'object') {
    candidate = ((winQws as Record<string, unknown>).PetsService ?? undefined) as AriesPetsService | undefined;
    if (candidate && typeof candidate.getTeams === 'function') {
      log('[Aries] ✅ Found PetsService at window.QWS.PetsService');
      return candidate;
    }
  }

  // Fallback: Try reading from localStorage if Aries stores teams there
  // NOTE: Aries userscripts don't appear in DOM (Tampermonkey isolation) and don't expose globals.
  // We can't detect if it's currently enabled, so we show UI whenever valid teams exist.
  // To hide stale data: localStorage.removeItem('qws:pets:teams:v1')
  const localStorageFallback = tryCreateLocalStorageFallback();
  if (localStorageFallback) {
    log('[Aries] ✅ Found teams in localStorage');
    return localStorageFallback;
  }

  // Don't log "not found" - most users won't have Aries mod
  return null;
}

function tryCreateLocalStorageFallback(): AriesPetsService | null {
  // Known Aries mod localStorage keys (prioritized)
  const possibleKeys = [
    'qws:pets:teams:v1',      // Aries mod actual key
    'MGA_petPresets',          // Alternative Aries key
    'aries:teams',
    'aries:petTeams',
    'qws:teams',
    'qws:petTeams',
    'petTeams',
    'teams',
  ];

  for (const key of possibleKeys) {
    try {
      const stored = localStorage.getItem(key);
      if (!stored) continue;

      const data = JSON.parse(stored);
      if (!Array.isArray(data)) continue;

      // Validate it looks like team data
      const hasTeamStructure = data.every(item =>
        item &&
        typeof item === 'object' &&
        'id' in item &&
        'name' in item &&
        'slots' in item &&
        Array.isArray(item.slots)
      );

      if (hasTeamStructure && data.length > 0) {
        return {
          getTeams: () => data,
          // No live updates in fallback mode
        };
      }
    } catch {
      // Invalid JSON or structure, continue
    }
  }

  return null;
}

async function resolveAriesTeams(service: AriesPetsService): Promise<AriesTeamSummary[]> {
  try {
    const teams = await Promise.resolve(service.getTeams());
    return normalizeAriesTeams(teams);
  } catch (error) {
    log('Aries getTeams failed', error);
    return [];
  }
}

function normalizeAriesTeams(raw: unknown): AriesTeamSummary[] {
  if (!Array.isArray(raw)) return [];
  const teams: AriesTeamSummary[] = [];
  raw.forEach(entry => {
    const normalized = normalizeAriesTeam(entry);
    if (normalized) {
      teams.push(normalized);
    }
  });
  return teams;
}

function normalizeAriesTeam(entry: unknown): AriesTeamSummary | null {
  if (!entry || typeof entry !== 'object') return null;
  const obj = entry as Record<string, unknown>;
  const id = normalizeSlotIdentifier(obj.id ?? obj.teamId ?? obj.key) ?? `team-${Math.random().toString(36).slice(2, 8)}`;
  const rawName = obj.name ?? obj.label ?? obj.title ?? id;
  const name = typeof rawName === 'string' && rawName.trim().length ? rawName.trim() : `Team ${id}`;
  const slotsSource = Array.isArray(obj.slots) ? obj.slots : Array.isArray(obj.team) ? obj.team : [];
  const slotIds: (string | null)[] = [];
  for (let i = 0; i < 3; i += 1) {
    slotIds.push(normalizeSlotIdentifier(slotsSource[i]));
  }
  return { id, name, slotIds };
}

function normalizeSlotIdentifier(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return (
      normalizeSlotIdentifier(obj.id) ??
      normalizeSlotIdentifier(obj.petId) ??
      normalizeSlotIdentifier(obj.slotId) ??
      null
    );
  }
  return null;
}

function cleanupOnDetach(element: HTMLElement, cleanup: () => void): void {
  let wasConnected = element.isConnected;
  const observer = new MutationObserver(() => {
    const connected = element.isConnected;
    if (!wasConnected && connected) {
      wasConnected = true;
      return;
    }
    if (wasConnected && !connected) {
      observer.disconnect();
      cleanup();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function enableSpriteDropdown(select: HTMLSelectElement, getPets: () => PetWithSource[]): void {
  if (spriteDropdownRegistry.has(select)) {
    return;
  }
  spriteDropdownRegistry.set(select, getPets);
  select.style.cursor = 'pointer';
  select.addEventListener('mousedown', event => {
    if (select.disabled) return;
    event.preventDefault();
    event.stopPropagation();
    toggleSpriteDropdown(select);
  });
  select.addEventListener('keydown', event => {
    if (select.disabled) return;
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openSpriteDropdown(select);
    } else if (event.key === 'Escape') {
      closeActiveSpriteDropdown();
    }
  });
}

function toggleSpriteDropdown(select: HTMLSelectElement): void {
  if (activeSpriteDropdown?.select === select) {
    closeActiveSpriteDropdown();
  } else {
    openSpriteDropdown(select);
  }
}

function openSpriteDropdown(select: HTMLSelectElement): void {
  const getPets = spriteDropdownRegistry.get(select);
  if (!getPets) return;
  const options = Array.from(select.options);
  if (!options.length) return;
  closeActiveSpriteDropdown();
  const pets = getPets();
  const rect = select.getBoundingClientRect();
  const overlay = document.createElement('div');
  const viewportMargin = 8;
  const pageX = rect.left + window.scrollX;
  const initialTop = rect.bottom + window.scrollY + viewportMargin;
  let maxHeight = Math.min(360, window.innerHeight - rect.bottom - viewportMargin - 4);
  let top = initialTop;
  if (maxHeight < 160) {
    const availableAbove = rect.top - viewportMargin;
    if (availableAbove > maxHeight) {
      maxHeight = Math.min(360, availableAbove);
      top = rect.top + window.scrollY - viewportMargin - maxHeight;
    }
  }
  const finalMaxHeight = maxHeight > 0 ? Math.min(360, maxHeight) : 240;
  overlay.style.cssText = `
    position: absolute;
    left: ${pageX}px;
    top: ${top}px;
    width: ${rect.width}px;
    max-height: ${finalMaxHeight}px;
    overflow-y: auto;
    background: rgba(8, 10, 15, 0.98);
    border: 1px solid var(--qpm-border);
    border-radius: 10px;
    box-shadow: 0 18px 40px rgba(0,0,0,0.55);
    z-index: 1000000;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  `;

  options.forEach(option => {
    const idx = Number(option.value);
    const pet = Number.isFinite(idx) ? pets[idx] ?? null : null;
    const sprite = pet ? getDisplaySprite(pet.stats) : null;
    const item = createSpriteDropdownItem(select, option.value, option.textContent ?? option.value, sprite, option.value === select.value);
    overlay.appendChild(item);
  });

  if (!overlay.children.length) {
    overlay.textContent = 'No pets available';
    overlay.style.color = 'var(--qpm-text-dim)';
    overlay.style.textAlign = 'center';
    overlay.style.padding = '12px';
  }

  document.body.appendChild(overlay);
  activeSpriteDropdown = { element: overlay, select };
  attachSpriteDropdownListeners();
}

function createSpriteDropdownItem(select: HTMLSelectElement, value: string, label: string, sprite: string | null, selected: boolean): HTMLElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.style.cssText = `
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border: none;
    border-radius: 8px;
    background: ${selected ? 'rgba(143,130,255,0.18)' : 'transparent'};
    color: var(--qpm-text);
    font-size: 13px;
    text-align: left;
    cursor: pointer;
  `;
  const spriteBox = document.createElement('div');
  spriteBox.style.cssText = `
    width: 30px;
    height: 30px;
    border-radius: 8px;
    border: 1px solid var(--qpm-border);
    flex-shrink: 0;
    image-rendering: pixelated;
    background: ${sprite ? `url("${sprite}") center/contain no-repeat` : 'rgba(255,255,255,0.05)'};
  `;
  const labelSpan = document.createElement('div');
  labelSpan.style.cssText = 'flex:1;font-weight:600;';
  labelSpan.textContent = label;
  btn.appendChild(spriteBox);
  btn.appendChild(labelSpan);

  const highlight = (state: 'hover' | 'selected' | 'idle') => {
    if (state === 'hover') {
      btn.style.background = 'rgba(143,130,255,0.22)';
    } else if (state === 'selected') {
      btn.style.background = 'rgba(143,130,255,0.18)';
    } else {
      btn.style.background = 'transparent';
    }
  };
  if (selected) highlight('selected');
  btn.addEventListener('mouseenter', () => highlight('hover'));
  btn.addEventListener('mouseleave', () => highlight(selected ? 'selected' : 'idle'));
  btn.addEventListener('click', () => {
    if (select.value !== value) {
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    closeActiveSpriteDropdown();
  });
  return btn;
}

function closeActiveSpriteDropdown(): void {
  if (!activeSpriteDropdown) return;
  activeSpriteDropdown.element.remove();
  activeSpriteDropdown = null;
  detachSpriteDropdownListeners();
}

function attachSpriteDropdownListeners(): void {
  if (spriteDropdownListenersAttached) return;
  spriteDropdownListenersAttached = true;
  document.addEventListener('mousedown', handleDropdownGlobalMouseDown, true);
  window.addEventListener('resize', closeActiveSpriteDropdown);
  document.addEventListener('scroll', handleDropdownScroll, true);
  document.addEventListener('keydown', handleDropdownKeydown, true);
}

function detachSpriteDropdownListeners(force: boolean = false): void {
  if (!spriteDropdownListenersAttached) return;
  if (!force && activeSpriteDropdown) return; // Don't detach if dropdown is active unless forced
  spriteDropdownListenersAttached = false;
  activeSpriteDropdown = null; // Clear active dropdown reference
  document.removeEventListener('mousedown', handleDropdownGlobalMouseDown, true);
  window.removeEventListener('resize', closeActiveSpriteDropdown);
  document.removeEventListener('scroll', handleDropdownScroll, true);
  document.removeEventListener('keydown', handleDropdownKeydown, true);
}

function handleDropdownGlobalMouseDown(event: MouseEvent): void {
  if (!activeSpriteDropdown) return;
  const target = event.target as Node;
  if (activeSpriteDropdown.element.contains(target) || activeSpriteDropdown.select.contains(target)) {
    return;
  }
  closeActiveSpriteDropdown();
}

function handleDropdownKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    closeActiveSpriteDropdown();
  }
}

const INVENTORY_ATOMS = ['Inventory', 'inventoryAtom', 'lockerAtom'];
const HUTCH_ATOMS = [
  'petHutchAtom',
  'petHutch',
  'hutchAtom',
  'petHutchData',
  'hutchPets',
  'petHutchPets',
  'Hutch Pets',
  'petHutchEntries',
  '/home/runner/work/magiccircle.gg/magiccircle.gg/client/src/games/Quinoa/atoms/inventoryAtoms.ts/myPetHutchStoragesAtom',
  '/home/runner/work/magiccircle.gg/magiccircle.gg/client/src/games/Quinoa/atoms/inventoryAtoms.ts/myPetHutchItemsAtom',
  '/home/runner/work/magiccircle.gg/magiccircle.gg/client/src/games/Quinoa/atoms/inventoryAtoms.ts/myPetHutchPetItemsAtom',
  '/home/runner/work/magiccircle.gg/magiccircle.gg/client/src/games/Quinoa/atoms/inventoryAtoms.ts/myNumPetHutchItemsAtom',
];

// Expose helper for console inspection
(window as any).__QPM__ = (window as any).__QPM__ || {};
(window as any).__QPM__.getAtomByLabel = getAtomByLabel;

function determineWinner(a: DetailedPetStats | null, b: DetailedPetStats | null): 'A' | 'B' | null {
  if (a && !b) return 'A';
  if (b && !a) return 'B';
  if (!a || !b) return null;
  const strengthA = Number(a.currentStrength ?? 0);
  const strengthB = Number(b.currentStrength ?? 0);
  if (strengthA !== strengthB) return strengthA > strengthB ? 'A' : 'B';
  const maxA = Number(a.maxStrength ?? 0);
  const maxB = Number(b.maxStrength ?? 0);
  if (maxA !== maxB) return maxA > maxB ? 'A' : 'B';
  const abilitiesA = Number(a.abilityCount ?? a.abilities.length ?? 0);
  const abilitiesB = Number(b.abilityCount ?? b.abilities.length ?? 0);
  if (abilitiesA !== abilitiesB) return abilitiesA > abilitiesB ? 'A' : 'B';
  const mutA = Number(a.mutationCount ?? a.mutations.length ?? 0);
  const mutB = Number(b.mutationCount ?? b.mutations.length ?? 0);
  if (mutA !== mutB) return mutA > mutB ? 'A' : 'B';
  // Tie-breaker: top ability value per hour then procs
  const topAbility = (stats: DetailedPetStats) =>
    [...stats.abilities].sort((x, y) => {
      const v = (y.valuePerHour || 0) - (x.valuePerHour || 0);
      if (Math.abs(v) > 1e-6) return v;
      return (y.procsPerHour || 0) - (x.procsPerHour || 0);
    })[0];
  const topA = topAbility(a);
  const topB = topAbility(b);
  const valA = topA ? topA.valuePerHour || 0 : 0;
  const valB = topB ? topB.valuePerHour || 0 : 0;
  if (valA !== valB) return valA > valB ? 'A' : 'B';
  const procA = topA ? topA.procsPerHour || 0 : 0;
  const procB = topB ? topB.procsPerHour || 0 : 0;
  if (procA !== procB) return procA > procB ? 'A' : 'B';
  return null;
}

function extractPetEntriesFromValue(value: any): any[] {
  const visit = (val: any, depth: number): any[] => {
    if (depth > 4 || val == null) return [];
    if (Array.isArray(val)) {
      const objs = val.filter(entry => entry && typeof entry === 'object');
      if (objs.length) return objs;
    }
    if (typeof val !== 'object') return [];

    const out: any[] = [];
    const keys = ['items', 'pets', 'inventory', 'entries', 'list', 'data', 'value'];
    for (const key of keys) {
      const chunk = (val as Record<string, unknown>)[key];
      if (Array.isArray(chunk)) {
        out.push(...chunk.filter(entry => entry && typeof entry === 'object'));
      }
    }
    for (const child of Object.values(val)) {
      out.push(...visit(child, depth + 1));
    }
    return out;
  };

  return visit(value, 0);
}

function isPetLikeEntry(entry: any): boolean {
  if (!entry || typeof entry !== 'object') return false;
  if (entry.petSpecies || entry.species) return true;
  if (Array.isArray(entry.abilities) || Array.isArray(entry.mutations)) return true;
  const type = String(entry.itemType ?? entry.type ?? '').toLowerCase();
  if (type.includes('pet')) return true;
  if (entry.pet && typeof entry.pet === 'object') {
    return Boolean(entry.pet.species || entry.pet.petSpecies);
  }
  return false;
}

function buildPetEntryKey(entry: any, source: 'inventory' | 'hutch'): string {
  const idCandidate = entry?.id ?? entry?.petId ?? entry?.itemId ?? entry?.slotId ?? entry?.uuid;
  if (idCandidate) {
    return `${source}:${String(idCandidate)}`;
  }
  const species = (entry?.petSpecies ?? entry?.species ?? 'unknown').toLowerCase();
  const xp = entry?.xp ?? entry?.pet?.xp ?? 0;
  const targetScale = entry?.targetScale ?? entry?.pet?.targetScale ?? '';
  const mutations = Array.isArray(entry?.mutations) ? entry.mutations.length : 0;
  return `${source}:${species}:${xp}:${targetScale}:${mutations}`;
}

function dedupePetEntries(entries: any[], source: 'inventory' | 'hutch'): any[] {
  const seen = new Set<string>();
  const result: any[] = [];
  for (const entry of entries) {
    if (!isPetLikeEntry(entry)) continue;
    const key = buildPetEntryKey(entry, source);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(entry);
  }
  return result;
}

async function readAtomEntries(label: string): Promise<any[]> {
  const atom = getAtomByLabel(label);
  if (!atom) return [];
  try {
    const value = await readAtomValue(atom);
    return extractPetEntriesFromValue(value);
  } catch (error) {
    log(`Failed to read ${label}:`, error);
    return [];
  }
}

async function fetchInventoryPetEntries(): Promise<any[]> {
  let entries: any[] = [];
  for (const label of INVENTORY_ATOMS) {
    const chunk = await readAtomEntries(label);
    if (chunk.length) {
      entries = entries.concat(chunk);
    }
  }

  if (!entries.length) {
    const cached = getInventoryItems();
    for (const item of cached) {
      const raw = item.raw as any;
      const hasPetSpecies = Boolean(raw?.petSpecies || raw?.species);
      if ((item.itemType && item.itemType.toLowerCase() === 'pet') || item.species || hasPetSpecies) {
        entries.push(raw ?? item);
      }
    }
  }

  return dedupePetEntries(entries, 'inventory');
}

async function fetchHutchPetEntries(): Promise<any[]> {
  let entries: any[] = [];
  for (const label of HUTCH_ATOMS) {
    const chunk = await readAtomEntries(label);
    if (chunk.length) {
      entries = entries.concat(chunk);
    }
  }

  if (!entries.length) {
    // Try any atom that mentions PetHutch / hutch, including Aries' fake atoms
    try {
      const atomCandidates = findAtomsByLabel(/PetHutch|hutch/i);
      for (const atom of atomCandidates) {
        try {
          const value = await readAtomValue(atom);
          entries = entries.concat(extractPetEntriesFromValue(value));
        } catch (err) {
          log('Failed reading hutch atom candidate', err);
        }
      }
    } catch (err) {
      log('Failed to scan atom cache for hutch', err);
    }
  }

  if (!entries.length) {
    try {
      const globalObj: any = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
      const keys = Object.keys(globalObj).filter(k => k.toLowerCase().includes('hutch'));
      for (const key of keys) {
        const val = (globalObj as any)[key];
        if (val && typeof val === 'object' && ((val as any).debugLabel || (val as any).label)) {
          try {
            const atomVal = await readAtomValue(val);
            entries = entries.concat(extractPetEntriesFromValue(atomVal));
            continue;
          } catch {}
        }
        entries = entries.concat(extractPetEntriesFromValue(val));
        if (val instanceof Map) {
          for (const [, mv] of val.entries()) {
            const payload = (mv as any)?.value ?? mv;
            entries = entries.concat(extractPetEntriesFromValue(payload));
          }
        }
      }

      const mapCandidate = Object.values(globalObj).find(v =>
        v instanceof Map && [...v.keys()].some(k => String(k).includes('myPetHutch'))
      ) as Map<any, any> | undefined;
      if (mapCandidate) {
        for (const [, mv] of mapCandidate.entries()) {
          const payload = (mv as any)?.value ?? mv;
          const label = (mv as any)?.debugLabel ?? (mv as any)?.label ?? '';
          if (label) {
            try {
              const val = await readAtomValue(mv);
              entries = entries.concat(extractPetEntriesFromValue(val));
              continue;
            } catch {}
          }
          entries = entries.concat(extractPetEntriesFromValue(payload));
        }
      }
    } catch (e) {
      log('Failed to scan global hutch entries', e);
    }
  }
  return dedupePetEntries(entries, 'hutch');
}

function toStringArray(value: any): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map(entry => {
        if (typeof entry === 'string') return entry;
        if (entry && typeof entry === 'object') {
          return entry.name ?? entry.type ?? entry.abilityType ?? null;
        }
        return null;
      })
      .filter((entry): entry is string => Boolean(entry));
  }
  return [];
}

function convertPetItemToActiveInfo(entry: any): ActivePetInfo | null {
  if (!entry || typeof entry !== 'object') return null;

  const looksLikePet =
    entry.petSpecies ||
    entry.pet?.species ||
    (entry.itemType && String(entry.itemType).toLowerCase().includes('pet')) ||
    (entry.type && String(entry.type).toLowerCase().includes('pet'));
  if (!looksLikePet) return null;

  const species = entry.petSpecies ?? entry.species ?? entry.pet?.species ?? null;
  if (!species) return null;

  const targetScale = entry.targetScale ?? entry.pet?.targetScale ?? null;

  let maxStrength: number | null = null;
  if (targetScale != null) {
    maxStrength = calculateMaxStrength(targetScale, species);
    if (maxStrength == null) {
      const maxScale = getSpeciesMaxScale(species) ?? 2.0;
      if (maxScale > 1) {
        const ratio = (targetScale - 1) / (maxScale - 1);
        maxStrength = Math.round(80 + ratio * 20);
      }
    }
  }
  if (maxStrength == null) {
    maxStrength = 100;
  }

  let strength = entry.strength ?? entry.pet?.strength ?? null;
  if (strength != null && strength > maxStrength) {
    strength = maxStrength;
  }

  if (strength == null && entry.xp != null) {
    const xpPerLevel = getSpeciesXpPerLevel(species);
    if (xpPerLevel && xpPerLevel > 0) {
      const level = Math.min(30, Math.floor(entry.xp / xpPerLevel));
      const baseStrength = 50;
      const strengthPerLevel = (maxStrength - baseStrength) / 30;
      strength = Math.min(maxStrength, Math.round(baseStrength + level * strengthPerLevel));
    }
  }

  const mutations = toStringArray(entry.mutations ?? entry.pet?.mutations);
  const abilities = toStringArray(entry.abilities ?? entry.pet?.abilities);

  const petInfo: ActivePetInfo = {
    slotIndex: -1,
    slotId: null,
    petId: entry.id ?? entry.petId ?? null,
    hungerPct: null,
    hungerValue: null,
    hungerMax: null,
    hungerRaw: null,
    name: entry.name ?? entry.pet?.name ?? null,
    species,
    targetScale,
    mutations,
    abilities,
    xp: entry.xp ?? entry.pet?.xp ?? null,
    level: strength,
    levelRaw: null,
    strength,
    position: null,
    updatedAt: Date.now(),
    raw: entry,
  };

  return petInfo;
}

function applyOptionSprites(select: HTMLSelectElement, pets: PetWithSource[]): void {
  Array.from(select.options).forEach(opt => {
    const idx = Number(opt.value);
    const pet = pets[idx];
    if (!pet) return;
    const sprite = getCachedSprite(pet); // Use cached sprite lookup
    if (sprite) {
      opt.style.backgroundImage = `url(${sprite})`;
      opt.style.backgroundRepeat = 'no-repeat';
      opt.style.backgroundSize = '20px 20px';
      opt.style.backgroundPosition = '6px center';
      opt.style.paddingLeft = '30px';
      opt.style.imageRendering = 'pixelated';
    }
  });
}

function buildPetIdLookup(pets: PetWithSource[]): Map<string, PetWithSource> {
  const map = new Map<string, PetWithSource>();
  const register = (value: unknown, pet: PetWithSource) => {
    const id = normalizeSlotIdentifier(value);
    if (id && !map.has(id)) {
      map.set(id, pet);
    }
  };
  pets.forEach(pet => {
    register(pet.stats.petId, pet);
    register(pet.petInfo?.petId ?? null, pet);
    register(pet.petInfo?.slotId ?? null, pet);
    const raw = pet.petInfo?.raw as Record<string, unknown> | undefined;
    if (raw) {
      register(raw.id, pet);
      register(raw.petId, pet);
      register(raw.slotId, pet);
      const slot = raw.slot as Record<string, unknown> | undefined;
      if (slot) {
        register(slot.id, pet);
        register(slot.petId, pet);
        register(slot.slotId, pet);
      }
    }
  });
  return map;
}

function applySelectPreview(select: HTMLSelectElement, pet: PetWithSource | null | undefined): void {
  const sprite = getDisplaySprite(pet?.stats ?? null);
  if (sprite) {
    select.style.backgroundImage = `url(${sprite})`;
    select.style.backgroundRepeat = 'no-repeat';
    select.style.backgroundSize = '24px 24px';
    select.style.backgroundPosition = '8px center';
    select.style.paddingLeft = '40px';
    select.style.imageRendering = 'pixelated';
  } else {
    select.style.backgroundImage = '';
    select.style.paddingLeft = '12px';
  }
}

async function getAllPets(): Promise<PetWithSource[]> {
  const allPets: PetWithSource[] = [];

  const appendPet = (entry: any, source: 'inventory' | 'hutch') => {
    try {
      const petInfo = convertPetItemToActiveInfo(entry);
      if (!petInfo) return;
      const stats = getDetailedPetStats(petInfo);
      allPets.push({ stats, source, petInfo });
    } catch (error) {
      log(`Failed to get stats for ${source} pet:`, error);
    }
  };

  const activePets = getActivePetInfos();
  for (const petInfo of activePets) {
    try {
      const stats = getDetailedPetStats(petInfo);
      allPets.push({ stats, source: 'active', petInfo });
    } catch (error) {
      log('Failed to get stats for active pet:', error);
    }
  }

  const [inventoryEntries, hutchEntries] = await Promise.all([
    fetchInventoryPetEntries(),
    fetchHutchPetEntries(),
  ]);

  inventoryEntries.forEach(entry => appendPet(entry, 'inventory'));
  hutchEntries.forEach(entry => appendPet(entry, 'hutch'));

  return allPets;
}

// --- Rendering helpers ----------------------------------------------------

function renderPetImage(stats: DetailedPetStats, size: number, bordered = false): string {
  const sprite = getDisplaySprite(stats);
  const baseBg = sprite ? `url(${sprite}) center/contain no-repeat` : 'linear-gradient(135deg,#3a3f5a,#202437)';
  const baseStyle = `
    width: ${size}px;
    height: ${size}px;
    border-radius: ${Math.round(size * 0.2)}px;
    background: ${baseBg};
    position: relative;
    overflow: hidden;
    image-rendering: pixelated;
    ${bordered ? 'border: 1px solid var(--qpm-border);' : ''}
  `;
  return `
    <div style="${baseStyle}"></div>
  `;
}

function statPill(label: string, value: string | number, highlight?: 'success' | 'danger'): string {
  const borderColor = highlight === 'success'
    ? SUCCESS_HIGHLIGHT_BORDER
    : highlight === 'danger'
      ? 'var(--qpm-error)'
      : 'var(--qpm-border)';
  const background = highlight === 'success'
    ? SUCCESS_HIGHLIGHT_BG
    : highlight === 'danger'
      ? 'rgba(244,67,54,0.12)'
      : 'rgba(255,255,255,0.02)';
  const valueColor = highlight === 'success'
    ? 'rgb(64, 255, 194)'
    : highlight === 'danger'
      ? 'var(--qpm-error)'
      : 'var(--qpm-text)';
  return `
    <div style="display:flex;flex-direction:column;gap:3px;padding:8px;border:1px solid ${borderColor};border-radius:8px;min-width:96px;background:${background};">
      <div style="font-size:11px;color:var(--qpm-text-dim);text-transform:uppercase;letter-spacing:0.5px;">${label}</div>
      <div style="font-size:14px;font-weight:700;color:${valueColor};">${value}</div>
    </div>
  `;
}

function renderAbilityCard(ability: AbilityStats): string {
  const { valueText, procsText, probText } = formatAbilityValue(ability);
  return `
    <div style="border:1px solid var(--qpm-border);border-radius:8px;padding:8px;display:grid;gap:4px;background:rgba(255,255,255,0.02);">
      <div style="font-weight:700;color:var(--qpm-accent);">${ability.name}</div>
      <div style="font-size:11px;color:var(--qpm-text-dim);display:flex;justify-content:space-between;">
        <span>Proc %</span><span style="color:var(--qpm-text);font-weight:700;">${probText}</span>
      </div>
      <div style="font-size:11px;color:var(--qpm-text-dim);display:flex;justify-content:space-between;">
        <span>Procs/Hr</span><span style="color:var(--qpm-text);font-weight:700;">${procsText}</span>
      </div>
      <div style="font-size:11px;color:var(--qpm-text-dim);display:flex;justify-content:space-between;">
        <span>Impact</span><span style="color:var(--qpm-text);font-weight:700;">${valueText}</span>
      </div>
    </div>
  `;
}

function comparisonRow(label: string, valA: string | number, valB: string | number, higherIsBetter = true): string {
  const numA = typeof valA === 'number' ? valA : Number(valA);
  const numB = typeof valB === 'number' ? valB : Number(valB);
  let winner: 'A' | 'B' | null = null;
  if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
    if (numA !== numB) {
      winner = higherIsBetter ? (numA > numB ? 'A' : 'B') : (numA < numB ? 'A' : 'B');
    }
  }
  const colorA = winner === 'A' ? 'var(--qpm-success)' : winner === 'B' ? 'var(--qpm-error)' : 'var(--qpm-text)';
  const colorB = winner === 'B' ? 'var(--qpm-success)' : winner === 'A' ? 'var(--qpm-error)' : 'var(--qpm-text)';
  const weightA = winner === 'A' ? 700 : 500;
  const weightB = winner === 'B' ? 700 : 500;

  return `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;align-items:center;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
      <div style="color:var(--qpm-text-dim);font-size:12px;">${label}</div>
      <div style="text-align:center;color:${colorA};font-weight:${weightA};">${valA}</div>
      <div style="text-align:center;color:${colorB};font-weight:${weightB};">${valB}</div>
    </div>
  `;
}

// --- UI Tabs ---------------------------------------------------------------

export function renderPetHubWindow(root: HTMLElement): void {
  root.innerHTML = '';
  root.style.cssText = `
    padding: 0;
    min-height: 400px;
  `;

  root.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--qpm-text-dim);">Loading pets...</div>';

  getAllPets().then(allPets => {
    root.innerHTML = '';
    if (allPets.length === 0) {
      root.innerHTML = `
        <div style="padding: 60px; text-align: center; color: var(--qpm-text-dim);">
          <div style="font-size: 48px; margin-bottom: 12px;">🐾</div>
          <div style="font-size: 16px; font-weight: 600;">No Pets Found</div>
          <div style="font-size: 13px;">Hatch or place some pets to use the Pet Hub.</div>
        </div>
      `;
      return;
    }

    createPetHubContent(root, allPets);
  }).catch(error => {
    log('Failed to load pets:', error);
    root.innerHTML = `
      <div style="padding: 40px; text-align: center; color: var(--qpm-error);">
        <div style="font-size: 48px; margin-bottom: 15px;">⚠️</div>
        <div style="font-size: 16px; font-weight: 600; margin-bottom: 8px;">Failed to Load Pets</div>
        <div style="font-size: 13px; color: var(--qpm-text-dim);">${error}</div>
      </div>
    `;
  });
}

function createPetHubContent(root: HTMLElement, allPets: PetWithSource[]): void {
  const tabContainer = document.createElement('div');
  tabContainer.style.cssText = `
    display: flex;
    border-bottom: 1px solid var(--qpm-border);
    background: rgba(143, 130, 255, 0.05);
  `;

  const contentContainer = document.createElement('div');
  contentContainer.style.cssText = `
    padding: 20px;
    overflow-y: auto;
    max-height: 75vh;
    min-width: 1080px;
  `;

  let activeTab: 'compare' | 'team' = 'compare';

  const createTab = (id: typeof activeTab, label: string, icon: string) => {
    const btn = document.createElement('button');
    btn.textContent = `${icon} ${label}`;
    const setStyle = () => {
      const isActive = activeTab === id;
      btn.style.cssText = `
        flex: 1;
        padding: 14px 20px;
        background: ${isActive ? 'rgba(143, 130, 255, 0.15)' : 'transparent'};
        color: ${isActive ? 'var(--qpm-accent)' : 'var(--qpm-text-dim)'};
        border: none;
        border-bottom: 2px solid ${isActive ? 'var(--qpm-accent)' : 'transparent'};
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      `;
    };
    setStyle();
    btn.addEventListener('click', () => {
      activeTab = id;
      Array.from(tabContainer.children).forEach(child => {
        const el = child as HTMLButtonElement;
        el.style.background = el === btn ? 'rgba(143,130,255,0.15)' : 'transparent';
        el.style.color = el === btn ? 'var(--qpm-accent)' : 'var(--qpm-text-dim)';
        el.style.borderBottom = el === btn ? '2px solid var(--qpm-accent)' : '2px solid transparent';
      });
      renderContent();
    });
    return btn;
  };

  const renderContent = () => {
    contentContainer.innerHTML = '';
    if (activeTab === 'compare') {
      contentContainer.appendChild(createCompareTab(allPets));
    } else if (activeTab === 'team') {
      contentContainer.appendChild(createTeamCompareTab(allPets));
    }
  };

  tabContainer.appendChild(createTab('compare', '1v1 Compare', '⚖️'));
  tabContainer.appendChild(createTab('team', '3v3 Compare', '👥'));

  root.appendChild(tabContainer);
  root.appendChild(contentContainer);
  renderContent();

  // Clean up sprite dropdown listeners when Pet Hub window is destroyed
  cleanupOnDetach(root, () => {
    detachSpriteDropdownListeners(true); // Force cleanup
    if (ariesRetryTimer != null) {
      window.clearTimeout(ariesRetryTimer);
      ariesRetryTimer = null;
    }
  });
}

// --- Overview -------------------------------------------------------------

function createPetCard(pet: PetWithSource): HTMLElement {
  const card = document.createElement('div');
  card.style.cssText = `
    background: rgba(143, 130, 255, 0.05);
    border: 1px solid var(--qpm-border);
    border-radius: 8px;
    padding: 16px;
    transition: all 0.2s;
    cursor: pointer;
  `;

  card.addEventListener('mouseenter', () => {
    card.style.background = 'rgba(143, 130, 255, 0.12)';
    card.style.borderColor = 'var(--qpm-accent)';
    card.style.transform = 'translateY(-2px)';
    card.style.boxShadow = '0 4px 12px rgba(143, 130, 255, 0.2)';
  });
  card.addEventListener('mouseleave', () => {
    card.style.background = 'rgba(143, 130, 255, 0.05)';
    card.style.borderColor = 'var(--qpm-border)';
    card.style.transform = 'translateY(0)';
    card.style.boxShadow = 'none';
  });

  const stats = pet.stats;
  const header = document.createElement('div');
  header.style.cssText = `
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--qpm-border);
  `;

  const petImageHtml = renderPetImage(stats, 48, true);
  header.innerHTML = `
    ${petImageHtml}
    <div style="flex: 1;">
      <div style="font-size: 16px; font-weight: 700; color: var(--qpm-accent);">${stats.name || stats.species || 'Unknown'}</div>
      <div style="font-size: 12px; color: var(--qpm-text-dim);">${pet.source.toUpperCase()}</div>
    </div>
  `;

  const statsGrid = document.createElement('div');
  statsGrid.style.cssText = `
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-bottom: 10px;
  `;
  statsGrid.innerHTML = `
    ${statPill('STR', stats.currentStrength ?? 'N/A')}
    ${statPill('Max STR', stats.maxStrength ?? 'N/A')}
    ${statPill('Abilities', stats.abilityCount ?? 0)}
    ${statPill('XP', stats.xp != null ? formatNumber(stats.xp) : 'N/A')}
  `;

  const abilitySection = document.createElement('div');
  const topAbilities = [...stats.abilities].slice(0, 2);
  abilitySection.innerHTML = topAbilities.length
    ? topAbilities.map(renderAbilityCard).join('')
    : '<div style="color:var(--qpm-text-dim);font-size:12px;">No abilities listed</div>';
  abilitySection.style.display = 'grid';
  abilitySection.style.gap = '6px';

  card.appendChild(header);
  card.appendChild(statsGrid);
  card.appendChild(abilitySection);
  return card;
}

function createOverviewTab(allPets: PetWithSource[]): HTMLElement {
  const container = document.createElement('div');

  const createSection = (title: string, pets: PetWithSource[], icon: string) => {
    if (pets.length === 0) return null;
    const section = document.createElement('div');
    section.style.cssText = 'margin-bottom: 30px;';

    const header = document.createElement('div');
    header.textContent = `${icon} ${title} (${pets.length})`;
    header.style.cssText = `
      font-size: 16px;
      font-weight: 700;
      color: var(--qpm-accent);
      margin-bottom: 15px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--qpm-border);
    `;

    const grid = document.createElement('div');
    grid.style.cssText = `
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 15px;
    `;

    pets.forEach(p => grid.appendChild(createPetCard(p)));

    section.appendChild(header);
    section.appendChild(grid);
    return section;
  };

  const activeSection = createSection('Active Pets', allPets.filter(p => p.source === 'active'), '🎮');
  const inventorySection = createSection('Inventory', allPets.filter(p => p.source === 'inventory'), '🎒');
  const hutchSection = createSection('Pet Hutch', allPets.filter(p => p.source === 'hutch'), '🏠');

  if (activeSection) container.appendChild(activeSection);
  if (inventorySection) container.appendChild(inventorySection);
  if (hutchSection) container.appendChild(hutchSection);

  return container;
}

// --- 1v1 Compare ----------------------------------------------------------

function renderAbilityComparison(a: AbilityStats | null, b: AbilityStats | null): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:10px;';
  const cell = (ability: AbilityStats | null, label: string) => {
    if (!ability) return `<div style="color:var(--qpm-text-dim);font-size:12px;">No ${label}</div>`;
    const { valueText, procsText, probText } = formatAbilityValue(ability);
    return `
      <div style="border:1px solid var(--qpm-border);border-radius:8px;padding:10px;background:rgba(255,255,255,0.02);">
        <div style="font-weight:700;color:var(--qpm-accent);">${ability.name}</div>
        <div style="font-size:12px;color:var(--qpm-text-dim);">Proc: <span style="color:var(--qpm-text);font-weight:700;">${probText}</span></div>
        <div style="font-size:12px;color:var(--qpm-text-dim);">Procs/Hr: <span style="color:var(--qpm-text);font-weight:700;">${procsText}</span></div>
        <div style="font-size:12px;color:var(--qpm-text-dim);">Impact: <span style="color:var(--qpm-text);font-weight:700;">${valueText}</span></div>
      </div>
    `;
  };
  wrapper.innerHTML = `${cell(a, 'Pet A ability')}${cell(b, 'Pet B ability')}`;
  return wrapper;
}

function createCompareTab(allPets: PetWithSource[]): HTMLElement {
  const container = document.createElement('div');
  if (allPets.length < 2) {
    container.innerHTML = '<div style="padding:20px;color:var(--qpm-text-dim);">Need at least 2 pets to compare.</div>';
    return container;
  }

  let indexA = 0;
  let indexB = 1;
  let abilityFilter = '';
  const comparisonArea = document.createElement('div');

  const render = () => {
    closeActiveSpriteDropdown();
    // Rebuild selects to respect ability filter
    const allowed = (pet: PetWithSource) =>
      !abilityFilter.trim() || pet.stats.abilities.some(a => a.name.toLowerCase().includes(abilityFilter.trim().toLowerCase()) || (a.baseName || '').toLowerCase().includes(abilityFilter.trim().toLowerCase()));

    [selectA, selectB].forEach((select, idx) => {
      const valueBefore = select.value;
      select.innerHTML = '';
      allPets.forEach((pet, i) => {
        if (!allowed(pet)) return;
        const opt = document.createElement('option');
        opt.value = i.toString();
        opt.textContent = `${pet.stats.name || pet.stats.species || 'Pet'} [${pet.stats.currentStrength ?? '?'} STR]`;
        select.appendChild(opt);
      });
      applyOptionSprites(select, allPets);
      enableSpriteDropdown(select, () => allPets);
      const stillValid = Array.from(select.options).some(o => o.value === valueBefore);
      if (stillValid) {
        select.value = valueBefore;
      } else if (select.options.length) {
        select.selectedIndex = 0;
        const newIdx = Number(select.value);
        if (idx === 0) indexA = newIdx;
        else indexB = newIdx;
      }
    });

    const petA = allPets[indexA];
    const petB = allPets[indexB];
    applySelectPreview(selectA, petA);
    applySelectPreview(selectB, petB);
    if (!petA || !petB || !allowed(petA) || !allowed(petB)) {
      comparisonArea.innerHTML = '<div style="padding:12px;color:var(--qpm-text-dim);">Select two pets with the chosen ability.</div>';
      return;
    }

    comparisonArea.innerHTML = '';
    comparisonArea.appendChild(create3v3SlotRow(petA, petB, 0, abilityFilter));
  };

  const selectorArea = document.createElement('div');
  selectorArea.style.cssText = 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;margin-bottom:16px;padding:12px;border:1px solid var(--qpm-border);border-radius:8px;background:rgba(143,130,255,0.05);';

  const abilityFilterWrap = document.createElement('div');
  abilityFilterWrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;max-width:240px;text-align:left;';
  const abilitySelect = document.createElement('select');
  abilitySelect.style.cssText = 'padding:8px 10px;border:1px solid var(--qpm-border);border-radius:6px;background:rgba(18,20,26,0.6);color:var(--qpm-text);font-size:13px;';
  const abilityLabel = document.createElement('div');
  abilityLabel.style.cssText = 'font-size:12px;color:var(--qpm-text-dim);text-transform:uppercase;letter-spacing:0.5px;';
  abilityLabel.textContent = 'Ability filter';
  const abilityNames = Array.from(new Set(allPets.flatMap(p => p.stats.abilities.map(a => a.baseName || a.name.split(' ')[0])))).filter(Boolean).sort();
  abilitySelect.appendChild(new Option('All abilities', ''));
  abilityNames.forEach(name => abilitySelect.appendChild(new Option(name, name ? name.toLowerCase() : '')));
  abilitySelect.addEventListener('change', () => {
    abilityFilter = abilitySelect.value;
    render();
  });
  abilityFilterWrap.appendChild(abilityLabel);
  abilityFilterWrap.appendChild(abilitySelect);
  const abilityFilterBar = document.createElement('div');
  abilityFilterBar.style.cssText = 'display:flex;justify-content:center;margin:0 0 12px;';
  abilityFilterBar.appendChild(abilityFilterWrap);

  const createSelect = (label: string, initial: number, onChange: (idx: number) => void) => {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;flex:1;max-width:320px;';
    const lab = document.createElement('div');
    lab.textContent = label;
    lab.style.cssText = 'font-size:12px;color:var(--qpm-text-dim);text-transform:uppercase;letter-spacing:0.5px;';
    const select = document.createElement('select');
    select.style.cssText = `
      width: 100%;
      padding: 10px 12px;
      background: rgba(18, 20, 26, 0.6);
      color: var(--qpm-text);
      border: 1px solid var(--qpm-border);
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
    `;
    allPets.forEach((pet, i) => {
      const opt = document.createElement('option');
      opt.value = i.toString();
      opt.textContent = `${pet.stats.name || pet.stats.species || 'Pet'} [${pet.stats.currentStrength ?? '?'} STR]`;
      if (i === initial) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener('change', e => {
      const idx = Number((e.target as HTMLSelectElement).value);
      onChange(idx);
      applySelectPreview(select, allPets[idx]);
      render();
    });
    applyOptionSprites(select, allPets);
    applySelectPreview(select, allPets[initial]);
    enableSpriteDropdown(select, () => allPets);
    wrap.appendChild(lab);
    wrap.appendChild(select);
    return { wrap, select };
  };

  const { wrap: selectAWrap, select: selectA } = createSelect('Pet A', indexA, idx => { indexA = idx; if (indexA === indexB) indexB = (idx + 1) % allPets.length; });
  const { wrap: selectBWrap, select: selectB } = createSelect('Pet B', indexB, idx => { indexB = idx; if (indexB === indexA) indexA = (idx + 1) % allPets.length; });
  selectorArea.appendChild(selectAWrap);
  selectorArea.appendChild(selectBWrap);

  container.appendChild(abilityFilterBar);
  container.appendChild(selectorArea);
  container.appendChild(comparisonArea);
  render();
  return container;
}

// --- 3v3 Teams ------------------------------------------------------------

function create3v3SlotRow(petA: PetWithSource | null, petB: PetWithSource | null, slotIndex: number, abilityFilter: string): HTMLElement {
  const row = document.createElement('div');
  row.style.cssText = `
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    align-items: stretch;
  `;

  const statsA = petA?.stats ?? null;
  const statsB = petB?.stats ?? null;
  const winner = determineWinner(statsA, statsB);

  const winnerFor = (aVal: number | null | undefined, bVal: number | null | undefined): 'A' | 'B' | null => {
    const aNum = Number(aVal);
    const bNum = Number(bVal);
    if (!Number.isFinite(aNum) || !Number.isFinite(bNum) || aNum === bNum) return null;
    return aNum > bNum ? 'A' : 'B';
  };

  const statWinner = {
    str: winnerFor(statsA?.currentStrength, statsB?.currentStrength),
    maxStr: winnerFor(statsA?.maxStrength, statsB?.maxStrength),
    xp: winnerFor(statsA?.xp, statsB?.xp),
    abilities: winnerFor(statsA?.abilityCount ?? statsA?.abilities.length, statsB?.abilityCount ?? statsB?.abilities.length),
    mutations: winnerFor(statsA?.mutationCount ?? statsA?.mutations.length, statsB?.mutationCount ?? statsB?.mutations.length),
  } as const;

  const center = document.createElement('div');
  center.style.cssText = `
    background: rgba(255,255,255,0.03);
    border: 1px solid var(--qpm-border);
    border-radius: 10px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-content: center;
    text-align: center;
    font-size: 12px;
    color: var(--qpm-text);
  `;

  const compareBadge = (label: string, a: number | string | null | undefined, b: number | string | null | undefined) => {
    const valA = a ?? '—';
    const valB = b ?? '—';
    const numA = Number(a);
    const numB = Number(b);
    const valid = Number.isFinite(numA) && Number.isFinite(numB);
    const highlightA = valid && numA > numB;
    const highlightB = valid && numB > numA;
    const lowlightA = valid && numA < numB;
    const lowlightB = valid && numB < numA;
    const baseBg = 'rgba(143,130,255,0.08)';

    // Side color coding - left (light blue), right (light purple)
    const leftColor = '#C9F1FF';
    const rightColor = '#F7E5FF';

    return `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
        <div style="background:${baseBg};padding:6px;border-radius:6px;${highlightA ? `box-shadow:0 0 0 1px ${SUCCESS_HIGHLIGHT_BORDER};background:${SUCCESS_HIGHLIGHT_BG};` : lowlightA ? 'box-shadow:0 0 0 1px var(--qpm-error);background:rgba(244,67,54,0.08);' : ''}">
          <div style="font-size:10px;color:${leftColor};">${label}</div>
          <div style="font-weight:700;color:${highlightA ? 'rgb(64, 255, 194)' : lowlightA ? 'var(--qpm-error)' : leftColor};">${valA}</div>
        </div>
        <div style="background:${baseBg};padding:6px;border-radius:6px;${highlightB ? `box-shadow:0 0 0 1px ${SUCCESS_HIGHLIGHT_BORDER};background:${SUCCESS_HIGHLIGHT_BG};` : lowlightB ? 'box-shadow:0 0 0 1px var(--qpm-error);background:rgba(244,67,54,0.08);' : ''}">
          <div style="font-size:10px;color:${rightColor};">${label}</div>
          <div style="font-weight:700;color:${highlightB ? 'rgb(64, 255, 194)' : lowlightB ? 'var(--qpm-error)' : rightColor};">${valB}</div>
        </div>
      </div>
    `;
  };

  const abilityProb = (a: AbilityStats | null) =>
    a?.effectiveProbability ?? (a as any)?.probability ?? (a as any)?.procChance ?? null;
  const abilityProcs = (a: AbilityStats | null) => a?.procsPerHour ?? (a as any)?.procs ?? null;
  const abilityImpact = (a: AbilityStats | null) =>
    a?.valuePerHour ?? a?.effectiveValue ?? (a as any)?.gardenValuePerProc ?? (a as any)?.value ?? null;

  const abilityWinner = (a: AbilityStats | null, b: AbilityStats | null): 'A' | 'B' | null => {
    const impactWin = winnerFor(abilityImpact(a), abilityImpact(b));
    if (impactWin) return impactWin;
    const procsWin = winnerFor(abilityProcs(a), abilityProcs(b));
    if (procsWin) return procsWin;
    return winnerFor(abilityProb(a), abilityProb(b));
  };

  // Helper to extract base ability name without tier (removes I, II, III, IV, etc.)
  const getBaseAbilityName = (ability: AbilityStats | null): string | null => {
    if (!ability) return null;
    const name = ability.baseName || ability.name;
    // Remove Roman numerals at the end (I, II, III, IV, V)
    return name.replace(/\s+(I|II|III|IV|V)$/i, '').trim();
  };

  // Cross-species comparisons (for different species with same ability type, regardless of tier)
  const speciesA = statsA?.species ?? null;
  const speciesB = statsB?.species ?? null;
  const isDifferentSpecies = speciesA && speciesB && speciesA !== speciesB;

  const pickTopAbility = (pet: PetWithSource | null) => {
    if (!pet) return null;
    const filtered = abilityFilter.trim()
      ? pet.stats.abilities.filter(a => a.name.toLowerCase().includes(abilityFilter.trim().toLowerCase()) || (a.baseName || '').toLowerCase().includes(abilityFilter.trim().toLowerCase()))
      : pet.stats.abilities;
    return [...filtered].sort((a, b) => {
      const valueDiff = (b.valuePerHour || 0) - (a.valuePerHour || 0);
      if (Math.abs(valueDiff) > 1e-6) return valueDiff;
      return (b.procsPerHour || 0) - (a.procsPerHour || 0);
    })[0] ?? null;
  };

  // For different species, prioritize matching abilities (same base type, regardless of tier)
  let abilityA: AbilityStats | null = null;
  let abilityB: AbilityStats | null = null;
  let sharesSameAbilityType = false;

  if (isDifferentSpecies && petA && petB) {
    // Try to find matching abilities between the two pets
    const abilitiesA = abilityFilter.trim()
      ? petA.stats.abilities.filter(a => a.name.toLowerCase().includes(abilityFilter.trim().toLowerCase()) || (a.baseName || '').toLowerCase().includes(abilityFilter.trim().toLowerCase()))
      : petA.stats.abilities;
    const abilitiesB = abilityFilter.trim()
      ? petB.stats.abilities.filter(a => a.name.toLowerCase().includes(abilityFilter.trim().toLowerCase()) || (a.baseName || '').toLowerCase().includes(abilityFilter.trim().toLowerCase()))
      : petB.stats.abilities;

    // Find matching base ability types
    let matchFound = false;
    for (const abilA of abilitiesA) {
      const baseA = getBaseAbilityName(abilA);
      if (!baseA) continue;

      for (const abilB of abilitiesB) {
        const baseB = getBaseAbilityName(abilB);
        if (!baseB) continue;

        if (baseA === baseB) {
          // Found matching ability type! Prioritize these
          abilityA = abilA;
          abilityB = abilB;
          sharesSameAbilityType = true;
          matchFound = true;
          break;
        }
      }
      if (matchFound) break;
    }

    // If no match found, fall back to top abilities
    if (!matchFound) {
      abilityA = pickTopAbility(petA);
      abilityB = pickTopAbility(petB);
    }
  } else {
    // Same species or no cross-species comparison needed
    abilityA = pickTopAbility(petA);
    abilityB = pickTopAbility(petB);
  }

  let hungerDepletionA: number | null = null;
  let hungerDepletionB: number | null = null;
  let timePerLevelA: number | null = null;
  let timePerLevelB: number | null = null;

  if (isDifferentSpecies && sharesSameAbilityType) {
    // Calculate hunger lifespan (hours to fully deplete from 100% to 0%)
    // Using wiki data from petHungerDepletion.ts
    const depletionMinutesA = getHungerDepletionTime(speciesA);
    const depletionMinutesB = getHungerDepletionTime(speciesB);

    if (depletionMinutesA && depletionMinutesA > 0) {
      hungerDepletionA = depletionMinutesA / 60; // convert minutes to hours
    }
    if (depletionMinutesB && depletionMinutesB > 0) {
      hungerDepletionB = depletionMinutesB / 60; // convert minutes to hours
    }

    // Calculate time per STR/level (hours per level)
    const xpPerLevelA = speciesA ? getSpeciesXpPerLevel(speciesA) : null;
    const xpPerLevelB = speciesB ? getSpeciesXpPerLevel(speciesB) : null;

    // Assume XP boost ability for now (can be refined)
    const xpPerHourA = abilityA ? (abilityA.valuePerHour ?? null) : null;
    const xpPerHourB = abilityB ? (abilityB.valuePerHour ?? null) : null;

    if (xpPerLevelA && xpPerHourA && xpPerHourA > 0) {
      timePerLevelA = xpPerLevelA / xpPerHourA;
    }
    if (xpPerLevelB && xpPerHourB && xpPerHourB > 0) {
      timePerLevelB = xpPerLevelB / xpPerHourB;
    }
  }

  const renderAbilityRow = (
    ability: AbilityStats | null,
    label = '',
    winProb = false,
    winProcs = false,
    winImpact = false,
    side: 'left' | 'right' = 'left',
  ) => {
    if (!ability) return '<div style="color:var(--qpm-text-dim);font-size:11px;">No proc data</div>';
    const { valueText, procsText, probText } = formatAbilityValue(ability);
    const highlightColor = 'rgb(64, 255, 194)';

    // Side color coding - left (light blue), right (light purple)
    const sideColor = side === 'left' ? '#C9F1FF' : '#F7E5FF';

    const probColor = winProb ? highlightColor : sideColor;
    const procsColor = winProcs ? highlightColor : sideColor;
    const impactColor = winImpact ? highlightColor : sideColor;
    const isWinner = winProb || winProcs || winImpact;
    const borderColor = isWinner ? SUCCESS_HIGHLIGHT_BORDER : 'var(--qpm-border)';
    const backgroundColor = isWinner ? SUCCESS_HIGHLIGHT_BG : 'rgba(255,255,255,0.02)';
    return `
      <div style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:${sideColor};padding:8px;border:1px solid ${borderColor};border-radius:8px;background:${backgroundColor};text-align:left;">
        <div style="font-weight:700;">${label || ability.name}</div>
        <div style="display:flex;justify-content:space-between;"><span style="color:var(--qpm-text-dim);">Proc %</span><span style="font-weight:700;color:${probColor};">${probText}</span></div>
        <div style="display:flex;justify-content:space-between;"><span style="color:var(--qpm-text-dim);">Procs/Hr</span><span style="font-weight:700;color:${procsColor};">${procsText}</span></div>
        <div style="display:flex;justify-content:space-between;"><span style="color:var(--qpm-text-dim);">Impact</span><span style="font-weight:700;color:${impactColor};">${valueText}</span></div>
      </div>
    `;
  };

  const needsProjection = (statsA && (statsA.currentStrength ?? 0) < (statsA.maxStrength ?? 0)) ||
    (statsB && (statsB.currentStrength ?? 0) < (statsB.maxStrength ?? 0));
  const projA = abilityA && statsA ? scaleAbilityToMax(abilityA, statsA.currentStrength, statsA.maxStrength) : null;
  const projB = abilityB && statsB ? scaleAbilityToMax(abilityB, statsB.currentStrength, statsB.maxStrength) : null;

  const probWinner = winnerFor(abilityProb(abilityA), abilityProb(abilityB));
  const procsWinner = winnerFor(abilityProcs(abilityA), abilityProcs(abilityB));
  const impactWinner = winnerFor(abilityImpact(abilityA), abilityImpact(abilityB));
  const abilityOverallWinner = abilityWinner(abilityA, abilityB);

  const projProbWinner = winnerFor(abilityProb(projA), abilityProb(projB));
  const projProcsWinner = winnerFor(abilityProcs(projA), abilityProcs(projB));
  const projImpactWinner = winnerFor(abilityImpact(projA), abilityImpact(projB));
  const projOverallWinner = abilityWinner(projA, projB);

  const leftCard = create3v3PetCard(petA, slotIndex, winner === 'A', abilityFilter, 'left', {
    str: statWinner.str === 'A',
    maxStr: statWinner.maxStr === 'A',
    xp: statWinner.xp === 'A',
    abilities: statWinner.abilities === 'A',
    mutations: statWinner.mutations === 'A',
    abilityFocus: abilityOverallWinner === 'A',
  });
  const rightCard = create3v3PetCard(petB, slotIndex, winner === 'B', abilityFilter, 'right', {
    str: statWinner.str === 'B',
    maxStr: statWinner.maxStr === 'B',
    xp: statWinner.xp === 'B',
    abilities: statWinner.abilities === 'B',
    mutations: statWinner.mutations === 'B',
    abilityFocus: abilityOverallWinner === 'B',
  });

  const projectionBlock = needsProjection
    ? `
      <div style="margin-top:4px;padding:8px;border:1px dashed var(--qpm-border);border-radius:8px;background:rgba(143,130,255,0.05);">
        <div style="font-size:11px;color:var(--qpm-text-dim);margin-bottom:6px;">Potential ability output at max STR</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <div>${renderAbilityRow(projA, projA ? `${projA.name} (max)` : '', projProbWinner === 'A' || projOverallWinner === 'A', projProcsWinner === 'A' || projOverallWinner === 'A', projImpactWinner === 'A' || projOverallWinner === 'A', 'left')}</div>
          <div>${renderAbilityRow(projB, projB ? `${projB.name} (max)` : '', projProbWinner === 'B' || projOverallWinner === 'B', projProcsWinner === 'B' || projOverallWinner === 'B', projImpactWinner === 'B' || projOverallWinner === 'B', 'right')}</div>
        </div>
      </div>
    `
    : '';

  // Cross-species comparison badges
  const crossSpeciesComparisons = isDifferentSpecies && sharesSameAbilityType ? `
    <div style="margin-top:8px;padding:8px;border:1px dashed rgba(255,193,7,0.5);border-radius:8px;background:rgba(255,193,7,0.05);">
      <div style="font-size:11px;color:rgba(255,193,7,0.9);margin-bottom:6px;font-weight:600;">📊 Cross-Species Comparison</div>
      ${hungerDepletionA != null && hungerDepletionB != null ? compareBadge('Hunger Lifespan (h)', hungerDepletionA.toFixed(1), hungerDepletionB.toFixed(1)) : ''}
      ${timePerLevelA != null && timePerLevelB != null ? compareBadge('Time/Level (h)', timePerLevelA.toFixed(2), timePerLevelB.toFixed(2)) : ''}
    </div>
  ` : '';

  center.innerHTML = `
    <div style="font-size: 13px; font-weight: 700; color: var(--qpm-accent);">Duel Metrics</div>
    ${compareBadge('Strength', statsA?.currentStrength, statsB?.currentStrength)}
    ${compareBadge('Max STR', statsA?.maxStrength, statsB?.maxStrength)}
    <div style="background:rgba(255,255,255,0.02);border:1px solid var(--qpm-border);padding:8px;border-radius:8px;display:grid;grid-template-columns:1fr 1fr;gap:8px;text-align:left;">
      <div>${renderAbilityRow(abilityA, '', probWinner === 'A' || abilityOverallWinner === 'A', procsWinner === 'A' || abilityOverallWinner === 'A', impactWinner === 'A' || abilityOverallWinner === 'A', 'left')}</div>
      <div>${renderAbilityRow(abilityB, '', probWinner === 'B' || abilityOverallWinner === 'B', procsWinner === 'B' || abilityOverallWinner === 'B', impactWinner === 'B' || abilityOverallWinner === 'B', 'right')}</div>
    </div>
    ${crossSpeciesComparisons}
    ${projectionBlock}
  `;

  row.appendChild(leftCard);
  row.appendChild(center);
  row.appendChild(rightCard);
  return row;
}

function create3v3PetCard(
  pet: PetWithSource | null,
  slotNum: number,
  isWinner: boolean,
  abilityFilter: string,
  side: DuelSide,
  highlights: SlotHighlightMap = {},
): HTMLElement {
  const card = document.createElement('div');
  const sideStyle = DUEL_SIDE_STYLES[side];
  const borderColor = isWinner ? 'rgba(64,255,194,0.9)' : sideStyle.border;
  const boxShadow = isWinner ? '0 0 22px rgba(64,255,194,0.45)' : sideStyle.glow;
  card.dataset.slot = String(slotNum + 1);
  card.style.cssText = `
    background: ${sideStyle.gradient};
    border: 1px solid ${borderColor};
    border-radius: 16px;
    padding: 16px;
    min-height: 220px;
    box-shadow: ${boxShadow};
    position: relative;
    overflow: hidden;
  `;

  if (!pet) {
    card.innerHTML = `
      <div style="font-size: 13px; font-weight: 600; color: var(--qpm-text-dim); text-align: center;">
        Empty Slot
      </div>
    `;
    return card;
  }
  const stats = pet.stats;
  const metadata = getPetMetadata(stats.species ?? null);
  const hungerPct = stats.hungerPct ?? null;

  // Calculate XP per level progress
  const xpPerLevel = stats.species ? getSpeciesXpPerLevel(stats.species) : null;
  const currentXp = stats.xp ?? 0;
  const xpTowardsNextLevel = xpPerLevel ? (currentXp % xpPerLevel) : 0;
  const xpLevelProgress = xpPerLevel && xpPerLevel > 0 ? (xpTowardsNextLevel / xpPerLevel) * 100 : 0;
  const xpLevelLabel = xpPerLevel ? `${xpTowardsNextLevel.toFixed(0)} / ${xpPerLevel} XP` : '—';

  // Use metadata hungerCost for accurate depletion time calculation
  const hungerCost = metadata?.hungerCost ?? null;
  const hungerDepletionHours = hungerPct != null && hungerCost != null && hungerCost > 0
    ? (hungerPct / 100) * 100000 / hungerCost // 100000 is max hunger
    : stats.timeUntilStarving ?? null;

  const hungerLabelParts: string[] = [];
  if (stats.hungerPct != null) hungerLabelParts.push(`${stats.hungerPct.toFixed(0)}%`);
  if (hungerDepletionHours != null) hungerLabelParts.push(`${hungerDepletionHours.toFixed(1)}h left`);
  const hungerLabel = hungerLabelParts.join(' • ') || '—';

  const strDelta = stats.maxStrength != null && stats.currentStrength != null ? Math.max(0, stats.maxStrength - stats.currentStrength) : null;
  const estLevels = (stats.maxStrength && stats.currentStrength)
    ? Math.max(0, stats.maxStrength - stats.currentStrength) / Math.max(1, stats.maxStrength / 30)
    : null;
  const xpToMax = xpPerLevel && estLevels ? Math.round(estLevels * xpPerLevel) : null;
  const progressDetails = strDelta && strDelta > 0
    ? `+${strDelta} STR to cap${xpToMax ? ` • ~${formatNumber(xpToMax)} XP` : ''}`
    : stats.xp != null ? `${formatNumber(stats.xp)} XP` : '';

  const filterTerm = abilityFilter.trim().toLowerCase();
  const filteredAbilities = filterTerm
    ? stats.abilities.filter(a => a.name.toLowerCase().includes(filterTerm) || (a.baseName || '').toLowerCase().includes(filterTerm))
    : stats.abilities;

  const topAbilities = [...filteredAbilities].sort((a, b) => {
    const valueDiff = (b.valuePerHour || 0) - (a.valuePerHour || 0);
    if (Math.abs(valueDiff) > 0.01) return valueDiff;
    return (b.procsPerHour || 0) - (a.procsPerHour || 0);
  }).slice(0, 3);

  const abilityRows = topAbilities.map((ability) => {
    const { valueText, procsText, probText } = formatAbilityValue(ability);
    const colors = getAbilityColorInfo(ability);
    return `
      <div style="display:flex;align-items:center;gap:10px;padding:10px;border-radius:12px;background:rgba(8,5,16,0.45);border:1px solid ${colors.border};box-shadow:0 0 14px ${colors.glow};">
        <span style="width:18px;height:18px;border-radius:6px;background:${colors.base};border:1px solid rgba(255,255,255,0.15);"></span>
        <div style="flex:1;">
          <div style="font-size:12px;font-weight:600;color:${colors.text};">${ability.name}</div>
          <div style="font-size:10px;color:var(--qpm-text-dim);">${valueText}</div>
        </div>
        <div style="text-align:right;font-size:10px;color:var(--qpm-text-dim);">
          <div style="font-weight:600;color:${colors.text};">${procsText}</div>
          <div>${probText} proc</div>
        </div>
      </div>
    `;
  }).join('');

  // Create ability squares (up to 4) with hover tooltips
  // These will be dynamically added after card creation for proper tooltip handling
  const abilitySquaresData = stats.abilities.slice(0, 4).map((ability) => ({
    color: getAbilityColorByName(ability.baseName || ability.name),
    name: ability.name || 'Unknown Ability',
  }));

  // Define stat indicators first
  const statIndicators = `
    <div style="display:flex;flex-direction:column;gap:10px;width:100%;">
      ${renderStatIndicator('XP/Level', xpLevelLabel, xpLevelProgress, '#7C4DFF')}
      ${renderStatIndicator('Hunger', hungerLabel, hungerPct, '#9BF5C3')}
    </div>
  `;

  // Pet sprite block - centered on pet image
  const spriteBlock = `
    <div style="position:relative;display:flex;flex-direction:column;align-items:center;gap:8px;width:100%;padding:8px 0;">
      <!-- STR text above image -->
      <div style="font-size:13px;font-weight:600;color:${sideStyle.text};">
        STR: ${stats.currentStrength != null ? stats.currentStrength.toFixed(0) : '?'}
      </div>

      <!-- Pet image centered -->
      <div style="position:relative;display:flex;justify-content:center;">
        ${renderPetImage(stats, 128, true)}

        <!-- Ability squares positioned to the left of pet image -->
        <div class="qpm-ability-squares" style="position:absolute;left:-30px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:6px;"></div>
      </div>

      <!-- MAX STR text below image -->
      <div style="font-size:13px;font-weight:600;color:${sideStyle.text};">
        MAX STR: ${stats.maxStrength != null ? stats.maxStrength.toFixed(0) : '?'}
      </div>
    </div>
  `;

  card.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center;">
      <div>
        <div style="font-size:16px;font-weight:700;color:${sideStyle.text};">${stats.name || stats.species || 'Pet'}</div>
        <div style="font-size:12px;color:rgba(255,255,255,0.7);">${stats.species || 'Unknown Species'}</div>
      </div>
      ${spriteBlock}
      ${statIndicators}
    </div>
  `;

  // Dynamically add ability squares with proper tooltips
  const squaresContainer = card.querySelector('.qpm-ability-squares');
  if (squaresContainer) {
    abilitySquaresData.forEach(({ color, name }) => {
      const square = document.createElement('div');
      square.style.cssText = `
        width: 20px;
        height: 20px;
        background: ${color};
        border-radius: 4px;
        border: 1px solid rgba(255, 255, 255, 0.4);
        cursor: help;
        transition: all 0.2s;
      `;
      square.title = name; // Set title directly as property
      square.addEventListener('mouseenter', () => {
        square.style.transform = 'scale(1.15)';
        square.style.borderColor = 'rgba(255,255,255,0.8)';
      });
      square.addEventListener('mouseleave', () => {
        square.style.transform = 'scale(1)';
        square.style.borderColor = 'rgba(255,255,255,0.4)';
      });
      squaresContainer.appendChild(square);
    });
  }

  return card;
}

function createTeamCompareTab(allPets: PetWithSource[]): HTMLElement {
  const container = document.createElement('div');
  if (allPets.length < 2) {
    container.innerHTML = '<div style="padding:20px;color:var(--qpm-text-dim);">Need more pets for 3v3 teams.</div>';
    return container;
  }

  const petIdLookup = buildPetIdLookup(allPets);
  const teamA: (PetWithSource | null)[] = [allPets[0] ?? null, allPets[1] ?? null, allPets[2] ?? null];
  const teamB: (PetWithSource | null)[] = [allPets[3] ?? null, allPets[4] ?? null, allPets[5] ?? null];
  let abilityFilter = '';

  const selectorDiv = document.createElement('div');
  selectorDiv.style.cssText = `
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin-bottom: 14px;
  `;

  const rebuildManualSelectors = () => {
    selectorDiv.querySelectorAll('select[data-rebuild="1"]').forEach(sel => {
      const rebuild = (sel as HTMLSelectElement & { _rebuild?: () => void })._rebuild;
      if (typeof rebuild === 'function') {
        rebuild();
      }
    });
  };

  const createTeamSelector = (label: string, team: (PetWithSource | null)[], onChange: (team: (PetWithSource | null)[]) => void) => {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
      border: 1px solid var(--qpm-border);
      border-radius: 8px;
      padding: 10px;
      background: rgba(143, 130, 255, 0.05);
    `;
    const title = document.createElement('div');
    title.textContent = label;
    title.style.cssText = 'font-weight:700;color:var(--qpm-accent);margin-bottom:6px;';

    const slotGrid = document.createElement('div');
    slotGrid.style.cssText = 'display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;';

    team.forEach((pet, idx) => {
      const select = document.createElement('select');
      select.style.cssText = `
        width: 100%;
        padding: 8px;
        background: rgba(18, 20, 26, 0.6);
        color: var(--qpm-text);
        border: 1px solid var(--qpm-border);
        border-radius: 6px;
        font-size: 12px;
      `;
      select.dataset.slot = String(idx);
      const rebuildOptions = () => {
        const prev = select.value;
        select.innerHTML = '';
        allPets.forEach((p, i) => {
          if (abilityFilter && !p.stats.abilities.some(a => (a.baseName || '').toLowerCase().includes(abilityFilter.toLowerCase()) || a.name.toLowerCase().includes(abilityFilter.toLowerCase()))) return;
          const opt = document.createElement('option');
          opt.value = i.toString();
          opt.textContent = `${p.stats.name || p.stats.species || 'Pet'} [${p.stats.currentStrength ?? '?'} STR]`;
          if (p === pet && !select.value) opt.selected = true;
          select.appendChild(opt);
        });
        applyOptionSprites(select, allPets);
        if (Array.from(select.options).some(o => o.value === prev)) {
          select.value = prev;
        } else if (select.options.length) {
          select.selectedIndex = 0;
          const i = Number(select.value);
          team[idx] = allPets[i] ?? null;
        }
        applySelectPreview(select, team[idx]);
      };
      rebuildOptions();
      select.addEventListener('change', e => {
        const newTeam = [...team];
        const i = Number((e.target as HTMLSelectElement).value);
        newTeam[idx] = allPets[i] ?? null;
        onChange(newTeam);
        applySelectPreview(select, newTeam[idx]);
        debouncedRender();
      });
      select.dataset.rebuild = '1';
      (select as HTMLSelectElement & { _rebuild?: () => void })._rebuild = rebuildOptions;
      enableSpriteDropdown(select, () => allPets);
      slotGrid.appendChild(select);
    });

    wrapper.appendChild(title);
    wrapper.appendChild(slotGrid);
    return wrapper;
  };

  selectorDiv.appendChild(createTeamSelector('🔵 Team A', teamA, t => { teamA.splice(0, teamA.length, ...t); }));
  selectorDiv.appendChild(createTeamSelector('🔴 Team B', teamB, t => { teamB.splice(0, teamB.length, ...t); }));

  let ariesStatusMsg: HTMLDivElement;

  const applyAriesPreset = (team: AriesTeamSummary, target: (PetWithSource | null)[]) => {
    const resolved: (PetWithSource | null)[] = [];
    const missingSlots: number[] = [];
    team.slotIds.forEach((slotId, idx) => {
      if (!slotId) {
        resolved[idx] = null;
        return;
      }
      const match = petIdLookup.get(slotId) ?? null;
      if (!match) {
        missingSlots.push(idx + 1);
      }
      resolved[idx] = match;
    });

    // Batch updates to avoid multiple re-renders
    target.splice(0, target.length, ...resolved);

    // Update status immediately
    if (missingSlots.length) {
      ariesStatusMsg.textContent = `Applied "${team.name}" but slots ${missingSlots.join(', ')} are missing in Pet Hub data.`;
      ariesStatusMsg.style.color = 'var(--qpm-error)';
    } else {
      ariesStatusMsg.textContent = `✅ Applied "${team.name}" preset.`;
      ariesStatusMsg.style.color = 'var(--qpm-success)';
    }

    // Batch selector rebuild and render into one operation
    rebuildManualSelectors();
    debouncedRender();
  };

  const createPresetControl = (label: string, apply: (team: AriesTeamSummary) => void) => {
    let options: AriesTeamSummary[] = [];
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
    const title = document.createElement('div');
    title.textContent = label;
    title.style.cssText = 'font-size:12px;font-weight:600;color:var(--qpm-accent);';
    const select = document.createElement('select');
    select.style.cssText = 'padding:6px 10px;border:1px solid var(--qpm-border);border-radius:6px;background:rgba(18,20,26,0.6);color:var(--qpm-text);font-size:13px;';
    select.disabled = true;
    select.appendChild(new Option('No presets detected', ''));
    select.addEventListener('change', () => {
      const team = options.find(entry => entry.id === select.value);
      if (team) {
        apply(team);
        select.value = '';
      }
    });
    const updateOptions = (teams: AriesTeamSummary[]) => {
      options = teams;
      select.innerHTML = '';
      select.appendChild(new Option('Select preset', ''));
      if (!teams.length) {
        select.disabled = true;
        return;
      }
      teams.forEach(team => {
        select.appendChild(new Option(team.name, team.id));
      });
      select.disabled = false;
    };
    wrapper.append(title, select);
    return { wrapper, updateOptions };
  };

  const ariesSection = document.createElement('div');
  ariesSection.style.cssText = 'display:none;flex-direction:column;gap:10px;margin-bottom:12px;padding:10px;border:1px solid var(--qpm-border);border-radius:10px;background:rgba(143,130,255,0.08);';

  const ariesHeaderRow = document.createElement('div');
  ariesHeaderRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;';
  const ariesHeader = document.createElement('div');
  ariesHeader.textContent = '🔗 Aries Mod Presets';
  ariesHeader.style.cssText = 'font-size:13px;font-weight:700;color:var(--qpm-accent);';

  const refreshButton = document.createElement('button');
  refreshButton.textContent = '🔄 Refresh';
  refreshButton.style.cssText = 'padding:4px 8px;font-size:11px;background:rgba(143,130,255,0.2);color:var(--qpm-accent);border:1px solid var(--qpm-border);border-radius:4px;cursor:pointer;';
  refreshButton.title = 'Manually retry detection of Aries Mod';
  refreshButton.addEventListener('click', () => {
    log('[Aries] Manual refresh triggered');
    ariesWatcherAttached = false;
    ariesWatcherPromise = null;
    if (ariesRetryTimer != null) {
      window.clearTimeout(ariesRetryTimer);
      ariesRetryTimer = null;
    }
    ensureAriesTeamsWatcher();
  });

  ariesHeaderRow.append(ariesHeader, refreshButton);

  ariesStatusMsg = document.createElement('div');
  ariesStatusMsg.style.cssText = 'font-size:11px;color:var(--qpm-text-dim);';
  ariesStatusMsg.textContent = 'Detecting Aries Mod teams...';
  const presetControls = document.createElement('div');
  presetControls.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit, minmax(220px,1fr));gap:10px;';
  const presetA = createPresetControl('Apply to Team A', team => applyAriesPreset(team, teamA));
  const presetB = createPresetControl('Apply to Team B', team => applyAriesPreset(team, teamB));
  presetControls.append(presetA.wrapper, presetB.wrapper);
  ariesSection.append(ariesHeaderRow, ariesStatusMsg, presetControls);

  const unsubscribeAries = subscribeToAriesTeams(({ status, teams }) => {
    // Only show the section when Aries is successfully detected
    if (status === 'ready' && teams.length > 0) {
      ariesSection.style.display = 'flex';
      ariesStatusMsg.textContent = `✅ Found ${teams.length} preset(s). Select one to populate team slots automatically.`;
      ariesStatusMsg.style.color = 'var(--qpm-success)';
      presetA.updateOptions(teams);
      presetB.updateOptions(teams);
      presetControls.style.display = 'grid';
    } else if (status === 'ready' && teams.length === 0) {
      // Aries detected but no teams - show section with helpful message
      ariesSection.style.display = 'flex';
      ariesStatusMsg.textContent = '⚠️ No pet teams found in Aries Mod. Create teams first.';
      ariesStatusMsg.style.color = 'var(--qpm-warning)';
      presetControls.style.display = 'none';
    } else {
      // Not detected or still detecting - hide completely
      ariesSection.style.display = 'none';
    }
  });
  cleanupOnDetach(container, unsubscribeAries);

  const slotsWrapper = document.createElement('div');
  slotsWrapper.style.cssText = 'display:grid;grid-template-columns:1fr;gap:12px;';

  // Cache row elements to avoid full DOM regeneration on every render
  const cachedRows: HTMLElement[] = [];

  const render = () => {
    // Use DocumentFragment for batch DOM operations
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < 3; i++) {
      const newRow = create3v3SlotRow(teamA[i] ?? null, teamB[i] ?? null, i, abilityFilter);
      fragment.appendChild(newRow);
    }

    // Replace all rows at once instead of clearing innerHTML
    while (slotsWrapper.firstChild) {
      slotsWrapper.removeChild(slotsWrapper.firstChild);
    }
    slotsWrapper.appendChild(fragment);
  };

  // Debounce render to prevent multiple rapid calls (e.g., during Aries team application)
  let renderTimeout: number | null = null;
  const debouncedRender = () => {
    if (renderTimeout != null) {
      window.clearTimeout(renderTimeout);
    }
    renderTimeout = window.setTimeout(() => {
      renderTimeout = null;
      render();
    }, 50); // 50ms debounce - fast enough to feel instant, slow enough to batch updates
  };

  const filterWrap = document.createElement('div');
  filterWrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;align-items:center;text-align:center;';
  const filterLabel = document.createElement('div');
  filterLabel.textContent = 'Ability filter';
  filterLabel.style.cssText = 'font-size:12px;color:var(--qpm-text-dim);text-transform:uppercase;letter-spacing:0.5px;';
  const filterSelect = document.createElement('select');
  filterSelect.style.cssText = 'padding:6px 10px;border:1px solid var(--qpm-border);border-radius:6px;background:rgba(18,20,26,0.6);color:var(--qpm-text);font-size:13px;width:220px;';
  filterSelect.appendChild(new Option('All abilities', ''));

  // Cache ability names to avoid recomputing on every render - compute once at tab creation
  const abilityNames = Array.from(new Set(allPets.flatMap(p => p.stats.abilities.map(a => a.baseName || a.name.split(' ')[0]))))
    .filter((name): name is string => Boolean(name))
    .sort();
  abilityNames.forEach(name => filterSelect.appendChild(new Option(name, name.toLowerCase())));
  filterSelect.addEventListener('change', () => {
    abilityFilter = filterSelect.value.trim();
    rebuildManualSelectors();
    debouncedRender();
  });
  filterWrap.appendChild(filterLabel);
  filterWrap.appendChild(filterSelect);
  const filterBar = document.createElement('div');
  filterBar.style.cssText = 'display:flex;justify-content:center;margin-bottom:12px;';
  filterBar.appendChild(filterWrap);

  container.appendChild(filterBar);
  container.appendChild(ariesSection);
  container.appendChild(selectorDiv);
  container.appendChild(slotsWrapper);
  render();
  return container;
}
