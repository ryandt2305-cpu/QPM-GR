export interface VariantBadge {
    matches: string[];
    label: string;
    color?: string;
    gradient?: string;
    bold?: boolean;
}
export declare const VARIANT_BADGES: VariantBadge[];
export declare function findVariantBadge(variant: string): VariantBadge | undefined;
export declare function getVariantChipColors(variant: string, collected: boolean): {
    bg: string;
    text: string;
    weight: 400 | 600;
};
//# sourceMappingURL=variantBadges.d.ts.map