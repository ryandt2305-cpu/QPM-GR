/**
 * How long it takes for a pet to fully deplete their hunger (minutes)
 * This is independent of hunger capacity - all pets deplete at species-specific rates
 */
export declare const PET_HUNGER_DEPLETION_TIMES: Record<string, number>;
/**
 * Get hunger depletion time in minutes for a species
 */
export declare function getHungerDepletionTime(species: string | null | undefined): number | null;
/**
 * Calculate hunger depletion rate (hunger points per minute)
 * @param species Pet species
 * @param hungerCap Maximum hunger capacity for this species
 * @returns Hunger points depleted per minute, or null if unknown
 */
export declare function getHungerDepletionRate(species: string | null | undefined, hungerCap: number): number | null;
/**
 * Calculate how many feeds are needed for a pet to gain X levels
 * Assumes pet is kept at optimal hunger (> minimum threshold)
 *
 * @param species Pet species
 * @param hungerCap Pet's hunger capacity
 * @param xpPerLevel XP required per level
 * @param xpPerHour Team XP generation rate (XP/hour)
 * @param levelsToGain Number of levels to calculate feeds for
 * @returns Number of feeds needed, or null if calculation not possible
 */
export declare function calculateFeedsForLevels(species: string | null | undefined, hungerCap: number, xpPerLevel: number, xpPerHour: number, levelsToGain: number): number | null;
/**
 * Calculate feeds per level (convenience wrapper)
 */
export declare function calculateFeedsPerLevel(species: string | null | undefined, hungerCap: number, xpPerLevel: number, xpPerHour: number): number | null;
//# sourceMappingURL=petHungerDepletion.d.ts.map