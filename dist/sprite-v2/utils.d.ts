import { PixiConstructors } from './types';
/**
 * Finds any node in a PIXI display tree matching a predicate
 */
export declare function findAny(root: any, pred: (node: any) => boolean, lim?: number): any;
/**
 * Extracts PIXI constructors from the app or global PIXI object
 */
export declare function getCtors(app: any): PixiConstructors;
/**
 * Gets the base texture from a texture (handles different PIXI versions)
 */
export declare function baseTexOf(tex: any): any;
/**
 * Remembers base textures to prevent garbage collection
 */
export declare function rememberBaseTex(tex: any, atlasBases: Set<any>): void;
/**
 * Normalizes a key for comparison (lowercase, alphanumeric only)
 */
export declare function normalizeKey(s: string): string;
/**
 * Gets the base name from a sprite key (last component)
 */
export declare function baseNameOf(key: string): string;
/**
 * Checks if a key represents a tall plant
 */
export declare function isTallKey(k: string): boolean;
//# sourceMappingURL=utils.d.ts.map