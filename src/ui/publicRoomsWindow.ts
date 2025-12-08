import {
  fetchRooms,
  getState,
  initPublicRooms,
  setConnectionStatusCallback,
  setErrorCallback,
  setPlayerFilter,
  setRoomsUpdateCallback,
  setSearchTerm,
  setSortBy,
} from '../features/publicRooms';
import type { RoomsMap, Room, RoomUserSlot, PublicRoomsState } from '../types/publicRooms';

function showToast(message: string, level: 'info' | 'success' | 'error' = 'info'): void {
  console.log(`[PublicRooms:${level}]`, message);
}

function formatRoomLabel(roomId: string): string {
  const trimmed = roomId.trim();
  if (trimmed.length <= 16) return trimmed;
  const start = trimmed.slice(0, 10);
  const end = trimmed.slice(-4);
  return `${start}…${end}`;
}

function roomOriginLabel(roomId: string): 'Discord' | 'Web' {
  // Discord rooms now identified by Aries convention: codes starting with "I-"
  const trimmed = roomId.trim();
  return trimmed.startsWith('I-') ? 'Discord' : 'Web';
}

function setRoomStatPills(totalRooms: number, visibleRooms: number): void {
  const totalEl = document.getElementById('pr-total-rooms-pill');
  const visibleEl = document.getElementById('pr-visible-rooms-pill');
  if (totalEl) totalEl.textContent = `Rooms: ${totalRooms}`;
  if (visibleEl) visibleEl.textContent = `Showing: ${visibleRooms}`;
}

function createAppContainer(): HTMLElement {
  const container = document.createElement('div');
  container.id = 'pr-app';

  container.innerHTML = `
    <div style="padding: 20px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 2px solid rgba(66, 165, 245, 0.25);">
        <div>
          <h3 style="color: #fff; margin: 0 0 4px 0; font-size: 22px; display: flex; align-items: center; gap: 10px;">
            🌐 Public Rooms
          </h3>
          <div style="display: flex; align-items: center; gap: 8px;">
            <p style="margin: 0; font-size: 11px; color: #888;">Powered by Supabase</p>
            <span id="pr-connection-status" style="font-size: 11px; color: #42A5F5;">🔄 Connecting...</span>
          </div>
          <div id="pr-room-statline" style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px;">
            <span id="pr-total-rooms-pill" style="padding: 3px 10px; border-radius: 999px; background: rgba(66, 165, 245, 0.15); border: 1px solid rgba(66, 165, 245, 0.35); color: #90CAF9; font-size: 11px; font-weight: 600;">Rooms: --</span>
            <span id="pr-visible-rooms-pill" style="padding: 3px 10px; border-radius: 999px; background: rgba(76, 175, 80, 0.15); border: 1px solid rgba(76, 175, 80, 0.35); color: #A5D6A7; font-size: 11px; font-weight: 600;">Showing: --</span>
          </div>
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          <button id="pr-refresh-btn" class="qpm-button qpm-button--neutral" style="padding: 8px 16px; font-size: 13px;">🔄 Refresh</button>
        </div>
      </div>

      <div class="qpm-card" style="margin-bottom: 16px; background: rgba(33, 150, 243, 0.08); border: 2px solid rgba(33, 150, 243, 0.25);">
        <h4 style="color: #42A5F5; margin-bottom: 12px; font-size: 15px; display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 18px;">🔍</span> Discover Rooms & Players
        </h4>
        <input type="text" id="pr-search-input" placeholder="🔎 Search by room code or player name..."
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
              <option value="name">Room Code</option>
              <option value="players-desc" selected>Most Players</option>
              <option value="players-asc">Least Players</option>
            </select>
          </div>
        </div>
      </div>

      <div style="margin-bottom: 12px; padding-bottom: 10px; border-bottom: 2px solid rgba(255, 255, 255, 0.08);">
        <h4 style="color: #fff; margin: 0; font-size: 16px; display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 20px;">🎮</span> Available Rooms
        </h4>
      </div>
      <div id="pr-rooms-list" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; margin-bottom: 20px;">
        <p style="text-align: center; color: #aaa; grid-column: 1/-1; font-size: 14px;">Loading rooms...</p>
      </div>

      <div class="qpm-card" style="background: rgba(255, 152, 0, 0.08); border: 2px solid rgba(255, 152, 0, 0.25);">
        <h4 style="color: #FF9800; margin-bottom: 12px; font-size: 15px; display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 18px;">⚙️</span> Settings
        </h4>
        <div style="color: #f6c56a; font-size: 12px; font-weight: 700;">Auto-refresh disabled to reduce server load. Use Refresh to fetch latest.</div>
      </div>
    </div>
  `;

  return container;
}

