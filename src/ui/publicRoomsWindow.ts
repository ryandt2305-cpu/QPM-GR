/**
 * Public Rooms UI Window
 *
 * Renders the public rooms interface and handles user interactions
 *
 * Credits:
 * - Public Rooms system powered by https://roomy.umm12many.net/
 * - Firebase integration and room discovery infrastructure
 */

import {
  getState,
  getConfig,
  getCurrentUser,
  isAuthenticated,
  fetchRooms,
  signIn,
  signInWithGoogle,
  signInWithGitHub,
  signOut,
  createAccount,
  createPublicRoom,
  deletePublicRoom,
  setRefreshInterval,
  setPlayerCountInterval,
  setSearchTerm,
  setPlayerFilter,
  setSortBy,
  setAuthStateCallback,
  setRoomsUpdateCallback,
  setConnectionStatusCallback,
  setErrorCallback,
  retryFirebaseInit,
  isCurrentRoomPublic,
  getCurrentRoomData
} from '../features/publicRooms';
import type { FirebaseUser, RoomsMap, RoomData } from '../types/publicRooms';

/**
 * Show a toast notification
 */
function showToast(message: string, level: 'success' | 'error' | 'info' = 'info', duration = 3000): void {
  const toast = document.createElement('div');
  toast.textContent = message;

  const colors = {
    success: '#4CAF50',
    error: '#ff4d4d',
    info: '#42A5F5'
  };

  toast.style.cssText = `
    position: fixed;
    bottom: 80px;
    right: 20px;
    background: ${colors[level]};
    color: white;
    padding: 12px 20px;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 100000;
    animation: qpm-toast-in 0.3s ease;
    font-family: var(--chakra-fonts-body, sans-serif);
  `;

  // Add animation styles if not present
  if (!document.querySelector('#qpm-toast-styles')) {
    const style = document.createElement('style');
    style.id = 'qpm-toast-styles';
    style.textContent = `
      @keyframes qpm-toast-in {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

// UI state
let currentRoomIsPublic = false;
let searchTimeout: number | null = null;

/**
 * Create login section (optional, for creating/managing rooms)
 */
function createLoginSection(): HTMLElement {
  const container = document.createElement('div');
  container.id = 'pr-login-section';
  container.className = 'qpm-card';
  container.style.cssText = `
    margin-bottom: 20px;
    background: linear-gradient(135deg, rgba(156, 39, 176, 0.1) 0%, rgba(103, 58, 183, 0.1) 100%);
    border: 2px solid rgba(156, 39, 176, 0.3);
  `;

  container.innerHTML = `
    <h4 style="color: #CE93D8; margin-bottom: 12px; font-size: 15px; display: flex; align-items: center; gap: 8px;">
      <span style="font-size: 18px;">🔑</span> Sign In
      <span style="font-size: 11px; color: #888; font-weight: normal;">(optional - required to create/manage rooms)</span>
    </h4>
    <div id="pr-error" style="color: #ff4d4d; margin-bottom: 10px; font-size: 13px; display: none;"></div>

    <!-- OAuth Sign-in Options -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">
      <button id="pr-google-signin-btn" style="
        padding: 10px 16px;
        background: #fff;
        color: #444;
        border: 1px solid #ddd;
        border-radius: 6px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 600;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        transition: background 0.2s;
      " onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background='#fff'">
        <svg width="16" height="16" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
        </svg>
        Google
      </button>

      <button id="pr-github-signin-btn" style="
        padding: 10px 16px;
        background: #24292e;
        color: #fff;
        border: 1px solid #444;
        border-radius: 6px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 600;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        transition: background 0.2s;
      " onmouseover="this.style.background='#2f363d'" onmouseout="this.style.background='#24292e'">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
        </svg>
        GitHub
      </button>
    </div>

    <!-- Email/Password Sign-in (Collapsible) -->
    <details style="text-align: left;">
      <summary style="color: #CE93D8; cursor: pointer; padding: 8px 0; font-size: 12px; font-weight: 600;">Sign in with Email</summary>
      <div style="padding-top: 10px;">
        <input type="email" id="pr-email" placeholder="Email"
          style="width: 100%; padding: 10px; margin-bottom: 8px; background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(206, 147, 216, 0.4); color: #fff; border-radius: 6px; font-size: 13px; box-sizing: border-box;">
        <input type="password" id="pr-password" placeholder="Password"
          style="width: 100%; padding: 10px; margin-bottom: 12px; background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(206, 147, 216, 0.4); color: #fff; border-radius: 6px; font-size: 13px; box-sizing: border-box;">
        <div style="display: flex; gap: 8px;">
          <button id="pr-signin-btn" class="qpm-button qpm-button--positive" style="flex: 1; padding: 8px; font-size: 13px;">Sign In</button>
          <button id="pr-create-btn" class="qpm-button qpm-button--positive" style="flex: 1; padding: 8px; font-size: 13px;">Create Account</button>
        </div>
      </div>
    </details>
  `;

  return container;
}

/**
 * Create main app container
 */
function createAppContainer(): HTMLElement {
  const container = document.createElement('div');
  container.id = 'pr-app';

  const config = getConfig();

  container.innerHTML = `
    <div style="padding: 20px;">
      <!-- Header -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid rgba(66, 165, 245, 0.3);">
        <div>
          <h3 style="color: #fff; margin: 0 0 4px 0; font-size: 22px; display: flex; align-items: center; gap: 10px;">
            🌐 Public Rooms
          </h3>
          <div style="display: flex; align-items: center; gap: 8px;">
            <p style="margin: 0; font-size: 11px; color: #888;">Powered by <a href="https://roomy.umm12many.net/" target="_blank" style="color: #42A5F5; text-decoration: none;">roomy.umm12many.net</a></p>
            <span id="pr-connection-status" style="font-size: 11px; color: #42A5F5;">🔄 Connecting...</span>
          </div>
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          <span id="pr-user-status" style="font-size: 12px; color: #888;"></span>
          <button id="pr-refresh-btn" class="qpm-button qpm-button--neutral" style="padding: 8px 16px; font-size: 13px;">🔄 Refresh</button>
          <button id="pr-signout-btn" class="qpm-button qpm-button--negative hidden" style="padding: 8px 16px; font-size: 13px;">Sign Out</button>
        </div>
      </div>

      <!-- Login Section (shown when not authenticated) -->
      <div id="pr-login-container"></div>

      <!-- Make Room Public Section (shown only when authenticated) -->
      <div id="pr-manage-room-section" class="qpm-card hidden" style="margin-bottom: 20px; background: linear-gradient(135deg, rgba(76, 175, 80, 0.1) 0%, rgba(33, 150, 243, 0.1) 100%); border: 2px solid rgba(76, 175, 80, 0.3);">
        <h4 style="color: #4CAF50; margin-bottom: 12px; font-size: 15px; display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 18px;">📢</span> Share Your Room
        </h4>
        <p style="margin: 0 0 12px 0; font-size: 12px; color: #aaa;">Make your room discoverable to other players</p>
        <input type="text" id="pr-tags-input" placeholder="Tags (e.g. farming, trading, social, casual)"
          style="width: 100%; padding: 12px; margin-bottom: 12px; background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(76, 175, 80, 0.4); color: #fff; border-radius: 6px; font-size: 13px; box-sizing: border-box;">
        <div style="display: flex; gap: 10px;">
          <button id="pr-create-room-btn" class="qpm-button qpm-button--positive" style="flex: 1; padding: 10px;">✨ Make Public</button>
          <button id="pr-delete-room-btn" class="qpm-button qpm-button--negative hidden" style="flex: 1; padding: 10px;">🔒 Make Private</button>
        </div>
      </div>

      <!-- Search & Filter Section -->
      <div class="qpm-card" style="margin-bottom: 20px; background: rgba(33, 150, 243, 0.08); border: 2px solid rgba(33, 150, 243, 0.25);">
        <h4 style="color: #42A5F5; margin-bottom: 12px; font-size: 15px; display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 18px;">🔍</span> Discover Rooms
        </h4>
        <input type="text" id="pr-search-input" placeholder="🔎 Search by room name, creator, or tags..."
          style="width: 100%; padding: 12px; margin-bottom: 12px; background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(66, 165, 245, 0.4); color: #fff; border-radius: 6px; font-size: 13px; box-sizing: border-box;">

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div>
            <label style="color: #42A5F5; font-size: 12px; display: block; margin-bottom: 6px; font-weight: 600;">👥 Player Count:</label>
            <select id="pr-player-filter" style="width: 100%; padding: 10px; background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(66, 165, 245, 0.4); color: #fff; border-radius: 6px; font-size: 13px; cursor: pointer;">
              <option value="all">All Rooms</option>
              <option value="empty">Empty (0)</option>
              <option value="low">Few (1-2)</option>
              <option value="medium">Some (3-4)</option>
              <option value="high">Many (5-6)</option>
            </select>
          </div>
          <div>
            <label style="color: #42A5F5; font-size: 12px; display: block; margin-bottom: 6px; font-weight: 600;">📊 Sort By:</label>
            <select id="pr-sort-by" style="width: 100%; padding: 10px; background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(66, 165, 245, 0.4); color: #fff; border-radius: 6px; font-size: 13px; cursor: pointer;">
              <option value="name">Room Name</option>
              <option value="players-desc" selected>Most Players</option>
              <option value="players-asc">Least Players</option>
              <option value="creator">Creator Name</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Rooms List -->
      <div style="margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid rgba(255, 255, 255, 0.1);">
        <h4 style="color: #fff; margin: 0; font-size: 16px; display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 20px;">🎮</span> Available Rooms
        </h4>
      </div>
      <div id="pr-rooms-list" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; margin-bottom: 24px;">
        <p style="text-align: center; color: #aaa; grid-column: 1/-1; font-size: 14px;">Loading rooms...</p>
      </div>

      <!-- Settings Section -->
      <div class="qpm-card" style="background: rgba(255, 152, 0, 0.08); border: 2px solid rgba(255, 152, 0, 0.25);">
        <h4 style="color: #FF9800; margin-bottom: 12px; font-size: 15px; display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 18px;">⚙️</span> Settings
        </h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div>
            <label style="color: #FF9800; font-size: 12px; display: block; margin-bottom: 6px; font-weight: 600;">🔄 Room Refresh:</label>
            <select id="pr-refresh-interval" style="width: 100%; padding: 10px; background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(255, 152, 0, 0.4); color: #fff; border-radius: 6px; font-size: 13px; cursor: pointer;">
              <option value="15">15 seconds</option>
              <option value="30" ${config.refreshIntervalSeconds === 30 ? 'selected' : ''}>30 seconds</option>
              <option value="60">1 minute</option>
              <option value="300">5 minutes</option>
              <option value="0">Never</option>
            </select>
          </div>
          <div>
            <label style="color: #FF9800; font-size: 12px; display: block; margin-bottom: 6px; font-weight: 600;">👥 Player Count Update:</label>
            <select id="pr-player-interval" style="width: 100%; padding: 10px; background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(255, 152, 0, 0.4); color: #fff; border-radius: 6px; font-size: 13px; cursor: pointer;">
              <option value="1">1 minute</option>
              <option value="5" ${config.playerCountIntervalMinutes === 5 ? 'selected' : ''}>5 minutes</option>
              <option value="10">10 minutes</option>
              <option value="30">30 minutes</option>
              <option value="0">Never</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  `;

  return container;
}

/**
 * Render rooms list
 */
function renderRooms(rooms: RoomsMap): void {
  const roomsList = document.getElementById('pr-rooms-list');
  if (!roomsList) return;

  roomsList.innerHTML = '';

  const roomKeys = Object.keys(rooms);
  if (roomKeys.length === 0) {
    roomsList.innerHTML = '<p style="text-align: center; color: #aaa; grid-column: 1/-1;">No rooms found. Try adjusting your filters or be the first to create one!</p>';
    return;
  }

  const state = getState();

  roomKeys.forEach(roomCode => {
    const room = rooms[roomCode];
    if (!room) return;

    const isOwner = room.creatorUid === state.currentUserId;
    const playerCount = room.playerCount || 0;

    // Player count badge color based on count
    let playerBadgeColor = '#666';
    let playerBgColor = 'rgba(102, 102, 102, 0.2)';
    if (playerCount >= 5) {
      playerBadgeColor = '#4CAF50';
      playerBgColor = 'rgba(76, 175, 80, 0.2)';
    } else if (playerCount >= 3) {
      playerBadgeColor = '#FF9800';
      playerBgColor = 'rgba(255, 152, 0, 0.2)';
    } else if (playerCount >= 1) {
      playerBadgeColor = '#42A5F5';
      playerBgColor = 'rgba(66, 165, 245, 0.2)';
    }

    const roomCard = document.createElement('div');
    roomCard.className = 'qpm-card';
    roomCard.style.cssText = `
      padding: 16px;
      position: relative;
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(0, 0, 0, 0.2) 100%);
      border: 2px solid rgba(66, 165, 245, 0.2);
      transition: all 0.2s ease;
      cursor: pointer;
    `;

    roomCard.addEventListener('mouseenter', () => {
      roomCard.style.borderColor = 'rgba(66, 165, 245, 0.5)';
      roomCard.style.transform = 'translateY(-2px)';
      roomCard.style.boxShadow = '0 8px 16px rgba(0, 0, 0, 0.3)';
    });
    roomCard.addEventListener('mouseleave', () => {
      roomCard.style.borderColor = 'rgba(66, 165, 245, 0.2)';
      roomCard.style.transform = '';
      roomCard.style.boxShadow = '';
    });

    const tagsHtml = room.tags && room.tags.length > 0
      ? `<div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px;">
          ${room.tags.map(tag => `<span style="background: linear-gradient(135deg, rgba(0, 188, 212, 0.3) 0%, rgba(0, 150, 136, 0.3) 100%); padding: 4px 10px; border-radius: 12px; font-size: 11px; color: #4DD0E1; border: 1px solid rgba(77, 208, 225, 0.3); font-weight: 600;">${tag}</span>`).join('')}
         </div>`
      : '';

    roomCard.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
        <div style="font-size: 17px; font-weight: bold; color: #fff; flex: 1;">${room.originalRoomName || roomCode}</div>
        <div style="background: ${playerBgColor}; padding: 4px 10px; border-radius: 12px; border: 1px solid ${playerBadgeColor}; display: flex; align-items: center; gap: 4px; white-space: nowrap;">
          <span style="font-size: 12px;">👥</span>
          <span style="font-size: 12px; font-weight: 600; color: ${playerBadgeColor};">${playerCount}</span>
        </div>
      </div>
      <div style="font-size: 12px; color: #aaa; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
        <span style="color: #888;">👤</span>
        <span>${room.creator || 'Unknown'}</span>
      </div>
      <div style="font-size: 11px; color: #666; font-family: monospace; margin-top: 4px;">Room: ${roomCode}</div>
      ${tagsHtml}
      <div style="display: flex; gap: 8px; margin-top: 14px;">
        <button class="qpm-button qpm-button--positive pr-join-btn" data-room-code="${roomCode}" style="flex: 1; padding: 8px; font-size: 13px; font-weight: 600;">🚀 Join</button>
        ${isOwner ? `<button class="qpm-button qpm-button--negative pr-delete-btn" data-room-code="${roomCode}" style="flex: 1; padding: 8px; font-size: 13px; font-weight: 600;">🗑️ Delete</button>` : ''}
      </div>
    `;

    roomsList.appendChild(roomCard);
  });

  // Add event listeners to join buttons
  document.querySelectorAll('.pr-join-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const roomCode = (e.target as HTMLElement).getAttribute('data-room-code');
      if (roomCode) {
        window.location.href = `/r/${roomCode}`;
      }
    });
  });

  // Add event listeners to delete buttons
  document.querySelectorAll('.pr-delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const roomCode = (e.target as HTMLElement).getAttribute('data-room-code');
      if (roomCode && confirm(`Are you sure you want to delete room ${roomCode}?`)) {
        try {
          await deletePublicRoom(roomCode);
          showToast(`Room ${roomCode} deleted`, 'success');
        } catch (error: any) {
          showToast(error.message || 'Failed to delete room', 'error');
        }
      }
    });
  });
}

