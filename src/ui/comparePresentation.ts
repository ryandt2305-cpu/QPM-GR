// src/ui/comparePresentation.ts
// Shared compare presentation adapter built on top of petCompareEngine.

import type { PooledPet } from '../types/petTeams';
import {
  buildPetCompareProfile,
  type AbilityContribution,
  type ProgressionSignalSnapshot,
  type ProgressionStageSnapshot,
} from '../features/petCompareEngine';
import type { AbilityValuationContext } from '../features/abilityValuation';
import {
  areCompareGroupsCompatible,
  getCompareGroupLabel,
  getCompareMetricLabel,
  type CompareGroupId,
  type CompareStage,
} from '../data/petCompareRules';

export interface CompareSideMetrics {
  hasData: boolean;
  abilityId: string | null;
  abilityName: string;
  metricLabel: string;
  valuePerProc: string;
  impactPerHour: string;
  procsPerHour: string;
  triggerPercent: string;
  rawValuePerProc: number;
  rawImpactPerHour: number;
  rawProcsPerHour: number;
  rawTriggerPercent: number;
}

export interface CompareLedgerRow {
  id: 'value_per_proc' | 'impact_per_hour' | 'procs_per_hour' | 'trigger_percent';
  label: string;
  a: string;
  b: string;
  winner: 'a' | 'b' | 'tie' | 'review';
}

export interface CompareCardViewModel {
  verdict: 'a' | 'b' | 'tie' | 'review';
  groupId: CompareGroupId;
  reviewOnly: boolean;
  stageBadge: string;
  tieBreakRef: string;
  sideA: CompareSideMetrics;
  sideB: CompareSideMetrics;
  ledgerRows: CompareLedgerRow[];
}

interface ContributionCompareSnapshot {
  abilityId: string;
  abilityName: string;
  groupId: CompareGroupId;
  isAction: boolean;
  reviewOnly: boolean;
  triggerLabel: string;
  triggerPercent: number;
  procsPerHour: number;
  valuePerProc: number;
  expectedValuePerTrigger: number;
  impactPerHour: number;
  primaryValue: number;
  tieBreakerValue: number;
  metricLabel: string;
}

const EMPTY_SIGNALS: ProgressionSignalSnapshot = {
  rbwCount: null,
  storage: {
    petHutch: null,
    seedSilo: null,
    decorShed: null,
  },
  celestial: {
    starweaver: null,
    moon: null,
    dawn: null,
  },
  eggs: null,
  coins: null,
};

function toStageSnapshot(stage: CompareStage): ProgressionStageSnapshot {
  return {
    stage,
    score: 0,
    signals: EMPTY_SIGNALS,
  };
}