function playerChip(slot: RoomUserSlot): string {
  const avatar = slot.avatarUrl
    ? `<span style="width: 20px; height: 20px; border-radius: 50%; background-image: url(${slot.avatarUrl}); background-size: cover; background-position: center; border: 1px solid rgba(255,255,255,0.15);"></span>`
    : '<span style="font-size: 12px; opacity: 0.7;">👤</span>';
  return `
    <span class="pr-player-chip" data-player-name="${slot.name || ''}" style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 999px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08); color: #fff; font-size: 12px; font-weight: 600;">
      ${avatar}
      ${slot.name || 'Unknown'}
    </span>
  `;
}

function openPlayersModal(room: Room): void {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 20px;';

  const card = document.createElement('div');
  card.style.cssText = 'width: min(520px, 100%); max-height: 80vh; overflow: auto; background: #111827; border: 2px solid rgba(66,165,245,0.35); border-radius: 10px; padding: 18px; color: #fff; box-shadow: 0 12px 32px rgba(0,0,0,0.4);';

  const players = room.userSlots || [];

  card.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
      <div>
        <div style="font-size: 18px; font-weight: 700;">Players in ${room.id}</div>
        <div style="font-size: 12px; color: #9CA3AF;">${players.length} visible player${players.length === 1 ? '' : 's'}</div>
      </div>
      <button id="pr-modal-close" class="qpm-button qpm-button--neutral" style="padding: 6px 12px;">✖</button>
    </div>
    <div style="display: flex; flex-direction: column; gap: 10px;">
      ${players.length === 0 ? '<div style="color: #9CA3AF; font-size: 13px; text-align: center; padding: 20px;">No players visible for this room.</div>' : players.map(slot => `
        <div class="qpm-card" style="padding: 10px 12px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; gap: 10px;">
          ${slot.avatarUrl ? `<img src="${slot.avatarUrl}" alt="avatar" style="width: 36px; height: 36px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.2); object-fit: cover;">` : '<div style="width: 36px; height: 36px; border-radius: 50%; background: rgba(255,255,255,0.08); display: grid; place-items: center; color: #9CA3AF;">👤</div>'}
          <div style="flex: 1;">
            <div style="font-size: 14px; font-weight: 700;">${slot.name || 'Unknown player'}</div>
            <div style="font-size: 11px; color: #9CA3AF;">Tap to search by this player</div>
          </div>
          <button class="qpm-button qpm-button--neutral pr-search-player" data-player-name="${slot.name || ''}" style="padding: 6px 10px; font-size: 12px;">🔍 Search</button>
        </div>
      `).join('')}
    </div>
  `;

  overlay.appendChild(card);
  document.body.appendChild(overlay);

  const close = (): void => overlay.remove();
  card.querySelector('#pr-modal-close')?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  card.querySelectorAll('.pr-search-player').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const name = (e.currentTarget as HTMLElement).getAttribute('data-player-name') || '';
      const searchInput = document.getElementById('pr-search-input') as HTMLInputElement | null;
      if (searchInput) searchInput.value = name;
      setSearchTerm(name);
      close();
    });
  });
}

function renderRooms(rooms: RoomsMap): void {
  const roomsList = document.getElementById('pr-rooms-list');
  if (!roomsList) return;

  roomsList.innerHTML = '';
  const roomKeys = Object.keys(rooms);
  const totalRooms = Object.keys(getState().allRooms || {}).length;
  setRoomStatPills(totalRooms, roomKeys.length);

  const fragment = document.createDocumentFragment();

  if (roomKeys.length === 0) {
    roomsList.innerHTML = '<p style="text-align: center; color: #aaa; grid-column: 1/-1; font-size: 14px;">No rooms found. Try adjusting filters or search by player name.</p>';
    return;
  }

  roomKeys.forEach(roomCode => {
    const room = rooms[roomCode];
    if (!room) return;

    const playerCount = room.playersCount || 0;
    let playerBadgeColor = '#666';
    let playerBgColor = 'rgba(102, 102, 102, 0.2)';
    const isFull = playerCount >= 6;
    if (isFull) {
      playerBadgeColor = '#E53935';
      playerBgColor = 'rgba(229, 57, 53, 0.25)';
    } else if (playerCount >= 5) {
      playerBadgeColor = '#4CAF50';
      playerBgColor = 'rgba(76, 175, 80, 0.2)';
    } else if (playerCount >= 3) {
      playerBadgeColor = '#FF9800';
      playerBgColor = 'rgba(255, 152, 0, 0.2)';
    } else if (playerCount >= 1) {
      playerBadgeColor = '#42A5F5';
      playerBgColor = 'rgba(66, 165, 245, 0.2)';
    }

    const roomLabel = formatRoomLabel(room.id);
    const origin = roomOriginLabel(room.id);
    const originBadgeColor = origin === 'Discord' ? '#7289DA' : '#26A69A';
    const originBgColor = origin === 'Discord' ? 'rgba(114, 137, 218, 0.2)' : 'rgba(38, 166, 154, 0.2)';

    const slotsHtml = room.userSlots && room.userSlots.length > 0
      ? `<div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px;">${room.userSlots.map(playerChip).join('')}</div>`
      : '<div style="color: #777; font-size: 12px; margin-top: 10px;">No visible players</div>';

    const roomCard = document.createElement('div');
    roomCard.className = 'qpm-card';
    roomCard.style.cssText = 'padding: 16px; position: relative; background: linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(0, 0, 0, 0.2) 100%); border: 2px solid rgba(66, 165, 245, 0.2); transition: all 0.2s ease;';

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

    roomCard.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
        <div style="font-size: 17px; font-weight: bold; color: #fff; flex: 1; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
          ${room.isPrivate ? '<span title="Private" style="font-size: 14px; color: #ffb74d;">🔒</span>' : '<span title="Public" style="font-size: 14px; color: #4CAF50;">🔓</span>'}
          <span title="${room.id}" style="display: inline-flex; align-items: center; gap: 8px;">
            ${roomLabel}
          </span>
          <span title="Detected origin" style="padding: 3px 8px; border-radius: 10px; background: ${originBgColor}; border: 1px solid ${originBadgeColor}; color: ${originBadgeColor}; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px;">
            ${origin === 'Discord' ? '🛰️ Discord' : '🌐 Web'}
          </span>
        </div>
        <div style="background: ${playerBgColor}; padding: 4px 10px; border-radius: 12px; border: 1px solid ${playerBadgeColor}; display: flex; align-items: center; gap: 4px; white-space: nowrap;">
          <span style="font-size: 12px;">👥</span>
          <span style="font-size: 12px; font-weight: 600; color: ${playerBadgeColor};">${playerCount}</span>
        </div>
      </div>
      <div style="font-size: 11px; color: #666; font-family: monospace; margin-top: 4px;">Updated: ${room.lastUpdatedAt ? new Date(room.lastUpdatedAt).toLocaleTimeString() : 'n/a'}</div>
      ${slotsHtml}
      <div style="display: flex; gap: 8px; margin-top: 14px;">
        <button
          class="qpm-button ${isFull ? 'qpm-button--negative' : 'qpm-button--positive'} pr-join-btn"
          data-room-code="${roomCode}"
          style="flex: 1; padding: 8px; font-size: 13px; font-weight: 600; ${isFull ? 'background: linear-gradient(135deg, rgba(229,57,53,0.85), rgba(183,28,28,0.9)); border: 2px solid rgba(229,57,53,0.9); color: #fff;' : ''}"
        >${isFull ? '⛔ Full' : '🚀 Join'}</button>
        <button class="qpm-button qpm-button--neutral pr-view-btn" data-room-code="${roomCode}" style="padding: 8px; font-size: 13px; font-weight: 600;">👁️ Players</button>
      </div>
    `;

    fragment.appendChild(roomCard);
  });

  roomsList.appendChild(fragment);

  roomsList.querySelectorAll('.pr-join-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const roomCode = (e.target as HTMLElement).getAttribute('data-room-code');
      if (roomCode) window.location.href = `/r/${roomCode}`;
    });
  });

  roomsList.querySelectorAll('.pr-player-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      const name = (e.currentTarget as HTMLElement).getAttribute('data-player-name');
      if (!name) return;
      const searchInput = document.getElementById('pr-search-input') as HTMLInputElement | null;
      if (searchInput) searchInput.value = name;
      setSearchTerm(name);
    });
  });

  roomsList.querySelectorAll('.pr-view-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const roomCode = (e.target as HTMLElement).getAttribute('data-room-code');
      if (!roomCode) return;
      const room = getState().allRooms[roomCode];
      if (!room) {
        showToast('Room data unavailable', 'error');
        return;
      }
      if (!room.userSlots || room.userSlots.length === 0) {
        showToast('No players visible in this room', 'info');
        return;
      }
      openPlayersModal(room);
    });
  });
}

function showRoomsError(message: string): void {
  const roomsList = document.getElementById('pr-rooms-list');
  if (roomsList) {
    roomsList.innerHTML = `
      <div style="text-align: center; color: #ff4d4d; grid-column: 1/-1; padding: 40px;">
        <div style="font-size: 32px; margin-bottom: 16px;">⚠️</div>
        <p style="font-size: 14px; margin-bottom: 16px;">${message}</p>
        <button id="pr-retry-fetch-btn" style="padding: 10px 20px; background: rgba(66, 165, 245, 0.2); border: 2px solid #42A5F5; border-radius: 6px; color: #42A5F5; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s;">🔄 Retry</button>
      </div>
    `;

    const retryBtn = document.getElementById('pr-retry-fetch-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        roomsList.innerHTML = '<p style="text-align: center; color: #aaa; grid-column: 1/-1; font-size: 14px;">Loading rooms...</p>';
        fetchRooms();
      });
    }
  }
}

function updateConnectionStatus(status: PublicRoomsState['connectionStatus']): void {
  const statusEl = document.getElementById('pr-connection-status');
  const roomsList = document.getElementById('pr-rooms-list');

  const statusConfig = {
    connecting: { text: '🔄 Connecting...', color: '#42A5F5' },
    connected: { text: '✅ Connected', color: '#4CAF50' },
    failed: { text: '❌ Connection Failed', color: '#ff4d4d' },
    retrying: { text: '🔄 Retrying...', color: '#FF9800' },
  } as const;

  if (statusEl) {
    const cfg = statusConfig[status];
    statusEl.textContent = cfg.text;
    statusEl.style.color = cfg.color;
  }

  if (roomsList && (status === 'connecting' || status === 'retrying')) {
    roomsList.innerHTML = `
      <div style="text-align: center; color: #aaa; grid-column: 1/-1; padding: 40px;">
        <div style="font-size: 32px; margin-bottom: 16px;">🔄</div>
        <p style="font-size: 14px; margin-bottom: 8px;">${status === 'connecting' ? 'Connecting to Public Rooms...' : 'Retrying connection...'}</p>
        <p style="font-size: 12px; color: #666;">This may take a few seconds</p>
      </div>
    `;
  }
}

export function renderPublicRoomsWindow(root: HTMLElement): void {
  root.innerHTML = '';
  root.style.cssText = 'height: 100%; overflow-y: auto; background: linear-gradient(135deg, rgba(33, 33, 33, 0.95) 0%, rgba(0, 0, 0, 0.95) 50%, rgba(22, 22, 44, 0.95) 100%);';

  if (!document.querySelector('#pr-hidden-style')) {
    const style = document.createElement('style');
    style.id = 'pr-hidden-style';
    style.textContent = '.hidden { display: none !important; }';
    document.head.appendChild(style);
  }

  const appEl = createAppContainer();
  root.appendChild(appEl);

  const searchInput = document.getElementById('pr-search-input') as HTMLInputElement | null;
  const playerFilter = document.getElementById('pr-player-filter') as HTMLSelectElement | null;
  const sortBy = document.getElementById('pr-sort-by') as HTMLSelectElement | null;
  const refreshBtn = document.getElementById('pr-refresh-btn');

  if (searchInput) {
    let timeout: number | null = null;
    const swallowKey = (e: Event): void => {
      e.stopPropagation();
      // Prevent the game canvas from stealing focus/keys while typing
      if (typeof (e as any).stopImmediatePropagation === 'function') {
        (e as any).stopImmediatePropagation();
      }
    };
    (['keydown', 'keyup', 'keypress'] as const).forEach(evt => searchInput.addEventListener(evt, swallowKey, true));
    searchInput.addEventListener('input', (e) => {
      if (timeout) window.clearTimeout(timeout);
      timeout = window.setTimeout(() => {
        setSearchTerm((e.target as HTMLInputElement).value);
      }, 200);
    });
  }

  playerFilter?.addEventListener('change', (e) => {
    setPlayerFilter((e.target as HTMLSelectElement).value as any);
  });

  sortBy?.addEventListener('change', (e) => {
    setSortBy((e.target as HTMLSelectElement).value as any);
  });

  refreshBtn?.addEventListener('click', () => {
    fetchRooms();
    showToast('Refreshing rooms...', 'info');
  });

  setRoomsUpdateCallback(renderRooms);
  setConnectionStatusCallback(updateConnectionStatus);
  setErrorCallback(showRoomsError);

  initPublicRooms().catch(err => {
    showToast('Unable to initialize Public Rooms', 'error');
    console.error('[PublicRooms] init failed', err);
  });
}
