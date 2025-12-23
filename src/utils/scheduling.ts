// src/utils/scheduling.ts
// Cooperative scheduling utilities to prevent main thread blocking
// Inspired by Aries mod's non-blocking patterns

/**
 * Yields control back to the browser to allow rendering and user interaction.
 * Uses requestIdleCallback when available (best), falls back to rAF, then setTimeout.
 * 
 * @param timeout - Maximum time to wait before forcing resolution (ms)
 */
export function yieldToBrowser(timeout = 32): Promise<void> {
  return new Promise((resolve) => {
    const win = typeof window !== 'undefined' ? window : null;
    if (!win) {
      resolve();
      return;
    }

    // Prefer requestIdleCallback for best scheduling
    if (typeof (win as any).requestIdleCallback === 'function') {
      (win as any).requestIdleCallback(() => resolve(), { timeout });
    } else if (typeof requestAnimationFrame === 'function') {
      // Fall back to rAF for next frame
      requestAnimationFrame(() => resolve());
    } else {
      // Last resort: setTimeout(0) defers to event loop
      setTimeout(resolve, 0);
    }
  });
}

/**
 * Yields only if enough work has been done (frame count or time elapsed).
 * Call this inside loops to prevent blocking.
 */
export class YieldController {
  private frameCount = 0;
  private chunkStart: number;
  private readonly maxFrames: number;
  private readonly maxMs: number;

  constructor(maxFrames = 6, maxMs = 10) {
    this.maxFrames = maxFrames;
    this.maxMs = maxMs;
    this.chunkStart = typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  /**
   * Call after each unit of work. Returns true if you should yield.
   */
  shouldYield(): boolean {
    this.frameCount++;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const elapsed = now - this.chunkStart;
    return this.frameCount >= this.maxFrames || elapsed >= this.maxMs;
  }

  /**
   * Yields if needed, then resets counters.
   */
  async yieldIfNeeded(): Promise<void> {
    if (this.shouldYield()) {
      await yieldToBrowser();
      this.reset();
    }
  }

  /**
   * Resets the frame counter and timer.
   */
  reset(): void {
    this.frameCount = 0;
    this.chunkStart = typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  /**
   * Force yield and reset.
   */
  async forceYield(): Promise<void> {
    await yieldToBrowser();
    this.reset();
  }
}

/**
 * Process an array in chunks with yielding between chunks.
 * Prevents long-running loops from blocking the main thread.
 * 
 * @param items - Array of items to process
 * @param processor - Function to call for each item
 * @param chunkSize - Number of items per chunk (default: 5)
 * @param delayMs - Delay between chunks in ms (default: 8)
 */
export async function runInChunks<T>(
  items: T[],
  processor: (item: T, index: number) => void | Promise<void>,
  chunkSize = 5,
  delayMs = 8
): Promise<void> {
  const total = items.length;
  let index = 0;

  while (index < total) {
    const chunkEnd = Math.min(index + chunkSize, total);
    
    // Process this chunk
    for (let i = index; i < chunkEnd; i++) {
      const item = items[i];
      if (item !== undefined) {
        await processor(item, i);
      }
    }
    
    index = chunkEnd;
    
    // Yield between chunks if there's more work
    if (index < total) {
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

/**
 * Process an array with a time budget per frame.
 * Automatically yields when the budget is exceeded.
 * 
 * @param items - Array of items to process
 * @param processor - Sync function to call for each item
 * @param budgetMs - Time budget per frame (default: 8ms)
 */
export async function runWithBudget<T>(
  items: T[],
  processor: (item: T, index: number) => void,
  budgetMs = 8
): Promise<void> {
  const total = items.length;
  let index = 0;
  let chunkStart = performance.now();

  while (index < total) {
    const item = items[index];
    if (item !== undefined) {
      processor(item, index);
    }
    index++;

    // Check if we've exceeded the budget
    const elapsed = performance.now() - chunkStart;
    if (elapsed >= budgetMs && index < total) {
      await yieldToBrowser();
      chunkStart = performance.now();
    }
  }
}

/**
 * Deferred execution helper - schedules work during idle time.
 * Returns a promise that resolves with the result.
 */
export function scheduleIdle<T>(fn: () => T | Promise<T>, timeout = 50): Promise<T> {
  return new Promise((resolve, reject) => {
    const runner = async () => {
      try {
        const result = await fn();
        resolve(result);
      } catch (error) {
        reject(error);
      }
    };

    const win = typeof window !== 'undefined' ? window : null;
    if (win && typeof (win as any).requestIdleCallback === 'function') {
      (win as any).requestIdleCallback(runner, { timeout });
    } else if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(runner);
    } else {
      setTimeout(runner, 0);
    }
  });
}

/**
 * Delays execution for a specified number of milliseconds.
 * Use this instead of blocking sleeps.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Waits for a condition to be true, checking periodically.
 * Useful for waiting on game state without blocking.
 */
export async function waitFor(
  condition: () => boolean,
  timeoutMs = 10000,
  intervalMs = 50
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  
  while (Date.now() < deadline) {
    if (condition()) {
      return true;
    }
    await delay(intervalMs);
  }
  
  return false;
}

/**
 * Waits for a condition with exponential backoff.
 * Good for things that may take variable time to appear.
 */
export async function waitForWithBackoff(
  condition: () => boolean,
  timeoutMs = 10000,
  initialIntervalMs = 50,
  maxIntervalMs = 500
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  let interval = initialIntervalMs;
  
  while (Date.now() < deadline) {
    if (condition()) {
      return true;
    }
    await delay(interval);
    interval = Math.min(interval * 1.5, maxIntervalMs);
  }
  
  return false;
}


