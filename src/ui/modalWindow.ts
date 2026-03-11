// src/ui/modalWindow.ts - Modal Window System inspired by Aries mod
// Windows open when clicking tab buttons, draggable, with persistent position

import { storage } from '../utils/storage';
import { log } from '../utils/logger';

export type PanelRender = (root: HTMLElement) => void;

export interface WindowConfig {
  id: string;
  title: string;
  render: PanelRender;
  maxWidth?: string;
  maxHeight?: string;
}

interface WindowState {
  id: string;
  el: HTMLElement;
  head: HTMLElement;
  body: HTMLElement;
  titleEl: HTMLElement;
  minimizeBtn: HTMLElement;
  closeBtn: HTMLElement;
  isMinimized: boolean;
  maxHeight: string;
  restoreWidth: string | null;
  restoreHeight: string | null;
  restoreMinHeight: string | null;
  restoreMaxHeight: string | null;
}

const WINDOW_POSITION_KEY = 'qpm-window-pos-';
const WINDOW_STATE_KEY = 'qpm-window-state-';
const WINDOW_SIZE_KEY = 'qpm-window-size-';
const WINDOW_MARGIN = 8;
const WINDOW_MIN_WIDTH = 260;
const WINDOW_MIN_HEIGHT = 120;
const windows = new Map<string, WindowState>();
let currentZ = 10000;
let resizeListenerAdded = false;

function emitWindowEvent(eventName: string, id: string): void {
  window.dispatchEvent(new CustomEvent(eventName, { detail: { id } }));
}

function showWindowElement(el: HTMLElement, displayMode: 'flex' | 'block' = 'flex'): void {
  el.style.display = displayMode;
}

function setResizeHandleVisible(w: WindowState, visible: boolean): void {
  const handle = w.el.querySelector<HTMLElement>('.qpm-window-resize-handle');
  if (handle) handle.style.display = visible ? '' : 'none';
}

function restoreWindowFromMinimize(w: WindowState): void {
  showWindowElement(w.body, 'flex');
  if (w.restoreWidth) w.el.style.width = w.restoreWidth;
  if (w.restoreHeight) w.el.style.height = w.restoreHeight;
  if (w.restoreMinHeight) w.el.style.minHeight = w.restoreMinHeight;
  if (w.restoreMaxHeight) w.el.style.maxHeight = w.restoreMaxHeight;
  w.minimizeBtn.textContent = '−';
  w.minimizeBtn.title = 'Minimize';
  setResizeHandleVisible(w, true);
  requestAnimationFrame(() => {
    clampWindowSize(w.el);
    clampWindowRect(w.el);
  });
}

/**
 * Clamp window position to ensure it stays visible (Aries mod pattern)
 */
function clampWindowSizeToViewport(width: number, height: number): { width: number; height: number } {
  const maxWidth = Math.max(160, window.innerWidth - (WINDOW_MARGIN * 2));
  const maxHeight = Math.max(80, window.innerHeight - (WINDOW_MARGIN * 2));
  const minWidth = Math.min(WINDOW_MIN_WIDTH, maxWidth);
  const minHeight = Math.min(WINDOW_MIN_HEIGHT, maxHeight);
  return {
    width: Math.min(Math.max(width, minWidth), maxWidth),
    height: Math.min(Math.max(height, minHeight), maxHeight),
  };
}

function clampWindowSize(win: HTMLElement): void {
  const rect = win.getBoundingClientRect();
  const clamped = clampWindowSizeToViewport(rect.width, rect.height);

  if (Math.abs(clamped.width - rect.width) > 0.5) {
    win.style.width = `${Math.round(clamped.width)}px`;
  }
  if (Math.abs(clamped.height - rect.height) > 0.5) {
    win.style.height = `${Math.round(clamped.height)}px`;
  }
}

function clampWindowRect(win: HTMLElement): void {
  const rect = win.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let right = parseFloat(win.style.right) || (vw - rect.right);
  let top = parseFloat(win.style.top) || rect.top;

  const maxRight = Math.max(WINDOW_MARGIN, vw - rect.width - WINDOW_MARGIN);
  const maxTop = Math.max(WINDOW_MARGIN, vh - rect.height - WINDOW_MARGIN);

  right = Math.min(Math.max(right, WINDOW_MARGIN), maxRight);
  top = Math.min(Math.max(top, WINDOW_MARGIN), maxTop);

  win.style.right = `${right}px`;
  win.style.top = `${top}px`;
  win.style.left = 'auto';
  win.style.bottom = 'auto';
}

