/**
 * Aries mod stores extended pet ability logs on the window object.
 * This bridge provides type-safe access to that data.
 */
export interface AriesPetLog {
    abilityId: string;
    performedAt: number;
    petId?: string;
    slotId?: string;
    slotIndex?: number;
    data?: unknown;
    [key: string]: unknown;
}
export interface AriesAbilityStats {
    abilityId: string;
    totalProcs: number;
    lastProcAt: number;
    [key: string]: unknown;
}
/**
 * Get pet ability logs from Aries mod
 * Returns an empty array if Aries mod is not available
 */
export declare function getAriesPetLogs(): AriesPetLog[];
/**
 * Get ability statistics from Aries mod
 */
export declare function getAriesAbilityStats(): Record<string, AriesAbilityStats>;
/**
 * Check if Aries mod is available
 */
export declare function isAriesModAvailable(): boolean;
/**
 * Subscribe to Aries mod pet log updates
 * Returns unsubscribe function
 */
export declare function subscribeToAriesLogs(callback: (logs: AriesPetLog[]) => void): () => void;
/**
 * Get all ability logs from Aries mod for a specific ability
 */
export declare function getAriesLogsForAbility(abilityId: string): AriesPetLog[];
/**
 * Get all ability logs from Aries mod for a specific pet
 */
export declare function getAriesLogsForPet(petId: string): AriesPetLog[];
//# sourceMappingURL=ariesModBridge.d.ts.map