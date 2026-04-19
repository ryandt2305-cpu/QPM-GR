// src/features/locker/index.ts
// Public API for the Action Guard (Locker).

import { registerSendPreflight, clearSendPreflight } from '../../websocket/api';
import { lockerPreflight, startNativeHook, stopNativeHook } from './guard';
import { startInstaHarvest, stopInstaHarvest } from './instaHarvest';

let running = false;

export function startLocker(): void {
  if (running) return;
  running = true;
  registerSendPreflight(lockerPreflight);
  startNativeHook();
  startInstaHarvest();
}

export function stopLocker(): void {
  if (!running) return;
  running = false;
  clearSendPreflight();
  stopNativeHook();
  stopInstaHarvest();
}

export function isLockerRunning(): boolean {
  return running;
}

export { getLockerConfig, updateLockerConfig, resetLockerConfig } from './state';
export type { LockerConfig, GuardResult } from './types';
