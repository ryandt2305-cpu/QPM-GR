// src/utils/formatNumber.ts
// Number formatting utilities with K/M/B/T suffixes and full number on hover

/**
 * Format a number with K/M/B/T suffixes
 * @param num - The number to format
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted string like "1.5M"
 */
export function formatNumber(num: number, decimals: number = 1): string {
  if (num === 0) return '0';

  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : '';

  if (abs >= 1_000_000_000_000) {
    return sign + (abs / 1_000_000_000_000).toFixed(decimals) + 'T';
  }
  if (abs >= 1_000_000_000) {
    return sign + (abs / 1_000_000_000).toFixed(decimals) + 'B';
  }
  if (abs >= 1_000_000) {
    return sign + (abs / 1_000_000).toFixed(decimals) + 'M';
  }
  if (abs >= 1_000) {
    return sign + (abs / 1_000).toFixed(decimals) + 'K';
  }

  return sign + abs.toFixed(0);
}

/**
 * Format a number with full commas (e.g., "1,234,567")
 * Used for the full number display on hover
 */
export function formatNumberFull(num: number): string {
  return new Intl.NumberFormat('en-US').format(Math.floor(num));
}

/**
 * Create a span element with abbreviated number and full number on hover
 * @param num - The number to display
 * @param decimals - Number of decimal places for abbreviated form
 * @returns HTML string with title attribute
 */
export function createNumberSpan(num: number, decimals: number = 1): string {
  const abbreviated = formatNumber(num, decimals);
  const full = formatNumberFull(num);
  return `<span title="${full}">${abbreviated}</span>`;
}

/**
 * Create a span element for coin values with abbreviated and full display
 */
export function createCoinSpan(coins: number, decimals: number = 1): string {
  const abbreviated = formatNumber(coins, decimals);
  const full = formatNumberFull(coins);
  return `<span title="${full} coins">${abbreviated} coins</span>`;
}

/**
 * Format time duration in human-readable format
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  if (ms < 86400000) return `${(ms / 3600000).toFixed(1)}h`;
  return `${(ms / 86400000).toFixed(1)}d`;
}

/**
 * Format time ago (e.g., "5 minutes ago")
 */
export function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} minutes ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours ago`;
  return `${Math.floor(diff / 86400000)} days ago`;
}
