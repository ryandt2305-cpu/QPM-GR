// src/utils/storage.ts
declare const GM_getValue: ((key: string) => string | undefined) | undefined;
declare const GM_setValue: ((key: string, value: string) => void) | undefined;

export interface Storage {
  get<T = any>(key: string, fallback?: T): T;
  set(key: string, value: any): void;
}

export const storage: Storage = {
  get<T = any>(key: string, fallback: T = null as T): T {
    try {
      if (typeof GM_getValue === 'function') {
        const raw = GM_getValue(key);
        if (raw == null) return fallback;
        try { 
          return JSON.parse(raw); 
        } catch { 
          return raw as T; 
        }
      }
    } catch {}
    
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch { 
      return fallback; 
    }
  },

  set(key: string, value: any): void {
    try {
      if (typeof GM_setValue === 'function') {
        GM_setValue(key, JSON.stringify(value));
        return;
      }
    } catch {}
    
    try { 
      localStorage.setItem(key, JSON.stringify(value)); 
    } catch {}
  }
};