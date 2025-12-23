// src/ui/lazyWindow.ts
// Lazy window rendering utilities
// Defer heavy window content rendering until the window is actually opened

import { toggleWindow, type PanelRender, getWindow, isWindowOpen } from './modalWindow';
import { yieldToBrowser } from '../utils/scheduling';

export type LazyRender = () => Promise<PanelRender>;

/**
 * Map of window IDs to their lazy render functions.
 * The render function is only called when the window is first opened.
 */
const lazyRenders = new Map<string, LazyRender>();

/**
 * Map to track if a window has been rendered at least once
 */
const renderedWindows = new Set<string>();

/**
 * Register a window with lazy rendering.
 * The render function won't be called until the window is actually opened.
 */
export function registerLazyWindow(
  id: string,
  title: string,
  lazyRender: LazyRender,
  maxWidth?: string,
  maxHeight?: string
): () => Promise<boolean> {
  lazyRenders.set(id, lazyRender);
  
  // Return a function to toggle the window
  return () => toggleLazyWindow(id, title, maxWidth, maxHeight);
}

/**
 * Toggle a lazily-rendered window.
 * On first open, calls the lazy render function.
 */
export async function toggleLazyWindow(
  id: string,
  title: string,
  maxWidth?: string,
  maxHeight?: string
): Promise<boolean> {
  // If window is already open, just close it
  if (isWindowOpen(id)) {
    toggleWindow(id, title, () => {}, maxWidth, maxHeight);
    return false;
  }
  
  // Check if we've already rendered this window
  if (renderedWindows.has(id)) {
    // Re-open the existing window
    return toggleWindow(id, title, () => {}, maxWidth, maxHeight);
  }
  
  // Get the lazy render function
  const lazyRender = lazyRenders.get(id);
  if (!lazyRender) {
    console.warn(`[LazyWindow] No lazy render registered for window: ${id}`);
    return false;
  }
  
  // Create a loading placeholder render function
  const loadingRender: PanelRender = (root) => {
    root.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100px; color: #8f82ff;">
        <div style="font-size: 24px; margin-bottom: 8px;">⏳</div>
        <div>Loading...</div>
      </div>
    `;
  };
  
  // Open window with loading placeholder
  toggleWindow(id, title, loadingRender, maxWidth, maxHeight);
  
  // Yield to let the placeholder render
  await yieldToBrowser();
  
  try {
    // Get the actual render function
    const actualRender = await lazyRender();
    
    // Get the window body and re-render with actual content
    const win = getWindow(id);
    if (win && win.body) {
      win.body.innerHTML = '';
      actualRender(win.body);
      renderedWindows.add(id);
    }
  } catch (error) {
    console.error(`[LazyWindow] Failed to render window: ${id}`, error);
    
    // Show error state
    const win = getWindow(id);
    if (win && win.body) {
      win.body.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100px; color: #ff6b6b;">
          <div style="font-size: 24px; margin-bottom: 8px;">❌</div>
          <div>Failed to load window</div>
          <div style="font-size: 12px; opacity: 0.7; margin-top: 4px;">${error instanceof Error ? error.message : 'Unknown error'}</div>
        </div>
      `;
    }
  }
  
  return true;
}

/**
 * Clear the rendered state for a window.
 * The next time the window is opened, it will re-render.
 */
export function invalidateWindow(id: string): void {
  renderedWindows.delete(id);
}

/**
 * Clear all rendered window states.
 */
export function invalidateAllWindows(): void {
  renderedWindows.clear();
}

/**
 * Create a lazy-loading window toggle function.
 * This is a simpler API for common use cases.
 * 
 * @param id - Window ID
 * @param title - Window title
 * @param importFn - Function that dynamically imports and returns the render function
 * @param maxWidth - Optional max width
 * @param maxHeight - Optional max height
 * @returns A function that toggles the window
 */
export function createLazyWindowToggle(
  id: string,
  title: string,
  importFn: () => Promise<{ render: PanelRender }>,
  maxWidth?: string,
  maxHeight?: string
): () => Promise<boolean> {
  const lazyRender: LazyRender = async () => {
    const module = await importFn();
    return module.render;
  };
  
  lazyRenders.set(id, lazyRender);
  
  return () => toggleLazyWindow(id, title, maxWidth, maxHeight);
}

/**
 * Batch-register multiple lazy windows.
 * This is useful for setting up all windows at initialization time.
 */
export function registerLazyWindows(
  windows: Array<{
    id: string;
    title: string;
    lazyRender: LazyRender;
    maxWidth?: string;
    maxHeight?: string;
  }>
): Map<string, () => Promise<boolean>> {
  const toggles = new Map<string, () => Promise<boolean>>();
  
  for (const win of windows) {
    lazyRenders.set(win.id, win.lazyRender);
    toggles.set(win.id, () => toggleLazyWindow(win.id, win.title, win.maxWidth, win.maxHeight));
  }
  
  return toggles;
}

