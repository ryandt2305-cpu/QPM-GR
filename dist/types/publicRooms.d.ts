/**
 * TypeScript definitions for Public Rooms feature (Supabase-backed)
 */
export interface RoomUserSlot {
    name: string;
    avatarUrl: string | null;
}
export interface Room {
    id: string;
    isPrivate: boolean;
    playersCount: number;
    lastUpdatedAt: string;
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
    allowProfile: boolean;
    allowGarden: boolean;
    allowInventory: boolean;
    allowStats: boolean;
    allowActivity: boolean;
    allowJournal: boolean;
    allowRoom: boolean;
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
export type PlayerFilter = 'all' | 'empty' | 'low' | 'medium' | 'high';
export type SortOption = 'name' | 'players-desc' | 'players-asc';
export type RoomsUpdateCallback = (rooms: RoomsMap) => void;
export type ErrorCallback = (error: string) => void;
//# sourceMappingURL=publicRooms.d.ts.map