/**
 * Clamp all open windows on browser resize
 */
function clampAllWindows(): void {
  windows.forEach((state) => {
    if (!state.isMinimized) {
      clampWindowSize(state.el);
      clampWindowRect(state.el);
    }
  });
}

/**
 * Add window resize listener (once)
 */
function ensureResizeListener(): void {
  if (resizeListenerAdded) return;
  window.addEventListener('resize', clampAllWindows);
  resizeListenerAdded = true;
}

/**
 * Open a window by ID. If already exists, show it and bump to front.
 */
export function openWindow(id: string, title: string, render: PanelRender, maxWidth?: string, maxHeight?: string): void {
  if (windows.has(id)) {
    const w = windows.get(id)!;
    showWindowElement(w.el, 'flex');
    if (w.isMinimized) {
      w.isMinimized = false;
      restoreWindowFromMinimize(w);
    }
    bumpZ(w.el);
    saveWindowState(id, true, false);
    emitWindowEvent('qpm:window-restored', id);
    return;
  }

  // Use custom sizes if provided, otherwise default to 90vw/90vh
  const windowMaxWidth = maxWidth || '90vw';
  const windowMaxHeight = maxHeight || '90vh';

  // Create new window - Using Aries mod's working pattern
  const win = document.createElement('div');
  win.className = 'qpm-window';
  win.id = `qpm-window-${id}`;
  win.style.cssText = `
    position: fixed;
    display: flex;
    flex-direction: column;
    min-width: 260px;
    min-height: 120px;
    max-width: ${windowMaxWidth};
    max-height: ${windowMaxHeight};
    background: rgba(18, 20, 26, 0.96);
    border: 1px solid rgba(143, 130, 255, 0.5);
    border-radius: 8px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(12px);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 13px;
    color: #e0e0e0;
    z-index: ${currentZ++};
    box-sizing: border-box;
    overflow: hidden;
  `;

  // Header
  const head = document.createElement('div');
  head.className = 'qpm-window-head';
  head.style.cssText = `
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    background: linear-gradient(135deg, rgba(143, 130, 255, 0.12) 0%, rgba(143, 130, 255, 0.04) 100%);
    border-bottom: 1px solid rgba(143, 130, 255, 0.25);
    cursor: move;
    user-select: none;
  `;

  const titleEl = document.createElement('div');
  titleEl.className = 'qpm-window-title';
  titleEl.textContent = title;
  titleEl.style.cssText = `
    font-size: 15px;
    font-weight: 600;
    color: #8f82ff;
    flex: 1;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  `;

  const btnContainer = document.createElement('div');
  btnContainer.style.cssText = 'display: flex; gap: 6px;';

  const minimizeBtn = createWindowButton('−', 'Minimize');
  const closeBtn = createWindowButton('×', 'Close');

  btnContainer.appendChild(minimizeBtn);
  btnContainer.appendChild(closeBtn);

  head.appendChild(titleEl);
  head.appendChild(btnContainer);

  // Body - flex:1 so it fills remaining height; overflow:auto for scrolling
  const body = document.createElement('div');
  body.className = 'qpm-window-body';
  body.style.cssText = `
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    padding: 16px;
    background: rgba(0, 0, 0, 0.25);
    box-sizing: border-box;
  `;

  // Add custom scrollbar
  addScrollbarStyles(id);

  win.appendChild(head);
  win.appendChild(body);

  document.body.appendChild(win);

  // Render content directly in body
  render(body);

  // Restore position or center
  restoreWindowPosition(id, win);

  // Restore saved size if available (overrides max-width/max-height)
  restoreWindowSize(id, win);

  // Ensure window stays on screen after positioning
  requestAnimationFrame(() => {
    clampWindowSize(win);
    clampWindowRect(win);
  });

  // Add resize listener to keep windows visible (Aries mod pattern)
  ensureResizeListener();

  // Make draggable and resizable
  makeDraggable(win, head, id);
  makeResizable(win, id);

  // Prevent game zoom from interfering with window scrolling
  win.addEventListener('wheel', (e) => {
    e.stopPropagation();
  }, { passive: false });

  // Button handlers
  minimizeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMinimize(id);
  });

  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeWindow(id);
  });

  // Bump to front on click
  win.addEventListener('mousedown', () => bumpZ(win));

  // Store window state
  const state: WindowState = {
    id,
    el: win,
    head,
    body,
    titleEl,
    minimizeBtn,
    closeBtn,
    isMinimized: false,
    maxHeight: windowMaxHeight,
    restoreWidth: null,
    restoreHeight: null,
    restoreMinHeight: null,
    restoreMaxHeight: null,
  };

  windows.set(id, state);
  saveWindowState(id, true, false);
}

