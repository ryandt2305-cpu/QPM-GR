import { GetSpriteParams, SpriteState, SpriteConfig, SpriteCategory, SpriteItem } from './types';
export declare function listItemsByCategory(state: SpriteState, category?: SpriteCategory): SpriteItem[];
export declare function buildVariant(mutations: string[]): import('./types').VariantInfo;
export declare function getSpriteWithMutations(params: GetSpriteParams, state: SpriteState, cfg: SpriteConfig): any;
export declare function getBaseSprite(params: GetSpriteParams, state: SpriteState): any;
//# sourceMappingURL=api.d.ts.map