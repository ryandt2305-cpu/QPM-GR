import { WeatherPreset } from '../features/weatherSwap';
export type ShopCategoryKey = 'seeds' | 'eggs' | 'tools' | 'decor';
interface FeedEntry {
    count: number;
    lastFeedAt: number | null;
}
interface ShopItemEntry {
    count: number;
    coins: number;
    credits: number;
    lastPurchasedAt: number;
}
export interface StatsSnapshot {
    feed: {
        totalFeeds: number;
        perPet: Record<string, FeedEntry>;
        lastFeedAt: number | null;
        sessionStart: number;
    };
    weather: {
        totalSwaps: number;
        swapsByState: Record<'weather' | 'noweather', number>;
        presetUsage: Record<'weather' | 'noweather', Record<WeatherPreset, number>>;
        cooldownBlocks: number;
        timeByKind: Record<string, number>;
        activeKind: string;
        lastSwapAt: number | null;
    };
    shop: {
        totalPurchases: number;
        totalSpentCoins: number;
        totalSpentCredits: number;
        purchasesByCategory: Record<ShopCategoryKey, number>;
        items: Record<string, ShopItemEntry>;
        history: Array<{
            itemName: string;
            category: ShopCategoryKey;
            count: number;
            coins: number;
            credits: number;
            timestamp: number;
            success: boolean;
            failureReason?: string;
        }>;
        lastPurchase: {
            itemName: string;
            category: ShopCategoryKey;
            count: number;
            coins: number;
            credits: number;
            timestamp: number;
        } | null;
        totalFailures: number;
        failuresByCategory: Record<ShopCategoryKey, number>;
    };
    meta: {
        initializedAt: number;
        updatedAt: number;
        version: number;
    };
}
export declare function initializeStatsStore(): void;
export declare function subscribeToStats(listener: (snapshot: StatsSnapshot) => void): () => void;
export declare function getStatsSnapshot(): StatsSnapshot;
export declare function recordFeedEvent(petName: string, timestamp?: number): void;
export declare function recordWeatherSwap(stateType: 'weather' | 'noweather', preset: WeatherPreset, triggeredAt: number): void;
export declare function recordWeatherCooldownBlock(): void;
export declare function recordShopPurchase(category: ShopCategoryKey, itemName: string, count: number, coins: number, credits: number, timestamp?: number): void;
export declare function recordShopFailure(category: ShopCategoryKey, itemName: string, reason: string, timestamp?: number): void;
export declare function resetStats(): void;
export {};
//# sourceMappingURL=stats.d.ts.map