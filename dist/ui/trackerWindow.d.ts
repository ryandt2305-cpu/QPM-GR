import { ActivePetInfo } from '../store/pets';
import { AbilityContribution } from './originalPanel';
import { AbilityDefinition } from '../data/petAbilities';
export interface AbilityGroup {
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
export interface TrackerWindowState {
    root: HTMLElement;
    summaryText: HTMLElement;
    tbody: HTMLElement;
    footer: HTMLElement;
    updateInterval: number | null;
    latestAnalysis: any;
    latestInfos: ActivePetInfo[];
}
/**
 * Calculate effective proc rate for Rainbow/Gold Granter abilities
 * These can waste procs on already-colored plants
 */
export declare function calculateEffectiveProcRate(baseProcsPerHour: number, abilityId: string): {
    effective: number;
    wastePercent: number;
};
/**
 * Format live countdown ETA for next expected proc
 */
export declare function calculateLiveETA(lastProcAt: number, expectedMinutesBetween: number | null, effectiveProcsPerHour?: number): {
    text: string;
    isOverdue: boolean;
};
/**
 * Create a row for a pet ability in the tracker table
 */
export declare function createAbilityRow(entry: AbilityContribution, abilityName: string, tbody: HTMLTableSectionElement, detailedView?: boolean, savedBaselines?: Map<string, number>): HTMLTableRowElement;
/**
 * Create a total row for an ability group (showing combined stats for multiple pets with same ability)
 */
export declare function createAbilityGroupTotalRow(group: AbilityGroup, tbody: HTMLTableSectionElement, detailedView?: boolean, savedGroupBaselines?: Map<string, number>): HTMLTableRowElement | null;
//# sourceMappingURL=trackerWindow.d.ts.map