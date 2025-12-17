import { PixiHooks } from './types';
/**
 * Creates hooks to intercept PIXI initialization.
 * The game calls __PIXI_APP_INIT__ and __PIXI_RENDERER_INIT__ when PIXI is ready.
 * We need to hook into these to get access to PIXI constructors and renderer.
 */
export declare function createPixiHooks(): PixiHooks;
/**
 * Waits for PIXI to be initialized and returns the app and renderer
 */
export declare function waitForPixi(handles: PixiHooks, timeoutMs?: number): Promise<{
    app: any;
    renderer: any;
    version: string | null;
}>;
/**
 * Ensures the document is ready before proceeding
 */
export declare function ensureDocumentReady(): Promise<void>;
//# sourceMappingURL=hooks.d.ts.map