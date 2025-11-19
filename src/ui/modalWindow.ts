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
}

const WINDOW_POSITION_KEY = 'qpm-window-pos-';
const WINDOW_STATE_KEY = 'qpm-window-state-';
const WINDOW_MARGIN = 8;
const windows = new Map<string, WindowState>();
let currentZ = 10000;
let resizeListenerAdded = false;

/**
 * Clamp window position to ensure it stays visible (Aries mod pattern)
 */
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
  log('Window resize listener added');
}

/**
 * Open a window by ID. If already exists, show it and bump to front.
 */
export function openWindow(id: string, title: string, render: PanelRender, maxWidth?: string, maxHeight?: string): void {
  if (windows.has(id)) {
    const w = windows.get(id)!;
    w.el.style.display = '';
    w.isMinimized = false;
    bumpZ(w.el);
    saveWindowState(id, true, false);
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
    min-width: 260px;
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
    overflow: auto;
  `;

  // Header
  const head = document.createElement('div');
  head.className = 'qpm-window-head';
  head.style.cssText = `
    display: flex;
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

  // Body - simple container (scrolling handled by window)
  const body = document.createElement('div');
  body.className = 'qpm-window-body';
  body.style.cssText = `
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

  // Ensure window stays on screen after positioning
  requestAnimationFrame(() => {
    clampWindowRect(win);
  });

  // Add resize listener to keep windows visible (Aries mod pattern)
  ensureResizeListener();

  // Make draggable
  makeDraggable(win, head, id);

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
  };

  windows.set(id, state);
  saveWindowState(id, true, false);
  log(`Window ${id} opened`);
}

/**
 * Close a window
 */
export function closeWindow(id: string): void {
  const w = windows.get(id);
  if (!w) return;

  w.el.style.display = 'none';
  saveWindowState(id, false, w.isMinimized);
  log(`Window ${id} closed`);
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
    existing.el.style.display = '';
    existing.isMinimized = false;
    bumpZ(existing.el);
    saveWindowState(id, true, false);
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
    w.body.style.display = 'none';
    w.el.style.maxHeight = 'auto';
    w.minimizeBtn.textContent = '□';
    w.minimizeBtn.title = 'Restore';
  } else {
    w.body.style.display = '';
    w.el.style.maxHeight = w.maxHeight;
    w.minimizeBtn.textContent = '−';
    w.minimizeBtn.title = 'Minimize';
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
  log(`Window ${id} destroyed`);
}

/**
 * Destroy all windows
 */
export function destroyAllWindows(): void {
  windows.forEach((w) => destroyWindow(w.id));
}
