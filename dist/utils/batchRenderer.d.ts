interface BatchRenderOptions {
    batchSize?: number;
    priority?: number;
    timeout?: number;
}
export declare class BatchRenderer {
    private queue;
    private isRunning;
    private batchSize;
    private maxFrameTime;
    constructor(options?: BatchRenderOptions);
    /**
     * Add items to the render queue
     */
    enqueue<T>(items: T[], render: (item: T) => HTMLElement | Promise<HTMLElement>, options?: BatchRenderOptions & {
        onBatchComplete?: (elements: HTMLElement[]) => void;
    }): void;
    /**
     * Start processing the render queue
     */
    private start;
    /**
     * Process one frame of rendering
     */
    private processFrame;
    /**
     * Clear the render queue
     */
    clear(): void;
    /**
     * Get remaining queue size
     */
    getQueueSize(): number;
    /**
     * Check if renderer is active
     */
    isActive(): boolean;
}
/**
 * Get or create global batch renderer
 */
export declare function getBatchRenderer(): BatchRenderer;
/**
 * Batch render sprites with requestAnimationFrame
 * @param sprites Array of sprite data to render
 * @param renderFn Function that renders a sprite and returns HTMLElement
 * @param container Optional container to append elements to
 * @param options Batch rendering options
 */
export declare function batchRenderSprites<T>(sprites: T[], renderFn: (sprite: T) => HTMLElement, container?: HTMLElement, options?: BatchRenderOptions): Promise<HTMLElement[]>;
/**
 * Render large list with batching and progress callback
 */
export declare function batchRenderWithProgress<T>(items: T[], renderFn: (item: T, index: number) => HTMLElement, onProgress?: (completed: number, total: number) => void): Promise<HTMLElement[]>;
export {};
//# sourceMappingURL=batchRenderer.d.ts.map