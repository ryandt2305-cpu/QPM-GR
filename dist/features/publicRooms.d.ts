import { PublicRoomsConfig, PublicRoomsState, PlayerFilter, SortOption, RoomsUpdateCallback, ErrorCallback, RoomSearchResult, PlayerRoomResult, PlayerView } from '../types/publicRooms';
type ConnectionStatus = PublicRoomsState['connectionStatus'];
export declare function initPublicRooms(): Promise<void>;
export declare function fetchRooms(): Promise<void>;
export declare function setRefreshInterval(seconds: number): void;
export declare function setSearchTerm(term: string): void;
export declare function setPlayerFilter(filter: PlayerFilter): void;
export declare function setSortBy(sort: SortOption): void;
export declare function setRoomsUpdateCallback(callback: RoomsUpdateCallback): void;
export declare function setErrorCallback(callback: ErrorCallback): void;
export declare function setConnectionStatusCallback(callback: (status: ConnectionStatus) => void): void;
export declare function getState(): Readonly<PublicRoomsState>;
export declare function getConfig(): Readonly<PublicRoomsConfig>;
export declare function searchRoomsByPlayerName(query: string): Promise<RoomSearchResult[]>;
export declare function searchPlayersByName(query: string): Promise<PlayerRoomResult[]>;
export declare function fetchPlayerView(playerId: string): Promise<PlayerView | null>;
export {};
//# sourceMappingURL=publicRooms.d.ts.map