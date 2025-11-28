/**
 * Public Rooms Feature
 *
 * Firebase-based public room discovery and management system
 * Allows users to create, browse, and join public rooms
 *
 * Credits:
 * - Public Rooms system powered by https://roomy.umm12many.net/
 * - Firebase infrastructure and room discovery backend
 */

import { log } from '../utils/logger';
import { storage } from '../utils/storage';
import type {
  FirebaseConfig,
  FirebaseApp,
  FirebaseAuth,
  FirebaseDatabase,
  FirebaseUser,
  RoomData,
  RoomsMap,
  PublicRoomsConfig,
  PublicRoomsState,
  AuthStateCallback,
  RoomsUpdateCallback,
  ErrorCallback,
  PlayerFilter,
  SortOption
} from '../types/publicRooms';

// Firebase configuration
const FIREBASE_CONFIG: FirebaseConfig = {
  apiKey: "AIzaSyDW_p602lr7Itqe0-JrSVwaeVt7Y5bxciQ",
  authDomain: "public-rooms.firebaseapp.com",
  databaseURL: "https://public-rooms-default-rtdb.firebaseio.com",
  projectId: "public-rooms",
  storageBucket: "public-rooms.firebasestorage.app",
  messagingSenderId: "479424427769",
  appId: "1:479424427769:web:113dd6b6c52a929c659428",
  measurementId: "G-T6DT3YEEVX"
};

// Private state
let app: FirebaseApp | null = null;
let auth: FirebaseAuth | null = null;
let database: FirebaseDatabase | null = null;

let state: PublicRoomsState = {
  currentUser: null,
  currentUserId: null,
  currentRoomCode: null,
  isAuthReady: false,
  isFirebaseReady: false,
  connectionStatus: 'connecting',
  allRooms: {},
  currentSearchTerm: '',
  currentPlayerFilter: 'all',
  currentSortBy: 'players-desc' // Default to Most Players
};

let config: PublicRoomsConfig = {
  refreshIntervalSeconds: 30,
  playerCountIntervalMinutes: 5
};

// Intervals
let autoRefreshInterval: number | null = null;
let playerCountUpdateInterval: number | null = null;
let backgroundPlayerCountInterval: number | null = null;

// Callbacks
let authStateCallback: AuthStateCallback | null = null;
let roomsUpdateCallback: RoomsUpdateCallback | null = null;
let errorCallback: ErrorCallback | null = null;

/**
 * Initialize Firebase SDK
 */
function initializeFirebase(): boolean {
  try {
    if (typeof window.firebase === 'undefined') {
      log('❌ Firebase SDK not available');
      state.connectionStatus = 'failed';
      return false;
    }

    if (!window.firebase.apps.length) {
      app = window.firebase.initializeApp(FIREBASE_CONFIG);
    } else {
      app = window.firebase.app();
    }

    auth = window.firebase.auth();
    database = window.firebase.database();

    state.isFirebaseReady = true;
    state.connectionStatus = 'connected';
    log('✅ Firebase initialized for Public Rooms');

    // Setup auth state listener (optional - kept for backwards compatibility)
    auth.onAuthStateChanged((user: FirebaseUser | null) => {
      state.isAuthReady = true;
      state.currentUser = user;
      state.currentUserId = user?.uid || null;

      log(user ? `✅ User signed in: ${user.email}` : '👤 User signed out (viewing anonymously)');

      if (authStateCallback) {
        authStateCallback(user);
      }
    });

    // Start features immediately - no auth required
    startAutoRefresh();
    fetchRooms();

    return true;
  } catch (error) {
    log('❌ Firebase initialization failed:', error);
    state.connectionStatus = 'failed';
    return false;
  }
}

/**
 * Extract current room code from URL
 */
function extractRoomCode(): string | null {
  const urlMatch = window.location.pathname.match(/\/r\/([^/]+)/);
  return urlMatch && urlMatch[1] ? urlMatch[1].toUpperCase() : null;
}

/**
 * Get current player count from game state
 */
function getCurrentPlayerCount(): number {
  try {
    const roomConnection = (window as any).MagicCircle_RoomConnection;
    if (roomConnection?.lastRoomStateJsonable) {
      const userSlots = roomConnection.lastRoomStateJsonable.child.data.userSlots;
      if (Array.isArray(userSlots)) {
        return userSlots.filter((slot: any) => slot !== null && slot !== undefined).length;
      }
    }
  } catch (error) {
    log('⚠️ Error getting player count:', error);
  }
  return 0;
}

