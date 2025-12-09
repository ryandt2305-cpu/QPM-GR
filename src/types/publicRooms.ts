/**
 * TypeScript definitions for Public Rooms feature (Aries-backed)
 */

export interface RoomUserSlot {
  name: string;
  avatarUrl: string | null;
  playerId?: string | null; // Aries may provide player_id for richer lookups
}

export interface Room {
  id: string; // room code
  isPrivate: boolean;
  playersCount: number;
  lastUpdatedAt: string; // ISO timestamp
  lastUpdatedByPlayerId: string | null;
  userSlots?: RoomUserSlot[];
}

export interface RoomSearchResult {
  room: Room;
  matchedSlots: RoomUserSlot[];
}

export interface PlayerRoomResult {
  playerName: string;
  avatarUrl: string | null;
  roomId: string;
  roomPlayersCount: number;
}

export interface PlayerPrivacyPayload {
  showProfile: boolean;
  showGarden: boolean;
  showInventory: boolean;
  showStats: boolean;
  showActivityLog: boolean;
  showJournal: boolean;
  showCoins: boolean;
  hideRoomFromPublicList?: boolean;
}

export interface PlayerViewState {
  garden: unknown | null;
  inventory: unknown | null;
  stats: Record<string, any> | null;
  activityLog: any[] | null;
  journal: any | null;
  activityLogs?: any[] | null;
}

export interface PlayerView {
  playerId: string;
  playerName: string | null;
  avatarUrl: string | null;
  coins: number | null;
  room: any | null;
  hasModInstalled: boolean;
  isOnline: boolean;
  lastEventAt: string | null;
  privacy: PlayerPrivacyPayload;
  state: PlayerViewState;
}

export interface RoomsMap {
  [roomId: string]: Room;
}

export interface ApiResponse<T> {
  status: number;
  data: T | null;
  error?: string;
}

// Public Rooms configuration
export interface PublicRoomsConfig {
  refreshIntervalSeconds: number;
}

export interface PublicRoomsState {
  connectionStatus: 'connecting' | 'connected' | 'failed' | 'retrying';
  allRooms: RoomsMap;
  currentSearchTerm: string;
  currentPlayerFilter: 'all' | 'empty' | 'low' | 'medium' | 'high';
  currentSortBy: 'name' | 'players-desc' | 'players-asc';
  lastUpdatedAt: string | null;
}

// Filter and sort types
export type PlayerFilter = 'all' | 'empty' | 'low' | 'medium' | 'high';
export type SortOption = 'name' | 'players-desc' | 'players-asc';

// Callback types
export type RoomsUpdateCallback = (rooms: RoomsMap) => void;
export type ErrorCallback = (error: string) => void;
