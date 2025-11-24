// src/core/pageContext.ts
// Minimal helpers to interact with the page window regardless of sandboxing.

/* eslint-disable @typescript-eslint/ban-ts-comment */
// Some userscript environments still expose unsafeWindow while others do not.
// We defensively rely on a declared global so the bundler does not complain.
// @ts-ignore
declare const unsafeWindow: (Window & typeof globalThis & Record<string, unknown>) | undefined;
/* eslint-enable @typescript-eslint/ban-ts-comment */

const sandboxWindow = window;
const pageWindowRef = typeof unsafeWindow !== 'undefined' && unsafeWindow
  ? unsafeWindow
  : sandboxWindow;

/** Reference to the actual page window. Falls back to the sandbox window. */
export const pageWindow = pageWindowRef;

/** True when we execute inside an isolated userscript sandbox. */
export const isIsolatedContext = pageWindowRef !== sandboxWindow;

/** Expose the sandbox window for completeness. */
export const userscriptWindow = sandboxWindow;

/**
 * Mirror a value onto both the page window and sandbox window.
 * Useful for sharing captured stores across co-existing scripts.
 */
export function shareGlobal(name: string, value: unknown): void {
  try {
    (pageWindowRef as unknown as Record<string, unknown>)[name] = value;
  } catch {}

  if (isIsolatedContext) {
    try {
      (sandboxWindow as unknown as Record<string, unknown>)[name] = value;
    } catch {}
  }
}

/** Read a value that might have been stored on either window. */
export function readSharedGlobal<T = unknown>(name: string): T | undefined {
  if (isIsolatedContext) {
    const sandboxValue = (sandboxWindow as unknown as Record<string, unknown>)[name];
    if (sandboxValue !== undefined) {
      return sandboxValue as T;
    }
  }
  return (pageWindowRef as unknown as Record<string, unknown>)[name] as T | undefined;
}
