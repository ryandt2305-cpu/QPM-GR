import { MutationName, VariantInfo, SpriteState, SpriteConfig } from './types';
export declare function hasMutationFilter(value: string): boolean;
export declare function sortMutations(list: string[]): MutationName[];
export declare function renderMutatedTexture(tex: any, itKey: string, V: VariantInfo, state: SpriteState, cfg: SpriteConfig): any;
export declare function processVariantJobs(state: SpriteState, cfg: SpriteConfig): boolean;
export declare function buildVariantFromMutations(list: string[]): VariantInfo;
export declare function computeVariantSignature(state: SpriteState): VariantInfo;
//# sourceMappingURL=renderer.d.ts.map