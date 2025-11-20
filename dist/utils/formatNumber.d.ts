/**
 * Format a number with K/M/B/T suffixes
 * @param num - The number to format
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted string like "1.5M"
 */
export declare function formatNumber(num: number, decimals?: number): string;
/**
 * Format a number with full commas (e.g., "1,234,567")
 * Used for the full number display on hover
 */
export declare function formatNumberFull(num: number): string;
/**
 * Create a span element with abbreviated number and full number on hover
 * @param num - The number to display
 * @param decimals - Number of decimal places for abbreviated form
 * @returns HTML string with title attribute
 */
export declare function createNumberSpan(num: number, decimals?: number): string;
/**
 * Create a span element for coin values with abbreviated and full display
 */
export declare function createCoinSpan(coins: number, decimals?: number): string;
/**
 * Format time duration in human-readable format
 */
export declare function formatDuration(ms: number): string;
/**
 * Format time ago (e.g., "5 minutes ago")
 */
export declare function formatTimeAgo(timestamp: number): string;
//# sourceMappingURL=formatNumber.d.ts.map