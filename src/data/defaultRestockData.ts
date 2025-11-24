// src/data/defaultRestockData.ts
// Default restock data - pre-parsed from Discord history
// This data is loaded on first run to provide historical context

import type { RestockEvent } from '../features/shopRestockTracker';

/**
 * Default restock events (imported from Discord #shop-restock channel)
 * To regenerate this file, run: npm run parse-discord-html
 */
export const DEFAULT_RESTOCK_EVENTS: RestockEvent[] = [];

// Note: This file will be populated by running the parse-discord-html script
// with your Discord HTML export file. The script will parse the HTML and
// generate a compact JSON array of RestockEvent objects.
