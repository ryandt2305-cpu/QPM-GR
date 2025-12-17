import { SpriteService } from './types';
export declare function setSpriteService(svc: SpriteService): void;
/**
 * Gets crop sprite data URL by species name or tile ID
 * OLD API: getCropSpriteDataUrl(speciesOrTile: string | number)
 * NOTE: Synchronous wrapper around async service
 */
export declare function getCropSpriteDataUrl(speciesOrTile: string | number | null | undefined): string;
/**
 * Gets pet sprite data URL by species name
 * OLD API: getPetSpriteDataUrl(species: string)
 * NOTE: Synchronous wrapper around async service
 */
export declare function getPetSpriteDataUrl(species: string): string;
/**
 * Gets crop sprite canvas by tile ID
 * OLD API: getCropSpriteByTileId(tileId: string | number)
 */
export declare function getCropSpriteByTileId(tileId: string | number | null | undefined): HTMLCanvasElement | null;
/**
 * Gets mutation overlay data URL
 * OLD API: getMutationOverlayDataUrl(mutation: string)
 * NOTE: Synchronous wrapper around async service
 */
export declare function getMutationOverlayDataUrl(mutation: string): string;
/**
 * Renders plant with mutations
 * OLD API: renderPlantWithMutations(base: HTMLCanvasElement, mutations: string[])
 * NOTE: In new system, we need species/id, not a base canvas
 */
export declare function renderPlantWithMutations(baseOrId: HTMLCanvasElement | string, mutations: string[]): HTMLCanvasElement | null;
/**
 * Gets pet sprite canvas
 * OLD API: getPetSpriteCanvas(species: string)
 */
export declare function getPetSpriteCanvas(species: string): HTMLCanvasElement | null;
/**
 * Creates sprite element (old API for debug views)
 * OLD API: createSpriteElement(sheet: string, index: number, size?: number)
 */
export declare function createSpriteElement(sheet: string, index: number, size?: number): HTMLDivElement | null;
/**
 * Renders plant sprite
 * OLD API: renderPlantSprite(tileId, species?, mutations?)
 * NOTE: Synchronous wrapper around async service
 */
export declare function renderPlantSprite(tileId: string | number | null | undefined, species?: string | null, mutations?: string[]): string;
/**
 * Legacy sprite extractor object for compatibility
 */
export declare const spriteExtractor: {
    getTile: (sheet: string, index: number) => HTMLCanvasElement | null;
    getCropSprite: (species: string) => HTMLCanvasElement | null;
    getCropSpriteByTileId: typeof getCropSpriteByTileId;
    getSeedSprite: (seedName: string) => HTMLCanvasElement | null;
    getPetSprite: typeof getPetSpriteCanvas;
    renderPlantWithMutations: typeof renderPlantWithMutations;
    loadSheetFromUrl: (_url: string, _alias?: string, _forceSize?: 256 | 512) => Promise<boolean>;
    init: () => void;
};
/**
 * Exposes the Sprites object for global access
 */
export declare const Sprites: {
    init: () => void;
    clearCaches: () => void;
    lists: () => {
        all: string[];
        tiles: string[];
    };
};
/**
 * Initialize function
 */
export declare function initSprites(): void;
export declare function inspectPetSprites(): Promise<void>;
export declare function renderSpriteGridOverlay(sheetName?: string, maxTiles?: number): void;
export declare function renderAllSpriteSheetsOverlay(maxTilesPerSheet?: number): void;
export declare function listTrackedSpriteResources(_category?: string): Array<{
    url: string;
    families: string[];
}>;
export declare function loadTrackedSpriteSheets(_maxSheets?: number, _category?: string): Promise<string[]>;
//# sourceMappingURL=compat.d.ts.map