/**
 * Close a window
 */
export function closeWindow(id: string): void {
  const w = windows.get(id);
  if (!w) return;

  w.el.style.display = 'none';
  saveWindowState(id, false, w.isMinimized);
}

/**
 * Toggle window open/close
 */
export function toggleWindow(id: string, title: string, render: PanelRender, maxWidth?: string, maxHeight?: string): boolean {
  const existing = windows.get(id);
  if (!existing) {
    openWindow(id, title, render, maxWidth, maxHeight);
    return true;
  }

  if (isWindowShown(existing.el)) {
    closeWindow(id);
    return false;
  } else {
    showWindowElement(existing.el, 'flex');
    if (existing.isMinimized) {
      existing.isMinimized = false;
      restoreWindowFromMinimize(existing);
    }
    bumpZ(existing.el);
    saveWindowState(id, true, false);
    emitWindowEvent('qpm:window-restored', id);
    return true;
  }
}

/**
 * Toggle minimize/restore
 */
export function toggleMinimize(id: string): void {
  const w = windows.get(id);
  if (!w) return;

  w.isMinimized = !w.isMinimized;

  if (w.isMinimized) {
    const rect = w.el.getBoundingClientRect();
    w.restoreWidth = `${Math.round(rect.width)}px`;
    w.restoreHeight = `${Math.round(rect.height)}px`;
    w.restoreMinHeight = w.el.style.minHeight || '120px';
    w.restoreMaxHeight = w.el.style.maxHeight || w.maxHeight;
    w.body.style.display = 'none';
    w.el.style.width = w.restoreWidth;
    const collapsed = Math.max(36, Math.round(w.head.getBoundingClientRect().height));
    w.el.style.height = `${collapsed}px`;
    w.el.style.minHeight = `${collapsed}px`;
    w.el.style.maxHeight = `${collapsed}px`;
    w.minimizeBtn.textContent = '□';
    w.minimizeBtn.title = 'Restore';
    setResizeHandleVisible(w, false);
    emitWindowEvent('qpm:window-minimized', id);
  } else {
    restoreWindowFromMinimize(w);
    emitWindowEvent('qpm:window-restored', id);
  }

  saveWindowState(id, true, w.isMinimized);
}

/**
 * Check if window is currently shown
 */
function isWindowShown(el: HTMLElement): boolean {
  return el.style.display !== 'none';
}

/**
 * Bump window to front
 */
function bumpZ(el: HTMLElement): void {
  el.style.zIndex = String(currentZ++);
}

/**
 * Create window control button
 */
function createWindowButton(text: string, title: string): HTMLElement {
  const btn = document.createElement('button');
  btn.className = 'qpm-window-btn';
  btn.textContent = text;
  btn.title = title;
  btn.style.cssText = `
    width: 26px;
    height: 26px;
    border: none;
    background: rgba(255, 255, 255, 0.08);
    color: #e0e0e0;
    font-size: ${text === '×' ? '20px' : '18px'};
    font-weight: 300;
    line-height: 1;
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.15s ease;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  `;

  btn.addEventListener('mouseenter', () => {
    if (text === '×') {
      btn.style.background = 'rgba(244, 67, 54, 0.8)';
    } else {
      btn.style.background = 'rgba(143, 130, 255, 0.5)';
    }
    btn.style.color = '#fff';
  });

  btn.addEventListener('mouseleave', () => {
    btn.style.background = 'rgba(255, 255, 255, 0.08)';
    btn.style.color = '#e0e0e0';
  });

  return btn;
}

/**
 * Make window draggable
 */
