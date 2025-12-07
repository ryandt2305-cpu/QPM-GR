// src/store/achievements.ts
// Achievements state, definitions, and evaluation scaffold (phase 1)

import { storage } from '../utils/storage';
import { log } from '../utils/logger';
import { getStatsSnapshot, subscribeToStats, type StatsSnapshot } from './stats';
import { notify } from '../core/notifications';
import { getInventoryItems, readInventoryDirect } from './inventory';
import { startAbilityTriggerStore, getAbilityHistorySnapshot } from './abilityLogs';
import { startPetInfoStore, getActivePetInfos } from './pets';
import { getJournal, getJournalStats, getJournalSummary } from '../features/journalChecker';
import { pageWindow } from '../core/pageContext';
import { getAtomByLabel, readAtomValue, subscribeAtom, findAtomsByLabel } from '../core/jotaiBridge';
import { getMutationSummary } from './mutationSummary';
import { getSaleWindowCounts, startSellWindowTracking } from './saleWindow';

export type AchievementRarity = 'common' | 'uncommon' | 'rare' | 'legendary' | 'mythical' | 'divine' | 'celestial';

export interface AchievementDefinition {
  id: string;
  title: string;
  description: string;
  category: 'garden' | 'pets' | 'abilities' | 'shop' | 'weather' | 'wealth' | 'collection' | 'streaks' | 'obscure';
  rarity: AchievementRarity;
  visibility: 'public' | 'hidden' | 'secret';
  target: number | Record<string, number>;
  tags?: string[];
  icon?: string;
  hiddenTargetUntil?: string;
  oneTime?: boolean;
}

export interface AchievementProgress {
  id: string;
  current: number;
  target: number;
  completedAt: number | null;
  lastUpdated: number;
  ineligible?: boolean;
}

export interface AchievementSnapshot {
  stats: StatsSnapshot | null;
  inventoryCount: number;
  inventoryValue: number | null;
  journalProduceCompletion: number | null;
  journalPetCompletion: number | null;
  journalProduceCompleted: number | null;
  journalProduceTotal: number | null;
  journalPetCompleted: number | null;
  journalPetTotal: number | null;
  journalProduceSpeciesCompleted: number | null;
  journalPetSpeciesCompleted: number | null;
  journalProduceMaxWeightCompleted: number | null;
  coinBalance: number | null;
  lastCurrencyTransaction: unknown;
  cropEarnings: number | null;
  petEarnings: number | null;
  weatherTriggers: Record<string, number>;
  maxSeedsOfSingleType: number | null;
  rainbowHatches: number | null;
  abilityCounts: Record<string, number>;
  abilityLastProc: Record<string, number | null>;
  boostPetsActive: number | null;
  abilityUnique5m: number | null;
  abilityUnique30s: number | null;
  mutationEvents30m: number | null;
  mutatedHarvests: number | null;
  weatherSeenKinds: Set<string> | null;
  activePetsWithFourAbilities: number | null;
  saleUnique60s: number | null;
  saleUnique10m: number | null;
  roomJoinCount: number | null;
  roomMinutes: number | null;
  lastRoomPlayers: number | null;
  sellBurstCoins: number | null;
  sellBurstAlone: boolean | null;
  instantFeedsUsed: number | null;
  weatherEventsLastHour: number | null;
  // Future: activity log/events + coin balance + per-species counters + rolling windows
}

interface AchievementsState {
  initialized: boolean;
  progress: Map<string, AchievementProgress>;
  definitions: AchievementDefinition[];
  lastSnapshot: AchievementSnapshot | null;
}

const STORAGE_KEY = 'qpm:achievements:v1';
const listeners = new Set<(progress: Map<string, AchievementProgress>) => void>();

const ACHIEVEMENT_DEBUG_LOGS = false;
const dbgAch = (...args: unknown[]): void => {
  if (!ACHIEVEMENT_DEBUG_LOGS) return;
  log(...(args as [any, ...any[]]));
};

let state: AchievementsState = {
  initialized: false,
  progress: new Map(),
  definitions: [],
  lastSnapshot: null,
};

let statsUnsubscribe: (() => void) | null = null;
let activityLogUnsubscribe: (() => void) | null = null;
let cropLogUnsubscribe: (() => void) | null = null;
let liveStatsUnsubscribe: (() => void) | null = null;
let ariesStatsUnsubscribe: (() => void) | null = null;
let sellWindowStarted = false;

let roomJoinCount = 0;
let roomMinutes = 0;
let lastRoomId: string | null = null;
let lastRoomSeenAt: number | null = null;
let lastRoomPlayers = 0;
let lastRoomIsPrivate = false;
let lastCoinBalanceFromLogs: number | null = null;
let sellBurstCoins = 0;
let sellBurstAlone = false;
let instantFeedsUsed = 0;
let lastWeatherKind: string | null = null;
const weatherEvents: Array<{ kind: string; timestamp: number }> = [];

let loggedLiveShape = false;
let loggedAriesShape = false;
let loggedAriesSamples = false;
let loggedAriesShops = false;
let loggedLivePlayer = false;