/**
 * Update room status UI
 */
async function updateRoomStatus(): Promise<void> {
  const createBtn = document.getElementById('pr-create-room-btn');
  const deleteBtn = document.getElementById('pr-delete-room-btn');
  const tagsInput = document.getElementById('pr-tags-input') as HTMLInputElement;

  if (!createBtn || !deleteBtn || !tagsInput) return;

  currentRoomIsPublic = await isCurrentRoomPublic();

  if (currentRoomIsPublic) {
    createBtn.classList.add('hidden');
    deleteBtn.classList.remove('hidden');

    // Load existing tags
    const roomData = await getCurrentRoomData();
    if (roomData?.tags) {
      tagsInput.value = roomData.tags.join(', ');
    }
  } else {
    createBtn.classList.remove('hidden');
    deleteBtn.classList.add('hidden');
  }
}

/**
 * Display error message
 */
function displayError(message: string): void {
  const errorDiv = document.getElementById('pr-error');
  if (errorDiv) {
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    setTimeout(() => {
      errorDiv.style.display = 'none';
    }, 5000);
  }
}

/**
 * Setup login event listeners (for login section)
 */
function setupLoginEventListeners(): void {
  // Prevent input fields from controlling the game
  const preventGameControl = (e: KeyboardEvent) => {
    e.stopPropagation();
  };

  // OAuth Login buttons
  const googleSigninBtn = document.getElementById('pr-google-signin-btn');
  const githubSigninBtn = document.getElementById('pr-github-signin-btn');

  if (googleSigninBtn) {
    googleSigninBtn.addEventListener('click', async () => {
      try {
        await signInWithGoogle();
        showToast('Signed in with Google!', 'success');
      } catch (error: any) {
        displayError(error.message);
      }
    });
  }

  if (githubSigninBtn) {
    githubSigninBtn.addEventListener('click', async () => {
      try {
        await signInWithGitHub();
        showToast('Signed in with GitHub!', 'success');
      } catch (error: any) {
        displayError(error.message);
      }
    });
  }

  // Email/Password Login form
  const signinBtn = document.getElementById('pr-signin-btn');
  const createBtn = document.getElementById('pr-create-btn');
  const emailInput = document.getElementById('pr-email') as HTMLInputElement;
  const passwordInput = document.getElementById('pr-password') as HTMLInputElement;

  if (emailInput) {
    emailInput.addEventListener('keydown', preventGameControl);
    emailInput.addEventListener('keyup', preventGameControl);
    emailInput.addEventListener('keypress', preventGameControl);
  }

  if (passwordInput) {
    passwordInput.addEventListener('keydown', preventGameControl);
    passwordInput.addEventListener('keyup', preventGameControl);
    passwordInput.addEventListener('keypress', preventGameControl);
  }

  if (signinBtn) {
    signinBtn.addEventListener('click', async () => {
      try {
        await signIn(emailInput.value, passwordInput.value);
        showToast('Signed in successfully!', 'success');
      } catch (error: any) {
        displayError(error.message);
      }
    });
  }

  if (createBtn) {
    createBtn.addEventListener('click', async () => {
      try {
        await createAccount(emailInput.value, passwordInput.value);
        showToast('Account created successfully!', 'success');
      } catch (error: any) {
        displayError(error.message);
      }
    });
  }
}