function makeDraggable(win: HTMLElement, head: HTMLElement, id: string): void {
  let down = false;
  let sx = 0;
  let sy = 0;
  let or = 0;
  let ot = 0;

  const onMove = (e: MouseEvent) => {
    if (!down) return;
    e.preventDefault();

    const dx = e.clientX - sx;
    const dy = e.clientY - sy;

    const nr = or - dx;
    const nt = ot + dy;

    // Clamp to viewport using WINDOW_MARGIN
    const maxRight = window.innerWidth - WINDOW_MARGIN;
    const maxBottom = window.innerHeight - WINDOW_MARGIN;
    const rect = win.getBoundingClientRect();

    const clampedRight = Math.max(WINDOW_MARGIN - rect.width, Math.min(maxRight - rect.width, nr));
    const clampedTop = Math.max(WINDOW_MARGIN, Math.min(maxBottom - rect.height, nt));

    win.style.right = `${clampedRight}px`;
    win.style.top = `${clampedTop}px`;
    win.style.left = 'auto';
    win.style.bottom = 'auto';
  };

  const onUp = () => {
    if (!down) return;
    down = false;
    head.style.cursor = 'move';
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);

    // Save position
    saveWindowPosition(id, win);
  };

  head.addEventListener('mousedown', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('.qpm-window-btn')) return; // Don't drag when clicking buttons

    down = true;
    head.style.cursor = 'grabbing';
    sx = e.clientX;
    sy = e.clientY;

    const rect = win.getBoundingClientRect();
    or = parseFloat(win.style.right) || (window.innerWidth - rect.right);
    ot = parseFloat(win.style.top) || rect.top;

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    bumpZ(win);
  });
}

/**
 * Make window resizable via bottom-right drag handle
 */
function makeResizable(win: HTMLElement, id: string): void {
  const handle = document.createElement('div');
  handle.className = 'qpm-window-resize-handle';
  handle.title = 'Drag to resize';
  handle.style.cssText = [
    'position:absolute',
    'bottom:0',
    'right:0',
    'width:16px',
    'height:16px',
    'cursor:se-resize',
    'background:linear-gradient(135deg,transparent 50%,rgba(143,130,255,0.4) 50%)',
    'border-radius:0 0 7px 0',
    'z-index:2',
    'flex-shrink:0',
  ].join(';');
  win.appendChild(handle);

  let down = false;
  let startX = 0;
  let startY = 0;
  let startW = 0;
  let startH = 0;
  let startLeft = 0;
  let startTop = 0;

  const onMove = (e: MouseEvent): void => {
    if (!down) return;
    e.preventDefault();
    const rawWidth = startW + (e.clientX - startX);
    const rawHeight = startH + (e.clientY - startY);
    const maxWidth = Math.max(160, window.innerWidth - startLeft - WINDOW_MARGIN);
    const maxHeight = Math.max(80, window.innerHeight - startTop - WINDOW_MARGIN);
    const minWidth = Math.min(WINDOW_MIN_WIDTH, maxWidth);
    const minHeight = Math.min(WINDOW_MIN_HEIGHT, maxHeight);
    const newW = Math.min(Math.max(rawWidth, minWidth), maxWidth);
    const newH = Math.min(Math.max(rawHeight, minHeight), maxHeight);
    win.style.width = `${newW}px`;
    win.style.height = `${newH}px`;
  };

  const onUp = (): void => {
    if (!down) return;
    down = false;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    // Convert back to right-anchored (consistent with drag and initial positioning)
    const r = win.getBoundingClientRect();
    win.style.left = 'auto';
    win.style.right = `${Math.max(0, window.innerWidth - r.right)}px`;
    win.style.top = `${r.top}px`;
    clampWindowSize(win);
    clampWindowRect(win);
    saveWindowSize(id, win);
    saveWindowPosition(id, win);
  };

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = win.getBoundingClientRect();
    startW = rect.width;
    startH = rect.height;
    startLeft = rect.left;
    startTop = rect.top;
    // Convert to left-anchored so resize handle tracks cursor correctly.
    // Without this, right-anchored windows grow leftward while the handle stays
    // pinned to the right viewport edge, making direction feel inverted.
    win.style.left = `${rect.left}px`;
    win.style.top = `${rect.top}px`;
    win.style.right = 'auto';
    win.style.bottom = 'auto';
    win.style.width = `${startW}px`;
    win.style.height = `${startH}px`;
    win.style.maxWidth = 'none';
    win.style.maxHeight = 'none';
    startX = e.clientX;
    startY = e.clientY;
    down = true;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    bumpZ(win);
  });
}

/**
 * Save window size to localStorage
 */
function saveWindowSize(id: string, win: HTMLElement): void {
  const rect = win.getBoundingClientRect();
  storage.set(WINDOW_SIZE_KEY + id, { width: Math.round(rect.width), height: Math.round(rect.height) });
}

/**
 * Restore saved window size (overrides max constraints)
 */
