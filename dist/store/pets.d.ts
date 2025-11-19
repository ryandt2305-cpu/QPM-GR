export interface ActivePetInfo {
    slotIndex: number;
    slotId: string | null;
    petId: string | null;
    hungerPct: number | null;
    hungerValue: number | null;
    hungerMax: number | null;
    hungerRaw: string | null;
    name: string | null;
    species: string | null;
    targetScale: number | null;
    mutations: string[];
    abilities: string[];
    xp: number | null;
    level: number | null;
    levelRaw: string | null;
    strength: number | null;
    position: {
        x: number | null;
        y: number | null;
    } | null;
    updatedAt: number;
    raw: unknown;
}
export declare function startPetInfoStore(): Promise<void>;
export declare function stopPetInfoStore(): void;
/**
 * Debug function to get current active pet data
 * Can be called from browser console via window.QPM.debugPets()
 */
export declare function getActivePetsDebug(): ActivePetInfo[];
export declare function getActivePetInfos(): ActivePetInfo[];
export declare function onActivePetInfos(callback: (infos: ActivePetInfo[]) => void, fireImmediately?: boolean): () => void;
//# sourceMappingURL=pets.d.ts.map