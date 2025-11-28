import { FirebaseUser, RoomData, PublicRoomsConfig, PublicRoomsState, AuthStateCallback, RoomsUpdateCallback, ErrorCallback, PlayerFilter, SortOption } from '../types/publicRooms';
/**
 * Fetch all rooms from Firebase
 */
export declare function fetchRooms(): Promise<void>;
/**
 * Apply current filters without refetching from database
 */
export declare function applyFilters(): void;
/**
 * Sign in with email and password
 */
export declare function signIn(email: string, password: string): Promise<void>;
/**
 * Sign in with Google OAuth
 */
export declare function signInWithGoogle(): Promise<void>;
/**
 * Sign in with GitHub OAuth
 */
export declare function signInWithGitHub(): Promise<void>;
/**
 * Create new account
 */
export declare function createAccount(email: string, password: string): Promise<void>;
/**
 * Sign out
 */
export declare function signOut(): Promise<void>;
/**
 * Create/update public room
 */
export declare function createPublicRoom(tags: string[]): Promise<void>;
/**
 * Delete public room
 */
export declare function deletePublicRoom(roomCode?: string): Promise<void>;
/**
 * Check if current room is public
 */
export declare function isCurrentRoomPublic(): Promise<boolean>;
/**
 * Get current room data
 */
export declare function getCurrentRoomData(): Promise<RoomData | null>;
export declare function setRefreshInterval(seconds: number): void;
export declare function setPlayerCountInterval(minutes: number): void;
export declare function setSearchTerm(term: string): void;
export declare function setPlayerFilter(filter: PlayerFilter): void;
export declare function setSortBy(sort: SortOption): void;
export declare function setAuthStateCallback(callback: AuthStateCallback): void;
export declare function setRoomsUpdateCallback(callback: RoomsUpdateCallback): void;
export declare function setErrorCallback(callback: ErrorCallback): void;
export declare function getState(): Readonly<PublicRoomsState>;
export declare function getConfig(): Readonly<PublicRoomsConfig>;
export declare function getCurrentUser(): FirebaseUser | null;
export declare function isAuthenticated(): boolean;
/**
 * Initialize Public Rooms feature
 */
export declare function initPublicRooms(): void;
//# sourceMappingURL=publicRooms.d.ts.map