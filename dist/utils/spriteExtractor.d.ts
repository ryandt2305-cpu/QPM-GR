type SpriteCategory = 'plants' | 'pets' | 'unknown';
declare class SpriteExtractor {
    private sheets;
    private tiles;
    private initialized;
    private scanInterval;
    /**
     * Initialize sprite extraction by scanning Pixi texture cache
     * Waits for game to fully load before starting
     */
    init(): void;
    /**
     * Wait for game to load and find sprite sheet URL
     */
    private waitForPixi;
    /**
     * Scan Pixi.js texture cache for sprite sheets
     */
    private scanPixiTextures;
    /**
     * Get sheet name from Pixi texture key
     */
    private getSheetNameFromKey;
    /**
     * Process a sprite sheet and slice it into tiles
     */
    private processSheet;
    ingestTextureSource(key: string, source: HTMLImageElement | HTMLCanvasElement): void;
    /**
     * Get a specific tile from a sheet
     */
    getTile(sheetName: string, index: number): HTMLCanvasElement | null;
    /**
     * Get crop sprite by species name
     */
    getCropSprite(species: string): HTMLCanvasElement | null;
    /**
     * Map crop species to sprite index
     * Based on actual game's plants.png sprite sheet (10x6 grid = 60 tiles, 256px each)
     * Verified mapping from in-game sprite sheet
     */
    private getCropSpriteIndex;
    /**
     * Get pet sprite by species name
     */
    getPetSprite(species: string): HTMLCanvasElement | null;
    private getPetSpriteIndex;
    /**
     * Get all available sheets
     */
    getSheets(): string[];
    getSheetSummaries(): Array<{
        name: string;
        url: string;
        tileSize: number;
        tilesPerRow: number;
        tilesPerColumn: number;
    }>;
    /**
     * Get mutation overlay tile
     */
    getMutationOverlay(mutation: string): HTMLCanvasElement | null;
    loadSheetFromUrl(url: string, alias?: string): Promise<boolean>;
    /**
     * Check if sprites are loaded
     */
    isReady(): boolean;
}
export declare const spriteExtractor: SpriteExtractor;
export declare function loadTrackedSpriteSheets(maxSheets?: number, category?: SpriteCategory | 'all'): Promise<string[]>;
/**
 * Get crop sprite as data URL for use in CSS background-image
 */
export declare function getCropSpriteDataUrl(species: string): string | null;
/**
 * Create a sprite element for rendering in UI
 */
/**
 * Get pet sprite as data URL for use in CSS background-image
 */
export declare function getPetSpriteDataUrl(species: string): string | null;
export declare function getPetSpriteCanvas(species: string): HTMLCanvasElement | null;
/**
 * Get mutation overlay sprite as data URL
 */
export declare function getMutationOverlayDataUrl(mutation: string): string | null;
export declare function createSpriteElement(species: string, size?: number): HTMLElement | null;
/**
 * Render an on-screen grid of a sprite sheet (useful for manual mapping)
 */
export declare function renderSpriteGridOverlay(sheetName?: string, maxTiles?: number): void;
export declare function renderAllSpriteSheetsOverlay(maxTilesPerSheet?: number): void;
export declare function listTrackedSpriteResources(category?: 'plants' | 'pets' | 'unknown' | 'all'): {
    url: string;
    sources: string[];
    lastSeen: number;
    category: SpriteCategory;
}[];
/**
 * Scan Pixi texture cache for pet sprite sheets
 * Console command: window.inspectPetSprites()
 */
export declare function inspectPetSprites(): Promise<void>;
export {};
//# sourceMappingURL=spriteExtractor.d.ts.map