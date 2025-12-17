import { AtlasData, PixiConstructors, SpriteItem } from './types';
export declare function buildAtlasTextures(data: AtlasData, baseTex: any, texMap: Map<string, any>, atlasBases: Set<any>, ctors: PixiConstructors): void;
export declare function buildItemsFromTextures(tex: Map<string, any>, cfg?: {
    catLevels?: number;
}): {
    items: SpriteItem[];
    cats: Map<string, SpriteItem[]>;
};
//# sourceMappingURL=atlas.d.ts.map