/**
 * TypeScript definitions for Public Rooms feature
 */

// Firebase types (minimal definitions for the SDK we're using)
export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  databaseURL: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId: string;
}

export interface FirebaseUser {
  uid: string;
  email: string | null;
  displayName: string | null;
}

export interface FirebaseAuthProvider {
  // OAuth provider base interface
}

export interface FirebaseAuth {
  currentUser: FirebaseUser | null;
  signInWithEmailAndPassword(email: string, password: string): Promise<any>;
  createUserWithEmailAndPassword(email: string, password: string): Promise<any>;
  signInWithPopup(provider: FirebaseAuthProvider): Promise<any>;
  signOut(): Promise<void>;
  onAuthStateChanged(callback: (user: FirebaseUser | null) => void): void;
  GoogleAuthProvider: new () => FirebaseAuthProvider;
  GithubAuthProvider: new () => FirebaseAuthProvider;
}

export interface FirebaseDatabaseReference {
  set(value: any): Promise<void>;
  once(eventType: string): Promise<FirebaseDatabaseSnapshot>;
  on(eventType: string, callback: (snapshot: FirebaseDatabaseSnapshot) => void, errorCallback?: (error: Error) => void): void;
  off(eventType?: string): void;
  remove(): Promise<void>;
}

export interface FirebaseDatabaseSnapshot {
  val(): any;
}

export interface FirebaseDatabase {
  ref(path: string): FirebaseDatabaseReference;
}

export interface FirebaseApp {
  auth(): FirebaseAuth;
  database(): FirebaseDatabase;
}

// Room data types
export interface RoomData {
  originalRoomName: string;
  creatorUid: string;
  creator: string;
  tags: string[];
  playerCount: number;
}

export interface RoomDataWithCode extends RoomData {
  code: string;
}

export interface RoomsMap {
  [roomCode: string]: RoomData;
}

// Public Rooms configuration
export interface PublicRoomsConfig {
  refreshIntervalSeconds: number;
  playerCountIntervalMinutes: number;
}

export interface PublicRoomsState {
  currentUser: FirebaseUser | null;
  currentUserId: string | null;
  currentRoomCode: string | null;
  isAuthReady: boolean;
  isFirebaseReady: boolean;
  connectionStatus: 'connecting' | 'connected' | 'failed' | 'retrying';
  allRooms: RoomsMap;
  currentSearchTerm: string;
  currentPlayerFilter: 'all' | 'empty' | 'low' | 'medium' | 'high';
  currentSortBy: 'name' | 'players-desc' | 'players-asc' | 'creator';
}

// Filter and sort types
export type PlayerFilter = 'all' | 'empty' | 'low' | 'medium' | 'high';
export type SortOption = 'name' | 'players-desc' | 'players-asc' | 'creator';

// Callback types
export type AuthStateCallback = (user: FirebaseUser | null) => void;
export type RoomsUpdateCallback = (rooms: RoomsMap) => void;
export type ErrorCallback = (error: string) => void;

// Global Firebase interface (from window)
declare global {
  interface Window {
    firebase?: {
      apps: any[];
      app: () => FirebaseApp;
      initializeApp: (config: FirebaseConfig) => FirebaseApp;
      auth: {
        (): FirebaseAuth;
        GoogleAuthProvider: new () => FirebaseAuthProvider;
        GithubAuthProvider: new () => FirebaseAuthProvider;
      };
      database: () => FirebaseDatabase;
    };
  }
}