function pickNumber(root: any, paths: Array<string | string[]>): number | null {
  for (const path of paths) {
    const segments = Array.isArray(path) ? path : [path];
    let cursor: any = root;
    let found = true;
    for (const seg of segments) {
      if (cursor && typeof cursor === 'object' && seg in cursor) {
        cursor = (cursor as any)[seg];
      } else {
        found = false;
        break;
      }
    }
    if (found) {
      const n = Number(cursor);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

async function fetchAriesStats(): Promise<any | null> {
  try {
    const svc = (pageWindow as any)?.AriesMod?.services?.StatsService;
    if (!svc) return null;
    if (typeof svc.getStats === 'function') return await svc.getStats();
    if (typeof svc.getSnapshot === 'function') return await svc.getSnapshot();
    if (typeof svc.getState === 'function') return await svc.getState();
    if (typeof svc.stats === 'object') return svc.stats;
    return null;
  } catch (error) {
    log('⚠️ Achievements: Aries StatsService fetch failed', error);
    return null;
  }
}

function subscribeAriesStats(): void {
  try {
    const svc = (pageWindow as any)?.AriesMod?.services?.StatsService;
    if (svc && typeof svc.subscribe === 'function') {
      const unsub = svc.subscribe((value: any) => {
        try {
          handleRoomSnapshot(value);
        } catch (error) {
          log('⚠️ Achievements: Aries room snapshot handler failed', error);
        }
        scheduleEvaluate();
      });
      if (typeof unsub === 'function') {
        ariesStatsUnsubscribe = unsub;
      }
    }
  } catch (error) {
    log('⚠️ Achievements: failed to subscribe to Aries StatsService', error);
  }
}

async function trySubscribeAtom(
  label: string,
  setter: (fn: () => void) => void,
  handler?: (value: unknown) => void,
): Promise<void> {
  const atom = getAtomByLabel(label);
  if (!atom) return;
  try {
    const unsub = await subscribeAtom(atom, (value: unknown) => {
      if (handler) {
        try {
          handler(value);
        } catch (error) {
          log(`⚠️ Achievements: handler for ${label} failed`, error);
        }
      }
      scheduleEvaluate();
    });
    setter(unsub);
  } catch (error) {
    log(`⚠️ Achievements: failed to subscribe to ${label}`, error);
  }
}

function loadPersisted(): void {
  try {
    const raw = storage.get<any>(STORAGE_KEY, null);
    if (!raw || typeof raw !== 'object') return;
    if (Array.isArray(raw.progress)) {
      raw.progress.forEach((row: any) => {
        if (!row || typeof row !== 'object') return;
        const id = String(row.id ?? '');
        if (!id) return;
        const entry: AchievementProgress = {
          id,
          current: Number(row.current ?? 0),
          target: Number(row.target ?? 0),
          completedAt: row.completedAt ?? null,
          lastUpdated: row.lastUpdated ?? Date.now(),
          ineligible: !!row.ineligible,
        };
        state.progress.set(id, entry);
      });
    }
  } catch (error) {
    log('⚠️ Achievements: failed to load persisted state', error);
  }
}

function pruneWeatherEvents(now: number): void {
  const cutoff = now - 60 * 60 * 1000;
  while (weatherEvents.length) {
    const first = weatherEvents[0];
    if (!first || first.timestamp >= cutoff) break;
    weatherEvents.shift();
  }
}

function logWeatherEvent(kind: string | null | undefined, now: number): void {
  const normalized = `${kind ?? ''}`.trim().toLowerCase();
  if (!normalized) return;
  if (normalized === lastWeatherKind) return;
  lastWeatherKind = normalized;
  weatherEvents.push({ kind: normalized, timestamp: now });
  pruneWeatherEvents(now);
}

function handleRoomFromLog(payload: any, now: number): void {
  const room = payload?.room;
  if (!room || typeof room !== 'object') return;
  const roomId = String(room.id ?? '').trim();
  if (!roomId) return;
  const isPrivate = room.isPrivate === true;
  const players = Number(room.playersCount ?? lastRoomPlayers ?? 0);

  if (lastRoomSeenAt != null && lastRoomId && roomId === lastRoomId) {
    const deltaMs = now - lastRoomSeenAt;
    if (deltaMs > 0) roomMinutes += deltaMs / 60000;
  }

  if (roomId !== lastRoomId) {
    if (!isPrivate) {
      roomJoinCount += 1;
    }
    lastRoomId = roomId;
  }

  lastRoomSeenAt = now;
  lastRoomPlayers = Number.isFinite(players) && players > 0 ? players : lastRoomPlayers;
  lastRoomIsPrivate = isPrivate;
}

function handleCoinsFromLog(payload: any): void {
  const coinsCandidates: Array<unknown> = [
    payload?.coins,
    payload?.state?.coins,
    payload?.state?.player?.coins,
    payload?.state?.stats?.player?.coins,
    payload?.player?.coins,
  ];
  const coins = coinsCandidates.map((v) => Number(v)).find((v) => Number.isFinite(v));
  if (!Number.isFinite(coins as number)) return;
  if (lastCoinBalanceFromLogs != null) {
    const delta = (coins as number) - lastCoinBalanceFromLogs;
    if (delta > 0) {
      sellBurstCoins = delta;
      sellBurstAlone = !lastRoomIsPrivate && (lastRoomPlayers || 0) <= 1;
    }
  }
  lastCoinBalanceFromLogs = coins as number;
}

function handleLogPayload(payload: any): void {
  const now = Date.now();
  handleRoomFromLog(payload, now);
  handleCoinsFromLog(payload);
  const currentWeather = payload?.state?.weather?.activeKind ?? payload?.state?.weather?.current ?? null;
  if (currentWeather) logWeatherEvent(currentWeather, now);
}

function handleRoomSnapshot(source: any): void {
  const now = Date.now();
  if (!source || typeof source !== 'object') return;
  const room = (source as any).room ?? (source as any).currentRoom ?? null;
  if (room && typeof room === 'object') {
    handleRoomFromLog({ room }, now);
  }
  handleCoinsFromLog(source);
}

export function recordInstantFeedUse(count = 1): void {
  const inc = Number(count);
  if (Number.isFinite(inc) && inc > 0) {
    instantFeedsUsed += inc;
    scheduleEvaluate();
  }
}

function persist(): void {
  try {
    const progress = Array.from(state.progress.values());
    storage.set(STORAGE_KEY, { progress });
  } catch (error) {
    log('⚠️ Achievements: failed to persist', error);
  }
}

function emit(): void {
  listeners.forEach((cb) => {
    try {
      cb(state.progress);
    } catch (error) {
      log('⚠️ Achievements listener error', error);
    }
  });
}

function ensureDefinitions(): void {
  if (state.definitions.length) return;
  state.definitions = [
    // Garden: planting tiers
    {
      id: 'garden:seedling-50',
      title: 'Seedling Planter I',
      description: 'Plant 50 crops.',
      category: 'garden',
      rarity: 'common',
      visibility: 'public',
      target: 50,
      icon: '🌱',
    },
    {
      id: 'garden:seedling-200',
      title: 'Seedling Planter II',
      description: 'Plant 200 crops.',
      category: 'garden',
      rarity: 'uncommon',
      visibility: 'public',
      target: 200,
      icon: '🌱',
    },
    {
      id: 'garden:seedling-500',
      title: 'Seedling Planter III',
      description: 'Plant 500 crops.',
      category: 'garden',
      rarity: 'rare',
      visibility: 'public',
      target: 500,
      icon: '🌱',
    },
    {
      id: 'garden:seedling-2500',
      title: 'Seedling Planter IV',
      description: 'Plant 2,500 crops.',
      category: 'garden',
      rarity: 'legendary',
      visibility: 'public',
      target: 2_500,
      icon: '🌱',
    },
    {
      id: 'garden:seedling-5000',
      title: 'Seedling Planter V',
      description: 'Plant 5,000 crops.',
      category: 'garden',
      rarity: 'mythical',
      visibility: 'public',
      target: 5_000,
      icon: '🌱',
    },
    {
      id: 'garden:seedling-12500',
      title: 'Seedling Planter VI',
      description: 'Plant 12,500 crops.',
      category: 'garden',
      rarity: 'divine',
      visibility: 'public',
      target: 12_500,
      icon: '🌱',
    },
    {
      id: 'garden:seedling-100000',
      title: 'Seedling Planter VII',
      description: 'Plant 50,000 crops.',
      category: 'garden',
      rarity: 'celestial',
      visibility: 'public',
      target: 50_000,
      icon: '🌱',
      hiddenTargetUntil: 'garden:seedling-12500',
    },

    // Garden: harvest tiers
    {
      id: 'garden:harvester-300',
      title: 'Harvester I',
      description: 'Harvest 300 crops.',
      category: 'garden',
      rarity: 'common',
      visibility: 'public',
      target: 300,
      icon: '🧺',
    },
    {
      id: 'garden:harvester-1000',
      title: 'Harvester II',
      description: 'Harvest 1,000 crops.',
      category: 'garden',
      rarity: 'uncommon',
      visibility: 'public',
      target: 1_000,
      icon: '🧺',
    },
    {
      id: 'garden:harvester-5000',
      title: 'Harvester III',
      description: 'Harvest 5,000 crops.',
      category: 'garden',
      rarity: 'rare',
      visibility: 'public',
      target: 5_000,
      icon: '🧺',
    },
    {
      id: 'garden:harvester-20000',
      title: 'Harvester IV',
      description: 'Harvest 20,000 crops.',
      category: 'garden',
      rarity: 'legendary',
      visibility: 'public',
      target: 20_000,
      icon: '🧺',
    },
    {
      id: 'garden:harvester-50000',
      title: 'Harvester V',
      description: 'Harvest 50,000 crops.',
      category: 'garden',
      rarity: 'mythical',
      visibility: 'public',
      target: 50_000,
      icon: '🧺',
    },
    {
      id: 'garden:harvester-150000',
      title: 'Harvester VI',
      description: 'Harvest 75,000 crops.',
      category: 'garden',
      rarity: 'divine',
      visibility: 'public',
      target: 75_000,
      icon: '🧺',
    },
    {
      id: 'garden:harvester-100000',
      title: 'Harvester VII',
      description: 'Harvest 100,000 crops.',
      category: 'garden',
      rarity: 'celestial',
      visibility: 'public',
      target: 100_000,
      icon: '🧺',
      hiddenTargetUntil: 'garden:harvester-150000',
    },

    // Garden: watering tiers
    {
      id: 'garden:watering-200',
      title: 'I wish I could buy more than 99... I',
      description: 'Use 200 watering cans on your crops.',
      category: 'garden',
      rarity: 'common',
      visibility: 'public',
      target: 200,
      icon: '💧',
    },
    {
      id: 'garden:watering-800',
      title: 'I wish I could buy more than 99... II',
      description: 'Use 800 watering cans on your crops.',
      category: 'garden',
      rarity: 'uncommon',
      visibility: 'public',
      target: 800,
      icon: '💧',
    },
    {
      id: 'garden:watering-2000',
      title: 'I wish I could buy more than 99... III',
      description: 'Use 2,000 watering cans on your crops.',
      category: 'garden',
      rarity: 'rare',
      visibility: 'public',
      target: 2_000,
      icon: '💧',
    },
    {
      id: 'garden:watering-10000',
      title: 'I wish I could buy more than 99... IV',
      description: 'Use 10,000 watering cans on your crops.',
      category: 'garden',
      rarity: 'legendary',
      visibility: 'public',
      target: 10_000,
      icon: '💧',
    },
    {
      id: 'garden:watering-50000',
      title: 'I wish I could buy more than 99... V',
      description: 'Use 50,000 watering cans on your crops.',
      category: 'garden',
      rarity: 'mythical',
      visibility: 'public',
      target: 50_000,
      icon: '💧',
    },
    {
      id: 'garden:watering-200000',
      title: 'I wish I could buy more than 99... VI',
      description: 'Use 80,000 watering cans on your crops.',
      category: 'garden',
      rarity: 'divine',
      visibility: 'public',
      target: 80_000,
      icon: '💧',
    },
    {
      id: 'garden:watering-125000',
      title: 'I wish I could buy more than 99... VII',
      description: 'Use 125,000 watering cans.',
      category: 'garden',
      rarity: 'celestial',
      visibility: 'public',
      target: 125_000,
      icon: '💧',
      hiddenTargetUntil: 'garden:watering-200000',
    },

    // Pets: hatch counts
    {
      id: 'pets:hatchling-10',
      title: 'Hatchery Rookie',
      description: 'Hatch 10 pets.',
      category: 'pets',
      rarity: 'common',
      visibility: 'public',
      target: 10,
      icon: '🥚',
    },
    {
      id: 'pets:hatchling-100',
      title: 'Hatchery Scout',
      description: 'Hatch 100 pets.',
      category: 'pets',
      rarity: 'uncommon',
      visibility: 'public',
      target: 100,
      icon: '🥚',
    },
    {
      id: 'pets:hatchling-500',
      title: 'Hatchery Specialist',
      description: 'Hatch 500 pets.',
      category: 'pets',
      rarity: 'rare',
      visibility: 'public',
      target: 500,
      icon: '🥚',
    },
    {
      id: 'pets:hatchling-2000',
      title: 'Hatchery Expert',
      description: 'Hatch 2,000 pets.',
      category: 'pets',
      rarity: 'legendary',
      visibility: 'public',
      target: 2_000,
      icon: '🥚',
    },
    {
      id: 'pets:hatchling-5000',
      title: 'Hatchery Master',
      description: 'Hatch 5,000 pets.',
      category: 'pets',
      rarity: 'mythical',
      visibility: 'public',
      target: 5_000,
      icon: '🥚',
    },
    {
      id: 'pets:hatchling-15000',
      title: 'Hatchery Legend',
      description: 'Hatch 15,000 pets.',
      category: 'pets',
      rarity: 'divine',
      visibility: 'public',
      target: 15_000,
      icon: '🥚',
    },
    {
      id: 'pets:hatchling-50000',
      title: 'Hatchery Celestial',
      description: 'Hatch 50,000 pets.',
      category: 'pets',
      rarity: 'celestial',
      visibility: 'public',
      target: 50_000,
      icon: '🥚',
      hiddenTargetUntil: 'pets:hatchling-15000',
    },

    // Pets: gold hatch counts
    {
      id: 'pets:gold-1',
      title: 'Gold Digger I',
      description: 'Hatch 1 gold pet.',
      category: 'pets',
      rarity: 'common',
      visibility: 'public',
      target: 1,
      icon: '🏅',
    },
    {
      id: 'pets:gold-3',
      title: 'Gold Digger II',
      description: 'Hatch 3 gold pets.',
      category: 'pets',
      rarity: 'uncommon',
      visibility: 'public',
      target: 3,
      icon: '🏅',
    },
    {
      id: 'pets:gold-10',
      title: 'Gold Digger III',
      description: 'Hatch 10 gold pets.',
      category: 'pets',
      rarity: 'rare',
      visibility: 'public',
      target: 10,
      icon: '🏅',
    },
    {
      id: 'pets:gold-25',
      title: 'Gold Digger IV',
      description: 'Hatch 25 gold pets.',
      category: 'pets',
      rarity: 'legendary',
      visibility: 'public',
      target: 25,
      icon: '🏅',
    },
    {
      id: 'pets:gold-75',
      title: 'Gold Digger V',
      description: 'Hatch 75 gold pets.',
      category: 'pets',
      rarity: 'mythical',
      visibility: 'public',
      target: 75,
      icon: '🏅',
    },
    {
      id: 'pets:gold-200',
      title: 'Gold Digger VI',
      description: 'Hatch 200 gold pets.',
      category: 'pets',
      rarity: 'divine',
      visibility: 'public',
      target: 200,
      icon: '🏅',
    },
    {
      id: 'pets:gold-1000',
      title: 'Gold Digger VII',
      description: 'Hatch 1,000 gold pets.',
      category: 'pets',
      rarity: 'celestial',
      visibility: 'public',
      target: 1_000,
      icon: '🏅',
      hiddenTargetUntil: 'pets:gold-200',
    },

    // Abilities: proc tiers (Trigger Happy)
    {
      id: 'abilities:proc-50',
      title: 'Trigger Happy I',
      description: 'Trigger 50 abilities.',
      category: 'abilities',
      rarity: 'common',
      visibility: 'public',
      target: 50,
      icon: '✨',
    },
    {
      id: 'abilities:proc-200',
      title: 'Trigger Happy II',
      description: 'Trigger 200 abilities.',
      category: 'abilities',
      rarity: 'uncommon',
      visibility: 'public',
      target: 200,
      icon: '✨',
    },
    {
      id: 'abilities:proc-1000',
      title: 'Trigger Happy III',
      description: 'Trigger 1,000 abilities.',
      category: 'abilities',
      rarity: 'rare',
      visibility: 'public',
      target: 1_000,
      icon: '✨',
    },
    {
      id: 'abilities:proc-5000',
      title: 'Trigger Happy IV',
      description: 'Trigger 5,000 abilities.',
      category: 'abilities',
      rarity: 'legendary',
      visibility: 'public',
      target: 5_000,
      icon: '✨',
    },
    {
      id: 'abilities:proc-20000',
      title: 'Trigger Happy V',
      description: 'Trigger 20,000 abilities.',
      category: 'abilities',
      rarity: 'mythical',
      visibility: 'public',
      target: 20_000,
      icon: '✨',
    },
    {
      id: 'abilities:proc-85000',
      title: 'Trigger Happy VI',
      description: 'Trigger 85,000 abilities.',
      category: 'abilities',
      rarity: 'divine',
      visibility: 'public',
      target: 85_000,
      icon: '✨',
    },
    {
      id: 'abilities:proc-150000',
      title: 'Trigger Happy VII',
      description: 'Trigger 150,000 abilities.',
      category: 'abilities',
      rarity: 'celestial',
      visibility: 'public',
      target: 150_000,
      icon: '✨',
      hiddenTargetUntil: 'abilities:proc-85000',
    },

    // Wealth: crop earnings tiers
    {
      id: 'economy:crop-earner-1000000',
      title: 'Filthy Rich I',
      description: 'Earn 1,000,000 coins from crops.',
      category: 'wealth',
      rarity: 'common',
      visibility: 'public',
      target: 1_000_000,
      icon: '🌾',
    },
    {
      id: 'economy:crop-earner-100000000',
      title: 'Filthy Rich II',
      description: 'Earn 100,000,000 coins from crops.',
      category: 'wealth',
      rarity: 'uncommon',
      visibility: 'public',
      target: 100_000_000,
      icon: '🌾',
    },
    {
      id: 'economy:crop-earner-10000000000',
      title: 'Filthy Rich III',
      description: 'Earn 10,000,000,000 coins from crops.',
      category: 'wealth',
      rarity: 'rare',
      visibility: 'public',
      target: 10_000_000_000,
      icon: '🌾',
    },
    {
      id: 'economy:crop-earner-1000000000000',
      title: 'Filthy Rich IV',
      description: 'Earn 1,000,000,000,000 coins from crops.',
      category: 'wealth',
      rarity: 'legendary',
      visibility: 'public',
      target: 1_000_000_000_000,
      icon: '🌾',
    },
    {
      id: 'economy:crop-earner-5000000000000',
      title: 'Filthy Rich V',
      description: 'Earn 5,000,000,000,000 coins from crops.',
      category: 'wealth',
      rarity: 'mythical',
      visibility: 'public',
      target: 5_000_000_000_000,
      icon: '🌾',
    },
    {
      id: 'economy:crop-earner-10000000000000',
      title: 'Filthy Rich VI',
      description: 'Earn 10,000,000,000,000 coins from crops.',
      category: 'wealth',
      rarity: 'divine',
      visibility: 'public',
      target: 10_000_000_000_000,
      icon: '🌾',
    },
    {
      id: 'economy:crop-earner-150000000000000',
      title: 'Filthy Rich VII',
      description: 'Earn 150,000,000,000,000 coins from crops.',
      category: 'wealth',
      rarity: 'celestial',
      visibility: 'public',
      target: 150_000_000_000_000,
      icon: '🌾',
      hiddenTargetUntil: 'economy:crop-earner-10000000000000',
    },

    // Weather milestones (specific skies) ~5x scaled
    {
      id: 'weather:fresh-frozen-50',
      title: 'Fresh Frozen I',
      description: 'Watch it snow 50 times.',
      category: 'weather',
      rarity: 'common',
      visibility: 'public',
      target: 50,
      icon: '❄️',
    },
    {
      id: 'weather:fresh-frozen-125',
      title: 'Fresh Frozen II',
      description: 'Watch it snow 125 times.',
      category: 'weather',
      rarity: 'uncommon',
      visibility: 'public',
      target: 125,
      icon: '❄️',
    },
    {
      id: 'weather:fresh-frozen-300',
      title: 'Fresh Frozen III',
      description: 'Watch it snow 300 times.',
      category: 'weather',
      rarity: 'rare',
      visibility: 'public',
      target: 300,
      icon: '❄️',
    },
    {
      id: 'weather:fresh-frozen-625',
      title: 'Fresh Frozen IV',
      description: 'Watch it snow 625 times.',
      category: 'weather',
      rarity: 'legendary',
      visibility: 'public',
      target: 625,
      icon: '❄️',
    },
    {
      id: 'weather:fresh-frozen-1250',
      title: 'Fresh Frozen V',
      description: 'Watch it snow 1,250 times.',
      category: 'weather',
      rarity: 'mythical',
      visibility: 'public',
      target: 1_250,
      icon: '❄️',
    },
    {
      id: 'weather:fresh-frozen-2500',
      title: 'Fresh Frozen VI',
      description: 'Watch it snow 2,500 times.',
      category: 'weather',
      rarity: 'divine',
      visibility: 'public',
      target: 2_500,
      icon: '❄️',
    },
    {
      id: 'weather:fresh-frozen-5000',
      title: 'Fresh Frozen VII',
      description: 'Watch it snow 5,000 times.',
      category: 'weather',
      rarity: 'celestial',
      visibility: 'public',
      target: 5_000,
      icon: '❄️',
      hiddenTargetUntil: 'weather:fresh-frozen-2500',
    },
    {
      id: 'weather:early-bird-50',
      title: 'Early Bird I',
      description: 'Sit through 50 Dawn moons.',
      category: 'weather',
      rarity: 'common',
      visibility: 'public',
      target: 50,
      icon: '🌅',
    },
    {
      id: 'weather:early-bird-125',
      title: 'Early Bird II',
      description: 'Sit through 125 Dawn moons.',
      category: 'weather',
      rarity: 'uncommon',
      visibility: 'public',
      target: 125,
      icon: '🌅',
    },
    {
      id: 'weather:early-bird-300',
      title: 'Early Bird III',
      description: 'Sit through 300 Dawn moons.',
      category: 'weather',
      rarity: 'rare',
      visibility: 'public',
      target: 300,
      icon: '🌅',
    },
    {
      id: 'weather:early-bird-625',
      title: 'Early Bird IV',
      description: 'Sit through 625 Dawn moons.',
      category: 'weather',
      rarity: 'legendary',
      visibility: 'public',
      target: 625,
      icon: '🌅',
    },
    {
      id: 'weather:early-bird-1250',
      title: 'Early Bird V',
      description: 'Sit through 1,250 Dawn moons.',
      category: 'weather',
      rarity: 'mythical',
      visibility: 'public',
      target: 1_250,
      icon: '🌅',
    },
    {
      id: 'weather:early-bird-2500',
      title: 'Early Bird VI',
      description: 'Sit through 2,500 Dawn moons.',
      category: 'weather',
      rarity: 'divine',
      visibility: 'public',
      target: 2_500,
      icon: '🌅',
    },
    {
      id: 'weather:early-bird-5000',
      title: 'Early Bird VII',
      description: 'Sit through 5,000 Dawn moons.',
      category: 'weather',
      rarity: 'celestial',
      visibility: 'public',
      target: 5_000,
      icon: '🌅',
      hiddenTargetUntil: 'weather:early-bird-2500',
    },
    {
      id: 'weather:night-owl-50',
      title: 'Night Owl I',
      description: 'Sit through 50 Amber moons.',
      category: 'weather',
      rarity: 'common',
      visibility: 'public',
      target: 50,
      icon: '🌙',
    },
    {
      id: 'weather:night-owl-125',
      title: 'Night Owl II',
      description: 'Sit through 125 Amber moons.',
      category: 'weather',
      rarity: 'uncommon',
      visibility: 'public',
      target: 125,
      icon: '🌙',
    },
    {
      id: 'weather:night-owl-300',
      title: 'Night Owl III',
      description: 'Sit through 300 Amber moons.',
      category: 'weather',
      rarity: 'rare',
      visibility: 'public',
      target: 300,
      icon: '🌙',
    },
    {
      id: 'weather:night-owl-625',
      title: 'Night Owl IV',
      description: 'Sit through 625 Amber moons.',
      category: 'weather',
      rarity: 'legendary',
      visibility: 'public',
      target: 625,
      icon: '🌙',
    },
    {
      id: 'weather:night-owl-1250',
      title: 'Night Owl V',
      description: 'Sit through 1,250 Amber moons.',
      category: 'weather',
      rarity: 'mythical',
      visibility: 'public',
      target: 1_250,
      icon: '🌙',
    },
    {
      id: 'weather:night-owl-2500',
      title: 'Night Owl VI',
      description: 'Sit through 2,500 Amber moons.',
      category: 'weather',
      rarity: 'divine',
      visibility: 'public',
      target: 2_500,
      icon: '🌙',
    },
    {
      id: 'weather:night-owl-5000',
      title: 'Night Owl VII',
      description: 'Sit through 5,000 Amber moons.',
      category: 'weather',
      rarity: 'celestial',
      visibility: 'public',
      target: 5_000,
      icon: '🌙',
      hiddenTargetUntil: 'weather:night-owl-2500',
    },

    // Pets: rainbow hatches (Pure Luck)
    {
      id: 'pets:rainbow-1',
      title: 'Pure Luck I',
      description: 'Hatch 1 rainbow pet.',
      category: 'pets',
      rarity: 'common',
      visibility: 'public',
      target: 1,
      icon: '🌈',
    },
    {
      id: 'pets:rainbow-2',
      title: 'Pure Luck II',
      description: 'Hatch 2 rainbow pets.',
      category: 'pets',
      rarity: 'uncommon',
      visibility: 'public',
      target: 2,
      icon: '🌈',
    },
    {
      id: 'pets:rainbow-3',
      title: 'Pure Luck III',
      description: 'Hatch 3 rainbow pets.',
      category: 'pets',
      rarity: 'rare',
      visibility: 'public',
      target: 3,
      icon: '🌈',
    },
    {
      id: 'pets:rainbow-6',
      title: 'Pure Luck IV',
      description: 'Hatch 6 rainbow pets.',
      category: 'pets',
      rarity: 'legendary',
      visibility: 'public',
      target: 6,
      icon: '🌈',
    },
    {
      id: 'pets:rainbow-10',
      title: 'Pure Luck V',
      description: 'Hatch 10 rainbow pets.',
      category: 'pets',
      rarity: 'mythical',
      visibility: 'public',
      target: 10,
      icon: '🌈',
    },
    {
      id: 'pets:rainbow-20',
      title: 'Pure Luck VI',
      description: 'Hatch 20 rainbow pets.',
      category: 'pets',
      rarity: 'divine',
      visibility: 'public',
      target: 20,
      icon: '🌈',
    },
    {
      id: 'pets:rainbow-50',
      title: 'Pure Luck VII',
      description: 'Hatch 50 rainbow pets.',
      category: 'pets',
      rarity: 'celestial',
      visibility: 'public',
      target: 50,
      icon: '🌈',
      hiddenTargetUntil: 'pets:rainbow-20',
    },

    // Seeds on hand (single type) - Seed Hoarder
    {
      id: 'garden:seed-hoarder-100',
      title: 'Seed Hoarder I',
      description: 'Hold 100 seeds of a single type.',
      category: 'garden',
      rarity: 'common',
      visibility: 'public',
      target: 100,
      icon: '🌱',
    },
    {
      id: 'garden:seed-hoarder-500',
      title: 'Seed Hoarder II',
      description: 'Hold 500 seeds of a single type.',
      category: 'garden',
      rarity: 'uncommon',
      visibility: 'public',
      target: 500,
      icon: '🌱',
    },
    {
      id: 'garden:seed-hoarder-1500',
      title: 'Seed Hoarder III',
      description: 'Hold 1,500 seeds of a single type.',
      category: 'garden',
      rarity: 'rare',
      visibility: 'public',
      target: 1_500,
      icon: '🌱',
    },
    {
      id: 'garden:seed-hoarder-5000',
      title: 'Seed Hoarder IV',
      description: 'Hold 7,500 seeds of a single type.',
      category: 'garden',
      rarity: 'legendary',
      visibility: 'public',
      target: 7_500,
      icon: '🌱',
    },
    {
      id: 'garden:seed-hoarder-15000',
      title: 'Seed Hoarder V',
      description: 'Hold 35,000 seeds of a single type.',
      category: 'garden',
      rarity: 'mythical',
      visibility: 'public',
      target: 35_000,
      icon: '🌱',
    },
    {
      id: 'garden:seed-hoarder-35000',
      title: 'Seed Hoarder VI',
      description: 'Hold 100,000 seeds of a single type.',
      category: 'garden',
      rarity: 'divine',
      visibility: 'public',
      target: 100_000,
      icon: '🌱',
    },
    {
      id: 'garden:seed-hoarder-80000',
      title: 'Seed Hoarder VII',
      description: 'Hold 750,000 seeds of a single type.',
      category: 'garden',
      rarity: 'celestial',
      visibility: 'public',
      target: 750_000,
      icon: '🌱',
      hiddenTargetUntil: 'garden:seed-hoarder-35000',
    },

    // One-time achievements
    {
      id: 'onetime:this-is-only-the-beginning',
      title: 'This is just the beginning',
      description: 'Crop Eater ate a crop.',
      category: 'obscure',
      rarity: 'common',
      visibility: 'public',
      target: 1,
      icon: '🪓',
      oneTime: true,
    },
    {
      id: 'onetime:yummy-crop-eater',
      title: 'YUMMY!',
      description: 'Crop Eater ate a celestial crop.',
      category: 'obscure',
      rarity: 'rare',
      visibility: 'public',
      target: 1,
      icon: '🍬',
      oneTime: true,
    },
    {
      id: 'onetime:eating-good',
      title: 'Eating Good :(',
      description: 'Fed pet produce worth over 500M.',
      category: 'pets',
      rarity: 'legendary',
      visibility: 'public',
      target: 500_000_000,
      icon: '🥗',
      oneTime: true,
    },
    {
      id: 'onetime:all-i-see-is-money',
      title: 'All I see is Money',
      description: 'Only gold or rainbow pets in inventory and hutch.',
      category: 'pets',
      rarity: 'celestial',
      visibility: 'public',
      target: 1,
      icon: '💰',
      oneTime: true,
    },
    {
      id: 'onetime:gamblers-fallacy',
      title: 'Gamblers Fallacy',
      description: '12h accumulated with 3+ Crop Size Boost pets active and no boost proc.',
      category: 'obscure',
      rarity: 'legendary',
      visibility: 'public',
      target: 1,
      icon: '🎲',
      oneTime: true,
    },
    {
      id: 'onetime:money-cant-buy-happiness',
      title: 'Money can’t buy happiness',
      description: 'Open 1,000 eggs or reach 1B crop value sold with no rainbow pets ever.',
      category: 'wealth',
      rarity: 'legendary',
      visibility: 'public',
      target: 1,
      icon: '💸',
      oneTime: true,
    },
    {
      id: 'onetime:rich',
      title: 'Rich',
      description: 'Reach 50B coin balance.',
      category: 'wealth',
      rarity: 'rare',
      visibility: 'public',
      target: 50_000_000_000,
      icon: '🏦',
      oneTime: true,
    },
    {
      id: 'onetime:baller-status',
      title: 'Baller Status',
      description: 'Reach 1T coin balance.',
      category: 'wealth',
      rarity: 'mythical',
      visibility: 'public',
      target: 1_000_000_000_000,
      icon: '🪙',
      oneTime: true,
    },
    {
      id: 'onetime:whos-bill-gates',
      title: "Who's Bill Gates?",
      description: 'Reach 10T coin balance.',
      category: 'wealth',
      rarity: 'divine',
      visibility: 'public',
      target: 10_000_000_000_000,
      icon: '🏰',
      oneTime: true,
    },
    {
      id: 'onetime:what-is-money',
      title: 'What is money??',
      description: 'Reach 100T coin balance.',
      category: 'wealth',
      rarity: 'celestial',
      visibility: 'public',
      target: 100_000_000_000_000,
      icon: '💎',
      oneTime: true,
    },
    {
      id: 'onetime:what-is-grass',
      title: 'What is Grass..',
      description: 'Reach 1Q coin balance.',
      category: 'wealth',
      rarity: 'celestial',
      visibility: 'public',
      target: 1_000_000_000_000_000,
      icon: '🌾',
      oneTime: true,
    },
    {
      id: 'onetime:god-tier-research',
      title: 'GOD-TIER RESEARCH',
      description: 'Complete all journal sections.',
      category: 'collection',
      rarity: 'celestial',
      visibility: 'public',
      target: 1,
      icon: '📚',
      oneTime: true,
    },
    {
      id: 'collection:pets-3',
      title: 'Animal Lover I',
      description: 'Complete the pets journal.',
      category: 'collection',
      rarity: 'common',
      visibility: 'public',
      target: 3,
      icon: '📔',
    },
    {
      id: 'collection:pets-7',
      title: 'Animal Lover II',
      description: 'Complete the pets journal.',
      category: 'collection',
      rarity: 'uncommon',
      visibility: 'public',
      target: 7,
      icon: '📔',
    },
    {
      id: 'collection:pets-12',
      title: 'Animal Lover III',
      description: 'Complete the pets journal.',
      category: 'collection',
      rarity: 'rare',
      visibility: 'public',
      target: 12,
      icon: '📔',
    },
    {
      id: 'collection:pets-20',
      title: 'Animal Lover IV',
      description: 'Complete the pets journal.',
      category: 'collection',
      rarity: 'legendary',
      visibility: 'public',
      target: 20,
      icon: '📔',
    },
    {
      id: 'collection:pets-35',
      title: 'Animal Lover V',
      description: 'Complete the pets journal.',
      category: 'collection',
      rarity: 'mythical',
      visibility: 'public',
      target: 35,
      icon: '📔',
    },
    {
      id: 'collection:pets-50',
      title: 'Animal Lover VI',
      description: 'Complete the pets journal.',
      category: 'collection',
      rarity: 'divine',
      visibility: 'public',
      target: 50,
      icon: '📔',
    },
    {
      id: 'collection:pets-60',
      title: 'Animal Lover VII',
      description: 'Complete the pets journal.',
      category: 'collection',
      rarity: 'celestial',
      visibility: 'public',
      target: 60,
      icon: '📔',
      hiddenTargetUntil: 'collection:pets-50',
    },
    // Collection: journal completion tiers (moved below Animal Lover for ordering)
    {
      id: 'collection:produce-10',
      title: 'Completionist I',
      description: 'Complete the produce journal.',
      category: 'collection',
      rarity: 'common',
      visibility: 'public',
      target: 10,
      icon: '📔',
    },
    {
      id: 'collection:produce-25',
      title: 'Completionist II',
      description: 'Complete the produce journal.',
      category: 'collection',
      rarity: 'uncommon',
      visibility: 'public',
      target: 25,
      icon: '📔',
    },
    {
      id: 'collection:produce-50',
      title: 'Completionist III',
      description: 'Complete the produce journal.',
      category: 'collection',
      rarity: 'rare',
      visibility: 'public',
      target: 50,
      icon: '📔',
    },
    {
      id: 'collection:produce-100',
      title: 'Completionist IV',
      description: 'Complete the produce journal.',
      category: 'collection',
      rarity: 'legendary',
      visibility: 'public',
      target: 100,
      icon: '📔',
    },
    {
      id: 'collection:produce-250',
      title: 'Completionist V',
      description: 'Complete the produce journal.',
      category: 'collection',
      rarity: 'mythical',
      visibility: 'public',
      target: 250,
      icon: '📔',
    },
    {
      id: 'collection:produce-325',
      title: 'Completionist VI',
      description: 'Complete the produce journal.',
      category: 'collection',
      rarity: 'divine',
      visibility: 'public',
      target: 325,
      icon: '📔',
    },
    {
      id: 'collection:produce-385',
      title: 'Completionist VII',
      description: 'Complete the produce journal.',
      category: 'collection',
      rarity: 'celestial',
      visibility: 'public',
      target: 385,
      icon: '📔',
      hiddenTargetUntil: 'collection:produce-325',
    },

    // New one-time: perfect journal completions
    {
      id: 'onetime:perfect-produce',
      title: 'Perfect Produce',
      description: 'Complete every variant for any single crop.',
      category: 'collection',
      rarity: 'rare',
      visibility: 'public',
      target: 1,
      icon: '🥕',
      oneTime: true,
      tags: ['per-species', 'journal', 'variant'],
    },
    {
      id: 'onetime:perfect-symmetry',
      title: 'Perfect Symmetry',
      description: 'Complete all variants for any pet species.',
      category: 'collection',
      rarity: 'rare',
      visibility: 'public',
      target: 1,
      icon: '🐾',
      oneTime: true,
      tags: ['per-species', 'journal', 'variant'],
    },

    // New one-time: time/concurrency challenges
    {
      id: 'onetime:mutation-marathon',
      title: 'Mutation Marathon',
      description: 'Trigger 10 mutations within 30 minutes.',
      category: 'weather',
      rarity: 'legendary',
      visibility: 'public',
      target: 10,
      icon: '🌦️',
      oneTime: true,
      tags: ['window', 'mutations'],
    },
    {
      id: 'onetime:all-weathered',
      title: 'All-Weathered',
      description: 'See Dawn, Amber, and Snow in a single session.',
      category: 'weather',
      rarity: 'legendary',
      visibility: 'public',
      target: 3,
      icon: '⛈️',
      oneTime: true,
      tags: ['weather', 'session'],
    },
    {
      id: 'onetime:triple-hatch',
      title: 'Triple Hatch',
      description: 'Hatch Gold, Rainbow, and Normal pets within 30 minutes.',
      category: 'pets',
      rarity: 'legendary',
      visibility: 'public',
      target: 3,
      icon: '🥚',
      oneTime: true,
      tags: ['window', 'hatch'],
    },
    {
      id: 'onetime:These-Exist!?',
      title: 'These-Exist!?',
      description: 'Hatch a pet with 4 abilities.',
      category: 'pets',
      rarity: 'mythical',
      visibility: 'public',
      target: 1,
      icon: '❔',
      oneTime: true,
      tags: ['hatch'],
    },
    {
      id: 'onetime:loyal-companion',
      title: 'Loyal Companion',
      description: 'Keep one pet active for 6+ hours in a single day.',
      category: 'pets',
      rarity: 'legendary',
      visibility: 'public',
      target: 1,
      icon: '🕰️',
      oneTime: true,
      tags: ['session', 'pet-active'],
    },
    {
      id: 'onetime:ability-synergy',
      title: 'Ability Synergy',
      description: 'Trigger 5 different abilities within 5 minutes.',
      category: 'abilities',
      rarity: 'legendary',
      visibility: 'public',
      target: 5,
      icon: '🧩',
      oneTime: true,
      tags: ['window', 'abilities'],
    },
    {
      id: 'onetime:combo-caster',
      title: 'Combo Caster',
      description: 'Trigger 3 different abilities inside 30 seconds.',
      category: 'abilities',
      rarity: 'mythical',
      visibility: 'public',
      target: 3,
      icon: '⚡',
      oneTime: true,
      tags: ['window', 'abilities'],
    },
    {
      id: 'onetime:market-maker',
      title: 'Market Maker',
      description: 'Sell 10 different crop types within 10 minutes.',
      category: 'shop',
      rarity: 'legendary',
      visibility: 'public',
      target: 10,
      icon: '🛒',
      oneTime: true,
      tags: ['sell', 'window'],
    },
    {
      id: 'onetime:fire-sale',
      title: 'Fire Sale',
      description: 'Sell 5 different crop types within 60 seconds.',
      category: 'shop',
      rarity: 'legendary',
      visibility: 'public',
      target: 5,
      icon: '🔥',
      oneTime: true,
      tags: ['sell', 'window'],
    },
    {
      id: 'onetime:abilities:crit-crafter',
      title: 'Crit Crafter',
      description: 'Apply Rainbow or Gold-granting abilities to 1,000 crops total.',
      category: 'abilities',
      rarity: 'mythical',
      visibility: 'public',
      target: 1_000,
      icon: '🌈',
      oneTime: true,
      tags: ['abilities', 'value'],
    },
    {
      id: 'onetime:clutch-hatch',
      title: 'Clutch Hatch',
      description: 'Hatch a Gold or Rainbow pet within 2 minutes of egg purchase.',
      category: 'pets',
      rarity: 'legendary',
      visibility: 'public',
      target: 1,
      icon: '⏱️',
      oneTime: true,
      tags: ['hatch', 'window'],
    },

    // Rarity-tiered: mutation harvest
    {
      id: 'garden:mutation-harvester-100',
      title: 'Mutation Harvester I',
      description: 'Harvest 100 mutated crops.',
      category: 'garden',
      rarity: 'common',
      visibility: 'public',
      target: 100,
      icon: '🧬',
    },
    {
      id: 'garden:mutation-harvester-1000',
      title: 'Mutation Harvester II',
      description: 'Harvest 1,000 mutated crops.',
      category: 'garden',
      rarity: 'uncommon',
      visibility: 'public',
      target: 1_000,
      icon: '🧬',
    },
    {
      id: 'garden:mutation-harvester-2500',
      title: 'Mutation Harvester III',
      description: 'Harvest 2,500 mutated crops.',
      category: 'garden',
      rarity: 'rare',
      visibility: 'public',
      target: 2_500,
      icon: '🧬',
    },
    {
      id: 'garden:mutation-harvester-7500',
      title: 'Mutation Harvester IV',
      description: 'Harvest 7,500 mutated crops.',
      category: 'garden',
      rarity: 'legendary',
      visibility: 'public',
      target: 7_500,
      icon: '🧬',
    },
    {
      id: 'garden:mutation-harvester-15000',
      title: 'Mutation Harvester V',
      description: 'Harvest 15,000 mutated crops.',
      category: 'garden',
      rarity: 'mythical',
      visibility: 'public',
      target: 15_000,
      icon: '🧬',
    },
    {
      id: 'garden:mutation-harvester-50000',
      title: 'Mutation Harvester VI',
      description: 'Harvest 50,000 mutated crops.',
      category: 'garden',
      rarity: 'divine',
      visibility: 'public',
      target: 50_000,
      icon: '🧬',
    },
    {
      id: 'garden:mutation-harvester-125000',
      title: 'Mutation Harvester VII',
      description: 'Harvest 125,000 mutated crops.',
      category: 'garden',
      rarity: 'celestial',
      visibility: 'public',
      target: 125_000,
      icon: '🧬',
      hiddenTargetUntil: 'garden:mutation-harvester-50000',
    },

    // Rarity-tiered: giant grower
    {
      id: 'garden:giant-grower-1',
      title: 'Giant Grower I',
      description: 'Achieve max weight on 1 crop.',
      category: 'garden',
      rarity: 'common',
      visibility: 'public',
      target: 1,
      icon: '🌳',
    },
    {
      id: 'garden:giant-grower-3',
      title: 'Giant Grower II',
      description: 'Achieve max weight on 3 crops.',
      category: 'garden',
      rarity: 'uncommon',
      visibility: 'public',
      target: 3,
      icon: '🌳',
    },
    {
      id: 'garden:giant-grower-7',
      title: 'Giant Grower III',
      description: 'Achieve max weight on 7 crops.',
      category: 'garden',
      rarity: 'rare',
      visibility: 'public',
      target: 7,
      icon: '🌳',
    },
    {
      id: 'garden:giant-grower-10',
      title: 'Giant Grower IV',
      description: 'Achieve max weight on 10 crops.',
      category: 'garden',
      rarity: 'legendary',
      visibility: 'public',
      target: 10,
      icon: '🌳',
    },
    {
      id: 'garden:giant-grower-15',
      title: 'Giant Grower V',
      description: 'Achieve max weight on 15 crops.',
      category: 'garden',
      rarity: 'mythical',
      visibility: 'public',
      target: 15,
      icon: '🌳',
    },
    {
      id: 'garden:giant-grower-25',
      title: 'Giant Grower VI',
      description: 'Achieve max weight on 25 crops.',
      category: 'garden',
      rarity: 'divine',
      visibility: 'public',
      target: 25,
      icon: '🌳',
    },
    {
      id: 'garden:giant-grower-35',
      title: 'Giant Grower VII',
      description: 'Achieve max weight on 35 crops.',
      category: 'garden',
      rarity: 'celestial',
      visibility: 'public',
      target: 35,
      icon: '🌳',
      hiddenTargetUntil: 'garden:giant-grower-25',
    },

    // Rarity-tiered: trainer (levels)
    {
      id: 'pets:trainer-50',
      title: 'Trainer I',
      description: 'Gain 50 pet levels total.',
      category: 'pets',
      rarity: 'common',
      visibility: 'public',
      target: 50,
      icon: '🎓',
    },
    {
      id: 'pets:trainer-200',
      title: 'Trainer II',
      description: 'Gain 200 pet levels total.',
      category: 'pets',
      rarity: 'uncommon',
      visibility: 'public',
      target: 200,
      icon: '🎓',
    },
    {
      id: 'pets:trainer-800',
      title: 'Trainer III',
      description: 'Gain 800 pet levels total.',
      category: 'pets',
      rarity: 'rare',
      visibility: 'public',
      target: 800,
      icon: '🎓',
    },
    {
      id: 'pets:trainer-2000',
      title: 'Trainer IV',
      description: 'Gain 2,000 pet levels total.',
      category: 'pets',
      rarity: 'legendary',
      visibility: 'public',
      target: 2_000,
      icon: '🎓',
    },
    {
      id: 'pets:trainer-5000',
      title: 'Trainer V',
      description: 'Gain 5,000 pet levels total.',
      category: 'pets',
      rarity: 'mythical',
      visibility: 'public',
      target: 5_000,
      icon: '🎓',
    },
    {
      id: 'pets:trainer-10000',
      title: 'Trainer VI',
      description: 'Gain 10,000 pet levels total.',
      category: 'pets',
      rarity: 'divine',
      visibility: 'public',
      target: 10_000,
      icon: '🎓',
    },
    {
      id: 'pets:trainer-50000',
      title: 'Trainer VII',
      description: 'Gain 50,000 pet levels total.',
      category: 'pets',
      rarity: 'celestial',
      visibility: 'public',
      target: 50_000,
      icon: '🎓',
      hiddenTargetUntil: 'pets:trainer-10000',
    },

    // Rarity-tiered: diligent gardener (streak)
    {
      id: 'streaks:diligent-gardener-3',
      title: 'Diligent Gardener I',
      description: 'Keep a 3-day garden streak.',
      category: 'streaks',
      rarity: 'common',
      visibility: 'public',
      target: 3,
      icon: '📅',
    },
    {
      id: 'streaks:diligent-gardener-7',
      title: 'Diligent Gardener II',
      description: 'Keep a 7-day garden streak.',
      category: 'streaks',
      rarity: 'uncommon',
      visibility: 'public',
      target: 7,
      icon: '📅',
    },
    {
      id: 'streaks:diligent-gardener-14',
      title: 'Diligent Gardener III',
      description: 'Keep a 14-day garden streak.',
      category: 'streaks',
      rarity: 'rare',
      visibility: 'public',
      target: 14,
      icon: '📅',
    },
    {
      id: 'streaks:diligent-gardener-30',
      title: 'Diligent Gardener IV',
      description: 'Keep a 30-day garden streak.',
      category: 'streaks',
      rarity: 'legendary',
      visibility: 'public',
      target: 30,
      icon: '📅',
    },
    {
      id: 'streaks:diligent-gardener-80',
      title: 'Diligent Gardener V',
      description: 'Keep an 80-day garden streak.',
      category: 'streaks',
      rarity: 'mythical',
      visibility: 'public',
      target: 80,
      icon: '📅',
    },
    {
      id: 'streaks:diligent-gardener-180',
      title: 'Diligent Gardener VI',
      description: 'Keep a 180-day garden streak.',
      category: 'streaks',
      rarity: 'divine',
      visibility: 'public',
      target: 180,
      icon: '📅',
    },
    {
      id: 'streaks:diligent-gardener-365',
      title: 'Diligent Gardener VII',
      description: 'Keep a 365-day garden streak.',
      category: 'streaks',
      rarity: 'celestial',
      visibility: 'public',
      target: 365,
      icon: '📅',
      hiddenTargetUntil: 'streaks:diligent-gardener-180',
    },

    // Rarity-tiered: empowered harvest (rainbow/gold applied crops)
    {
      id: 'abilities:empowered-harvest-10',
      title: 'Empowered Harvest I',
      description: 'Apply Rainbow/Gold-granting abilities to 10 crops.',
      category: 'abilities',
      rarity: 'common',
      visibility: 'public',
      target: 10,
      icon: '💠',
    },
    {
      id: 'abilities:empowered-harvest-50',
      title: 'Empowered Harvest II',
      description: 'Apply Rainbow/Gold-granting abilities to 50 crops.',
      category: 'abilities',
      rarity: 'uncommon',
      visibility: 'public',
      target: 50,
      icon: '💠',
    },
    {
      id: 'abilities:empowered-harvest-500',
      title: 'Empowered Harvest III',
      description: 'Apply Rainbow/Gold-granting abilities to 500 crops.',
      category: 'abilities',
      rarity: 'rare',
      visibility: 'public',
      target: 500,
      icon: '💠',
    },
    {
      id: 'abilities:empowered-harvest-2500',
      title: 'Empowered Harvest IV',
      description: 'Apply Rainbow/Gold-granting abilities to 2,500 crops.',
      category: 'abilities',
      rarity: 'legendary',
      visibility: 'public',
      target: 2_500,
      icon: '💠',
    },
    {
      id: 'abilities:empowered-harvest-5000',
      title: 'Empowered Harvest V',
      description: 'Apply Rainbow/Gold-granting abilities to 5,000 crops.',
      category: 'abilities',
      rarity: 'mythical',
      visibility: 'public',
      target: 5_000,
      icon: '💠',
    },
    {
      id: 'abilities:empowered-harvest-10000',
      title: 'Empowered Harvest VI',
      description: 'Apply Rainbow/Gold-granting abilities to 10,000 crops.',
      category: 'abilities',
      rarity: 'divine',
      visibility: 'public',
      target: 10_000,
      icon: '💠',
    },
    {
      id: 'abilities:empowered-harvest-50000',
      title: 'Empowered Harvest VII',
      description: 'Apply Rainbow/Gold-granting abilities to 50,000 crops.',
      category: 'abilities',
      rarity: 'celestial',
      visibility: 'public',
      target: 50_000,
      icon: '💠',
      hiddenTargetUntil: 'abilities:empowered-harvest-10000',
    },

    // Public rooms & selling
    {
      id: 'rooms:socialite-10',
      title: 'Room Socialite I',
      description: 'Join 10 public rooms.',
      category: 'streaks',
      rarity: 'common',
      visibility: 'public',
      target: 10,
      icon: '🪩',
    },
    {
      id: 'rooms:socialite-40',
      title: 'Room Socialite II',
      description: 'Join 40 public rooms.',
      category: 'streaks',
      rarity: 'uncommon',
      visibility: 'public',
      target: 40,
      icon: '🪩',
    },
    {
      id: 'rooms:socialite-120',
      title: 'Room Socialite III',
      description: 'Join 120 public rooms.',
      category: 'streaks',
      rarity: 'rare',
      visibility: 'public',
      target: 120,
      icon: '🪩',
    },
    {
      id: 'rooms:socialite-300',
      title: 'Room Socialite IV',
      description: 'Join 300 public rooms.',
      category: 'streaks',
      rarity: 'legendary',
      visibility: 'public',
      target: 300,
      icon: '🪩',
    },
    {
      id: 'rooms:socialite-750',
      title: 'Room Socialite V',
      description: 'Join 750 public rooms.',
      category: 'streaks',
      rarity: 'mythical',
      visibility: 'public',
      target: 750,
      icon: '🪩',
    },
    {
      id: 'rooms:socialite-2500',
      title: 'Room Socialite VI',
      description: 'Join 2,500 public rooms.',
      category: 'streaks',
      rarity: 'divine',
      visibility: 'public',
      target: 2_500,
      icon: '🪩',
    },
    {
      id: 'rooms:socialite-10000',
      title: 'Room Socialite VII',
      description: 'Join 10,000 public rooms.',
      category: 'streaks',
      rarity: 'celestial',
      visibility: 'public',
      target: 10_000,
      icon: '🪩',
      hiddenTargetUntil: 'rooms:socialite-2500',
    },

    {
      id: 'rooms:anchor-60',
      title: 'Room Anchor I',
      description: 'Spend 60 minutes in public rooms.',
      category: 'streaks',
      rarity: 'common',
      visibility: 'public',
      target: 60,
      icon: '⚓',
    },
    {
      id: 'rooms:anchor-300',
      title: 'Room Anchor II',
      description: 'Spend 300 minutes in public rooms.',
      category: 'streaks',
      rarity: 'uncommon',
      visibility: 'public',
      target: 300,
      icon: '⚓',
    },
    {
      id: 'rooms:anchor-1000',
      title: 'Room Anchor III',
      description: 'Spend 1,000 minutes in public rooms.',
      category: 'streaks',
      rarity: 'rare',
      visibility: 'public',
      target: 1_000,
      icon: '⚓',
    },
    {
      id: 'rooms:anchor-3000',
      title: 'Room Anchor IV',
      description: 'Spend 3,000 minutes in public rooms.',
      category: 'streaks',
      rarity: 'legendary',
      visibility: 'public',
      target: 3_000,
      icon: '⚓',
    },
    {
      id: 'rooms:anchor-7500',
      title: 'Room Anchor V',
      description: 'Spend 7,500 minutes in public rooms.',
      category: 'streaks',
      rarity: 'mythical',
      visibility: 'public',
      target: 7_500,
      icon: '⚓',
    },
    {
      id: 'rooms:anchor-15000',
      title: 'Room Anchor VI',
      description: 'Spend 15,000 minutes in public rooms.',
      category: 'streaks',
      rarity: 'divine',
      visibility: 'public',
      target: 15_000,
      icon: '⚓',
    },
    {
      id: 'rooms:anchor-50000',
      title: 'Room Anchor VII',
      description: 'Spend 50,000 minutes in public rooms.',
      category: 'streaks',
      rarity: 'celestial',
      visibility: 'public',
      target: 50_000,
      icon: '⚓',
      hiddenTargetUntil: 'rooms:anchor-15000',
    },

    {
      id: 'shop:sell-burst-1000000',
      title: 'Sell Burst I',
      description: 'Earn 1,000,000 coins in a single sell-all.',
      category: 'shop',
      rarity: 'common',
      visibility: 'public',
      target: 1_000_000,
      icon: '💰',
    },
    {
      id: 'shop:sell-burst-5000000',
      title: 'Sell Burst II',
      description: 'Earn 5,000,000 coins in a single sell-all.',
      category: 'shop',
      rarity: 'uncommon',
      visibility: 'public',
      target: 5_000_000,
      icon: '💰',
    },
    {
      id: 'shop:sell-burst-50000000',
      title: 'Sell Burst III',
      description: 'Earn 50,000,000 coins in a single sell-all.',
      category: 'shop',
      rarity: 'rare',
      visibility: 'public',
      target: 50_000_000,
      icon: '💰',
    },
    {
      id: 'shop:sell-burst-250000000',
      title: 'Sell Burst IV',
      description: 'Earn 250,000,000 coins in a single sell-all.',
      category: 'shop',
      rarity: 'legendary',
      visibility: 'public',
      target: 250_000_000,
      icon: '💰',
    },
    {
      id: 'shop:sell-burst-1000000000',
      title: 'Sell Burst V',
      description: 'Earn 1,000,000,000 coins in a single sell-all.',
      category: 'shop',
      rarity: 'mythical',
      visibility: 'public',
      target: 1_000_000_000,
      icon: '💰',
    },
    {
      id: 'shop:sell-burst-1000000000000',
      title: 'Sell Burst VI',
      description: 'Earn 1,000,000,000,000 coins in a single sell-all.',
      category: 'shop',
      rarity: 'divine',
      visibility: 'public',
      target: 1_000_000_000_000,
      icon: '💰',
    },
    {
      id: 'shop:sell-burst-5000000000000',
      title: 'Sell Burst VII',
      description: 'Earn 5,000,000,000,000 coins in a single sell-all.',
      category: 'shop',
      rarity: 'celestial',
      visibility: 'public',
      target: 5_000_000_000_000,
      icon: '💰',
      hiddenTargetUntil: 'shop:sell-burst-1000000000000',
    },

    {
      id: 'garden:mutation-appraiser-10000000',
      title: 'Mutation Appraiser I',
      description: 'Track 10,000,000 coins of mutation value.',
      category: 'garden',
      rarity: 'common',
      visibility: 'public',
      target: 10_000_000,
      icon: '🧫',
    },
    {
      id: 'garden:mutation-appraiser-50000000',
      title: 'Mutation Appraiser II',
      description: 'Track 50,000,000 coins of mutation value.',
      category: 'garden',
      rarity: 'uncommon',
      visibility: 'public',
      target: 50_000_000,
      icon: '🧫',
    },
    {
      id: 'garden:mutation-appraiser-500000000',
      title: 'Mutation Appraiser III',
      description: 'Track 500,000,000 coins of mutation value.',
      category: 'garden',
      rarity: 'rare',
      visibility: 'public',
      target: 500_000_000,
      icon: '🧫',
    },
    {
      id: 'garden:mutation-appraiser-25000000000',
      title: 'Mutation Appraiser IV',
      description: 'Track 25,000,000,000 coins of mutation value.',
      category: 'garden',
      rarity: 'legendary',
      visibility: 'public',
      target: 25_000_000_000,
      icon: '🧫',
    },
    {
      id: 'garden:mutation-appraiser-100000000000',
      title: 'Mutation Appraiser V',
      description: 'Track 100,000,000,000 coins of mutation value.',
      category: 'garden',
      rarity: 'mythical',
      visibility: 'public',
      target: 100_000_000_000,
      icon: '🧫',
    },
    {
      id: 'garden:mutation-appraiser-500000000000',
      title: 'Mutation Appraiser VI',
      description: 'Track 500,000,000,000 coins of mutation value.',
      category: 'garden',
      rarity: 'divine',
      visibility: 'public',
      target: 500_000_000_000,
      icon: '🧫',
    },
    {
      id: 'garden:mutation-appraiser-1000000000000',
      title: 'Mutation Appraiser VII',
      description: 'Track 1,000,000,000,000 coins of mutation value.',
      category: 'garden',
      rarity: 'celestial',
      visibility: 'public',
      target: 1_000_000_000_000,
      icon: '🧫',
      hiddenTargetUntil: 'garden:mutation-appraiser-500000000000',
    },

    {
      id: 'garden:boosted-operation-100',
      title: 'Boosted Operation I',
      description: 'Track 100 crop boost procs.',
      category: 'garden',
      rarity: 'common',
      visibility: 'public',
      target: 100,
      icon: '⚙️',
    },
    {
      id: 'garden:boosted-operation-600',
      title: 'Boosted Operation II',
      description: 'Track 600 crop boost procs.',
      category: 'garden',
      rarity: 'uncommon',
      visibility: 'public',
      target: 600,
      icon: '⚙️',
    },
    {
      id: 'garden:boosted-operation-2000',
      title: 'Boosted Operation III',
      description: 'Track 2,000 crop boost procs.',
      category: 'garden',
      rarity: 'rare',
      visibility: 'public',
      target: 2_000,
      icon: '⚙️',
    },
    {
      id: 'garden:boosted-operation-6000',
      title: 'Boosted Operation IV',
      description: 'Track 6,000 crop boost procs.',
      category: 'garden',
      rarity: 'legendary',
      visibility: 'public',
      target: 6_000,
      icon: '⚙️',
    },
    {
      id: 'garden:boosted-operation-15000',
      title: 'Boosted Operation V',
      description: 'Track 15,000 crop boost procs.',
      category: 'garden',
      rarity: 'mythical',
      visibility: 'public',
      target: 15_000,
      icon: '⚙️',
    },
    {
      id: 'garden:boosted-operation-35000',
      title: 'Boosted Operation VI',
      description: 'Track 35,000 crop boost procs.',
      category: 'garden',
      rarity: 'divine',
      visibility: 'public',
      target: 35_000,
      icon: '⚙️',
    },
    {
      id: 'garden:boosted-operation-100000',
      title: 'Boosted Operation VII',
      description: 'Track 100,000 crop boost procs.',
      category: 'garden',
      rarity: 'celestial',
      visibility: 'public',
      target: 100_000,
      icon: '⚙️',
      hiddenTargetUntil: 'garden:boosted-operation-35000',
    },

    {
      id: 'pets:chow-line-80',
      title: 'Pet Chow Line I',
      description: 'Use 80 instant feeds.',
      category: 'pets',
      rarity: 'common',
      visibility: 'public',
      target: 80,
      icon: '🍖',
    },
    {
      id: 'pets:chow-line-240',
      title: 'Pet Chow Line II',
      description: 'Use 240 instant feeds.',
      category: 'pets',
      rarity: 'uncommon',
      visibility: 'public',
      target: 240,
      icon: '🍖',
    },
    {
      id: 'pets:chow-line-720',
      title: 'Pet Chow Line III',
      description: 'Use 720 instant feeds.',
      category: 'pets',
      rarity: 'rare',
      visibility: 'public',
      target: 720,
      icon: '🍖',
    },
    {
      id: 'pets:chow-line-1850',
      title: 'Pet Chow Line IV',
      description: 'Use 1,850 instant feeds.',
      category: 'pets',
      rarity: 'legendary',
      visibility: 'public',
      target: 1_850,
      icon: '🍖',
    },
    {
      id: 'pets:chow-line-5000',
      title: 'Pet Chow Line V',
      description: 'Use 5,000 instant feeds.',
      category: 'pets',
      rarity: 'mythical',
      visibility: 'public',
      target: 5_000,
      icon: '🍖',
    },
    {
      id: 'pets:chow-line-15000',
      title: 'Pet Chow Line VI',
      description: 'Use 15,000 instant feeds.',
      category: 'pets',
      rarity: 'divine',
      visibility: 'public',
      target: 15_000,
      icon: '🍖',
    },
    {
      id: 'pets:chow-line-50000',
      title: 'Pet Chow Line VII',
      description: 'Use 50,000 instant feeds.',
      category: 'pets',
      rarity: 'celestial',
      visibility: 'public',
      target: 50_000,
      icon: '🍖',
      hiddenTargetUntil: 'pets:chow-line-15000',
    },

    {
      id: 'weather:dawnsmith-10',
      title: 'Dawnsmith I',
      description: 'Harvest 10 crops during Dawn moon.',
      category: 'weather',
      rarity: 'common',
      visibility: 'public',
      target: 10,
      icon: '🌅',
    },
    {
      id: 'weather:dawnsmith-40',
      title: 'Dawnsmith II',
      description: 'Harvest 40 crops during Dawn moon.',
      category: 'weather',
      rarity: 'uncommon',
      visibility: 'public',
      target: 40,
      icon: '🌅',
    },
    {
      id: 'weather:dawnsmith-250',
      title: 'Dawnsmith III',
      description: 'Harvest 250 crops during Dawn moon.',
      category: 'weather',
      rarity: 'rare',
      visibility: 'public',
      target: 250,
      icon: '🌅',
    },
    {
      id: 'weather:dawnsmith-1000',
      title: 'Dawnsmith IV',
      description: 'Harvest 1,000 crops during Dawn moon.',
      category: 'weather',
      rarity: 'legendary',
      visibility: 'public',
      target: 1_000,
      icon: '🌅',
    },
    {
      id: 'weather:dawnsmith-5000',
      title: 'Dawnsmith V',
      description: 'Harvest 5,000 crops during Dawn moon.',
      category: 'weather',
      rarity: 'mythical',
      visibility: 'public',
      target: 5_000,
      icon: '🌅',
    },
    {
      id: 'weather:dawnsmith-12000',
      title: 'Dawnsmith VI',
      description: 'Harvest 12,000 crops during Dawn moon.',
      category: 'weather',
      rarity: 'divine',
      visibility: 'public',
      target: 12_000,
      icon: '🌅',
    },
    {
      id: 'weather:dawnsmith-250000',
      title: 'Dawnsmith VII',
      description: 'Harvest 250,000 crops during Dawn moon.',
      category: 'weather',
      rarity: 'celestial',
      visibility: 'public',
      target: 250_000,
      icon: '🌅',
      hiddenTargetUntil: 'weather:dawnsmith-12000',
    },

    {
      id: 'weather:amberforge-10',
      title: 'Amberforge I',
      description: 'Harvest 10 crops during Amber moon.',
      category: 'weather',
      rarity: 'common',
      visibility: 'public',
      target: 10,
      icon: '🟠',
    },
    {
      id: 'weather:amberforge-40',
      title: 'Amberforge II',
      description: 'Harvest 40 crops during Amber moon.',
      category: 'weather',
      rarity: 'uncommon',
      visibility: 'public',
      target: 40,
      icon: '🟠',
    },
    {
      id: 'weather:amberforge-250',
      title: 'Amberforge III',
      description: 'Harvest 250 crops during Amber moon.',
      category: 'weather',
      rarity: 'rare',
      visibility: 'public',
      target: 250,
      icon: '🟠',
    },
    {
      id: 'weather:amberforge-1000',
      title: 'Amberforge IV',
      description: 'Harvest 1,000 crops during Amber moon.',
      category: 'weather',
      rarity: 'legendary',
      visibility: 'public',
      target: 1_000,
      icon: '🟠',
    },
    {
      id: 'weather:amberforge-5000',
      title: 'Amberforge V',
      description: 'Harvest 5,000 crops during Amber moon.',
      category: 'weather',
      rarity: 'mythical',
      visibility: 'public',
      target: 5_000,
      icon: '🟠',
    },
    {
      id: 'weather:amberforge-12000',
      title: 'Amberforge VI',
      description: 'Harvest 12,000 crops during Amber moon.',
      category: 'weather',
      rarity: 'divine',
      visibility: 'public',
      target: 12_000,
      icon: '🟠',
    },
    {
      id: 'weather:amberforge-250000',
      title: 'Amberforge VII',
      description: 'Harvest 250,000 crops during Amber moon.',
      category: 'weather',
      rarity: 'celestial',
      visibility: 'public',
      target: 250_000,
      icon: '🟠',
      hiddenTargetUntil: 'weather:amberforge-12000',
    },

    {
      id: 'weather:fresh-freeze-harvest-10',
      title: 'Fresh Freeze I',
      description: 'Harvest 10 Frozen variants during snow.',
      category: 'weather',
      rarity: 'common',
      visibility: 'public',
      target: 10,
      icon: '🧊',
    },
    {
      id: 'weather:fresh-freeze-harvest-40',
      title: 'Fresh Freeze II',
      description: 'Harvest 40 Frozen variants during snow.',
      category: 'weather',
      rarity: 'uncommon',
      visibility: 'public',
      target: 40,
      icon: '🧊',
    },
    {
      id: 'weather:fresh-freeze-harvest-250',
      title: 'Fresh Freeze III',
      description: 'Harvest 250 Frozen variants during snow.',
      category: 'weather',
      rarity: 'rare',
      visibility: 'public',
      target: 250,
      icon: '🧊',
    },
    {
      id: 'weather:fresh-freeze-harvest-1000',
      title: 'Fresh Freeze IV',
      description: 'Harvest 1,000 Frozen variants during snow.',
      category: 'weather',
      rarity: 'legendary',
      visibility: 'public',
      target: 1_000,
      icon: '🧊',
    },
    {
      id: 'weather:fresh-freeze-harvest-5000',
      title: 'Fresh Freeze V',
      description: 'Harvest 5,000 Frozen variants during snow.',
      category: 'weather',
      rarity: 'mythical',
      visibility: 'public',
      target: 5_000,
      icon: '🧊',
    },
    {
      id: 'weather:fresh-freeze-harvest-12000',
      title: 'Fresh Freeze VI',
      description: 'Harvest 12,000 Frozen variants during snow.',
      category: 'weather',
      rarity: 'divine',
      visibility: 'public',
      target: 12_000,
      icon: '🧊',
    },
    {
      id: 'weather:fresh-freeze-harvest-250000',
      title: 'Fresh Freeze VII',
      description: 'Harvest 250,000 Frozen variants during snow.',
      category: 'weather',
      rarity: 'celestial',
      visibility: 'public',
      target: 250_000,
      icon: '🧊',
      hiddenTargetUntil: 'weather:fresh-freeze-harvest-12000',
    },

    // New one-time achievements
    {
      id: 'onetime:first-contact',
      title: 'First Contact',
      description: 'Join your first public room session.',
      category: 'streaks',
      rarity: 'common',
      visibility: 'public',
      target: 1,
      icon: '🛰️',
      oneTime: true,
    },
    {
      id: 'onetime:marathoner',
      title: 'Marathoner',
      description: 'Stay in a single room session for 60 minutes.',
      category: 'streaks',
      rarity: 'rare',
      visibility: 'public',
      target: 60,
      icon: '⏳',
      oneTime: true,
    },
    {
      id: 'onetime:market-buzz-25000000',
      title: 'Market Buzz',
      description: 'Earn 25,000,000 coins in a single sell-all.',
      category: 'shop',
      rarity: 'legendary',
      visibility: 'public',
      target: 25_000_000,
      icon: '📈',
      oneTime: true,
    },
    {
      id: 'onetime:market-shock-250000000000',
      title: 'Market Shock',
      description: 'Earn 250,000,000,000 coins in a single sell-all.',
      category: 'shop',
      rarity: 'mythical',
      visibility: 'public',
      target: 250_000_000_000,
      icon: '📉',
      oneTime: true,
    },
    {
      id: 'onetime:perfect-storm',
      title: 'Perfect Storm',
      description: 'Log three different weather events in one hour.',
      category: 'weather',
      rarity: 'legendary',
      visibility: 'public',
      target: 3,
      icon: '🌪️',
      oneTime: true,
      tags: ['window'],
    },
    {
      id: 'onetime:rainbow-weather',
      title: 'Rainbow Weather',
      description: 'Trigger a rainbow pet ability during rain or snow.',
      category: 'abilities',
      rarity: 'legendary',
      visibility: 'public',
      target: 1,
      icon: '🌈',
      oneTime: true,
    },
    {
      id: 'onetime:goldsmith',
      title: 'Goldsmith',
      description: 'Trigger a gold pet ability during Dawn moon.',
      category: 'abilities',
      rarity: 'legendary',
      visibility: 'public',
      target: 1,
      icon: '🥇',
      oneTime: true,
    },
    {
      id: 'onetime:crystal-clear',
      title: 'Crystal Clear',
      description: 'Harvest a Frozen variant while snow is active.',
      category: 'weather',
      rarity: 'rare',
      visibility: 'public',
      target: 1,
      icon: '🔮',
      oneTime: true,
    },
    {
      id: 'onetime:quiet-profit-50000000',
      title: 'Quiet Profit',
      description: 'Earn 50,000,000 coins from a sell-all while alone in a room.',
      category: 'shop',
      rarity: 'legendary',
      visibility: 'public',
      target: 50_000_000,
      icon: '🤫',
      oneTime: true,
    },
    {
      id: 'onetime:dawn-double',
      title: 'Dawn Double',
      description: 'Hatch a rainbow pet and harvest a max-size crop during the same Dawn moon.',
      category: 'weather',
      rarity: 'mythical',
      visibility: 'public',
      target: 1,
      icon: '🌅',
      oneTime: true,
      tags: ['window'],
    },
    {
      id: 'onetime:amber-artisan',
      title: 'Amber Artisan',
      description: 'Hatch a gold pet and sell 100,000,000+ coins in one action during the same Amber moon.',
      category: 'weather',
      rarity: 'mythical',
      visibility: 'public',
      target: 1,
      icon: '🟠',
      oneTime: true,
      tags: ['window'],
    },
  ];
}

export function getAchievementDefinitions(): AchievementDefinition[] {
  ensureDefinitions();
    return [...state.definitions];
}

export function getAchievementProgress(): Map<string, AchievementProgress> {
  return new Map(state.progress);
  }

export function subscribeToAchievements(cb: (progress: Map<string, AchievementProgress>) => void): () => void {
  listeners.add(cb);
    cb(getAchievementProgress());
  return () => listeners.delete(cb);
}

export function getAchievementSnapshot(): AchievementSnapshot | null {
  return state.lastSnapshot ? { ...state.lastSnapshot } : null;
  }

async function buildSnapshot(): Promise<AchievementSnapshot> {
  const snapshotNow = Date.now();
  const stats = getStatsSnapshot();
    const invItems = getInventoryItems();

  let coinBalance: number | null = null;
  let lastCurrencyTransaction: unknown = null;
  let cropEarnings: number | null = null;
  let petEarnings: number | null = null;
  let inventoryValue: number | null = null;
  const weatherTriggers: Record<string, number> = {};
  let maxSeedsOfSingleType: number | null = null;
  let rainbowOwnedCount: number | null = null;
  const abilityCounts: Record<string, number> = {};
  const abilityLastProc: Record<string, number | null> = {};
  let boostPetsActive: number | null = null;
  let abilityUnique5m: number | null = null;
  let abilityUnique30s: number | null = null;
  let mutationEvents30m: number | null = null;
  let mutatedHarvests: number | null = null;
  let weatherSeenKinds: Set<string> | null = null;
  let activePetsWithFourAbilities: number | null = null;
  let weatherEventsLastHour: number | null = null;
  let roomJoinCountSnap: number | null = null;
  let roomMinutesSnap: number | null = null;
  let lastRoomPlayersSnap: number | null = null;
  let sellBurstCoinsSnap: number | null = null;
  let sellBurstAloneSnap: boolean | null = null;
  let instantFeedsUsedSnap: number | null = null;

  try {
    const coinAtom = getAtomByLabel('myCoinsCountAtom');
    if (coinAtom) {
      const value = await readAtomValue<number>(coinAtom);
      coinBalance = typeof value === 'number' ? value : Number(value ?? NaN);
      if (!Number.isFinite(coinBalance)) {
        coinBalance = null;
      }
    }
  } catch (error) {
    log('⚠️ Achievements: coin balance snapshot failed', error);
  }

  try {
    // Attempt to read inventory valuation if exposed by Aries or game stats
    const valueAtom = getAtomByLabel('inventoryValueAtom');
    if (valueAtom) {
      const v = await readAtomValue<number>(valueAtom);
      if (Number.isFinite(v)) inventoryValue = v;
    }
    if (inventoryValue == null && stats?.shop) {
      const picked = pickNumber(stats.shop, [
        'inventoryValue',
        'inventoryWorth',
        ['inventory', 'value'],
        ['inventory', 'worth'],
        ['inventory', 'total'],
        ['inventory', 'coins'],
        ['inventory', 'netWorth'],
      ]);
      if (picked != null) inventoryValue = picked;
    }
    if (inventoryValue == null) {
      const computeFromItems = (items: typeof invItems): number | null => {
        let total = 0;
        let counted = false;
        const valueKeys: Array<string | string[]> = [
          'value',
          'worth',
          'price',
          'sellValue',
          'sellPrice',
          'coinValue',
          ['sell', 'value'],
          ['sale', 'value'],
        ];
        for (const item of items) {
          const qty = Number(item.quantity ?? item.count ?? item.amount ?? item.stackSize ?? 0);
          if (!Number.isFinite(qty) || qty <= 0) continue;
          const value = pickNumber(item, valueKeys) ?? pickNumber(item.raw, valueKeys);
          if (value != null && value > 0) {
            counted = true;
            total += value * qty;
          }
        }
        return counted ? total : null;
      };

      const derived = computeFromItems(invItems);
      if (derived != null) inventoryValue = derived;
    }
  } catch (error) {
    log('⚠️ Achievements: inventory value snapshot failed', error);
  }

  try {
    const computeMaxSeeds = (items: typeof invItems): number | null => {
      let max: number | null = null;

      const isSeedItem = (item: typeof invItems[number]): boolean => {
        const raw = (item as any)?.raw ?? {};
        const textCandidates: Array<unknown> = [
          item.itemType,
          item.name,
          item.displayName,
          item.id,
          item.species,
          raw.itemType,
          raw.type,
          raw.category,
          raw.subType,
          raw.itemCategory,
          raw.itemSubType,
          raw.kind,
        ];

        const hasSeedText = textCandidates.some((field) => `${field ?? ''}`.toLowerCase().includes('seed'));
        if (hasSeedText) return true;

        const tagCandidates: Array<unknown> = [raw.tags, raw.tagList, raw.itemTags, raw.labels];
        for (const candidate of tagCandidates) {
          if (Array.isArray(candidate) && candidate.some((tag) => `${tag ?? ''}`.toLowerCase().includes('seed'))) {
            return true;
          }
        }

        return raw.isSeed === true;
      };

      const pickQty = (item: any): number | null => {
        const raw = item?.raw ?? {};
        const candidates: Array<unknown> = [
          item.quantity,
          item.count,
          item.amount,
          item.stackSize,
          item.qty,
          item.owned,
          item.quantityOwned,
          raw.quantity,
          raw.count,
          raw.amount,
          raw.stackSize,
          raw.qty,
          raw.owned,
          raw.quantityOwned,
        ];
        for (const c of candidates) {
          const n = Number(c);
          if (Number.isFinite(n) && n > 0) return n;
        }
        return null;
      };

      for (const item of items) {
        if (!isSeedItem(item)) continue;
        const qty = pickQty(item);
        if (!Number.isFinite(qty) || (qty as number) <= 0) continue;
        max = max == null ? (qty as number) : Math.max(max, qty as number);
      }
      return max;
    };

    // Prefer a direct read of crop inventory (if available), then fall back to cached inventory
    const directInventory = await readInventoryDirect();
    const directMax = computeMaxSeeds(directInventory?.items ?? []);
    const cachedMax = computeMaxSeeds(invItems);
    const picked = [directMax, cachedMax].filter((v): v is number => Number.isFinite(v as number));
    if (picked.length) {
      maxSeedsOfSingleType = Math.max(...picked);
    }
  } catch (error) {
    log('⚠️ Achievements: seed stack scan failed', error);
  }

  try {
    const abilityHistory = getAbilityHistorySnapshot();
    const now = snapshotNow;
    const abilityEvents: Array<{ abilityId: string; performedAt: number }> = [];
    const mutationAbilityIds = new Set(['GoldGranter', 'RainbowGranter', 'ProduceScaleBoost', 'ProduceScaleBoostII']);
    abilityHistory.forEach((history) => {
      const { abilityId, events, lastPerformedAt } = history;
      abilityCounts[abilityId] = (abilityCounts[abilityId] ?? 0) + events.length;
      const last = events.length ? Math.max(...events.map((e) => e.performedAt)) : lastPerformedAt ?? null;
      const prev = abilityLastProc[abilityId];
      abilityLastProc[abilityId] = prev == null ? last : Math.max(prev, last ?? 0);

      events.forEach((event) => {
        if (!event) return;
        const performedAt = Number(event.performedAt ?? 0);
        if (!Number.isFinite(performedAt) || performedAt <= 0) return;
        abilityEvents.push({ abilityId, performedAt });
      });
    });

    if (abilityEvents.length) {
      const cutoff5m = now - 5 * 60 * 1000;
      const cutoff30s = now - 30 * 1000;
      const cutoff30m = now - 30 * 60 * 1000;

      const unique5m = new Set<string>();
      const unique30s = new Set<string>();
      let mutationWindowCount = 0;

      abilityEvents.forEach(({ abilityId, performedAt }) => {
        if (performedAt >= cutoff5m) unique5m.add(abilityId);
        if (performedAt >= cutoff30s) unique30s.add(abilityId);
        if (performedAt >= cutoff30m && mutationAbilityIds.has(abilityId)) {
          mutationWindowCount += 1;
        }
      });

      abilityUnique5m = unique5m.size;
      abilityUnique30s = unique30s.size;
      mutationEvents30m = mutationWindowCount;
    }

    // Aries backfill (if available) for up to 500 logged events
    if (Object.keys(abilityCounts).length === 0) {
      const petsService = (pageWindow as any)?.AriesMod?.services?.PetsService;
      if (petsService && typeof petsService.getAbilityLogs === 'function') {
        try {
          const logs = await petsService.getAbilityLogs();
          if (Array.isArray(logs)) {
            logs.forEach((entry: any) => {
              const abilityId = String(entry?.abilityId ?? entry?.id ?? '').trim();
              const performedAt = Number(entry?.performedAt ?? entry?.timestamp ?? entry?.createdAt ?? 0);
              if (!abilityId) return;
              if (!Number.isFinite(performedAt) || performedAt <= 0) return;
              abilityCounts[abilityId] = (abilityCounts[abilityId] ?? 0) + 1;
              const prev = abilityLastProc[abilityId];
              abilityLastProc[abilityId] = prev == null ? performedAt : Math.max(prev, performedAt);
            });
          }
        } catch (error) {
          log('⚠️ Achievements: Aries ability log backfill failed', error);
        }
      }
    }
  } catch (error) {
    log('⚠️ Achievements: ability history scan failed', error);
  }

  try {
    const extractPetEntriesFromValue = (value: any): any[] => {
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
    };

    const readPetAtomEntries = async (label: string): Promise<any[]> => {
      const atom = getAtomByLabel(label);
      if (!atom) return [];
      try {
        const value = await readAtomValue<any>(atom);
        return extractPetEntriesFromValue(value);
      } catch (error) {
        log(`⚠️ Achievements: failed to read ${label} for rainbow count`, error);
        return [];
      }
    };

    const collectPetEntries = async (): Promise<any[]> => {
      let entries: any[] = [];
      const labels = ['myPetInventoryAtom', 'myPetHutchPetItemsAtom'];
      for (const label of labels) {
        entries.push(...await readPetAtomEntries(label));
      }

      if (!entries.length) {
        try {
          const candidates = findAtomsByLabel(/pet|hutch/i);
          for (const atom of candidates) {
            try {
              const val = await readAtomValue(atom);
              entries.push(...extractPetEntriesFromValue(val));
            } catch {}
          }
        } catch {}
      }

      if (!entries.length) {
        // Fallback: use cached inventory items
        for (const item of invItems) {
          const raw = (item as any)?.raw ?? item;
          const type = String(raw?.itemType ?? raw?.type ?? '').toLowerCase();
          if (type.includes('pet') || raw?.petSpecies || raw?.species) {
            entries.push(raw);
          }
        }
      }
      return entries;
    };

    const isRainbowPet = (item: any): boolean => {
      const raw = (item as any)?.raw ?? item ?? {};
      const textFields: Array<unknown> = [
        item.rarity,
        item.petRarity,
        item.rarityName,
        item.quality,
        item.variant,
        item.mutation,
        item.name,
        item.petVariant,
        raw.rarity,
        raw.petRarity,
        raw.rarityName,
        raw.quality,
        raw.variant,
        raw.mutation,
        raw.name,
      ];
      if (textFields.some((field) => `${field ?? ''}`.toLowerCase().includes('rainbow'))) return true;
      const muts: unknown[] = [];
      if (Array.isArray(item?.mutations)) muts.push(...item.mutations);
      if (Array.isArray(raw?.mutations)) muts.push(...raw.mutations);
      if (Array.isArray(raw?.pet?.mutations)) muts.push(...raw.pet.mutations);
      if (muts.some(m => `${m ?? ''}`.toLowerCase().includes('rainbow'))) return true;
      return (item as any)?.isRainbow === true || raw.isRainbow === true;
    };

    const countRainbow = (entries: any[]): number => {
      let count = 0;
      const seen = new Set<string>();
      entries.forEach((entry, idx) => {
        if (!entry) return;
        if (!isRainbowPet(entry)) return;
        const key = String(entry.id ?? entry.itemId ?? entry.petId ?? `${entry.petSpecies ?? entry.species ?? 'pet'}:${idx}`);
        if (seen.has(key)) return;
        seen.add(key);
        count += 1;
      });
      return count;
    };

    const entries = await collectPetEntries();
    const counted = countRainbow(entries);
    if (Number.isFinite(counted)) {
      rainbowOwnedCount = counted;
    }
  } catch (error) {
    log('⚠️ Achievements: rainbow ownership scan failed', error);
  }

  try {
    const activePets = getActivePetInfos();
    if (activePets?.length) {
      const boostCount = activePets.filter((pet) => pet.abilities?.some((a) => a === 'ProduceScaleBoost' || a === 'ProduceScaleBoostII')).length;
      boostPetsActive = boostCount;

      const countFourAbilities = activePets.filter((pet) => Array.isArray(pet.abilities) && pet.abilities.length >= 4).length;
      if (countFourAbilities > 0) {
        activePetsWithFourAbilities = countFourAbilities;
      }
    }
  } catch (error) {
    log('⚠️ Achievements: boost pet scan failed', error);
  }

  try {
    const txnAtom = getAtomByLabel('lastCurrencyTransactionAtom');
    if (txnAtom) {
      lastCurrencyTransaction = await readAtomValue<unknown>(txnAtom);
    }
  } catch (error) {
    log('⚠️ Achievements: transaction snapshot failed', error);
  }

  let journalProduceCompletion: number | null = null;
  let journalPetCompletion: number | null = null;
  let journalProduceCompleted: number | null = null;
  let journalProduceTotal: number | null = null;
  let journalPetCompleted: number | null = null;
  let journalPetTotal: number | null = null;
  let journalProduceSpeciesCompleted: number | null = null;
  let journalPetSpeciesCompleted: number | null = null;
  let journalProduceMaxWeightCompleted: number | null = null;
  try {
    // Prefer journal checker tracker (variant-based) for progress; fall back to raw journal entries
    const trackerStats = await getJournalStats();
    if (trackerStats) {
      journalProduceCompleted = Math.round(trackerStats.produce.collected);
      journalProduceTotal = Math.round(trackerStats.produce.total);
      journalProduceCompletion = Math.round(trackerStats.produce.percentage);

      journalPetCompleted = Math.round(trackerStats.petVariants.collected);
      journalPetTotal = Math.round(trackerStats.petVariants.total);
      journalPetCompletion = Math.round(trackerStats.petVariants.percentage);
    } else {
      const journal = await getJournal();
      if (journal?.produce) {
        const produceEntries = Object.values(journal.produce);
        if (produceEntries.length) {
          const completed = produceEntries.filter((p: any) => p?.completion === 100).length;
          journalProduceCompleted = completed;
          journalProduceTotal = produceEntries.length;
          journalProduceCompletion = Math.round((completed / produceEntries.length) * 100);
        }
      }
      if (journal?.pets) {
        const petEntries = Object.values(journal.pets as any);
        if (petEntries.length) {
          const completed = petEntries.filter((p: any) => p?.completion === 100).length;
          journalPetCompleted = completed;
          journalPetTotal = petEntries.length;
          journalPetCompletion = Math.round((completed / petEntries.length) * 100);
        }
      }
    }

    try {
      const summary = await getJournalSummary();
      if (summary?.produce?.length) {
        let fullProduce = 0;
        let maxWeightCollected = 0;
        summary.produce.forEach((entry) => {
          const collectedAll = entry.variants.every((variant) => variant.collected);
          if (collectedAll) fullProduce += 1;
          const hasMaxWeight = entry.variants.some((variant) => variant.collected && /max\s*weight/i.test(variant.variant));
          if (hasMaxWeight) maxWeightCollected += 1;
        });
        journalProduceSpeciesCompleted = fullProduce;
        journalProduceMaxWeightCompleted = maxWeightCollected;
      }
      if (summary?.pets?.length) {
        let fullPets = 0;
        summary.pets.forEach((entry) => {
          const collectedAll = entry.variants.every((variant) => variant.collected);
          if (collectedAll) fullPets += 1;
        });
        journalPetSpeciesCompleted = fullPets;
      }
    } catch (error) {
      log('⚠️ Achievements: journal summary scan failed', error);
    }
  } catch (error) {
    log('⚠️ Achievements: journal snapshot failed', error);
  }

  const applyExternalStats = (source: any) => {
    if (!source || typeof source !== 'object' || !stats) return;
    const root = (source as any).player ?? source;
    const g = (root as any).garden ?? (root as any).plants ?? (root as any).farm ?? root;
    const p = (root as any).pets ?? root;
    const a = (root as any).abilities ?? (root as any).abilityStats ?? root;
    const s = (root as any).shop ?? (root as any).shops ?? (root as any).economy ?? root;
    const w = (root as any).weather ?? root;

    // Prefer in-game stats (player) over Aries when both exist
    const player = (source as any).player;
    if (player && typeof player === 'object') {
      const plantedPlayer = pickNumber(player, ['numSeedsPlanted', 'numPlantsPotted']);
      if (plantedPlayer != null && plantedPlayer > stats.garden.totalPlanted) stats.garden.totalPlanted = plantedPlayer;
      const harvestedPlayer = pickNumber(player, ['numCropsHarvested']);
      if (harvestedPlayer != null && harvestedPlayer > stats.garden.totalHarvested) stats.garden.totalHarvested = harvestedPlayer;
      const wateredPlayer = pickNumber(player, ['numPlantsWatered']);
      if (wateredPlayer != null && wateredPlayer > stats.garden.totalWateringCans) stats.garden.totalWateringCans = wateredPlayer;
      const destroyedPlayer = pickNumber(player, ['numPlantsDestroyed']);
      if (destroyedPlayer != null && destroyedPlayer > stats.garden.totalDestroyed) stats.garden.totalDestroyed = destroyedPlayer;

      const hatchedPlayer = pickNumber(player, ['numEggsHatched']);
      if (hatchedPlayer != null && hatchedPlayer > stats.pets.totalHatched) stats.pets.totalHatched = hatchedPlayer;
      const rainbowPlayer = pickNumber(player, ['numRainbowPetsHatched', ['rarity', 'rainbow']]);
      if (rainbowPlayer != null && rainbowPlayer > stats.pets.hatchedByRarity.rainbow) stats.pets.hatchedByRarity.rainbow = rainbowPlayer;

      const cropsEarnPlayer = pickNumber(player, ['totalEarningsSellCrops']);
      if (cropsEarnPlayer != null) cropEarnings = cropsEarnPlayer;
      const petEarnPlayer = pickNumber(player, ['totalEarningsSellPet']);
      if (petEarnPlayer != null) petEarnings = petEarnPlayer;
    }

    // Garden
    const planted = pickNumber(g, ['seedsPlanted', 'totalPlanted', 'planted', ['stats', 'planted'], 'totalSeedsPlanted']);
    if (planted != null && planted > stats.garden.totalPlanted) stats.garden.totalPlanted = planted;
    const harvested = pickNumber(g, ['cropsHarvested', 'totalHarvested', 'harvested', ['stats', 'harvested'], 'totalCropsHarvested']);
    if (harvested != null && harvested > stats.garden.totalHarvested) stats.garden.totalHarvested = harvested;
    const watered = pickNumber(g, ['plantsWatered', 'totalWateringCans', 'watered', ['stats', 'watered'], 'wateringCansUsed', 'watercanUsed']);
    if (watered != null && watered > stats.garden.totalWateringCans) stats.garden.totalWateringCans = watered;
    const destroyed = pickNumber(g, ['plantsDestroyed', 'totalDestroyed', 'destroyed']);
    if (destroyed != null && destroyed > stats.garden.totalDestroyed) stats.garden.totalDestroyed = destroyed;

    // Pets
    const hatched = pickNumber(p, ['eggsHatched', 'totalHatched', 'hatched', 'petsHatched']);
    if (hatched != null && hatched > stats.pets.totalHatched) stats.pets.totalHatched = hatched;
    const gold = pickNumber(p, ['gold', 'hatchedGold', 'goldPets', ['rarity', 'gold']]);
    if (gold != null && gold > stats.pets.hatchedByRarity.gold) stats.pets.hatchedByRarity.gold = gold;
    const hatchedByType = (p as any).hatchedByType;
    if (hatchedByType && typeof hatchedByType === 'object') {
      let totalHatched = stats.pets.totalHatched;
      let totalGold = stats.pets.hatchedByRarity.gold;
      let totalRainbow = stats.pets.hatchedByRarity.rainbow;
      for (const value of Object.values(hatchedByType as Record<string, any>)) {
        if (!value || typeof value !== 'object') continue;
        const n = Number((value as any).normal ?? 0);
        const gVal = Number((value as any).gold ?? 0);
        const r = Number((value as any).rainbow ?? 0);
        if (Number.isFinite(n)) totalHatched += n;
        if (Number.isFinite(gVal)) {
          totalHatched += gVal;
          totalGold += gVal;
        }
        if (Number.isFinite(r)) {
          totalHatched += r;
          totalRainbow += r;
        }
      }
      if (totalHatched > stats.pets.totalHatched) stats.pets.totalHatched = totalHatched;
      if (totalGold > stats.pets.hatchedByRarity.gold) stats.pets.hatchedByRarity.gold = totalGold;
      if (totalRainbow > stats.pets.hatchedByRarity.rainbow) stats.pets.hatchedByRarity.rainbow = totalRainbow;
    }

    // Abilities
    const procs = (() => {
      const direct = pickNumber(a, ['totalProcs', 'procs', 'abilityProcs', ['stats', 'procs']]);
      if (direct != null) return direct;
      const triggers = (a as any).triggers ?? (a as any).triggerCounts ?? (a as any).abilityTriggers ?? a;
      if (triggers && typeof triggers === 'object') {
        let sum = 0;
        let totalValue = 0;
        for (const value of Object.values(triggers as Record<string, unknown>)) {
          if (value && typeof value === 'object' && 'triggers' in (value as any)) {
            const t = Number((value as any).triggers);
            const tv = Number((value as any).totalValue ?? 0);
            if (Number.isFinite(t)) sum += t;
            if (Number.isFinite(tv)) totalValue += tv;
          }
        }
        if (totalValue > stats.abilities.totalEstimatedValue) {
          stats.abilities.totalEstimatedValue = totalValue;
        }
        return sum > 0 ? sum : null;
      }
      return null;
    })();
    if (procs != null && procs > stats.abilities.totalProcs) stats.abilities.totalProcs = procs;

    // Shop / economy
    const spentCoins = pickNumber(s, [
      'totalSpentCoins',
      'coinsSpent',
      'spentCoins',
      'totalCoinsSpent',
      'totalCoinsUsed',
      'coinsUsed',
      'spendCoins',
      'spent',
      ['spend', 'coins'],
      ['coins', 'spent'],
    ]);
    if (spentCoins != null && spentCoins > stats.shop.totalSpentCoins) stats.shop.totalSpentCoins = spentCoins;
    if (player && typeof player === 'object') {
      const spentPlayer = pickNumber(player, ['coinsSpent', 'totalCoinsSpent', 'totalSpentCoins']);
      if (spentPlayer != null && spentPlayer > stats.shop.totalSpentCoins) stats.shop.totalSpentCoins = spentPlayer;
    }

    const cropEarn = pickNumber(s, [
      'cropEarnings',
      'cropsEarned',
      'coinsFromCrops',
      'coinsEarnedFromCrops',
      'totalCropEarnings',
      'cropCoinsEarned',
      ['cropsSold', 'coins'],
      ['cropsSold', 'value'],
      ['cropsSold', 'total'],
      'cropsSoldValue',
      ['shop', 'totalSpentCoins'], // fallback to treat as spend if no earnings metric is present
    ]);
    if (cropEarn != null && cropEarnings == null) cropEarnings = cropEarn;
    const petEarn = pickNumber(s, ['petEarnings', 'coinsFromPets', 'coinsEarnedFromPets', 'petsSoldValue']);
    if (petEarn != null && petEarnings == null) petEarnings = petEarn;

    if (cropEarnings == null) {
      const cropsSoldCount = pickNumber(s, ['cropsSoldCount']);
      if (cropsSoldCount != null) {
        cropEarnings = cropsSoldCount;
      }
    }

    // Weather
    const swaps = pickNumber(w, ['totalSwaps', 'swaps', 'weatherSwaps']);
    if (swaps != null) {
      stats.weather.totalSwaps = swaps;
    }
    if (w && typeof w === 'object' && w !== root) {
      let sum = 0;
      for (const [key, value] of Object.entries(w as Record<string, unknown>)) {
        if (value && typeof value === 'object' && 'triggers' in (value as any)) {
          const t = Number((value as any).triggers);
          if (Number.isFinite(t)) {
            sum += t;
            weatherTriggers[key] = t;
          }
        }
      }
      if (sum > stats.weather.totalSwaps) stats.weather.totalSwaps = sum;
    }
  };

  // Best-effort merge from live stats atom if present, so existing player stats show immediately
  try {
    const liveStatsAtom = getAtomByLabel('myStatsAtom');
    if (liveStatsAtom && stats) {
      const live = await readAtomValue<any>(liveStatsAtom);
      applyExternalStats(live);
      if (!loggedLiveShape && live && typeof live === 'object') {
        loggedLiveShape = true;
        const keys = Object.keys(live);
        dbgAch('ℹ️ Achievements: myStatsAtom keys', keys);
        const sample = ['player', 'garden', 'plants', 'farm', 'pets', 'abilities', 'abilityStats', 'shop', 'economy', 'weather']
          .reduce<Record<string, unknown>>((acc, k) => {
            if (k in (live as any)) acc[k] = Object.keys((live as any)[k] || {});
            return acc;
          }, {});
        dbgAch('ℹ️ Achievements: myStatsAtom nested keys', sample);
        if (!loggedLivePlayer && (live as any).player) {
          loggedLivePlayer = true;
          const player = (live as any).player;
          dbgAch('ℹ️ Achievements: myStatsAtom player keys', Object.keys(player || {}));
          dbgAch('ℹ️ Achievements: myStatsAtom player sample', Object.fromEntries(Object.entries(player || {}).slice(0, 5)));
        }
      }
    } else if (!liveStatsAtom) {
      dbgAch('ℹ️ Achievements: myStatsAtom not found (skipping live stats overlay)');
    }
  } catch (error) {
    log('⚠️ Achievements: merge from live stats atom failed', error);
  }

  // Secondary source: Aries mod StatsService
  try {
    const ariesStats = await fetchAriesStats();
    if (ariesStats) {
      handleRoomSnapshot(ariesStats);
      applyExternalStats(ariesStats);
      if (!loggedAriesShape && ariesStats && typeof ariesStats === 'object') {
        loggedAriesShape = true;
        const keys = Object.keys(ariesStats);
        dbgAch('ℹ️ Achievements: Aries stats keys', keys);
        const sample = ['garden', 'plants', 'farm', 'pets', 'abilities', 'abilityStats', 'shop', 'economy', 'weather']
          .reduce<Record<string, unknown>>((acc, k) => {
            if (k in (ariesStats as any)) acc[k] = Object.keys((ariesStats as any)[k] || {});
            return acc;
          }, {});
        dbgAch('ℹ️ Achievements: Aries stats nested keys', sample);
        if (!loggedAriesSamples) {
          loggedAriesSamples = true;
          const pickSample = (obj: any, key: string) => {
            if (!obj || typeof obj !== 'object' || !(key in obj)) return undefined;
            const sub = (obj as any)[key];
            if (sub && typeof sub === 'object') {
              return Object.fromEntries(Object.entries(sub).slice(0, 5));
            }
            return sub;
          };
          dbgAch('ℹ️ Achievements: Aries garden sample', pickSample(ariesStats, 'garden'));
          dbgAch('ℹ️ Achievements: Aries pets sample', pickSample(ariesStats, 'pets'));
          dbgAch('ℹ️ Achievements: Aries abilities sample', pickSample(ariesStats, 'abilities'));
          dbgAch('ℹ️ Achievements: Aries shops sample', pickSample(ariesStats, 'shops'));
          dbgAch('ℹ️ Achievements: Aries weather sample', pickSample(ariesStats, 'weather'));
          if (!loggedAriesShops) {
            loggedAriesShops = true;
            if ((ariesStats as any).shops) {
              dbgAch('ℹ️ Achievements: Aries shops full', (ariesStats as any).shops);
            }
          }
        }
      }
    } else {
      dbgAch('ℹ️ Achievements: Aries StatsService not available');
    }
  } catch (error) {
    log('⚠️ Achievements: Aries stats merge failed', error);
  }

  try {
    if (stats?.weather?.timeByKind) {
      const seen = new Set<string>();
      Object.entries(stats.weather.timeByKind).forEach(([kind, value]) => {
        const n = Number(value ?? 0);
        if (Number.isFinite(n) && n > 0) {
          seen.add(kind.toLowerCase());
        }
      });
      const active = stats.weather.activeKind;
      if (active) seen.add(String(active).toLowerCase());
      weatherSeenKinds = seen;
    }
    if (stats?.weather?.activeKind) {
      logWeatherEvent(stats.weather.activeKind, snapshotNow);
    }
    pruneWeatherEvents(snapshotNow);
    if (weatherEvents.length) {
      const uniq = new Set(weatherEvents.map((evt) => evt.kind));
      weatherEventsLastHour = uniq.size;
    }
  } catch (error) {
    log('⚠️ Achievements: weather seen scan failed', error);
  }

  try {
    const mutationSummary = getMutationSummary();
    if (mutationSummary) {
      const primary = mutationSummary;
      const mutatedFromEligible = Math.max(0, (primary.overallTrackedPlantCount ?? 0) - (primary.overallEligiblePlantCount ?? 0));
      const mutatedFromLunar = Math.max(0, primary.lunar?.mutatedPlantCount ?? 0);
      const mutatedFromTotals = Math.max(mutatedFromEligible, mutatedFromLunar, primary.lunar?.mutatedFruitCount ?? 0);

      const candidates = [mutatedFromEligible, mutatedFromLunar, mutatedFromTotals].filter((v) => Number.isFinite(v));
      if (candidates.length) {
        mutatedHarvests = Math.max(...(candidates as number[]));
      }
    }
  } catch (error) {
    log('⚠️ Achievements: mutation summary scan failed', error);
  }

  const saleCounts = getSaleWindowCounts();

  roomJoinCountSnap = roomJoinCount;
  roomMinutesSnap = Math.floor(roomMinutes);
  lastRoomPlayersSnap = lastRoomPlayers || null;
  sellBurstCoinsSnap = sellBurstCoins || null;
  sellBurstAloneSnap = sellBurstAlone;
  instantFeedsUsedSnap = instantFeedsUsed || null;

  const snapshot: AchievementSnapshot = {
    stats,
    inventoryCount: invItems.length,
    inventoryValue,
    journalProduceCompletion,
    journalPetCompletion,
    journalProduceCompleted,
    journalProduceTotal,
    journalPetCompleted,
    journalPetTotal,
    journalProduceSpeciesCompleted,
    journalPetSpeciesCompleted,
    journalProduceMaxWeightCompleted,
    coinBalance,
    lastCurrencyTransaction,
    cropEarnings,
    petEarnings,
    weatherTriggers,
    maxSeedsOfSingleType,
    rainbowHatches: (() => {
      const statsRainbow = stats?.pets.hatchedByRarity.rainbow;
      const ownedRainbow = rainbowOwnedCount;
      if (ownedRainbow != null) return ownedRainbow;
      return statsRainbow ?? null;
    })(),
    abilityCounts,
    abilityLastProc,
    boostPetsActive,
    abilityUnique5m,
    abilityUnique30s,
    mutationEvents30m,
    mutatedHarvests,
    weatherSeenKinds,
    activePetsWithFourAbilities,
    saleUnique60s: saleCounts.unique60s,
    saleUnique10m: saleCounts.unique10m,
    roomJoinCount: roomJoinCountSnap,
    roomMinutes: roomMinutesSnap,
    lastRoomPlayers: lastRoomPlayersSnap,
    sellBurstCoins: sellBurstCoinsSnap,
    sellBurstAlone: sellBurstAloneSnap,
    instantFeedsUsed: instantFeedsUsedSnap,
    weatherEventsLastHour,
  };
  dbgAch('ℹ️ Achievements snapshot', {
    planted: stats.garden.totalPlanted,
    harvested: stats.garden.totalHarvested,
    watered: stats.garden.totalWateringCans,
    destroyed: stats.garden.totalDestroyed,
    hatched: stats.pets.totalHatched,
    goldHatched: stats.pets.hatchedByRarity.gold,
    procs: stats.abilities.totalProcs,
    abilityValue: stats.abilities.totalEstimatedValue,
    cropEarnings,
    petEarnings,
    weatherSwaps: stats.weather.totalSwaps,
    weatherTriggers,
  });
  state.lastSnapshot = snapshot;
  return snapshot;
}

function evaluate(defs: AchievementDefinition[], snap: AchievementSnapshot): void {
  const now = Date.now();
  const abilityCounts = snap.abilityCounts ?? {};
  const abilityLastProc = snap.abilityLastProc ?? {};
  const abilityUnique5m = snap.abilityUnique5m ?? 0;
  const abilityUnique30s = snap.abilityUnique30s ?? 0;
  const mutationEvents30m = snap.mutationEvents30m ?? 0;
  const mutatedHarvests = snap.mutatedHarvests ?? 0;
  const weatherSeen = snap.weatherSeenKinds ?? null;
  const activePetsWithFourAbilities = snap.activePetsWithFourAbilities ?? 0;
  const saleUnique60s = snap.saleUnique60s ?? 0;
  const saleUnique10m = snap.saleUnique10m ?? 0;
  const roomJoinCount = snap.roomJoinCount ?? 0;
  const roomMinutes = snap.roomMinutes ?? 0;
  const sellBurstCoins = snap.sellBurstCoins ?? 0;
  const sellBurstAlone = snap.sellBurstAlone ?? false;
  const instantFeedsUsed = snap.instantFeedsUsed ?? 0;
  const weatherEventsLastHour = snap.weatherEventsLastHour ?? 0;
  defs.forEach((def) => {
    const existing = state.progress.get(def.id) ?? {
      id: def.id,
      current: 0,
      target: typeof def.target === 'number' ? def.target : 0,
      completedAt: null,
      lastUpdated: now,
      ineligible: false,
    };

    let current = existing.current;
    const target = typeof def.target === 'number' ? def.target : 0;
    const wasCompleted = !!existing.completedAt;
    const isOneTime = !!def.oneTime;
    let ineligible = !!existing.ineligible;

    try {
      if (snap.stats) {
        const weatherByKind = snap.weatherTriggers ?? {};

        if (def.id.startsWith('garden:seedling-')) {
          current = snap.stats.garden.totalPlanted;
        } else if (def.id.startsWith('garden:harvester-')) {
          current = snap.stats.garden.totalHarvested;
        } else if (def.id.startsWith('garden:watering-')) {
          current = snap.stats.garden.totalWateringCans;
        } else if (def.id.startsWith('pets:hatchling-')) {
          current = snap.stats.pets.totalHatched;
        } else if (def.id.startsWith('pets:gold-')) {
          current = snap.stats.pets.hatchedByRarity.gold;
        } else if (def.id.startsWith('pets:rainbow-')) {
          current = snap.rainbowHatches ?? snap.stats.pets.hatchedByRarity.rainbow;
        } else if (def.id.startsWith('abilities:proc-')) {
          current = snap.stats.abilities.totalProcs;
        } else if (def.id.startsWith('economy:crop-earner-')) {
          current = snap.cropEarnings ?? existing.current;
        } else if (def.id.startsWith('weather:fresh-frozen-')) {
          current = weatherByKind.frost ?? 0;
        } else if (def.id.startsWith('weather:early-bird-')) {
          current = weatherByKind.dawn ?? 0;
        } else if (def.id.startsWith('weather:night-owl-')) {
          current = weatherByKind.ambermoon ?? 0;
        } else if (def.id === 'onetime:fire-sale') {
          current = saleUnique60s;
        } else if (def.id === 'onetime:market-maker') {
          current = saleUnique10m;
        } else if (def.id.startsWith('rooms:socialite-')) {
          current = roomJoinCount;
        } else if (def.id.startsWith('rooms:anchor-')) {
          current = roomMinutes;
        } else if (def.id.startsWith('shop:sell-burst-')) {
          current = sellBurstCoins;
        } else if (def.id === 'onetime:market-buzz-25000000' || def.id === 'onetime:market-shock-250000000000') {
          current = sellBurstCoins;
        } else if (def.id === 'onetime:quiet-profit-50000000') {
          current = sellBurstAlone ? sellBurstCoins : 0;
        } else if (def.id.startsWith('collection:produce-')) {
          current = snap.journalProduceCompleted ?? existing.current;
        } else if (def.id.startsWith('collection:pets-')) {
          current = snap.journalPetCompleted ?? existing.current;
        } else if (def.id.startsWith('garden:seed-hoarder-')) {
          current = snap.maxSeedsOfSingleType ?? 0;
        } else if (def.id === 'onetime:rich' || def.id === 'onetime:baller-status' || def.id === 'onetime:whos-bill-gates' || def.id === 'onetime:what-is-money' || def.id === 'onetime:what-is-grass') {
          current = snap.coinBalance ?? existing.current;
        } else if (def.id === 'onetime:god-tier-research') {
          const produceDone = snap.journalProduceCompleted != null && snap.journalProduceTotal != null && snap.journalProduceCompleted >= snap.journalProduceTotal;
          const petsDone = snap.journalPetCompleted != null && snap.journalPetTotal != null && snap.journalPetCompleted >= snap.journalPetTotal;
          current = produceDone && petsDone ? target : 0;
        } else if (def.id === 'onetime:money-cant-buy-happiness') {
          const totalHatched = snap.stats.pets.totalHatched;
          const cropsSoldValue = snap.cropEarnings ?? 0;
          const ineligibleNow = totalHatched >= 1_000 && cropsSoldValue >= 1_000_000_000;
          ineligible = ineligibleNow;
          if (ineligibleNow) {
            current = target;
          }
        } else if (def.id === 'onetime:perfect-produce') {
          const fullSpecies = snap.journalProduceSpeciesCompleted ?? 0;
          current = fullSpecies > 0 ? target : 0;
        } else if (def.id === 'onetime:perfect-symmetry') {
          const fullPets = snap.journalPetSpeciesCompleted ?? 0;
          current = fullPets > 0 ? target : 0;
        } else if (def.id === 'onetime:mutation-marathon') {
          current = mutationEvents30m;
        } else if (def.id === 'onetime:all-weathered') {
          if (weatherSeen && weatherSeen.size > 0) {
            const hasDawn = Array.from(weatherSeen).some((kind) => kind.includes('dawn'));
            const hasAmber = Array.from(weatherSeen).some((kind) => kind.includes('amber'));
            const hasSnow = Array.from(weatherSeen).some((kind) => kind.includes('snow') || kind.includes('frost'));
            current = hasDawn && hasAmber && hasSnow ? target : 0;
          } else {
            current = existing.current;
          }
        } else if (def.id === 'onetime:triple-hatch') {
          current = existing.current;
        } else if (def.id === 'onetime:These-Exist!?') {
          current = activePetsWithFourAbilities > 0 ? target : 0;
        } else if (def.id === 'onetime:this-is-only-the-beginning') {
          current = abilityCounts['ProduceEater'] ?? 0;
          if (current > 0) current = target;
        } else if (def.id === 'onetime:yummy-crop-eater') {
          // Without crop rarity details in ability log payload, treat any Crop Eater proc as success for now.
          current = abilityCounts['ProduceEater'] ?? 0;
          if (current > 0) current = target;
        } else if (def.id === 'onetime:gamblers-fallacy') {
          const boostCount = snap.boostPetsActive ?? 0;
          const lastBoost = Math.max(
            abilityLastProc['ProduceScaleBoost'] ?? 0,
            abilityLastProc['ProduceScaleBoostII'] ?? 0,
          );
          const elapsed = lastBoost > 0 ? now - lastBoost : Number.POSITIVE_INFINITY;
          const twelveHours = 12 * 60 * 60 * 1000;
          current = boostCount >= 3 && elapsed >= twelveHours ? target : 0;
        } else if (def.id === 'onetime:ability-synergy') {
          current = abilityUnique5m;
        } else if (def.id === 'onetime:combo-caster') {
          current = abilityUnique30s;
        } else if (def.id === 'onetime:abilities:crit-crafter') {
          current = (abilityCounts['GoldGranter'] ?? 0) + (abilityCounts['RainbowGranter'] ?? 0);
        } else if (def.id.startsWith('pets:chow-line-')) {
          current = instantFeedsUsed;
        } else if (def.id.startsWith('garden:mutation-harvester-')) {
          current = mutatedHarvests;
        } else if (def.id.startsWith('garden:giant-grower-')) {
          current = snap.journalProduceMaxWeightCompleted ?? existing.current;
        } else if (def.id.startsWith('abilities:empowered-harvest-')) {
          current = (abilityCounts['GoldGranter'] ?? 0) + (abilityCounts['RainbowGranter'] ?? 0);
        } else if (def.id === 'onetime:perfect-storm') {
          current = weatherEventsLastHour;
        } else {
          current = existing.current;
        }
      }
    } catch (error) {
      log('⚠️ Achievements evaluate error', error);
    }

    const completedNow = !ineligible && current >= target && target > 0;
    const completedAt = existing.completedAt || (completedNow ? now : null);

    const updated: AchievementProgress = {
      ...existing,
      current,
      target,
      completedAt,
      lastUpdated: now,
      ineligible,
    };
    state.progress.set(def.id, updated);

    if (!wasCompleted && completedNow) {
      const tierLabel = isOneTime ? 'One-time achievement' : 'Achievement';
      notify({
        feature: 'achievements',
        level: 'success',
        message: `${tierLabel}: ${def.title} completed!`,
      });
    }
  });
}

let debounceTimer: number | null = null;
const DEBOUNCE_MS = 800;

function scheduleEvaluate(): void {
  if (debounceTimer != null) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = window.setTimeout(async () => {
    debounceTimer = null;
    try {
      ensureDefinitions();
      const snap = await buildSnapshot();
      evaluate(state.definitions, snap);
      persist();
      emit();
    } catch (error) {
      log('⚠️ Achievements evaluation failed', error);
    }
  }, DEBOUNCE_MS);
}

export function initializeAchievements(): void {
  if (state.initialized) return;
  state.initialized = true;
  loadPersisted();
  ensureDefinitions();

  // Start live ability and pet trackers used by achievement evaluation
  void startAbilityTriggerStore().catch((error) => log('⚠️ Achievements: ability trigger store start failed', error));
  void startPetInfoStore().catch((error) => log('⚠️ Achievements: pet info store start failed', error));
  if (!sellWindowStarted) {
    sellWindowStarted = true;
    void startSellWindowTracking(() => scheduleEvaluate()).catch((error) => {
      log('⚠️ Achievements: sell window tracker failed to start', error);
      sellWindowStarted = false;
    });
  }

  // Kick off initial evaluation after stats/inventory load
  scheduleEvaluate();

  // Live updates from stats; inventory/journal/other feeds can trigger externally via triggerAchievementRecompute
  try {
    statsUnsubscribe = subscribeToStats(() => scheduleEvaluate());
  } catch (error) {
    log('⚠️ Achievements: failed to subscribe to stats', error);
  }

  // Live stats atom (game panel) to reflect existing totals immediately
  void trySubscribeAtom('myStatsAtom', (fn) => {
    liveStatsUnsubscribe = fn;
  });

  // Aries StatsService subscription (if available) to refresh on updates
  subscribeAriesStats();

  // Activity logs (for reconciliation/backfill when local hooks miss events)
  void trySubscribeAtom('newLogsAtom', (fn) => {
    activityLogUnsubscribe = fn;
  }, handleLogPayload);
  void trySubscribeAtom('newCropLogsFromSellingAtom', (fn) => {
    cropLogUnsubscribe = fn;
  });

  // Future: add subscriptions to inventory and coin balance deltas when located
  log('✅ Achievements store initialized (phase 1 stub)');
}

// Convenience trigger for external events to force recompute
export function triggerAchievementRecompute(): void {
  scheduleEvaluate();
}
