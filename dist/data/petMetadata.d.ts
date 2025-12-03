export interface PetMetadata {
    weight: number | null;
    maturityHours: number | null;
    hungerCost: number | null;
    sellPrice: number | null;
    rarity: string | null;
}
export declare function getPetMetadata(species: string | null | undefined): PetMetadata | null;
//# sourceMappingURL=petMetadata.d.ts.map