/**
 * Filter and sort rooms based on current criteria
 */
function filterAndSortRooms(rooms: RoomsMap): RoomsMap {
  if (!rooms) return {};

  let roomsArray = Object.keys(rooms).map(code => ({
    code,
    ...rooms[code]
  }));

  // Apply search filter
  if (state.currentSearchTerm) {
    const searchLower = state.currentSearchTerm.toLowerCase();
    roomsArray = roomsArray.filter(room => {
      const nameMatch = room.originalRoomName?.toLowerCase().includes(searchLower);
      const codeMatch = room.code.toLowerCase().includes(searchLower);
      const tagsMatch = room.tags?.some(tag => tag.toLowerCase().includes(searchLower));
      return nameMatch || codeMatch || tagsMatch;
    });
  }

  // Apply player count filter
  if (state.currentPlayerFilter !== 'all') {
    roomsArray = roomsArray.filter(room => {
      const count = room.playerCount || 0;
      switch (state.currentPlayerFilter) {
        case 'empty': return count === 0;
        case 'low': return count >= 1 && count <= 2;
        case 'medium': return count >= 3 && count <= 4;
        case 'high': return count >= 5 && count <= 6;
        default: return true;
      }
    });
  }

  // Apply sorting
  roomsArray.sort((a, b) => {
    switch (state.currentSortBy) {
      case 'name':
        return (a.originalRoomName || a.code).toLowerCase()
          .localeCompare((b.originalRoomName || b.code).toLowerCase());
      case 'players-desc':
        return (b.playerCount || 0) - (a.playerCount || 0);
      case 'players-asc':
        return (a.playerCount || 0) - (b.playerCount || 0);
      case 'creator':
        return (a.creator || 'Unknown').toLowerCase()
          .localeCompare((b.creator || 'Unknown').toLowerCase());
      default:
        return 0;
    }
  });

  // Convert back to object
  const filtered: RoomsMap = {};
  roomsArray.forEach(room => {
    const { code, ...data } = room;
    // Ensure all required RoomData properties are present
    filtered[code] = {
      originalRoomName: data.originalRoomName || code,
      creatorUid: data.creatorUid || '',
      creator: data.creator || 'Unknown',
      tags: data.tags || [],
      playerCount: data.playerCount || 0
    };
  });

  return filtered;
}

/**
 * Fetch all rooms from Firebase
 */
export async function fetchRooms(): Promise<void> {
  if (!database) {
    log('⚠️ Database not initialized');
    return;
  }

  try {
    const snapshot = await database.ref('rooms/').once('value');
    state.allRooms = snapshot.val() || {};

    const filteredRooms = filterAndSortRooms(state.allRooms);

    if (roomsUpdateCallback) {
      roomsUpdateCallback(filteredRooms);
    }

    log(`✅ Fetched ${Object.keys(state.allRooms).length} rooms`);
  } catch (error) {
    log('❌ Error fetching rooms:', error);
    if (errorCallback) {
      errorCallback('Failed to fetch rooms');
    }
  }
}

/**
 * Apply current filters without refetching from database
 */
export function applyFilters(): void {
  const filteredRooms = filterAndSortRooms(state.allRooms);
  if (roomsUpdateCallback) {
    roomsUpdateCallback(filteredRooms);
  }
}

/**
 * Update player count for current room (authenticated)
 */
async function updatePlayerCount(): Promise<void> {
  if (!state.currentRoomCode || !state.currentUserId || !database) return;

  try {
    const snapshot = await database.ref('rooms/' + state.currentRoomCode).once('value');
    const room = snapshot.val();

    if (room && room.creatorUid === state.currentUserId) {
      const playerCount = getCurrentPlayerCount();
      await database.ref('rooms/' + state.currentRoomCode + '/playerCount').set(playerCount);
      log(`✅ Player count updated: ${playerCount}`);
    }
  } catch (error) {
    log('⚠️ Error updating player count:', error);
  }
}

/**
 * Update player count anonymously (works even when not logged in)
 */
async function updatePlayerCountAnonymous(): Promise<void> {
  if (!state.currentRoomCode || !database || !state.isFirebaseReady) return;

  try {
    const snapshot = await database.ref('rooms/' + state.currentRoomCode).once('value');
    const room = snapshot.val();

    if (room) {
      const playerCount = getCurrentPlayerCount();
      await database.ref('rooms/' + state.currentRoomCode + '/playerCount').set(playerCount);
      log(`✅ Background player count updated: ${playerCount}`);
    }
  } catch (error) {
    log('⚠️ Error in background player count update:', error);
  }
}