/**
 * Setup app event listeners (for main interface)
 */
function setupAppEventListeners(): void {
  // Prevent input fields from controlling the game
  const preventGameControl = (e: KeyboardEvent) => {
    e.stopPropagation();
  };

  // App buttons
  const signoutBtn = document.getElementById('pr-signout-btn');
  const refreshBtn = document.getElementById('pr-refresh-btn');
  const createRoomBtn = document.getElementById('pr-create-room-btn');
  const deleteRoomBtn = document.getElementById('pr-delete-room-btn');

  if (signoutBtn) {
    signoutBtn.addEventListener('click', async () => {
      try {
        await signOut();
        showToast('Signed out', 'success');
      } catch (error: any) {
        showToast(error.message, 'error');
      }
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      fetchRooms();
      showToast('Refreshing rooms...', 'success');
    });
  }

  if (createRoomBtn) {
    createRoomBtn.addEventListener('click', async () => {
      const tagsInput = document.getElementById('pr-tags-input') as HTMLInputElement;
      const tags = tagsInput.value.split(',').map(t => t.trim()).filter(t => t);

      try {
        await createPublicRoom(tags);
        showToast('Room made public!', 'success');
        updateRoomStatus();
      } catch (error: any) {
        showToast(error.message, 'error');
      }
    });
  }

  if (deleteRoomBtn) {
    deleteRoomBtn.addEventListener('click', async () => {
      if (confirm('Make this room private? It will be removed from the public list.')) {
        try {
          await deletePublicRoom();
          showToast('Room made private', 'success');
          updateRoomStatus();
        } catch (error: any) {
          showToast(error.message, 'error');
        }
      }
    });
  }

  // Search and filters
  const searchInput = document.getElementById('pr-search-input') as HTMLInputElement;
  const playerFilter = document.getElementById('pr-player-filter') as HTMLSelectElement;
  const sortBy = document.getElementById('pr-sort-by') as HTMLSelectElement;
  const tagsInput = document.getElementById('pr-tags-input') as HTMLInputElement;

  // Prevent search input from controlling the game
  if (searchInput) {
    searchInput.addEventListener('keydown', preventGameControl);
    searchInput.addEventListener('keyup', preventGameControl);
    searchInput.addEventListener('keypress', preventGameControl);
    searchInput.addEventListener('input', (e) => {
      if (searchTimeout) clearTimeout(searchTimeout);
      searchTimeout = window.setTimeout(() => {
        setSearchTerm((e.target as HTMLInputElement).value);
      }, 300);
    });
  }

  // Prevent tags input from controlling the game
  if (tagsInput) {
    tagsInput.addEventListener('keydown', preventGameControl);
    tagsInput.addEventListener('keyup', preventGameControl);
    tagsInput.addEventListener('keypress', preventGameControl);
  }

  if (playerFilter) {
    playerFilter.addEventListener('change', (e) => {
      setPlayerFilter((e.target as HTMLSelectElement).value as any);
    });
  }

  if (sortBy) {
    sortBy.addEventListener('change', (e) => {
      setSortBy((e.target as HTMLSelectElement).value as any);
    });
  }

  // Settings
  const refreshInterval = document.getElementById('pr-refresh-interval') as HTMLSelectElement;
  const playerInterval = document.getElementById('pr-player-interval') as HTMLSelectElement;

  if (refreshInterval) {
    refreshInterval.addEventListener('change', (e) => {
      const value = parseInt((e.target as HTMLSelectElement).value, 10);
      setRefreshInterval(value);
      showToast(`Refresh interval set to ${value > 0 ? value + 's' : 'never'}`, 'success');
    });
  }

  if (playerInterval) {
    playerInterval.addEventListener('change', (e) => {
      const value = parseInt((e.target as HTMLSelectElement).value, 10);
      setPlayerCountInterval(value);
      showToast(`Player count interval set to ${value > 0 ? value + 'm' : 'never'}`, 'success');
    });
  }
}