function restoreWindowSize(id: string, win: HTMLElement): void {
  const saved = storage.get<{ width: number; height: number }>(WINDOW_SIZE_KEY + id);
  if (saved && saved.width > 0 && saved.height > 0) {
    const clamped = clampWindowSizeToViewport(saved.width, saved.height);
    win.style.width = `${Math.round(clamped.width)}px`;
    win.style.height = `${Math.round(clamped.height)}px`;
    win.style.maxWidth = 'none';
    win.style.maxHeight = 'none';
  }
}

/**
 * Save window position to localStorage
 */
function saveWindowPosition(id: string, win: HTMLElement): void {
  const rect = win.getBoundingClientRect();
  const position = {
    right: parseFloat(win.style.right) || (window.innerWidth - rect.right),
    top: parseFloat(win.style.top) || rect.top,
  };
  storage.set(WINDOW_POSITION_KEY + id, position);
}

/**
 * Restore window position from localStorage
 */
function restoreWindowPosition(id: string, win: HTMLElement): void {
  const saved = storage.get<{ right: number; top: number }>(WINDOW_POSITION_KEY + id);

  if (saved) {
    win.style.right = `${saved.right}px`;
    win.style.top = `${saved.top}px`;
    win.style.left = 'auto';
    win.style.bottom = 'auto';
  } else {
    // Center on screen
    win.style.left = '50%';
    win.style.top = '50%';
    win.style.transform = 'translate(-50%, -50%)';
    win.style.right = 'auto';
    win.style.bottom = 'auto';

    // After render, remove transform and calculate position
    requestAnimationFrame(() => {
      const rect = win.getBoundingClientRect();
      win.style.transform = '';
      win.style.left = 'auto';
      win.style.right = `${window.innerWidth - rect.right}px`;
      win.style.top = `${rect.top}px`;
      saveWindowPosition(id, win);
    });
  }
}

/**
 * Save window state (open/closed, minimized) to localStorage
 */
function saveWindowState(id: string, isOpen: boolean, isMinimized: boolean): void {
  storage.set(WINDOW_STATE_KEY + id, { isOpen, isMinimized });
}

/**
 * Add custom scrollbar styles
 */
function addScrollbarStyles(id: string): void {
  const styleId = `qpm-window-scrollbar-${id}`;
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    /* Scrollbar on the window itself (Aries mod pattern) */
    #qpm-window-${id}::-webkit-scrollbar {
      width: 8px;
    }
    #qpm-window-${id}::-webkit-scrollbar-track {
      background: rgba(0, 0, 0, 0.2);
      border-radius: 4px;
    }
    #qpm-window-${id}::-webkit-scrollbar-thumb {
      background: rgba(143, 130, 255, 0.35);
      border-radius: 4px;
      transition: background 0.2s;
    }
    #qpm-window-${id}::-webkit-scrollbar-thumb:hover {
      background: rgba(143, 130, 255, 0.55);
    }

    /* Constrain all content within window - prevent horizontal overflow */
    #qpm-window-${id} *,
    #qpm-window-${id} *::before,
    #qpm-window-${id} *::after {
      box-sizing: border-box;
      max-width: 100%;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }

    #qpm-window-${id} .qpm-card,
    #qpm-window-${id} .qpm-card__body,
    #qpm-window-${id} .qpm-card__header,
    #qpm-window-${id} .qpm-section-muted,
    #qpm-window-${id} input,
    #qpm-window-${id} button,
    #qpm-window-${id} select,
    #qpm-window-${id} div {
      max-width: 100%;
      min-width: 0;
    }

    /* Prevent pre/code from breaking layout */
    #qpm-window-${id} pre,
    #qpm-window-${id} code {
      white-space: pre-wrap;
      word-break: break-all;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Get window by ID
 */
export function getWindow(id: string): WindowState | null {
  return windows.get(id) || null;
}

/**
 * Check if window exists and is open
 */
export function isWindowOpen(id: string): boolean {
  const w = windows.get(id);
  return w ? isWindowShown(w.el) : false;
}

/**
 * Close all windows
 */
export function closeAllWindows(): void {
  windows.forEach((w) => closeWindow(w.id));
}

/**
 * Destroy a window completely
 */
export function destroyWindow(id: string): void {
  const w = windows.get(id);
  if (!w) return;

  w.el.remove();
  windows.delete(id);
}

/**
 * Destroy all windows
 */
export function destroyAllWindows(): void {
  windows.forEach((w) => destroyWindow(w.id));
}
