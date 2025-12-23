// src/utils/domBatcher.ts
// Batched DOM updates to minimize layout thrashing
// Collects DOM operations and flushes them in a single frame

type DOMOperation = () => void;

class DOMBatcher {
  private readQueue: DOMOperation[] = [];
  private writeQueue: DOMOperation[] = [];
  private scheduled = false;

  /**
   * Schedule a DOM read operation (e.g., getBoundingClientRect, offsetHeight)
   * Reads are batched and executed before writes
   */
  read(operation: DOMOperation): void {
    this.readQueue.push(operation);
    this.scheduleFlush();
  }

  /**
   * Schedule a DOM write operation (e.g., style changes, innerHTML)
   * Writes are batched and executed after all reads
   */
  write(operation: DOMOperation): void {
    this.writeQueue.push(operation);
    this.scheduleFlush();
  }

  /**
   * Schedule a measure-then-mutate operation
   * The measure function returns data, the mutate function uses it
   */
  measure<T>(measureFn: () => T, mutateFn: (data: T) => void): void {
    let data: T;
    this.read(() => {
      data = measureFn();
    });
    this.write(() => {
      mutateFn(data!);
    });
  }

  private scheduleFlush(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    requestAnimationFrame(() => this.flush());
  }

  private flush(): void {
    this.scheduled = false;

    // Execute all reads first
    const reads = this.readQueue.splice(0);
    for (const op of reads) {
      try {
        op();
      } catch (e) {
        console.error('[DOMBatcher] Read error:', e);
      }
    }

    // Then execute all writes
    const writes = this.writeQueue.splice(0);
    for (const op of writes) {
      try {
        op();
      } catch (e) {
        console.error('[DOMBatcher] Write error:', e);
      }
    }
  }

  /**
   * Immediately flush all pending operations
   */
  forceFlush(): void {
    if (this.readQueue.length || this.writeQueue.length) {
      this.flush();
    }
  }

  /**
   * Clear all pending operations
   */
  clear(): void {
    this.readQueue.length = 0;
    this.writeQueue.length = 0;
    this.scheduled = false;
  }
}

// Export singleton
export const domBatcher = new DOMBatcher();

// Convenience functions
export const batchRead = (op: DOMOperation): void => domBatcher.read(op);
export const batchWrite = (op: DOMOperation): void => domBatcher.write(op);
export const batchMeasure = <T>(measure: () => T, mutate: (data: T) => void): void => 
  domBatcher.measure(measure, mutate);

/**
 * Create elements efficiently using DocumentFragment
 * Batches multiple createElement operations
 */
export function createElements<T>(
  items: T[],
  createElement: (item: T, index: number) => HTMLElement
): DocumentFragment {
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < items.length; i++) {
    fragment.appendChild(createElement(items[i]!, i));
  }
  return fragment;
}

/**
 * Update a list of elements efficiently
 * Only updates changed items, reuses existing DOM nodes
 */
export function updateList<T>(
  container: HTMLElement,
  items: T[],
  keyFn: (item: T) => string,
  createFn: (item: T) => HTMLElement,
  updateFn?: (element: HTMLElement, item: T) => void
): void {
  const existingMap = new Map<string, HTMLElement>();
  
  // Index existing children by key
  for (const child of Array.from(container.children) as HTMLElement[]) {
    const key = child.dataset.key;
    if (key) {
      existingMap.set(key, child);
    }
  }

  const fragment = document.createDocumentFragment();
  const usedKeys = new Set<string>();

  for (const item of items) {
    const key = keyFn(item);
    usedKeys.add(key);

    let element = existingMap.get(key);
    if (element) {
      // Update existing element
      if (updateFn) {
        updateFn(element, item);
      }
    } else {
      // Create new element
      element = createFn(item);
      element.dataset.key = key;
    }
    fragment.appendChild(element);
  }

  // Clear and append in one operation
  container.innerHTML = '';
  container.appendChild(fragment);
}

/**
 * Efficient style batch update
 * Applies multiple style changes in one operation
 */
export function batchStyles(
  element: HTMLElement,
  styles: Partial<CSSStyleDeclaration>
): void {
  batchWrite(() => {
    Object.assign(element.style, styles);
  });
}

/**
 * Efficient class batch update
 */
export function batchClasses(
  element: HTMLElement,
  add: string[] = [],
  remove: string[] = []
): void {
  batchWrite(() => {
    if (remove.length) element.classList.remove(...remove);
    if (add.length) element.classList.add(...add);
  });
}





