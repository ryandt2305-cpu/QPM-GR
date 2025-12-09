/**
 * Test all pet and crop sprites to ensure they render without errors
 */
export declare function QPM_TEST_ALL_SPRITES(): void;
/**
 * Run performance benchmark on sprite generation
 */
export declare function QPM_BENCHMARK(): void;
/**
 * Validate species name mappings and normalization
 */
export declare function QPM_VALIDATE_SPECIES(): void;
/**
 * Inspect cache contents and statistics
 */
export declare function QPM_CACHE_INSPECT(): void;
declare global {
    interface Window {
        QPM_TEST_ALL_SPRITES: typeof QPM_TEST_ALL_SPRITES;
        QPM_BENCHMARK: typeof QPM_BENCHMARK;
        QPM_VALIDATE_SPECIES: typeof QPM_VALIDATE_SPECIES;
        QPM_CACHE_INSPECT: typeof QPM_CACHE_INSPECT;
    }
}
export declare function exposeValidationCommands(): void;
//# sourceMappingURL=validationCommands.d.ts.map