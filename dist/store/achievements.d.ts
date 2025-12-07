import { StatsSnapshot } from './stats';
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
}
export declare function recordInstantFeedUse(count?: number): void;
export declare function getAchievementDefinitions(): AchievementDefinition[];
export declare function getAchievementProgress(): Map<string, AchievementProgress>;
export declare function subscribeToAchievements(cb: (progress: Map<string, AchievementProgress>) => void): () => void;
export declare function getAchievementSnapshot(): AchievementSnapshot | null;
export declare function initializeAchievements(): void;
export declare function triggerAchievementRecompute(): void;
//# sourceMappingURL=achievements.d.ts.map