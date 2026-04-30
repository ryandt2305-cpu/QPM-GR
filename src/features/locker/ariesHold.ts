// src/features/locker/ariesHold.ts
// Rapid-fire hold mode: holding Space rapidly simulates pressing it at 10 Hz.
// Replicates the Aries mod "Hold to repeat" feature for all game actions
// (planting, harvesting, interacting, collecting, etc.).

import { pageWindow } from '../../core/pageContext';
import { getLockerConfig } from './state';

// ── Configuration ──────────────────────────────────────────────────────────

const RATE_HZ = 10;
const RATE_MS = 1000 / RATE_HZ;   // 100 ms between ticks
const KEYUP_DELAY_MS = 20;        // keydown → keyup gap per tap
const SYN_FLAG = '__qpm_rapid_syn__';
const SPACE_KEYCODE = 32;

// ── State ──────────────────────────────────────────────────────────────────

let listening = false;
let held = false;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let upTimer: ReturnType<typeof setTimeout> | null = null;
let lastTarget: EventTarget | null = null;

// ── Helpers ────────────────────────────────────────────────────────────────

function isTextInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

// ── Synthetic event dispatch ──────────────────────────────────────────────

function dispatchKey(type: 'keydown' | 'keyup', repeat: boolean): void {
  const target = lastTarget || pageWindow.document;
  // Use the page window's KeyboardEvent constructor for correct realm
  const EventCtor = (pageWindow as unknown as { KeyboardEvent: typeof KeyboardEvent }).KeyboardEvent;
  const ev = new EventCtor(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    key: ' ',
    code: 'Space',
    repeat,
  });

  // Legacy properties (some game handlers check keyCode/which)
  Object.defineProperties(ev, {
    keyCode:  { get: () => SPACE_KEYCODE },
    which:    { get: () => SPACE_KEYCODE },
    charCode: { get: () => SPACE_KEYCODE },
    [SYN_FLAG]: { value: true },
  });

  try {
    (target as Node).dispatchEvent(ev);
  } catch {
    pageWindow.document.dispatchEvent(ev);
  }
}

// ── Rapid-fire loop ──────────────────────────────────────────────────────

function tick(): void {
  if (!held) return;
  // Stop immediately if the user toggled the setting off mid-hold
  if (!getLockerConfig().ariesHold) {
    held = false;
    stopLoop();
    return;
  }
  dispatchKey('keydown', true);
  if (upTimer != null) clearTimeout(upTimer);
  upTimer = setTimeout(() => {
    dispatchKey('keyup', false);
    upTimer = null;
  }, KEYUP_DELAY_MS);
}

function startLoop(): void {
  stopLoop();
  tick(); // first tick fires immediately (matches Aries behavior)
  tickTimer = setInterval(tick, RATE_MS);
}

function stopLoop(): void {
  if (tickTimer != null) { clearInterval(tickTimer); tickTimer = null; }
  if (upTimer != null) { clearTimeout(upTimer); upTimer = null; }
}

// ── Event handlers ──────────────────────────────────────────────────────

function onKeyDown(event: KeyboardEvent): void {
  // Skip our own synthetic events
  if ((event as unknown as Record<string, unknown>)[SYN_FLAG]) return;
  if (event.code !== 'Space') return;
  if (event.repeat) return;
  if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
  if (isTextInputFocused()) return;
  if (!getLockerConfig().ariesHold) return;

  held = true;
  lastTarget = event.target;
  startLoop();
}

function onKeyUp(event: KeyboardEvent): void {
  if ((event as unknown as Record<string, unknown>)[SYN_FLAG]) return;
  if (event.code !== 'Space') return;
  if (!held) return;
  held = false;
  stopLoop();
}

function onBlur(): void {
  if (!held) return;
  held = false;
  stopLoop();
}

// ── Lifecycle ──────────────────────────────────────────────────────────────

export function startAriesHold(): void {
  if (listening) return;
  listening = true;
  // Register in capture phase, BEFORE instaHarvest to track held state
  // before instaHarvest may stopImmediatePropagation for qualifying plants.
  window.addEventListener('keydown', onKeyDown as EventListener, true);
  window.addEventListener('keyup', onKeyUp as EventListener, true);
  window.addEventListener('blur', onBlur);
}

export function stopAriesHold(): void {
  if (!listening) return;
  listening = false;
  held = false;
  stopLoop();
  window.removeEventListener('keydown', onKeyDown as EventListener, true);
  window.removeEventListener('keyup', onKeyUp as EventListener, true);
  window.removeEventListener('blur', onBlur);
  lastTarget = null;
}