/**
 * Update UI based on auth state
 */
function updateAuthUI(user: FirebaseUser | null): void {
  console.log('[PublicRooms] updateAuthUI called, user:', user ? 'logged in' : 'logged out');

  const loginContainer = document.getElementById('pr-login-container');
  const manageRoomSection = document.getElementById('pr-manage-room-section');
  const userStatus = document.getElementById('pr-user-status');
  const signoutBtn = document.getElementById('pr-signout-btn');
  const loginSection = document.getElementById('pr-login-section');

  if (user) {
    console.log('[PublicRooms] User logged in, showing management options');

    // Hide login section
    if (loginSection) loginSection.remove();
    if (loginContainer) loginContainer.innerHTML = '';

    // Show manage room section and sign out button
    if (manageRoomSection) manageRoomSection.classList.remove('hidden');
    if (signoutBtn) signoutBtn.classList.remove('hidden');

    // Update user status
    if (userStatus) {
      const displayName = user.displayName || user.email?.split('@')[0] || 'User';
      userStatus.textContent = `👤 ${displayName}`;
      userStatus.style.color = '#4CAF50';
    }

    // Update room status
    updateRoomStatus();
  } else {
    console.log('[PublicRooms] User logged out, showing login option');

    // Show login section if not already present
    if (loginContainer && !document.getElementById('pr-login-section')) {
      const loginEl = createLoginSection();
      loginContainer.appendChild(loginEl);

      // Re-setup login event listeners
      setupLoginEventListeners();
    }

    // Hide manage room section and sign out button
    if (manageRoomSection) manageRoomSection.classList.add('hidden');
    if (signoutBtn) signoutBtn.classList.add('hidden');

    // Update user status
    if (userStatus) {
      userStatus.textContent = '👁️ Viewing anonymously';
      userStatus.style.color = '#888';
    }
  }

  console.log('[PublicRooms] updateAuthUI complete');
}

