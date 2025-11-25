/**
 * Alert level based on hunger percentage
 */
export type AlertLevel = 'safe' | 'warning' | 'critical';
/**
 * Pet hunger state with computed values
 */
export interface PetHungerState {
    petIndex: number;
    petId: string;
    name: string;
    species: string;
    hungerPct: number;
    maxHunger: number;
    currentHunger: number;
    estimatedTimeToEmpty: number | null;
    hungerDecayRate: number | null;
    lastUpdateTime: number;
    alertLevel: AlertLevel;
    lastFedTime: number | null;
    level: number | null;
    xp: number | null;
    strength: number | null;
    abilities: string[];
    mutations: string[];
    position: {
        x: number | null;
        y: number | null;
    } | null;
}
/**
 * Configuration for hunger monitoring
 */
export interface HungerMonitorConfig {
    enabled: boolean;
    alertThresholdPct: number;
    criticalThresholdPct: number;
    flashPetSlots: boolean;
    largeNotifications: boolean;
    snapshotIntervalSec: number;
    minSnapshotsForRate: number;
}
/**
 * Get alert color for UI
 */
export declare function getAlertColor(level: AlertLevel): string;
/**
 * Get alert emoji for UI
 */
export declare function getAlertEmoji(level: AlertLevel): string;
/**
 * Initialize hunger monitoring
 */
export declare function initializeHungerMonitor(): Promise<void>;
/**
 * Manually refresh pet detection (useful for debugging)
 */
export declare function refreshPetDetection(): Promise<void>;
/**
 * Stop hunger monitoring
 */
export declare function stopHungerMonitor(): void;
/**
 * Register state change callback
 */
export declare function onHungerStateChange(callback: (states: PetHungerState[]) => void): void;
/**
 * Get current hunger states
 */
export declare function getHungerStates(): PetHungerState[];
/**
 * Get hunger state for specific pet
 */
export declare function getHungerState(petId: string): PetHungerState | null;
/**
 * Update configuration
 */
export declare function updateConfig(updates: Partial<HungerMonitorConfig>): void;
/**
 * Get current configuration
 */
export declare function getConfig(): HungerMonitorConfig;
/**
 * Register callback for configuration changes
 */
export declare function onConfigChange(callback: (config: HungerMonitorConfig) => void): () => void;
/**
 * Format time remaining as human-readable string
 */
export declare function formatTimeRemaining(minutes: number | null): string;
/**
 * Format decay rate for display
 */
export declare function formatDecayRate(rate: number | null): string;
/**
 * Format last fed time
 */
export declare function formatLastFed(timestamp: number | null): string;
//# sourceMappingURL=petHungerMonitor.d.ts.map