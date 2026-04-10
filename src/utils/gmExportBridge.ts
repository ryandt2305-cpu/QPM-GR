// src/utils/gmExportBridge.ts
//
// Responds to Starweaver Mod Manager GM-export requests so the manager can
// migrate TM/VM private GM storage into its own persistence layer.
//
// Protocol (both sides use the __swmmType envelope key):
//   Request  (content bridge → page):  { __swmmType: "gm-export-request",  nonce: string }
//   Response (QPM → content bridge):   { __swmmType: "gm-export-response", nonce: string,
//                                        values: Record<string, string> }
//
// Values are JSON strings, matching the format storage.set() writes to GM storage.

import { exportAllValues } from './storage';

const ENVELOPE_KEY = '__swmmType';
const REQUEST_TYPE = 'gm-export-request';
const RESPONSE_TYPE = 'gm-export-response';

/**
 * Registers a one-time-per-page window message listener that answers export
 * requests from the Starweaver Mod Manager content bridge.
 *
 * Safe to call multiple times — a guard prevents duplicate registration.
 */
export function initGmExportBridge(): void {
  const guardKey = '__qpmGmExportBridgeInitialized';
  if ((window as unknown as Record<string, unknown>)[guardKey]) {
    return;
  }
  (window as unknown as Record<string, unknown>)[guardKey] = true;

  window.addEventListener('message', (event: MessageEvent) => {
    // Only handle messages from the same frame (rules out child frames / iframes)
    if (event.source !== window) {
      return;
    }

    const message = event.data;
    if (
      !message ||
      typeof message !== 'object' ||
      message[ENVELOPE_KEY] !== REQUEST_TYPE ||
      typeof message.nonce !== 'string' ||
      message.nonce.length === 0
    ) {
      return;
    }

    const values = exportAllValues();

    // Use location.origin as targetOrigin so the response stays on this page.
    window.postMessage(
      { [ENVELOPE_KEY]: RESPONSE_TYPE, nonce: message.nonce, values },
      location.origin
    );
  });
}
