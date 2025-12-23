// src/utils/batchRenderer.ts
// Batched rendering with requestAnimationFrame to prevent UI blocking

import { log } from './logger';

interface RenderTask<T> {
  item: T;
  render: (item: T) => HTMLElement | Promise<HTMLElement>;
  onComplete?: (element: HTMLElement) => void;
}

interface BatchRenderOptions {
  batchSize?: number; // Number of items to render per frame
  priority?: number; // Higher priority tasks run first
  timeout?: number; // Max time per frame in ms
}

export class BatchRenderer {
  private queue: Array<RenderTask<any> & { priority: number }> = [];
  private isRunning: boolean = false;
  private batchSize: number;
  private maxFrameTime: number;

  constructor(options?: BatchRenderOptions) {
    this.batchSize = options?.batchSize || 10;
    this.maxFrameTime = options?.timeout || 16; // ~60fps
  }

  /**
   * Add items to the render queue
   */
  public enqueue<T>(
    items: T[],
    render: (item: T) => HTMLElement | Promise<HTMLElement>,
    options?: BatchRenderOptions & { onBatchComplete?: (elements: HTMLElement[]) => void }
  ): void {
    const priority = options?.priority || 0;
    const elements: HTMLElement[] = [];
    let completedCount = 0;

    items.forEach((item) => {
      this.queue.push({
        item,
        render,
        priority,
        onComplete: (element) => {
          elements.push(element);
          completedCount++;
          
          // Call batch complete callback when all items are done
          if (completedCount === items.length && options?.onBatchComplete) {
            options.onBatchComplete(elements);
          }
        },
      });
    });

    // Sort queue by priority (higher first)
    this.queue.sort((a, b) => b.priority - a.priority);

    if (!this.isRunning) {
      this.start();
    }
  }

  /**
   * Start processing the render queue
   */
  private start(): void {
    if (this.isRunning || this.queue.length === 0) {
      return;
    }

    this.isRunning = true;
    this.processFrame();
  }

  /**
   * Process one frame of rendering
   */
  private processFrame(): void {
    const frameStart = performance.now();
    let rendered = 0;

    while (
      this.queue.length > 0 &&
      rendered < this.batchSize &&
      performance.now() - frameStart < this.maxFrameTime
    ) {
      const task = this.queue.shift();
      if (!task) break;

      try {
        const result = task.render(task.item);
        
        if (result instanceof Promise) {
          // Handle async rendering
          result.then((element) => {
            if (task.onComplete) {
              task.onComplete(element);
            }
          }).catch((err) => {
            console.error('[BatchRenderer] Async render failed:', err);
          });
        } else {
          // Synchronous rendering
          if (task.onComplete) {
            task.onComplete(result);
          }
        }
        
        rendered++;
      } catch (error) {
        console.error('[BatchRenderer] Render failed:', error);
      }
    }

    // Continue processing if there are more items
    if (this.queue.length > 0) {
      requestAnimationFrame(() => this.processFrame());
    } else {
      this.isRunning = false;
    }
  }

  /**
   * Clear the render queue
   */
  public clear(): void {
    this.queue = [];
    this.isRunning = false;
  }

  /**
   * Get remaining queue size
   */
  public getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Check if renderer is active
   */
  public isActive(): boolean {
    return this.isRunning;
  }
}

// Global batch renderer instance
let globalRenderer: BatchRenderer | null = null;

/**
 * Get or create global batch renderer
 */
export function getBatchRenderer(): BatchRenderer {
  if (!globalRenderer) {
    globalRenderer = new BatchRenderer({
      batchSize: 10,
      timeout: 16,
    });
  }
  return globalRenderer;
}

/**
 * Batch render sprites with requestAnimationFrame
 * @param sprites Array of sprite data to render
 * @param renderFn Function that renders a sprite and returns HTMLElement
 * @param container Optional container to append elements to
 * @param options Batch rendering options
 */
export async function batchRenderSprites<T>(
  sprites: T[],
  renderFn: (sprite: T) => HTMLElement,
  container?: HTMLElement,
  options?: BatchRenderOptions
): Promise<HTMLElement[]> {
  return new Promise((resolve) => {
    const renderer = getBatchRenderer();
    const elements: HTMLElement[] = [];

    renderer.enqueue(
      sprites,
      (sprite) => {
        const element = renderFn(sprite);
        if (container) {
          container.appendChild(element);
        }
        return element;
      },
      {
        ...options,
        onBatchComplete: (rendered) => {
          resolve(rendered);
        },
      }
    );
  });
}

/**
 * Render large list with batching and progress callback
 */
export async function batchRenderWithProgress<T>(
  items: T[],
  renderFn: (item: T, index: number) => HTMLElement,
  onProgress?: (completed: number, total: number) => void
): Promise<HTMLElement[]> {
  const elements: HTMLElement[] = [];
  const batchSize = 10;
  
  for (let i = 0; i < items.length; i += batchSize) {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        const batch = items.slice(i, i + batchSize);
        
        batch.forEach((item, batchIndex) => {
          const element = renderFn(item, i + batchIndex);
          elements.push(element);
        });

        if (onProgress) {
          onProgress(Math.min(i + batchSize, items.length), items.length);
        }

        resolve();
      });
    });
  }

  return elements;
}
