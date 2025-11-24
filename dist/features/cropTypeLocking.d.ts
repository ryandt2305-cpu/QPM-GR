export interface CropItem {
    id: string;
    species?: string;
    itemType?: string;
    scale?: number;
    mutations?: string[];
    element?: Element;
}
export interface CropTypeLockConfig {
    enabled: boolean;
    syncModeEnabled: boolean;
    lockedTypes: Record<string, boolean>;
    managedFavoriteIds: Record<string, string[]>;
    baselineFavoriteIds: Record<string, string[]>;
}
export declare function startCropTypeLocking(): void;
export declare function getCropLockConfig(): CropTypeLockConfig;
export declare function setCropLockEnabled(enabled: boolean): void;
export declare function setCropLockSyncMode(enabled: boolean): void;
export declare function isCropTypeLocked(species: string): boolean;
export declare function setCropTypeLocked(species: string, locked: boolean): void;
export declare function initCropTypeLocking(): void;
//# sourceMappingURL=cropTypeLocking.d.ts.map