/**
 * Start auto-refresh interval
 */
function startAutoRefresh(): void {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
  }

  if (config.refreshIntervalSeconds > 0) {
    autoRefreshInterval = window.setInterval(fetchRooms, config.refreshIntervalSeconds * 1000);
    log(`✅ Auto-refresh started: ${config.refreshIntervalSeconds}s`);
  }
}

/**
 * Start player count updater (authenticated)
 */
function startPlayerCountUpdater(): void {
  if (playerCountUpdateInterval) {
    clearInterval(playerCountUpdateInterval);
  }

  if (config.playerCountIntervalMinutes > 0) {
    playerCountUpdateInterval = window.setInterval(
      updatePlayerCount,
      config.playerCountIntervalMinutes * 60 * 1000
    );
    log(`✅ Player count updater started: ${config.playerCountIntervalMinutes}m`);
  }
}

/**
 * Start background player count updater (anonymous)
 */
function startBackgroundPlayerCountUpdater(): void {
  if (backgroundPlayerCountInterval) {
    clearInterval(backgroundPlayerCountInterval);
  }

  if (state.currentRoomCode && state.isFirebaseReady) {
    // Immediate update
    updatePlayerCountAnonymous();

    // Set interval (2 minutes)
    backgroundPlayerCountInterval = window.setInterval(updatePlayerCountAnonymous, 2 * 60 * 1000);
    log(`✅ Background player count updater started for room: ${state.currentRoomCode}`);
  }
}

/**
 * Sign in with email and password
 */
export async function signIn(email: string, password: string): Promise<void> {
  if (!auth) throw new Error('Auth not initialized');

  try {
    await auth.signInWithEmailAndPassword(email, password);
    log('✅ Signed in successfully');
  } catch (error: any) {
    log('❌ Sign in failed:', error);
    throw new Error(error.message || 'Sign in failed');
  }
}

/**
 * Sign in with Google OAuth
 */
export async function signInWithGoogle(): Promise<void> {
  if (!auth || typeof window.firebase === 'undefined') {
    throw new Error('Auth not initialized');
  }

  try {
    const provider = new window.firebase.auth.GoogleAuthProvider();
    await auth.signInWithPopup(provider);
    log('✅ Signed in with Google successfully');
  } catch (error: any) {
    log('❌ Google sign in failed:', error);
    throw new Error(error.message || 'Google sign in failed');
  }
}

/**
 * Sign in with GitHub OAuth
 */
export async function signInWithGitHub(): Promise<void> {
  if (!auth || typeof window.firebase === 'undefined') {
    throw new Error('Auth not initialized');
  }

  try {
    const provider = new window.firebase.auth.GithubAuthProvider();
    await auth.signInWithPopup(provider);
    log('✅ Signed in with GitHub successfully');
  } catch (error: any) {
    log('❌ GitHub sign in failed:', error);
    throw new Error(error.message || 'GitHub sign in failed');
  }
}

/**
 * Create new account
 */
export async function createAccount(email: string, password: string): Promise<void> {
  if (!auth) throw new Error('Auth not initialized');

  try {
    await auth.createUserWithEmailAndPassword(email, password);
    log('✅ Account created successfully');
  } catch (error: any) {
    log('❌ Account creation failed:', error);
    throw new Error(error.message || 'Account creation failed');
  }
}

/**
 * Sign out
 */
export async function signOut(): Promise<void> {
  if (!auth) throw new Error('Auth not initialized');

  try {
    await auth.signOut();
    log('✅ Signed out successfully');
  } catch (error: any) {
    log('❌ Sign out failed:', error);
    throw new Error(error.message || 'Sign out failed');
  }
}

/**
 * Create/update public room
 */
export async function createPublicRoom(tags: string[]): Promise<void> {
  if (!database || !state.currentUserId || !state.currentRoomCode) {
    throw new Error('Not authenticated or no room code');
  }

  try {
    const displayName = auth?.currentUser?.displayName || auth?.currentUser?.email?.split('@')[0] || 'Unknown';
    const playerCount = getCurrentPlayerCount();

    const roomData: RoomData = {
      originalRoomName: state.currentRoomCode,
      creatorUid: state.currentUserId,
      creator: displayName,
      tags,
      playerCount
    };

    await database.ref('rooms/' + state.currentRoomCode.toUpperCase()).set(roomData);
    log(`✅ Room ${state.currentRoomCode} made public`);

    startPlayerCountUpdater();
    fetchRooms();
  } catch (error: any) {
    log('❌ Failed to create public room:', error);
    throw new Error(error.message || 'Failed to create room');
  }
}

