import { MutationMultiplierBreakdown } from '../utils/cropMultipliers';
declare global {
    interface Window {
        highlightTilesByMutation?: (options: Record<string, unknown>) => void;
        removeAllTileOverrides?: () => void;
        queueNotification?: (message: string, persistent?: boolean) => void;
        __qpmHarvestDebugMatches?: HarvestMatch[];
        __qpmHarvestDebugConfig?: Record<string, unknown> | null;
    }
}
export type HarvestMutationKey = 'Rainbow' | 'Gold' | 'Frozen' | 'Wet' | 'Chilled' | 'Dawnlit' | 'Amberlit' | 'Amberbound' | 'Dawnbound';
export interface HarvestReminderConfig {
    enabled?: boolean;
    highlightEnabled?: boolean;
    toastEnabled?: boolean;
    minSize?: number;
    selectedMutations?: Partial<Record<HarvestMutationKey, boolean>>;
}
export interface HarvestSummary {
    readyCount: number;
    mutatedCount: number;
    totalValue: number;
    highestValue: {
        species: string;
        value: number;
        mutations: string[];
        size: number;
        multiplier: MutationMultiplierBreakdown;
        breakdownText: string;
        totalMultiplierText: string;
        unknownMutations: string[];
    } | null;
    friendBonus: number;
}
interface HarvestMatch {
    key: string;
    tileId: string;
    slotIndex: number;
    species: string;
    mutations: string[];
    size: number;
    value: number;
    multiplier: MutationMultiplierBreakdown;
    unknownMutations: string[];
}
export declare function initializeHarvestReminder(config?: HarvestReminderConfig): void;
export declare function disposeHarvestReminder(): void;
export declare function configureHarvestReminder(config: HarvestReminderConfig): void;
export declare function setHarvestReminderEnabled(enabled: boolean): void;
export declare function onHarvestSummary(cb: (summary: HarvestSummary) => void, fireImmediately?: boolean): () => void;
export declare function onHarvestToast(cb: (text: string) => void): () => void;
export declare function getHarvestSummary(): HarvestSummary;
export declare function runHarvestHighlightDebug(): void;
export {};
//# sourceMappingURL=harvestReminder.d.ts.map