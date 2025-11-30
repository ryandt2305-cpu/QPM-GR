export interface AutoFavoriteConfig {
    enabled: boolean;
    species: string[];
    mutations: string[];
    petAbilities: string[];
    filterByAbilities?: string[];
    filterByAbilityCount?: number | null | undefined;
    filterBySpecies?: string[];
    filterByCropTypes?: string[];
}
export declare function initializeAutoFavorite(): void;
export declare function getAutoFavoriteConfig(): AutoFavoriteConfig;
export declare function updateAutoFavoriteConfig(updates: Partial<AutoFavoriteConfig>): void;
export declare function subscribeToAutoFavoriteConfig(listener: (config: AutoFavoriteConfig) => void): () => void;
//# sourceMappingURL=autoFavorite.d.ts.map