function toCompareInput(pet: PooledPet): {
  id: string;
  species: string;
  strength: number | null;
  targetScale: number | null;
  abilities: string[];
  mutations: string[];
} {
  return {
    id: pet.id,
    species: pet.species,
    strength: pet.strength,
    targetScale: pet.targetScale,
    abilities: pet.abilities,
    mutations: pet.mutations,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatPercent(value: number): string {
  const n = clamp(value, 0, 100);
  if (n < 0.1) return `${n.toFixed(3)}%`;
  if (n < 1) return `${n.toFixed(2)}%`;
  if (n < 10) return `${n.toFixed(1)}%`;
  return `${n.toFixed(1).replace(/\.0$/, '')}%`;
}

function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';

  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  const toUnit = (divisor: number, suffix: string): string => {
    const compact = abs / divisor;
    const fixed = compact.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
    return `${sign}${fixed}${suffix}`;
  };

  if (abs >= 1e12) return toUnit(1e12, 'T');
  if (abs >= 1e9) return toUnit(1e9, 'B');
  if (abs >= 1e6) return toUnit(1e6, 'M');
  if (abs >= 1e3) return toUnit(1e3, 'k');
  return `${sign}${Math.round(abs)}`;
}

function formatMinutes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0min';
  const totalMinutes = Math.max(1, Math.round(value));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours}hr ${minutes}min`;
  if (hours > 0) return `${hours}hr`;
  return `${minutes}min`;
}

function formatValue(value: number, unit: AbilityContribution['unit'], suffix: 'proc' | 'trigger' | 'hour'): string {
  if (!Number.isFinite(value) || value <= 0) return '0';
  if (unit === 'coins') {
    const base = formatCompactNumber(Math.max(0, value));
    if (suffix === 'hour') return `${base}`;
    return `${base}`;
  }
  if (unit === 'minutes') {
    const base = formatMinutes(value);
    return suffix === 'hour' ? `${base}/hr` : `${base}/${suffix}`;
  }
  if (unit === 'xp') {
    const base = formatCompactNumber(Math.max(0, value));
    return suffix === 'hour' ? `${base} xp/hr` : `${base} xp/${suffix}`;
  }
  const rounded = value >= 10 ? value.toFixed(1) : value.toFixed(2);
  return suffix === 'hour' ? `${rounded}/hr` : `${rounded}/${suffix}`;
}

function getPrimaryValue(entry: AbilityContribution): number {
  if (entry.isAction) {
    return Math.max(0, entry.expectedValuePerTrigger);
  }
  return Math.max(0, entry.impactPerHour);
}

function getTieValue(entry: AbilityContribution): number {
  if (entry.isAction) {
    return Math.max(0, entry.chancePercent);
  }
  return Math.max(0, entry.procsPerHour);
}

function normalizeAbilityFilter(filter: string): string {
  return filter.trim().toLowerCase();
}

function matchesAbilityFilter(entry: AbilityContribution, filter: string): boolean {
  if (filter === 'all') return true;
  const norm = normalizeAbilityFilter(filter);
  return entry.abilityId.toLowerCase() === norm || entry.rawAbilityId.toLowerCase() === norm;
}

function chooseBestContribution(entries: AbilityContribution[], abilityFilter: string): AbilityContribution | null {
  const candidates = entries.filter((entry) => matchesAbilityFilter(entry, abilityFilter));
  if (!candidates.length) return null;

  const sorted = [...candidates].sort((a, b) => {
    if (a.isReview !== b.isReview) return a.isReview ? 1 : -1;
    if (a.isIgnored !== b.isIgnored) return a.isIgnored ? 1 : -1;

    const pa = getPrimaryValue(a);
    const pb = getPrimaryValue(b);
    if (pb !== pa) return pb - pa;

    const ta = getTieValue(a);
    const tb = getTieValue(b);
    if (tb !== ta) return tb - ta;

    return a.abilityId.localeCompare(b.abilityId);
  });

  return sorted[0] ?? null;
}

function toSnapshot(entry: AbilityContribution | null): ContributionCompareSnapshot | null {
  if (!entry) return null;
  return {
    abilityId: entry.abilityId,
    abilityName: entry.name,
    groupId: entry.group,
    isAction: entry.isAction,
    reviewOnly: entry.isReview || entry.isIgnored,
    triggerLabel: entry.triggerLabel,
    triggerPercent: entry.chancePercent,
    procsPerHour: entry.procsPerHour,
    valuePerProc: entry.valuePerTrigger,
    expectedValuePerTrigger: entry.expectedValuePerTrigger,
    impactPerHour: entry.impactPerHour,
    primaryValue: getPrimaryValue(entry),
    tieBreakerValue: getTieValue(entry),
    metricLabel: getCompareMetricLabel(entry.group, entry.isAction),
  };
}

function toSideMetrics(snapshot: ContributionCompareSnapshot | null): CompareSideMetrics {
  if (!snapshot) {
    return {
      hasData: false,
      abilityId: null,
      abilityName: 'No comparable ability',
      metricLabel: 'Metric',
      valuePerProc: '—',
      impactPerHour: '—',
      procsPerHour: '—',
      triggerPercent: '—',
      rawValuePerProc: 0,
      rawImpactPerHour: 0,
      rawProcsPerHour: 0,
      rawTriggerPercent: 0,
    };
  }

  const valuePerProc = snapshot.isAction
    ? formatValue(snapshot.valuePerProc, snapshot.groupId === 'hatch_trio' ? 'none' : inferUnit(snapshot), 'trigger')
    : formatValue(snapshot.valuePerProc, inferUnit(snapshot), 'proc');

  const impactPerHour = snapshot.isAction
    ? formatValue(snapshot.expectedValuePerTrigger, inferUnit(snapshot), 'trigger')
    : formatValue(snapshot.impactPerHour, inferUnit(snapshot), 'hour');

  const procsPerHour = snapshot.isAction ? '—' : `${snapshot.procsPerHour.toFixed(1)}`;

  return {
    hasData: true,
    abilityId: snapshot.abilityId,
    abilityName: snapshot.abilityName,
    metricLabel: snapshot.metricLabel,
    valuePerProc,
    impactPerHour,
    procsPerHour,
    triggerPercent: formatPercent(snapshot.triggerPercent),
    rawValuePerProc: snapshot.isAction ? snapshot.valuePerProc : snapshot.valuePerProc,
    rawImpactPerHour: snapshot.isAction ? snapshot.expectedValuePerTrigger : snapshot.impactPerHour,
    rawProcsPerHour: snapshot.isAction ? 0 : snapshot.procsPerHour,
    rawTriggerPercent: snapshot.triggerPercent,
  };
}

function inferUnit(snapshot: ContributionCompareSnapshot): AbilityContribution['unit'] {
  if (snapshot.metricLabel.includes('$')) return 'coins';
  if (snapshot.metricLabel.includes('xp')) return 'xp';
  if (snapshot.metricLabel.includes('saved')) return 'minutes';
  if (snapshot.groupId === 'hatch_trio') return 'none';
  return 'none';
}

function pickRowWinner(a: number, b: number, comparable: boolean): 'a' | 'b' | 'tie' | 'review' {
  if (!comparable) return 'review';
  if (a > b) return 'a';
  if (b > a) return 'b';
  return 'tie';
}

export function buildCompareCardViewModel(params: {
  petA: PooledPet | null;
  petB: PooledPet | null;
  abilityFilter: string;
  valuationContext: AbilityValuationContext | null;
  stage: CompareStage;
  poolForRank: PooledPet[];
}): CompareCardViewModel | null {
  const { petA, petB, abilityFilter, valuationContext, stage } = params;
  const stageSnapshot = toStageSnapshot(stage);

  const profileA = petA ? buildPetCompareProfile(toCompareInput(petA), stageSnapshot, valuationContext) : null;
  const profileB = petB ? buildPetCompareProfile(toCompareInput(petB), stageSnapshot, valuationContext) : null;
  const snapA = toSnapshot(profileA ? chooseBestContribution(profileA.abilities, abilityFilter) : null);
  const snapB = toSnapshot(profileB ? chooseBestContribution(profileB.abilities, abilityFilter) : null);

  if (!snapA && !snapB) return null;
  const active = snapA ?? snapB;
  if (!active) return null;

  const comparable = !!(
    snapA &&
    snapB &&
    !snapA.reviewOnly &&
    !snapB.reviewOnly &&
    areCompareGroupsCompatible(snapA.groupId, snapB.groupId)
  );

  let verdict: 'a' | 'b' | 'tie' | 'review' = 'review';
  if (comparable && snapA && snapB) {
    if (snapA.primaryValue > snapB.primaryValue) verdict = 'a';
    else if (snapB.primaryValue > snapA.primaryValue) verdict = 'b';
    else if (snapA.tieBreakerValue > snapB.tieBreakerValue) verdict = 'a';
    else if (snapB.tieBreakerValue > snapA.tieBreakerValue) verdict = 'b';
    else verdict = 'tie';
  }

  const sideA = toSideMetrics(snapA);
  const sideB = toSideMetrics(snapB);
  const isActionCompare = !!((snapA?.isAction ?? false) || (snapB?.isAction ?? false));

  const ledgerRows: CompareLedgerRow[] = isActionCompare
    ? [
        {
          id: 'value_per_proc',
          label: 'Value/Trigger',
          a: sideA.valuePerProc,
          b: sideB.valuePerProc,
          winner: pickRowWinner(sideA.rawValuePerProc, sideB.rawValuePerProc, comparable),
        },
        {
          id: 'impact_per_hour',
          label: 'Expected/Trigger',
          a: sideA.impactPerHour,
          b: sideB.impactPerHour,
          winner: pickRowWinner(sideA.rawImpactPerHour, sideB.rawImpactPerHour, comparable),
        },
        {
          id: 'trigger_percent',
          label: 'Chance/Min',
          a: sideA.triggerPercent,
          b: sideB.triggerPercent,
          winner: pickRowWinner(sideA.rawTriggerPercent, sideB.rawTriggerPercent, comparable),
        },
      ]
    : [
        {
          id: 'value_per_proc',
          label: 'Value/Proc',
          a: sideA.valuePerProc,
          b: sideB.valuePerProc,
          winner: pickRowWinner(sideA.rawValuePerProc, sideB.rawValuePerProc, comparable),
        },
        {
          id: 'impact_per_hour',
          label: 'Impact/Hr',
          a: sideA.impactPerHour,
          b: sideB.impactPerHour,
          winner: pickRowWinner(sideA.rawImpactPerHour, sideB.rawImpactPerHour, comparable),
        },
        {
          id: 'procs_per_hour',
          label: 'Rate/Hr',
          a: sideA.procsPerHour,
          b: sideB.procsPerHour,
          winner: pickRowWinner(sideA.rawProcsPerHour, sideB.rawProcsPerHour, comparable),
        },
        {
          id: 'trigger_percent',
          label: 'Chance/Min',
          a: sideA.triggerPercent,
          b: sideB.triggerPercent,
          winner: pickRowWinner(sideA.rawTriggerPercent, sideB.rawTriggerPercent, comparable),
        },
      ];

  return {
    verdict,
    groupId: active.groupId,
    reviewOnly: !comparable,
    stageBadge: stage.toUpperCase(),
    tieBreakRef: `${getCompareGroupLabel(active.groupId)} • primary > tie`,
    sideA,
    sideB,
    ledgerRows,
  };
}
