// src/features/locker/index.ts
// Public API for the Action Guard (Locker).

import { registerSendPreflight, clearSendPreflight } from '../../websocket/api';
import { lockerPreflight, startNativeHook, stopNativeHook } from './guard';
import { startAriesHold, stopAriesHold } from './ariesHold';
import { startInstaAction, stopInstaAction } from './instaAction';
import { startInstaHarvest, stopInstaHarvest } from './instaHarvest';

let running = false;

export function startLocker(): void {
  if (running) return;
  running = true;
  registerSendPreflight(lockerPreflight);
  startNativeHook();
  // ariesHold registers BEFORE instaAction/instaHarvest so its capture-phase
  // listener can track held state before they may stopImmediatePropagation.
  startAriesHold();
  startInstaAction();
  startInstaHarvest();
}

export function stopLocker(): void {
  if (!running) return;
  running = false;
  clearSendPreflight();
  stopNativeHook();
  stopAriesHold();
  stopInstaAction();
  stopInstaHarvest();
}

export function isLockerRunning(): boolean {
  return running;
}

export { getLockerConfig, updateLockerConfig, resetLockerConfig } from './state';
export type { LockerConfig, GuardResult } from './types';