/**
 * Update connection status UI
 */
function updateConnectionStatus(status: 'connecting' | 'connected' | 'failed' | 'retrying'): void {
  const statusEl = document.getElementById('pr-connection-status');
  const roomsList = document.getElementById('pr-rooms-list');
  
  if (statusEl) {
    const statusConfig = {
      connecting: { text: '🔄 Connecting to Firebase...', color: '#42A5F5' },
      connected: { text: '✅ Connected', color: '#4CAF50' },
      failed: { text: '❌ Connection Failed', color: '#ff4d4d' },
      retrying: { text: '🔄 Retrying connection...', color: '#FF9800' }
    };
    
    const config = statusConfig[status];
    statusEl.textContent = config.text;
    statusEl.style.color = config.color;
  }
  
  // Update rooms list with appropriate message
  if (roomsList) {
    if (status === 'connecting' || status === 'retrying') {
      roomsList.innerHTML = `
        <div style="text-align: center; color: #aaa; grid-column: 1/-1; padding: 40px;">
          <div style="font-size: 32px; margin-bottom: 16px;">🔄</div>
          <p style="font-size: 14px; margin-bottom: 8px;">${status === 'connecting' ? 'Connecting to Public Rooms...' : 'Retrying connection...'}</p>
          <p style="font-size: 12px; color: #666;">This may take a few seconds</p>
        </div>
      `;
    } else if (status === 'failed') {
      roomsList.innerHTML = `
        <div style="text-align: center; color: #ff4d4d; grid-column: 1/-1; padding: 40px;">
          <div style="font-size: 32px; margin-bottom: 16px;">❌</div>
          <p style="font-size: 16px; margin-bottom: 8px;">Unable to connect to Public Rooms</p>
          <p style="font-size: 12px; color: #aaa; margin-bottom: 16px;">The Firebase service may be temporarily unavailable</p>
          <button id="pr-retry-connection-btn" style="
            padding: 10px 20px;
            background: rgba(66, 165, 245, 0.2);
            border: 2px solid #42A5F5;
            border-radius: 6px;
            color: #42A5F5;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
          ">🔄 Retry Connection</button>
        </div>
      `;
      
      // Add retry button listener
      const retryBtn = document.getElementById('pr-retry-connection-btn');
      if (retryBtn) {
        retryBtn.addEventListener('click', async () => {
          retryBtn.textContent = '⏳ Retrying...';
          retryBtn.setAttribute('disabled', 'true');
          
          const success = await retryFirebaseInit();
          if (success) {
            showToast('Connected successfully!', 'success');
            fetchRooms();
          } else {
            showToast('Connection failed. Please try again.', 'error');
          }
        });
      }
    }
  }
}

