// src/utils/environment.ts
// Minimal environment detection helpers for cross-surface compatibility.

/** True when running inside Discord's activity iframe. */
export const isDiscordSurface: boolean =
  typeof location !== 'undefined' && location.hostname.includes('discord');

/** True when GM_* userscript APIs are available. */
export const hasGmApis: boolean =
  typeof GM_getValue === 'function' && typeof GM_setValue === 'function';
