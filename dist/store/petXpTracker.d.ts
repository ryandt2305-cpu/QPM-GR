export type PetXpObservationSource = 'snapshot' | 'level-up';
export interface PetXpObservation {
    level: number;
    xp: number;
    strength: number | null;
    samples: number;
    lastObservedAt: number;
    source: PetXpObservationSource;
}
export interface PetXpSpeciesSnapshot {
    key: string;
    displayName: string;
    lastUpdated: number;
    levels: PetXpObservation[];
}
interface PersistedObservation {
    level: number;
    xp: number;
    strength: number | null;
    samples: number;
    lastObservedAt: number;
    source: PetXpObservationSource;
}
interface PersistedSpeciesTable {
    key: string;
    displayName: string;
    lastUpdated: number;
    levels: PersistedObservation[];
}
interface PersistedPayload {
    version: number;
    savedAt: number;
    species: PersistedSpeciesTable[];
}
export interface PetXpEstimate {
    value: number;
    level: number;
    confidence: PetXpObservationSource;
    samples: number;
    observedAt: number;
    displayName: string;
}
export declare function estimatePetXpTarget(species: string | null, level: number | null, mode: 'nextLevel' | 'maxLevel'): PetXpEstimate | null;
export declare function getPetXpSnapshots(): PetXpSpeciesSnapshot[];
export declare function exportPetXpSnapshot(): PersistedPayload;
export declare function clearPetXpSnapshots(): void;
export declare function initializePetXpTracker(): void;
export declare function disposePetXpTracker(): void;
export {};
//# sourceMappingURL=petXpTracker.d.ts.map