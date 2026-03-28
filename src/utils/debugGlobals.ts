import { storage } from './storage';

export const DEBUG_GLOBALS_OPT_IN_KEY = 'qpm.debug.globals.v1';

function readLocalDebugOptIn(): boolean | undefined {
  try {
    const raw = storage.get<unknown>(DEBUG_GLOBALS_OPT_IN_KEY, undefined);
    if (raw == null) return undefined;
    if (typeof raw === 'boolean') return raw;
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return undefined;
  } catch {
    return undefined;
  }
}

export function isDebugGlobalsEnabled(): boolean {
  try {
    if ((import.meta as any)?.env?.DEV === true) return true;
  } catch {
    // no-op
  }

  const storageOptIn = storage.get<unknown>(DEBUG_GLOBALS_OPT_IN_KEY, undefined);
  if (typeof storageOptIn === 'boolean') return storageOptIn;

  return readLocalDebugOptIn() === true;
}
