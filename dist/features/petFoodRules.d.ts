export interface SpeciesOverride {
    allowed?: string[];
    forbidden?: string[];
    preferred?: string;
}
export interface PetFoodRulesState {
    respectRules: boolean;
    avoidFavorited: boolean;
    overrides: Record<string, SpeciesOverride>;
    updatedAt: number;
}
export interface InventoryItemSnapshot {
    id: string;
    species: string | null;
    itemType: string | null;
    name: string | null;
}
export interface InventorySnapshot {
    items: InventoryItemSnapshot[];
    favoritedIds: Set<string>;
    source: string;
}
export interface FoodSelection {
    item: InventoryItemSnapshot;
    usedFavoriteFallback: boolean;
}
export interface FoodSelectionOptions {
    avoidFavorited?: boolean;
}
export interface SpeciesCatalogEntry {
    species: string;
    key: string;
    label: string;
}
export interface DietOptionDescriptor {
    key: string;
    label: string;
}
export declare function getPetFoodRules(): PetFoodRulesState;
export declare function shouldRespectPetFoodRules(): boolean;
export declare function setRespectPetFoodRules(enabled: boolean): void;
export declare function setAvoidFavoritedFoods(enabled: boolean): void;
export declare function updateSpeciesOverride(species: string, override: SpeciesOverride | null): void;
export declare function resetPetFoodRules(): void;
export declare function readInventorySnapshot(): InventorySnapshot | null;
export declare function getPetSpeciesCatalog(): SpeciesCatalogEntry[];
export declare function getDietOptionsForSpecies(species: string): DietOptionDescriptor[];
export declare function getSpeciesPreferredFood(species: string): string | null;
export declare function setSpeciesPreferredFood(species: string, foodKey: string | null): void;
export declare function selectFoodForPet(petSpecies: string | null, snapshot: InventorySnapshot | null, options?: FoodSelectionOptions): FoodSelection | null;
//# sourceMappingURL=petFoodRules.d.ts.map