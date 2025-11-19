export interface AutoFavoriteConfig {
    enabled: boolean;
    autoFavoriteRarePets: boolean;
    autoFavoriteRareProduce: boolean;
}
export declare function initializeAutoFavorite(): void;
export declare function getAutoFavoriteConfig(): AutoFavoriteConfig;
export declare function updateAutoFavoriteConfig(updates: Partial<AutoFavoriteConfig>): void;
export declare function subscribeToAutoFavoriteConfig(listener: (config: AutoFavoriteConfig) => void): () => void;
export declare function shouldAutoFavoritePet(rarity: string): boolean;
export declare function shouldAutoFavoriteProduce(rarity: string): boolean;
export declare function favoriteGameItem(itemId: string, itemType: 'pet' | 'produce'): boolean;
export declare function autoFavoriteIfNeeded(itemId: string, itemType: 'pet' | 'produce', rarity: string): boolean;
//# sourceMappingURL=autoFavorite.d.ts.map