/**
 * Show error message in rooms list
 */
function showRoomsError(message: string): void {
  const roomsList = document.getElementById('pr-rooms-list');
  if (roomsList) {
    roomsList.innerHTML = `
      <div style="text-align: center; color: #ff4d4d; grid-column: 1/-1; padding: 40px;">
        <div style="font-size: 32px; margin-bottom: 16px;">⚠️</div>
        <p style="font-size: 14px; margin-bottom: 16px;">${message}</p>
        <button id="pr-retry-fetch-btn" style="
          padding: 10px 20px;
          background: rgba(66, 165, 245, 0.2);
          border: 2px solid #42A5F5;
          border-radius: 6px;
          color: #42A5F5;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        ">🔄 Retry</button>
      </div>
    `;
    
    // Add retry button listener
    const retryBtn = document.getElementById('pr-retry-fetch-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        roomsList.innerHTML = '<p style="text-align: center; color: #aaa; grid-column: 1/-1; font-size: 14px;">Loading rooms...</p>';
        fetchRooms();
      });
    }
  }
}

/**
 * Render Public Rooms window
 */
export function renderPublicRoomsWindow(root: HTMLElement): void {
  console.log('[PublicRooms] Rendering window into root...');

  // Clear root and set styles
  root.innerHTML = '';
  root.style.cssText = 'height: 100%; overflow-y: auto; background: linear-gradient(135deg, rgba(33, 33, 33, 0.95) 0%, rgba(0, 0, 0, 0.95) 50%, rgba(22, 22, 44, 0.95) 100%);';

  // Add hidden class style if not present
  if (!document.querySelector('#pr-hidden-style')) {
    const style = document.createElement('style');
    style.id = 'pr-hidden-style';
    style.textContent = '.hidden { display: none !important; }';
    document.head.appendChild(style);
  }

  // Add app container (always visible)
  const appEl = createAppContainer();
  root.appendChild(appEl);

  console.log('[PublicRooms] App container added to root');

  // Setup callbacks
  setAuthStateCallback(updateAuthUI);
  setRoomsUpdateCallback(renderRooms);
  setConnectionStatusCallback(updateConnectionStatus);
  setErrorCallback(showRoomsError);

  // Setup event listeners after a short delay to ensure DOM is ready
  setTimeout(() => {
    console.log('[PublicRooms] Setting up event listeners...');

    const state = getState();
    
    // Update connection status UI based on current state
    updateConnectionStatus(state.connectionStatus);

    // Check if Firebase SDK is available - if not, still show UI with retry option
    if (typeof window.firebase === 'undefined') {
      console.warn('[PublicRooms] Firebase SDK not loaded yet, showing retry UI');
      updateConnectionStatus('failed');
    } else {
      // Setup app event listeners
      setupAppEventListeners();

      // Check initial auth state and update UI accordingly
      const user = getCurrentUser();

      console.log('[PublicRooms] Initial state:', {
        isAuthReady: state.isAuthReady,
        hasUser: !!user,
        isFirebaseReady: state.isFirebaseReady,
        connectionStatus: state.connectionStatus
      });

      // Update UI based on auth state (will show login section if not authenticated)
      updateAuthUI(user);

      // Fetch rooms if Firebase is ready
      if (state.isFirebaseReady) {
        console.log('[PublicRooms] Fetching rooms...');
        fetchRooms();
      } else if (state.connectionStatus === 'connecting' || state.connectionStatus === 'retrying') {
        console.log('[PublicRooms] Firebase still initializing, waiting...');
        // Connection status callback will handle updates
      } else {
        console.log('[PublicRooms] Firebase not ready, showing retry option');
        updateConnectionStatus('failed');
      }
    }
  }, 100);

  console.log('[PublicRooms] Window rendering complete');
}
