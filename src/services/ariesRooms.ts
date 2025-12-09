// Aries public rooms client using GM_xmlhttpRequest
import type { Room, RoomUserSlot, ApiResponse } from '../types/publicRooms';

const API_BASE_URL = 'https://ariesmod-api.ariedam.fr/';

type HttpMethod = 'GET' | 'POST';

type GmXhr = (details: {
  method: HttpMethod;
  url: string;
  headers?: Record<string, string>;
  data?: string;
  onload?: (response: { status: number; responseText: string }) => void;
  onerror?: (error: any) => void;
}) => void;

function resolveGmXhr(): GmXhr | undefined {
  if (typeof GM_xmlhttpRequest === 'function') return GM_xmlhttpRequest as unknown as GmXhr;
  const gm = (globalThis as any).GM;
  if (gm?.xmlHttpRequest) return gm.xmlHttpRequest.bind(gm) as GmXhr;
  return undefined;
}

function buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
  const url = new URL(path, API_BASE_URL);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function httpGet<T>(path: string, query?: Record<string, string | number | undefined>): Promise<ApiResponse<T>> {
  return new Promise(resolve => {
    const url = buildUrl(path, query);
    const gm = resolveGmXhr();

    if (!gm) {
      resolve({ status: 0, data: null, error: 'GM_xmlhttpRequest unavailable' });
      return;
    }

    gm({
      method: 'GET',
      url,
      headers: {},
      onload: res => {
        let parsed: T | null = null;
        let error: string | undefined;

        if (res.responseText) {
          try {
            parsed = JSON.parse(res.responseText) as T;
          } catch (e) {
            error = `Failed to parse JSON: ${(e as Error).message}`;
          }
        }

        if ((res.status < 200 || res.status >= 300) && !error) {
          error = `HTTP ${res.status}`;
        }

        resolve({ status: res.status, data: parsed, error });
      },
      onerror: err => {
        resolve({ status: 0, data: null, error: String(err ?? 'Network error') });
      },
    });
  });
}

export async function listRooms(limit = 50): Promise<ApiResponse<Room[]>> {
  const res = await httpGet<RoomDto[]>('rooms', { limit });

  if (!res.data || !Array.isArray(res.data)) {
    return { status: res.status, data: null, error: res.error };
  }

  const rooms: Room[] = res.data.map(r => ({
    id: r.id,
    isPrivate: r.is_private,
    playersCount: r.players_count ?? 0,
    lastUpdatedAt: r.last_updated_at,
    lastUpdatedByPlayerId: r.last_updated_by_player_id,
    userSlots: Array.isArray(r.user_slots)
      ? r.user_slots.map(slot => ({ name: slot.name, avatarUrl: slot.avatar_url ?? null }))
      : undefined,
  }));

  return { status: res.status, data: rooms, error: res.error };
}

interface RoomDto {
  id: string;
  is_private: boolean;
  players_count: number | null;
  last_updated_at: string;
  last_updated_by_player_id: string | null;
  user_slots?: Array<{ name: string; avatar_url?: string | null }>;
}

// Re-export for convenience
export type { Room, RoomUserSlot };
