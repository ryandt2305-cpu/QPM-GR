import { Manifest, AtlasData } from './types';
/**
 * Fetches JSON data from URL
 */
export declare function getJSON<T = any>(url: string): Promise<T>;
/**
 * Fetches Blob data from URL
 */
export declare function getBlob(url: string): Promise<Blob>;
/**
 * Converts a Blob to an Image element
 */
export declare function blobToImage(blob: Blob): Promise<HTMLImageElement>;
/**
 * Joins base path with relative path
 */
export declare function joinPath(base: string, path: string): string;
/**
 * Gets directory of a path
 */
export declare function dirOf(path: string): string;
/**
 * Resolves relative path based on current path
 */
export declare function relPath(base: string, path: string): string;
/**
 * Extracts atlas JSON files from manifest
 */
export declare function extractAtlasJsons(manifest: Manifest): Set<string>;
/**
 * Loads all atlas JSON files from manifest, following related_multi_packs
 */
export declare function loadAtlasJsons(base: string, manifest: Manifest): Promise<Record<string, AtlasData>>;
/**
 * Checks if JSON is a valid atlas
 */
export declare function isAtlas(j: any): j is AtlasData;
/**
 * Splits a key into path components
 */
export declare function splitKey(key: string): string[];
/**
 * Determines category from sprite key
 */
export declare function categoryOf(key: string, catLevels?: number): string;
/**
 * Parses animation frame from key (e.g., "sprite_001.png" → { baseKey, idx: 1 })
 */
export declare function animParse(key: string): {
    baseKey: string;
    idx: number;
    frameKey: string;
} | null;
//# sourceMappingURL=manifest.d.ts.map