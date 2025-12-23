// src/utils/elementCache.ts
// Cache DOM element references to avoid repeated querySelector calls

import { visibleInterval } from './timerManager';

type ElementCacheEntry = {
  element: HTMLElement | null;
  selector: string;
  parent: ParentNode;
  timestamp: number;
};

class ElementCache {
  private cache = new Map<string, ElementCacheEntry>();
  private maxAge = 30000; // 30 seconds max cache age
  private cleanupInterval: (() => void) | null = null;

  constructor() {
    // Periodic cleanup of stale entries (pauses when tab hidden)
    if (typeof window !== 'undefined') {
      this.cleanupInterval = visibleInterval('element-cache-cleanup', () => this.cleanup(), 60000);
    }
  }

  /**
   * Get an element by selector, using cache if available
   */
  get<T extends HTMLElement = HTMLElement>(
    selector: string,
    parent: ParentNode = document
  ): T | null {
    const key = this.makeKey(selector, parent);
    const cached = this.cache.get(key);

    if (cached) {
      // Verify element is still in DOM
      if (cached.element && cached.element.isConnected) {
        return cached.element as T;
      }
      // Element was removed, clear cache
      this.cache.delete(key);
    }

    // Query and cache
    const element = parent.querySelector<T>(selector);
    this.cache.set(key, {
      element,
      selector,
      parent,
      timestamp: Date.now(),
    });

    return element;
  }

  /**
   * Get multiple elements by selector
   */
  getAll<T extends HTMLElement = HTMLElement>(
    selector: string,
    parent: ParentNode = document
  ): T[] {
    // Don't cache getAll results as they change more frequently
    return Array.from(parent.querySelectorAll<T>(selector));
  }

  /**
   * Invalidate cache for a specific selector
   */
  invalidate(selector: string, parent: ParentNode = document): void {
    const key = this.makeKey(selector, parent);
    this.cache.delete(key);
  }

  /**
   * Invalidate all cache entries for a parent
   */
  invalidateParent(parent: ParentNode): void {
    for (const [key, entry] of this.cache.entries()) {
      if (entry.parent === parent) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Cleanup stale entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      // Remove if stale or element no longer in DOM
      if (now - entry.timestamp > this.maxAge || 
          (entry.element && !entry.element.isConnected)) {
        this.cache.delete(key);
      }
    }
  }

  private makeKey(selector: string, parent: ParentNode): string {
    // Use a combination of selector and parent identity
    const parentId = parent === document 
      ? 'document' 
      : (parent as HTMLElement).id || (parent as HTMLElement).className || 'unknown';
    return `${parentId}::${selector}`;
  }

  /**
   * Destroy the cache and cleanup interval
   */
  destroy(): void {
    if (this.cleanupInterval !== null) {
      this.cleanupInterval();
      this.cleanupInterval = null;
    }
    this.cache.clear();
  }
}

// Export singleton
export const elementCache = new ElementCache();

// Convenience function
export const $$ = <T extends HTMLElement = HTMLElement>(
  selector: string,
  parent?: ParentNode
): T | null => elementCache.get<T>(selector, parent);

// For cases where you need fresh results (no cache)
export const $fresh = <T extends HTMLElement = HTMLElement>(
  selector: string,
  parent: ParentNode = document
): T | null => parent.querySelector<T>(selector);

// Get all matching elements (always fresh)
export const $$all = <T extends HTMLElement = HTMLElement>(
  selector: string,
  parent: ParentNode = document
): T[] => Array.from(parent.querySelectorAll<T>(selector));


/**
 * Create a scoped element manager for a specific container
 * Useful for window/panel management where elements are frequently accessed
 */
export function createScopedCache(container: HTMLElement) {
  const localCache = new Map<string, HTMLElement | null>();

  return {
    get<T extends HTMLElement = HTMLElement>(selector: string): T | null {
      if (localCache.has(selector)) {
        const cached = localCache.get(selector);
        if (cached && cached.isConnected) {
          return cached as T;
        }
        localCache.delete(selector);
      }
      const element = container.querySelector<T>(selector);
      localCache.set(selector, element);
      return element;
    },

    invalidate(selector?: string): void {
      if (selector) {
        localCache.delete(selector);
      } else {
        localCache.clear();
      }
    },

    clear(): void {
      localCache.clear();
    },
  };
}





