export interface AutoFavoriteConfig {
    enabled: boolean;
    autoFavoriteRarePets: boolean;
    autoFavoriteRareProduce: boolean;
}
export declare function initializeAutoFavorite(): void;
export declare function getAutoFavoriteConfig(): AutoFavoriteConfig;
export declare function updateAutoFavoriteConfig(updates: Partial<AutoFavoriteConfig>): void;
export declare function subscribeToAutoFavoriteConfig(listener: (config: AutoFavoriteConfig) => void): () => void;
//# sourceMappingURL=autoFavorite.d.ts.map