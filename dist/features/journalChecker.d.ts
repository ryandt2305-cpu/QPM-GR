export type ProduceVariantLog = {
    variant: string;
    createdAt?: number;
};
export type PetVariantLog = {
    variant: string;
    createdAt?: number;
};
export type PetAbilityLog = {
    ability: string;
    createdAt?: number;
};
export type SpeciesProduceLog = {
    variantsLogged?: ProduceVariantLog[];
};
export type SpeciesPetLog = {
    variantsLogged?: PetVariantLog[];
    abilitiesLogged?: PetAbilityLog[];
};
export type Journal = {
    produce?: Record<string, SpeciesProduceLog>;
    pets?: Record<string, SpeciesPetLog>;
};
export type JournalSummary = {
    produce: {
        species: string;
        variants: {
            variant: string;
            collected: boolean;
            collectedAt?: number | undefined;
        }[];
    }[];
    pets: {
        species: string;
        variants: {
            variant: string;
            collected: boolean;
            collectedAt?: number | undefined;
        }[];
    }[];
};
/**
 * Get journal with caching
 */
export declare function getJournal(): Promise<Journal | null>;
/**
 * Generate journal summary with missing items
 */
export declare function getJournalSummary(): Promise<JournalSummary | null>;
/**
 * Get statistics about journal completion
 */
export declare function getJournalStats(): Promise<{
    produce: {
        collected: number;
        total: number;
        percentage: number;
        typesCollected: number;
        typesTotal: number;
    };
    petVariants: {
        collected: number;
        total: number;
        percentage: number;
    };
    overall: {
        collected: number;
        total: number;
        percentage: number;
    };
} | null>;
/**
 * Refresh journal cache
 */
export declare function refreshJournalCache(): void;
//# sourceMappingURL=journalChecker.d.ts.map