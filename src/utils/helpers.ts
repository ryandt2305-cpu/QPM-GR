// src/utils/helpers.ts
export function structuredMerge<T extends Record<string, any>>(base: T, extra: Partial<T>): T {
  if (typeof base !== 'object' || typeof extra !== 'object' || base == null || extra == null) {
    return (extra ?? base) as T;
  }
  
  const out = Array.isArray(base) ? [...base] : { ...base };
  
  for (const [k, v] of Object.entries(extra)) {
    if (typeof v === 'object' && v && typeof base[k] === 'object' && base[k]) {
      (out as any)[k] = structuredMerge(base[k], v);
    } else {
      (out as any)[k] = v;
    }
  }
  
  return out as T;
}

export function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function formatValue(v: number | null | undefined): string {
  return v != null ? `${v}%` : '—';
}

export function safeCall<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

export function formatSince(timestamp: number): string {
  if (!timestamp) return '—';
  const seconds = Math.max(1, Math.floor((Date.now() - timestamp) / 1000));
  
  if (seconds < 60) return `${seconds}s ago`;
  
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function normalizeSpeciesKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[''`]/g, '')
    .replace(/\s+/g, '')
    .replace(/-/g, '')
    .replace(/(seed|plant|baby|fruit|crop)$/i, '');
}

export function debounce<T extends (...args: any[]) => void>(
  fn: T, 
  wait = 120
): (...args: Parameters<T>) => void {
  let timeout: number;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), wait) as unknown as number;
  };
}