/**
 * Format a number with K/M/B suffixes for readability
 * @param value Number to format
 * @returns Formatted string (e.g., "1.5K", "2.3M", "1.0B")
 */
export declare function formatNumber(value: number): string;
/**
 * Format a coin value, returning '—' for null/undefined/NaN
 * @param value Coin value to format
 * @returns Formatted string or '—'
 */
export declare function formatCoins(value: number | null | undefined): string;
/**
 * Format a timestamp as a localized date string
 * @param timestamp Unix timestamp in milliseconds
 * @returns Localized date/time string
 */
export declare function formatDate(timestamp: number): string;
/**
 * Format a duration in hours to a human-readable string
 * @param hours Duration in hours
 * @returns Formatted string (e.g., "2.5h", "1.0d")
 */
export declare function formatDuration(hours: number): string;
/**
 * Format a percentage value
 * @param value Percentage (0-100)
 * @param decimals Number of decimal places (default: 1)
 * @returns Formatted percentage string
 */
export declare function formatPercentage(value: number, decimals?: number): string;
//# sourceMappingURL=formatters.d.ts.map