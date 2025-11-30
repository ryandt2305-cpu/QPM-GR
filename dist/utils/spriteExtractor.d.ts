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
     * Get all available sheets
     */
    getSheets(): string[];
    /**
     * Check if sprites are loaded
     */
    isReady(): boolean;
}
export declare const spriteExtractor: SpriteExtractor;
/**
 * Get crop sprite as data URL for use in CSS background-image
 */
export declare function getCropSpriteDataUrl(species: string): string | null;
/**
 * Create a sprite element for rendering in UI
 */
export declare function createSpriteElement(species: string, size?: number): HTMLElement | null;
export {};
//# sourceMappingURL=spriteExtractor.d.ts.map