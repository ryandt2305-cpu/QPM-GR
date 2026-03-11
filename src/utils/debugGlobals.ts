import { storage } from './storage';

export const DEBUG_GLOBALS_OPT_IN_KEY = 'qpm.debug.globals.v1';

export function isDebugGlobalsEnabled(): boolean {
  try {
    if ((import.meta as any)?.env?.DEV === true) return true;
  } catch {
    // no-op
  }
  return storage.get<boolean>(DEBUG_GLOBALS_OPT_IN_KEY, false) === true;
}

