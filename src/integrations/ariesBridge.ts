// src/integrations/ariesBridge.ts
// Exposes lightweight data snapshots for Aries Mod to consume (achievements + pet teams)

import { getAchievementDefinitions, getAchievementProgress } from '../store/achievements';
import { getActivePetInfos } from '../store/pets';
import { log } from '../utils/logger';
import { shareGlobal } from '../core/pageContext';

export type AriesBridgeAchievement = {
  id: string;
  title: string;
  description: string;
  category: string;
  rarity: string;
  target: number | null;
  current: number;
  completedAt: number | null;
  ineligible: boolean;
};

export type AriesBridgeTeam = {
  id: string;
  name: string;
  slotIds: (string | null)[];
  source: 'localStorage' | 'activePets' | 'unknown';
};

const TEAM_STORAGE_KEYS = [
  'qws:pets:teams:v1',
  'MGA_petPresets',
  'aries:teams',
  'aries:petTeams',
  'qws:teams',
  'qws:petTeams',
  'petTeams',
  'teams',
];

function normalizeTeam(entry: any): AriesBridgeTeam | null {
  if (!entry || typeof entry !== 'object') return null;
  const obj = entry as Record<string, unknown>;
  const slotsSource = Array.isArray(obj.slots) ? obj.slots : Array.isArray(obj.team) ? obj.team : [];
  const slotIds: (string | null)[] = [];
  for (let i = 0; i < 3; i += 1) {
    const raw = slotsSource[i];
    if (typeof raw === 'string' && raw.trim()) {
      slotIds.push(raw.trim());
    } else if (typeof raw === 'number' && Number.isFinite(raw)) {
      slotIds.push(String(raw));
    } else if (raw && typeof raw === 'object') {
      const rObj = raw as Record<string, unknown>;
      const id = rObj.id ?? rObj.petId ?? rObj.slotId;
      slotIds.push(typeof id === 'string' && id.trim() ? id.trim() : null);
    } else {
      slotIds.push(null);
    }
  }

  const id = typeof obj.id === 'string' && obj.id.trim()
    ? obj.id.trim()
    : typeof obj.teamId === 'string' && obj.teamId.trim()
      ? obj.teamId.trim()
      : `team-${Math.random().toString(36).slice(2, 8)}`;
  const rawName = obj.name ?? obj.label ?? obj.title ?? id;
  const name = typeof rawName === 'string' && rawName.trim() ? rawName.trim() : id;

  return {
    id,
    name,
    slotIds,
    source: 'unknown',
  };
}

function readTeamsFromLocalStorage(): AriesBridgeTeam[] {
  const teams: AriesBridgeTeam[] = [];
  TEAM_STORAGE_KEYS.forEach((key) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const arrays: any[] = [];
      if (Array.isArray(parsed)) {
        arrays.push(parsed);
      } else if (parsed && typeof parsed === 'object') {
        Object.values(parsed).forEach((val) => {
          if (Array.isArray(val)) arrays.push(val);
        });
      }

      arrays.forEach((arr) => {
        arr.forEach((entry: unknown) => {
          const normalized = normalizeTeam(entry);
          if (normalized) {
            normalized.source = 'localStorage';
            teams.push(normalized);
          }
        });
      });
    } catch (error) {
      // ignore parse errors
      log('⚠️ AriesBridge: failed parsing team storage', error);
    }
  });
  return teams;
}

function buildActivePetsTeam(): AriesBridgeTeam | null {
  const pets = getActivePetInfos();
  if (!pets.length) return null;
  const slotIds = pets.slice(0, 3).map((p) => String(p.petId ?? p.slotIndex ?? '').trim() || null);
  return {
    id: 'active-pets',
    name: 'Active Pets',
    slotIds,
    source: 'activePets',
  };
}

function buildAchievementPayload(): AriesBridgeAchievement[] {
  const defs = getAchievementDefinitions();
  const progress = getAchievementProgress();
  return defs.map((def) => {
    const prog = progress.get(def.id);
    return {
      id: def.id,
      title: def.title,
      description: def.description,
      category: def.category,
      rarity: def.rarity,
      target: typeof def.target === 'number' ? def.target : null,
      current: prog?.current ?? 0,
      completedAt: prog?.completedAt ?? null,
      ineligible: !!prog?.ineligible,
    } satisfies AriesBridgeAchievement;
  });
}

function buildTeamsPayload(): AriesBridgeTeam[] {
  const teams: AriesBridgeTeam[] = [];
  teams.push(...readTeamsFromLocalStorage());
  const activeTeam = buildActivePetsTeam();
  if (activeTeam) teams.push(activeTeam);
  return teams;
}

export function exposeAriesBridge(): void {
  const payload = {
    getAchievements: (): AriesBridgeAchievement[] => buildAchievementPayload(),
    getTeams: (): AriesBridgeTeam[] => buildTeamsPayload(),
  };

  try {
    shareGlobal('QPM_ARIES_BRIDGE', payload);
    log('✅ AriesBridge: exposed QPM_ARIES_BRIDGE with achievements and teams');
  } catch (error) {
    log('⚠️ AriesBridge: failed to expose bridge', error);
  }
}