/**
 * Delete public room
 */
export async function deletePublicRoom(roomCode?: string): Promise<void> {
  const targetRoom = roomCode || state.currentRoomCode;
  if (!database || !state.currentUserId || !targetRoom) {
    throw new Error('Not authenticated or no room code');
  }

  try {
    const snapshot = await database.ref('rooms/' + targetRoom).once('value');
    const room = snapshot.val();

    if (room && room.creatorUid === state.currentUserId) {
      await database.ref('rooms/' + targetRoom).remove();
      log(`✅ Room ${targetRoom} deleted`);

      if (playerCountUpdateInterval) {
        clearInterval(playerCountUpdateInterval);
      }

      fetchRooms();
    } else {
      throw new Error('Not authorized to delete this room');
    }
  } catch (error: any) {
    log('❌ Failed to delete room:', error);
    throw new Error(error.message || 'Failed to delete room');
  }
}

/**
 * Check if current room is public
 */
export async function isCurrentRoomPublic(): Promise<boolean> {
  if (!database || !state.currentRoomCode) return false;

  try {
    const snapshot = await database.ref('rooms/' + state.currentRoomCode).once('value');
    const room = snapshot.val();
    return room && room.creatorUid === state.currentUserId;
  } catch (error) {
    log('⚠️ Error checking room status:', error);
    return false;
  }
}

/**
 * Get current room data
 */
export async function getCurrentRoomData(): Promise<RoomData | null> {
  if (!database || !state.currentRoomCode) return null;

  try {
    const snapshot = await database.ref('rooms/' + state.currentRoomCode).once('value');
    return snapshot.val();
  } catch (error) {
    log('⚠️ Error getting room data:', error);
    return null;
  }
}

// Configuration API
export function setRefreshInterval(seconds: number): void {
  config.refreshIntervalSeconds = seconds;
  storage.set('publicRooms:refreshInterval', seconds);
  startAutoRefresh();
}

export function setPlayerCountInterval(minutes: number): void {
  config.playerCountIntervalMinutes = minutes;
  storage.set('publicRooms:playerCountInterval', minutes);
  startPlayerCountUpdater();
}

export function setSearchTerm(term: string): void {
  state.currentSearchTerm = term;
  applyFilters();
}

export function setPlayerFilter(filter: PlayerFilter): void {
  state.currentPlayerFilter = filter;
  applyFilters();
}

export function setSortBy(sort: SortOption): void {
  state.currentSortBy = sort;
  applyFilters();
}

// Callback registration
export function setAuthStateCallback(callback: AuthStateCallback): void {
  authStateCallback = callback;
}

export function setRoomsUpdateCallback(callback: RoomsUpdateCallback): void {
  roomsUpdateCallback = callback;
}

export function setErrorCallback(callback: ErrorCallback): void {
  errorCallback = callback;
}

// State getters
export function getState(): Readonly<PublicRoomsState> {
  return { ...state };
}

export function getConfig(): Readonly<PublicRoomsConfig> {
  return { ...config };
}

export function getCurrentUser(): FirebaseUser | null {
  return state.currentUser;
}

export function isAuthenticated(): boolean {
  return state.currentUser !== null;
}

/**
 * Load configuration from storage
 */
function loadConfig(): void {
  config.refreshIntervalSeconds = storage.get('publicRooms:refreshInterval', 30);
  config.playerCountIntervalMinutes = storage.get('publicRooms:playerCountInterval', 5);
  log('✅ Public Rooms config loaded');
}

/**
 * Initialize Public Rooms feature
 */
export function initPublicRooms(): void {
  log('🌐 Initializing Public Rooms...');

  // Load config
  loadConfig();

  // Initialize Firebase
  if (!initializeFirebase()) {
    log('❌ Failed to initialize Firebase');
    return;
  }

  // Extract current room code
  state.currentRoomCode = extractRoomCode();
  if (state.currentRoomCode) {
    log(`📍 Current room: ${state.currentRoomCode}`);
    startBackgroundPlayerCountUpdater();
  }

  log('✅ Public Rooms initialized');
}
