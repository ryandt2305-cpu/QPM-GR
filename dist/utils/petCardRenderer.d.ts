interface PetCardConfig {
    species: string;
    name?: string;
    xp?: number;
    targetScale?: number;
    abilities?: string[];
    mutations?: string[];
    size?: 'small' | 'medium' | 'large';
}
/**
 * Normalize ability name for display
 * Converts camelCase or PascalCase ability IDs to human-readable names
 */
export declare function normalizeAbilityName(abilityId: string): string;
/**
 * Get ability color configuration
 */
export declare function getAbilityColor(abilityName: string): {
    base: string;
    glow: string;
    text: string;
};
/**
 * Generate Pet Hub-style pet card HTML
 * Returns complete card with abilities + sprite + name + STR
 */
export declare function renderPetCard(config: PetCardConfig): string;
/**
 * Generate pet species icon for filter cards (no STR label)
 * Just shows sprite + name
 */
export declare function renderPetSpeciesIcon(species: string): string;
/**
 * Generate lightweight pet sprite only (for use in lists/trackers)
 * Still includes abilities + name + STR but in compact format
 */
export declare function renderCompactPetSprite(config: PetCardConfig): string;
export {};
//# sourceMappingURL=petCardRenderer.d.ts.map