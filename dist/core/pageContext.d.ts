/** Reference to the actual page window. Falls back to the sandbox window. */
export declare const pageWindow: Window & typeof globalThis;
/** True when we execute inside an isolated userscript sandbox. */
export declare const isIsolatedContext: boolean;
/** Expose the sandbox window for completeness. */
export declare const userscriptWindow: Window & typeof globalThis;
/**
 * Mirror a value onto both the page window and sandbox window.
 * Useful for sharing captured stores across co-existing scripts.
 */
export declare function shareGlobal(name: string, value: unknown): void;
/** Read a value that might have been stored on either window. */
export declare function readSharedGlobal<T = unknown>(name: string): T | undefined;
//# sourceMappingURL=pageContext.d.ts.map