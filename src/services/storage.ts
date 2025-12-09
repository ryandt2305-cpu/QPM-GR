import { storage } from '../utils/storage';

export interface AriesAuth {
  token: string;
  playerId: string;
}

const ARIES_AUTH_KEY = 'qpm.aries.auth.v1';

export function readAriesAuth(): AriesAuth {
  const saved = storage.get<AriesAuth>(ARIES_AUTH_KEY, { token: '', playerId: '' });
  return {
    token: (saved?.token || '').trim(),
    playerId: (saved?.playerId || '').trim(),
  };
}

export function writeAriesAuth(auth: Partial<AriesAuth>): AriesAuth {
  const normalized: AriesAuth = {
    token: (auth.token || '').trim(),
    playerId: (auth.playerId || '').trim(),
  };
  storage.set(ARIES_AUTH_KEY, normalized);
  return normalized;
}
