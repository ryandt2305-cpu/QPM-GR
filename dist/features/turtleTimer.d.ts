import { ActivePetInfo } from '../store/pets';
declare global {
    interface Window {
        debugEggDetection?: () => void;
    }
}
export interface PetManualOverride {
    xp?: number | null;
    targetScale?: number | null;
    strength?: number | null;
}
export declare function getManualOverride(pet: ActivePetInfo): PetManualOverride | null;
export declare function setManualOverride(pet: ActivePetInfo, override: PetManualOverride): void;
export declare function clearManualOverride(pet: ActivePetInfo, field?: 'xp' | 'targetScale' | 'strength'): void;
export type TurtleTimerStatus = 'disabled' | 'no-data' | 'no-crops' | 'no-eggs' | 'no-turtles' | 'estimating';
export type TurtleTimerFocus = 'latest' | 'earliest' | 'specific';
type TurtleAbilityKind = 'plant' | 'egg';
type TurtleSupportKind = 'restore' | 'slow';
export interface TurtleTimerConfig {
    enabled?: boolean;
    includeBoardwalk?: boolean;
    minActiveHungerPct?: number;
    fallbackTargetScale?: number;
    focus?: TurtleTimerFocus;
    focusTargetTileId?: string | null;
    focusTargetSlotIndex?: number | null;
    eggFocus?: TurtleTimerFocus;
    eggFocusTargetTileId?: string | null;
    eggFocusTargetSlotIndex?: number | null;
}
export interface GardenSlotEstimate {
    tileId: string;
    slotIndex: number;
    species: string | null;
    seedSpecies: string | null;
    plantSpecies: string | null;
    eggId: string | null;
    eggSpecies: string | null;
    boardwalk: boolean;
    endTime: number | null;
    readyAt: number | null;
    plantedAt: number | null;
    slotType: string | null;
    slotCategory: string | null;
    objectType: string | null;
    tileObjectType: string | null;
    tileCategory: string | null;
    slotKind: string | null;
}
export interface TurtleContribution {
    ability: TurtleAbilityKind;
    abilityNames: string[];
    slotIndex: number;
    name: string | null;
    species: string | null;
    hungerPct: number | null;
    xp: number | null;
    targetScale: number;
    baseScore: number;
    rateContribution: number;
    perHourReduction: number;
    missingStats: boolean;
}
interface SupportAbilityBreakdown {
    abilityName: string;
    normalizedName: string;
    perTriggerPct: number | null;
    slowdownPct: number | null;
    triggersPerHour: number | null;
    pctPerHour: number | null;
    probabilityPerMinute: number | null;
}
export interface TurtleSupportEntry {
    type: TurtleSupportKind;
    abilityNames: string[];
    slotIndex: number;
    name: string | null;
    species: string | null;
    hungerPct: number | null;
    active: boolean;
    xp: number | null;
    targetScale: number;
    baseScore: number;
    missingStats: boolean;
    abilityDetails: SupportAbilityBreakdown[];
    totalRestorePerTriggerPct: number;
    totalRestorePerHourPct: number;
    totalTriggersPerHour: number;
    totalSlowPct: number;
}
export interface TurtleTimerChannel {
    status: TurtleTimerStatus;
    trackedSlots: number;
    growingSlots: number;
    maturedSlots: number;
    contributions: TurtleContribution[];
    expectedMinutesRemoved: number | null;
    effectiveRate: number | null;
    naturalMsRemaining: number | null;
    adjustedMsRemaining: number | null;
    minutesSaved: number | null;
    focusSlot: (GardenSlotEstimate & {
        remainingMs: number | null;
    }) | null;
}
export interface TurtleFocusOption {
    key: string;
    tileId: string;
    slotIndex: number;
    species: string | null;
    boardwalk: boolean;
    endTime: number | null;
    remainingMs: number | null;
}
export interface TurtleTimerSupportSummary {
    restoreCount: number;
    restoreActiveCount: number;
    slowCount: number;
    slowActiveCount: number;
    restorePctTotal: number;
    restorePctActive: number;
    restorePctPerHourTotal: number;
    restorePctPerHourActive: number;
    restoreTriggersPerHourTotal: number;
    restoreTriggersPerHourActive: number;
    slowPctTotal: number;
    slowPctActive: number;
    entries: TurtleSupportEntry[];
}
export interface TurtleTimerState {
    enabled: boolean;
    now: number;
    includeBoardwalk: boolean;
    focus: TurtleTimerFocus;
    focusTargetKey: string | null;
    focusTargetAvailable: boolean;
    eggFocus: TurtleTimerFocus;
    eggFocusTargetKey: string | null;
    eggFocusTargetAvailable: boolean;
    minActiveHungerPct: number;
    fallbackTargetScale: number;
    availableTurtles: number;
    hungerFilteredCount: number;
    turtlesMissingStats: number;
    plant: TurtleTimerChannel;
    plantTargets: TurtleFocusOption[];
    egg: TurtleTimerChannel;
    eggTargets: TurtleFocusOption[];
    support: TurtleTimerSupportSummary;
}
export interface CompletionLogEntry {
    id: string;
    type: 'plant' | 'egg';
    species: string;
    tileId: string;
    slotIndex: number;
    startedAt: number;
    completedAt: number;
    estimatedDuration: number;
    actualDuration: number;
    hadTurtles: boolean;
}
export declare function getCompletionLog(): CompletionLogEntry[];
export declare function clearCompletionLog(): void;
export declare function initializeTurtleTimer(initialConfig?: TurtleTimerConfig): void;
export declare function disposeTurtleTimer(): void;
export declare function configureTurtleTimer(next: TurtleTimerConfig): void;
export declare function setTurtleTimerEnabled(enabled: boolean): void;
export declare function recalculateTimerState(): void;
export declare function getTurtleTimerState(): TurtleTimerState;
export declare function onTurtleTimerState(listener: (snapshot: TurtleTimerState) => void, fireImmediately?: boolean): () => void;
export {};
//# sourceMappingURL=turtleTimer.d.ts.map