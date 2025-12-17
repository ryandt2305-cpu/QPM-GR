/**
 * Detects the current Magic Garden game version from various sources.
 * This makes the sprite system future-proof by adapting to version changes automatically.
 *
 * Detection strategy:
 * 1. Check global variables (gameVersion, MG_gameVersion, __MG_GAME_VERSION__)
 * 2. Scan script tags for version patterns
 * 3. Scan link tags for version patterns
 *
 * @returns The detected version hash (e.g., "436ff68")
 * @throws Error if version cannot be detected
 */
export declare function detectGameVersion(): string;
/**
 * Builds the base assets URL for the detected version
 * @param origin The origin URL (default: https://magicgarden.gg)
 * @returns The full base URL for assets (e.g., "https://magicgarden.gg/version/436ff68/assets/")
 */
export declare function buildAssetsBaseUrl(origin?: string): string;
/**
 * Detects if we're in a userscript environment
 */
export declare function isUserscriptEnv(): boolean;
/**
 * Gets the appropriate window object (handles userscript sandbox)
 */
export declare function getRuntimeWindow(): Window & typeof globalThis;
//# sourceMappingURL=detector.d.ts.map