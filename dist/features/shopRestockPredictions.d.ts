import { RestockEvent } from './shopRestockTracker';
/**
 * Item-specific restock configuration based on analysis of 34,861 events
 * See: RARE_RESTOCK_ANALYSIS.md for full details
 */
interface ItemRestockConfig {
    hardCooldownHours: number;
    practicalMinimumHours: number;
    allowedHours: number[] | null;
    correlationItems?: {
        itemName: string;
        windowHours: number;
        probability: number;
    }[];
    burstBehavior?: {
        windowHours: number;
        probability: number;
    };
}
/**
 * Time window for prediction
 */
export interface PredictionWindow {
    startTime: number;
    endTime: number;
    hour: number;
    confidence: 'high' | 'medium' | 'low';
    reason: string;
}
/**
 * Prediction result with time windows
 */
export interface WindowBasedPrediction {
    itemName: string;
    nextWindows: PredictionWindow[];
    tooEarly: boolean;
    cooldownActive: boolean;
    lastSeenTime: number | null;
    timeSinceLastSeen: number | null;
    hardCooldownRemaining: number | null;
    practicalMinimumRemaining: number | null;
    correlationSignals?: {
        itemName: string;
        detectedAt: number;
        probability: number;
        message: string;
    }[] | undefined;
    monitoringSchedule?: {
        message: string;
        optimalHours: number[];
    } | undefined;
}
/**
 * Get window-based prediction for an item
 */
export declare function predictItemWindows(itemName: string, lastSeenTime: number | null, recentEvents: RestockEvent[]): WindowBasedPrediction;
/**
 * Get monitoring alert status for current time
 * Returns items that should trigger monitoring alerts
 */
export declare function getMonitoringAlerts(predictions: Map<string, WindowBasedPrediction>): Array<{
    itemName: string;
    message: string;
    urgency: 'high' | 'medium' | 'low';
}>;
/**
 * Format time window for display
 */
export declare function formatTimeWindow(window: PredictionWindow): string;
/**
 * Get item configuration (for debugging/display)
 */
export declare function getItemConfig(itemName: string): ItemRestockConfig | null;
export {};
//# sourceMappingURL=shopRestockPredictions.d.ts.map