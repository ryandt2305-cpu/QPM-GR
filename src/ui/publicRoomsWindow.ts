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
import type { RoomsMap, Room, RoomUserSlot, PublicRoomsState, PlayerView } from '../types/publicRooms';
import { getPlayerView, getCachedFriendsSet, resetFriendsCache } from '../services/ariesPlayers';
import { storage } from '../utils/storage';
import {
  getCropSpriteCanvas,
  getCropSpriteWithMutations,
  getPetSpriteCanvas,
  getPetSpriteWithMutations,
  getMutationOverlayDataUrl,
  spriteExtractor,
  serviceReady,
} from '../sprite-v2/compat';
import type { SpriteCategory, SpriteService } from '../sprite-v2/types';
import { findVariantBadge } from '../data/variantBadges';
import { getSpeciesXpPerLevel, calculateMaxStrength } from '../store/xpTracker';
import { canvasToDataUrl } from '../utils/canvasHelpers';

const inspectorState = {
  targetPlayerId: null as string | null,
  targetPlayerName: '',
  targetRoomId: '',
};

const spriteReadyPromise = serviceReady;
let spriteService: SpriteService | null = null;
type SpriteKey = { category: SpriteCategory; id: string };
const spriteNameLookup = new Map<string, SpriteKey[]>();
const spriteUrlCache = new Map<string, string>();

function normalizeSpriteLookupKey(name: string): string {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function addSpriteLookup(name: string, entry: SpriteKey): void {
  const key = normalizeSpriteLookupKey(name);
  const arr = spriteNameLookup.get(key) ?? [];
  arr.push(entry);
  spriteNameLookup.set(key, arr);
}

void spriteReadyPromise.then((svc) => {
  spriteService = svc;
  if (!svc) return;
  const cats: SpriteCategory[] = ['item', 'decor', 'seed', 'plant', 'tallplant', 'crop', 'pet'];
  cats.forEach((cat) => {
    try {
      svc.list(cat).forEach((it) => {
        const parts = String(it.key || '').split('/');
        const id = parts[parts.length - 1] || it.key;
        addSpriteLookup(id, { category: cat, id });
      });
    } catch {
      // ignore
    }
  });
});

// Global debug command to inspect garden tile layout
// Returns command functions to be exposed via shareGlobal
export const setupGardenInspector = () => {
  const QPM_INSPECT_GARDEN = async () => {
    console.log('[QPM Garden Inspector] Starting...');
    
    try {
      // Get current Public Rooms state
      const state = getState();
      console.log('[QPM] Public Rooms state:', state);
      
      // Try to find your player ID
      const selfId = inferSelfPlayerId();
      console.log('[QPM] Your Player ID:', selfId || 'Not found');
      
      // Method 1: Check inspected player
      if (inspectorState.targetPlayerId) {
        console.log('[QPM] Currently inspecting:', inspectorState.targetPlayerName, inspectorState.targetPlayerId);
        const view = await getPlayerView(inspectorState.targetPlayerId);
        const garden = (view as any)?.data?.garden || (view as any)?.garden;
        if (garden?.tileObjects) {
          analyzeGardenTiles(garden.tileObjects, inspectorState.targetPlayerName);
          return;
        }
      }
      
      // Method 2: Use self ID
      if (selfId) {
        console.log('[QPM] Fetching YOUR garden...');
        const view = await getPlayerView(selfId);
        const garden = (view as any)?.data?.garden || (view as any)?.garden;
        if (garden?.tileObjects) {
          analyzeGardenTiles(garden.tileObjects, 'You');
          return;
        }
      }
      
      console.warn('[QPM] No garden data found. Open the inspector on a player first.');
    } catch (err) {
      console.error('[QPM] Error:', err);
    }
  };
  
  function analyzeGardenTiles(tiles: any, playerName: string) {
    const tileIds = Object.keys(tiles).map(k => parseInt(k, 10)).sort((a, b) => a - b);
    console.log(`[QPM] Garden for ${playerName}`);
    console.log('[QPM] Total tiles:', tileIds.length);
    console.log('[QPM] Tile IDs:', tileIds);
    
    // Group by row (÷10 for 10-wide pattern)
    const byRow10: Record<number, number[]> = {};
    tileIds.forEach(id => {
      const row = Math.floor(id / 10);
      if (!byRow10[row]) byRow10[row] = [];
      byRow10[row].push(id);
    });
    
    console.log('[QPM] Tiles grouped by row (÷10):');
    console.table(Object.entries(byRow10).map(([row, ids]) => ({
      Row: row,
      Count: ids.length,
      Range: `${ids[0]}-${ids[ids.length - 1]}`,
      IDs: ids.join(','),
    })));
    
    // Show sample tiles
    console.log('[QPM] Sample tile data (first 3):');
    tileIds.slice(0, 3).forEach(id => {
      console.log(`Tile ${id}:`, tiles[id]);
    });
  }
  
  console.log('✅ [QPM] Garden inspector ready! Run: QPM_INSPECT_GARDEN()');
  console.log('   Open the Public Rooms inspector on any player, then run the command');
  
  // Helper to show current tile player is standing on
  const QPM_CURRENT_TILE = async () => {
    try {
      const { getAtomByLabel, readAtomValue } = await import('../core/jotaiBridge');
      
      const tileAtom = getAtomByLabel('myCurrentGardenTileAtom');
      const objectAtom = getAtomByLabel('myOwnCurrentGardenObjectAtom');
      
      if (!tileAtom || !objectAtom) {
        console.warn('[QPM] Tile atoms not found. Make sure you\'re in your garden.');
        return null;
      }
      
      const tileInfo = await readAtomValue<any>(tileAtom);
      const tileObject = await readAtomValue<any>(objectAtom);
      
      console.log('[QPM] Current Tile Info:');
      console.log('  localTileIndex:', tileInfo?.localTileIndex);
      console.log('  tileType:', tileInfo?.tileType);
      console.log('  objectType:', tileObject?.objectType);
      console.log('  species:', tileObject?.species);
      console.log('\n[QPM] Full tile data:', { tileInfo, tileObject });
      
      return { tileInfo, tileObject };
    } catch (err) {
      console.error('[QPM] Error:', err);
      return null;
    }
  };
  
  // Helper to expose raw garden data for manual inspection
  const QPM_EXPOSE_GARDEN = async () => {
    try {
      const selfId = inferSelfPlayerId();
      let targetId = inspectorState.targetPlayerId || selfId;
      let targetName = inspectorState.targetPlayerName || 'You';
      
      if (!targetId) {
        console.warn('[QPM] No player selected. Open inspector on a player first.');
        return null;
      }
      
      console.log(`[QPM] Fetching garden data for ${targetName}...`);
      const res = await getPlayerView(targetId);
      console.log('[QPM] API Response:', res);
      const garden = (res as any)?.data?.garden || (res as any)?.garden;
      
      if (!garden) {
        console.warn('[QPM] No garden data in response. Response structure:', Object.keys(res || {}));
        if (res?.data) console.warn('[QPM] Response.data keys:', Object.keys(res.data));
        return null;
      }
      
      console.log('[QPM] Garden Data:');
      console.log('  tileObjects:', garden.tileObjects);
      console.log('  boardwalkTileObjects:', garden.boardwalkTileObjects);
      console.log('\n[QPM] Tile IDs in tileObjects:', Object.keys(garden.tileObjects || {}).map((k: string) => parseInt(k, 10)).sort((a: number, b: number) => a - b));
      console.log('[QPM] Tile IDs in boardwalkTileObjects:', Object.keys(garden.boardwalkTileObjects || {}).map((k: string) => parseInt(k, 10)).sort((a: number, b: number) => a - b));
      
      return garden;
    } catch (err) {
      console.error('[QPM] Error:', err);
      return null;
    }
  };
  
  return {
    QPM_INSPECT_GARDEN,
    QPM_EXPOSE_GARDEN,
    QPM_CURRENT_TILE
  };
};

// setupGardenInspector will be called from main.ts and exposed via shareGlobal

function inferSelfPlayerId(): string | null {
  // Try to derive the local player's id from existing storage or context if available.
  // Fallback: check public rooms state for a matching slot named like local player (best-effort).
  const state = getState?.();
  const maybeSelf = (state as any)?.selfPlayerId || storage.get<string>('quinoa:selfPlayerId', '');
  if (maybeSelf) return maybeSelf;
  try {
    const rooms = state?.allRooms || {};
    for (const room of Object.values(rooms) as Room[]) {
      const hit = room.userSlots?.find(u => u.playerId && u.name && u.name.toLowerCase().includes('you'));
      if (hit?.playerId) return hit.playerId;
    }
  } catch {}
  return null;
}

// Testing hook to force self player id and clear cached friends (console-friendly)
if (!(window as any).QPM_INSPECT_FRIEND) {
  (window as any).QPM_INSPECT_FRIEND = (playerId: string): void => {
    const pid = (playerId || '').trim();
    if (!pid) {
      console.warn('[QPM Inspector] Provide a playerId string.');
      return;
    }
    try {
      localStorage.setItem('quinoa:selfPlayerId', pid);
    } catch (err) {
      console.warn('[QPM Inspector] Unable to persist self playerId', err);
    }
    resetFriendsCache();
    console.log('[QPM Inspector] self playerId set to', pid, 'friend cache cleared.');
  };
}

function setPanePlaceholder(id: string, text: string): void {
  const el = document.getElementById(id);
  if (el) {
    el.innerHTML = `<div class="pr-pane-placeholder">${text}</div>`;
  }
}

function setPaneContent(id: string, html: string): void {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

function setAllPanes(text: string): void {
  setPanePlaceholder('pr-overview-content', text);
  setPanePlaceholder('pr-pets-content', text);
  setPanePlaceholder('pr-inventory-content', text);
  setPanePlaceholder('pr-activity-content', text);
}

// Inspector shell (placeholder until player endpoint is finalized)
function ensureInspectorShell(): HTMLDivElement {
  let shell = document.getElementById('pr-inspector-shell') as HTMLDivElement | null;
  if (shell) return shell;

  shell = document.createElement('div');
  shell.id = 'pr-inspector-shell';
  shell.className = 'pr-inspector hidden';
  shell.innerHTML = `
    <div class="pr-inspector-overlay"></div>
    <div class="pr-inspector-panel">
      <div class="pr-inspector-header" id="pr-drag-handle">
        <div class="pr-drag-indicator">⋮</div>
        <div class="pr-inspector-identity">
          <div id="pr-inspector-avatar" class="pr-inspector-avatar">👤</div>
          <div>
            <div id="pr-inspector-name" class="pr-inspector-name">Player</div>
            <div id="pr-inspector-sub" class="pr-inspector-sub">Room —</div>
          </div>
        </div>
        <div class="pr-inspector-actions">
          <button id="pr-inspector-refresh" class="qpm-button qpm-button--primary" title="Refresh player data">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
            </svg>
          </button>
          <button id="pr-inspector-close" class="qpm-button qpm-button--negative" title="Close inspector">✕</button>
        </div>
      </div>
      <div class="pr-inspector-tabs">
        <button class="pr-inspector-tab active" data-tab="player">Player</button>
        <button class="pr-inspector-tab" data-tab="compare">Compare</button>
      </div>
      <div class="pr-inspector-body">
        <div id="pr-tab-player" class="pr-inspector-pane active">
          <div class="pr-pane-card">
            <div class="pr-pane-title">Overview</div>
            <div id="pr-overview-content" class="pr-pane-placeholder">Awaiting endpoint & token. Data will load here when configured.</div>
          </div>
          <div class="pr-pane-card collapsible">
            <div class="pr-pane-title">Garden</div>
            <div id="pr-pets-content" class="pr-pane-placeholder">Grid, timers, eggs, mutations will render here.</div>
          </div>
          <div class="pr-pane-card collapsible">
            <div class="pr-pane-title">Inventory</div>
            <div id="pr-inventory-content" class="pr-pane-placeholder">Seeds, potions, tools, rare produce.</div>
          </div>
          <div class="pr-pane-card collapsible">
            <div class="pr-pane-title">Activity</div>
            <div id="pr-activity-content" class="pr-pane-placeholder">Recent actions (harvest, feedPet, MoonKisser...).</div>
          </div>
        </div>

        <div id="pr-tab-compare" class="pr-inspector-pane">
          <div class="pr-pane-card">
            <div class="pr-pane-title">Compare (coming soon)</div>
            <div class="pr-pane-placeholder">Compare pets/achievements once other player data is available.</div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(shell);

  const close = (): void => shell?.classList.add('hidden');
  shell.querySelector('#pr-inspector-close')?.addEventListener('click', close);
  shell.querySelector('.pr-inspector-overlay')?.addEventListener('click', close);

  shell.querySelectorAll('.pr-inspector-tab').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tab = (e.currentTarget as HTMLElement).getAttribute('data-tab');
      shell?.querySelectorAll('.pr-inspector-tab').forEach(t => t.classList.remove('active'));
      shell?.querySelectorAll('.pr-inspector-pane').forEach(p => p.classList.remove('active'));
      (e.currentTarget as HTMLElement).classList.add('active');
      const pane = tab ? shell?.querySelector(`#pr-tab-${tab}`) : null;
      pane?.classList.add('active');
    });
  });

  if (!shell.dataset.prRefreshBound) {
    shell.querySelector('#pr-inspector-refresh')?.addEventListener('click', () => refreshInspectorData(true));
    shell.dataset.prRefreshBound = '1';
  }

  // Make inspector draggable
  if (!shell.dataset.prDraggableBound) {
    const dragHandle = shell.querySelector('#pr-drag-handle') as HTMLElement | null;
    const panel = shell.querySelector('.pr-inspector-panel') as HTMLElement | null;
    
    if (dragHandle && panel) {
      let isDragging = false;
      let currentX = 0;
      let currentY = 0;
      let initialX = 0;
      let initialY = 0;
      
      dragHandle.addEventListener('mousedown', (e: MouseEvent) => {
        // Only allow dragging from drag handle or header background, not buttons
        const target = e.target as HTMLElement;
        if (target.closest('.pr-inspector-actions') || target.closest('button')) return;
        
        isDragging = true;
        const rect = panel.getBoundingClientRect();
        initialX = e.clientX - rect.left;
        initialY = e.clientY - rect.top;
        
        panel.style.transition = 'none';
        dragHandle.style.cursor = 'grabbing';
      });
      
      document.addEventListener('mousemove', (e: MouseEvent) => {
        if (!isDragging) return;
        
        e.preventDefault();
        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;
        
        // Constrain to viewport bounds
        const panelRect = panel.getBoundingClientRect();
        const maxX = window.innerWidth - panelRect.width;
        const maxY = window.innerHeight - panelRect.height;
        
        currentX = Math.max(0, Math.min(currentX, maxX));
        currentY = Math.max(0, Math.min(currentY, maxY));
        
        panel.style.left = `${currentX}px`;
        panel.style.top = `${currentY}px`;
        panel.style.transform = 'none'; // Remove centering transform when dragged
      });
      
      document.addEventListener('mouseup', () => {
        if (isDragging) {
          isDragging = false;
          panel.style.transition = '';
          dragHandle.style.cursor = '';
        }
      });
    }
    
    shell.dataset.prDraggableBound = '1';
  }

  return shell;
}

function openInspector(slot: RoomUserSlot | null, room: Room): void {
  const shell = ensureInspectorShell();
  const avatarEl = shell.querySelector('#pr-inspector-avatar') as HTMLElement | null;
  const nameEl = shell.querySelector('#pr-inspector-name') as HTMLElement | null;
  const subEl = shell.querySelector('#pr-inspector-sub') as HTMLElement | null;

  if (avatarEl) {
    if (slot?.avatarUrl) {
      avatarEl.style.backgroundImage = `url(${slot.avatarUrl})`;
      avatarEl.textContent = '';
      avatarEl.classList.add('has-img');
    } else {
      avatarEl.style.backgroundImage = 'none';
      avatarEl.textContent = avatarInitials(slot?.name ?? '');
      avatarEl.classList.remove('has-img');
    }
  }

  if (nameEl) nameEl.textContent = slot?.name || 'Unknown player';
  if (subEl) subEl.textContent = `Room ${room.id} • Updated ${formatUpdatedAgo(room.lastUpdatedAt)}`;

  inspectorState.targetPlayerId = slot?.playerId ?? null;
  inspectorState.targetPlayerName = slot?.name || '';
  inspectorState.targetRoomId = room.id;

  if (!inspectorState.targetPlayerId) {
    setAllPanes('No player id available for this player yet. Ask the player to enable Aries sync or try a different slot.');
  } else {
    setAllPanes('Loading player view...');
    refreshInspectorData(false).catch(err => {
      console.error('[PublicRooms] Inspector refresh failed', err);
      setAllPanes('Unable to load player view.');
    });
  }

  shell.classList.remove('hidden');
}

// Debug helper to open inspector directly by playerId (no room needed)
export function openInspectorDirect(playerId: string, playerName?: string | null): void {
  const pid = (playerId || '').trim();
  if (!pid) {
    console.warn('[PublicRooms] Missing playerId for inspector');
    return;
  }

  const shell = ensureInspectorShell();
  const avatarEl = shell.querySelector('#pr-inspector-avatar') as HTMLElement | null;
  const nameEl = shell.querySelector('#pr-inspector-name') as HTMLElement | null;
  const subEl = shell.querySelector('#pr-inspector-sub') as HTMLElement | null;

  if (avatarEl) {
    avatarEl.style.backgroundImage = 'none';
    avatarEl.textContent = avatarInitials(playerName ?? pid);
    avatarEl.classList.remove('has-img');
  }
  if (nameEl) nameEl.textContent = playerName || pid;
  if (subEl) subEl.textContent = 'Inspector (direct)';

  inspectorState.targetPlayerId = pid;
  inspectorState.targetPlayerName = playerName || pid;
  inspectorState.targetRoomId = 'debug';

  setAllPanes('Loading player view...');
  shell.classList.remove('hidden');
  refreshInspectorData(false).catch(err => {
    console.error('[PublicRooms] Inspector direct refresh failed', err);
    setAllPanes('Unable to load player view.');
  });
}

function showToast(message: string, level: 'info' | 'success' | 'error' = 'info'): void {
  console.log(`[PublicRooms:${level}]`, message);
}

function previewData(data: any): string {
  try {
    const str = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    return str.length > 320 ? `${str.slice(0, 320)}…` : str;
  } catch {
    return 'Data available';
  }
}

function formatLargeNumber(value: any, decimals: number = 1): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '—';
  
  const abs = Math.abs(n);
  if (abs >= 1e15) return `${(n / 1e15).toFixed(decimals)}Q`;
  if (abs >= 1e12) return `${(n / 1e12).toFixed(decimals)}T`;
  if (abs >= 1e9) return `${(n / 1e9).toFixed(decimals)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(decimals)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(decimals)}K`;
  return n.toLocaleString();
}

function formatCoins(value: any): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '—';
  return formatLargeNumber(n, 1);
}

function safeArray(value: any): any[] {
  return Array.isArray(value) ? value : [];
}

function renderAvatarBlock(view: PlayerView, name: string): string {
  const avatar = view.avatarUrl
    ? `<div class="pr-avatar-block-img" style="background-image:url(${view.avatarUrl})"></div>`
    : `<div class="pr-avatar-block-fallback">${avatarInitials(name)}</div>`;
  return `<div class="pr-avatar-block">${avatar}<div><div class="pr-avatar-name">${name}</div><div class="pr-avatar-id">${view.playerId}</div></div></div>`;
}

function normalizeMillis(value: any): number | null {
  if (value == null) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  // Convert seconds to ms if it looks like seconds
  return num < 1e11 ? num * 1000 : num;
}

function formatDuration(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return 'done';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${Math.max(totalSeconds, 0)}s`;
}

function renderProgressBar(percent: number, label: string): string {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  return `
    <div class="pr-progress">
      <div class="pr-progress-track">
        <div class="pr-progress-fill" style="width:${pct}%;"></div>
      </div>
      <div class="pr-progress-label">${label}</div>
    </div>
  `;
}

function friendlyName(raw: any): string {
  if (!raw) return 'Unknown';
  const str = String(raw).replace(/[_-]+/g, ' ');
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

function spriteCircle(url: string | null | undefined, fallback: string): string {
  // Properly quote data URLs in CSS
  const style = url ? `background-image:url('${url}');` : '';
  return `<div class="pr-sprite-circle" style="${style}">${url ? '' : fallback}</div>`;
}

type SpriteFilterConfig = {
  blendMode: GlobalCompositeOperation;
  colors: string[];
  alpha?: number;
  gradientAngle?: number;
  masked?: boolean;
};

const itemIconMap: Record<string, string> = {
  shovel: '⛏️',
  wateringcan: '💧',
  watering: '💧',
  fertilizer: '🧪',
  hoe: '⚒️',
  bucket: '🪣',
  seed: '🌱',
};

const ITEM_SHEET = 'items';
const itemTileMap: Record<string, number> = {
  shovel: 1,
  'watering can': 8,
  wateringcan: 8,
  'planter pot': 5,
  planterpot: 5,
  'wet potion': 15,
  wetpotion: 15,
  'frozen potion': 17,
  frozenpotion: 17,
  'chilled potion': 16,
  chilledpotion: 16,
  'dawnlit potion': 18,
  dawnlitpotion: 18,
  'amberlit potion': 19,
  amberlitpotion: 19,
  'ambercharged potion': 19,
  'amberbound potion': 19,
  'dawncharged potion': 18,
  'dawnbound potion': 18,
  'gold potion': 14,
  goldpotion: 14,
  'rainbow potion': 13,
  rainbowpotion: 13,
};

function getItemSpriteUrl(name: string): string | null {
  const key = name.toLowerCase();
  const tileIndex = itemTileMap[key] ?? itemTileMap[key.replace(/\s+/g, '')];
  if (typeof tileIndex === 'number') {
    const tile = spriteExtractor.getTile(ITEM_SHEET, tileIndex);
    const url = canvasToDataUrlSafe(tile);
    if (url) return url;
  }
  const cached = spriteUrlCache.get(`item:${normalizeSpriteLookupKey(name)}`);
  if (cached) return cached;
  const url = renderSpriteByName(name, ['item', 'decor']);
  if (url) spriteUrlCache.set(`item:${normalizeSpriteLookupKey(name)}`, url);
  return url;
}

function getEggSpriteUrl(eggId: string): string | null {
  // Eggs are in pets.png sheet (same as Aries mod)
  // Try multiple variations of egg ID
  const variants = [
    eggId,
    eggId.toLowerCase(),
    eggId.charAt(0).toUpperCase() + eggId.slice(1).toLowerCase(),
    eggId.replace(/egg$/i, '') + 'Egg',
  ];
  
  for (const variant of variants) {
    const canvas = getPetSpriteCanvas(variant);
    if (canvas) return canvasToDataUrlSafe(canvas);
  }
  return renderSpriteByName(eggId, ['pet', 'item']);
}

const mutationFilters: Record<string, SpriteFilterConfig> = {
  gold: { blendMode: 'source-atop', colors: ['rgb(255, 215, 0)'], alpha: 0.7 },
  rainbow: { blendMode: 'color', colors: ['#FF1744', '#FF9100', '#FFEA00', '#00E676', '#2979FF', '#D500F9'], gradientAngle: 130, masked: true },
  wet: { blendMode: 'source-atop', colors: ['rgb(128, 128, 255)'], alpha: 0.2 },
  chilled: { blendMode: 'source-atop', colors: ['rgb(183, 183, 236)'], alpha: 0.5 },
  frozen: { blendMode: 'source-atop', colors: ['rgb(128, 128, 255)'], alpha: 0.6 },
  dawnlit: { blendMode: 'source-atop', colors: ['rgb(120, 100, 180)'], alpha: 0.4 },
  ambershine: { blendMode: 'source-atop', colors: ['rgb(255, 140, 26)', 'rgb(230, 92, 26)', 'rgb(178, 58, 26)'], alpha: 0.5 },
  dawncharged: { blendMode: 'source-atop', colors: ['rgb(100, 80, 160)', 'rgb(110, 90, 170)', 'rgb(120, 100, 180)'], alpha: 0.5 },
  ambercharged: { blendMode: 'source-atop', colors: ['rgb(167, 50, 30)', 'rgb(177, 60, 40)', 'rgb(187, 70, 50)'], alpha: 0.5 },
};

function canvasToDataUrlSafe(canvas: HTMLCanvasElement | null): string | null {
  if (!canvas) return null;
  try {
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

function renderSpriteByName(name: string, preferred: SpriteCategory[] = ['item', 'decor', 'seed', 'crop', 'plant', 'tallplant', 'pet']): string | null {
  if (!name || !spriteService) return null;
  const norm = normalizeSpriteLookupKey(name);
  const cached = spriteUrlCache.get(`${preferred.join(',')}:${norm}`);
  if (cached) return cached;
  const matches = spriteNameLookup.get(norm);
  if (!matches || !matches.length) return null;

  const pick = preferred
    .map((cat) => matches.find((m) => m.category === cat))
    .find((m) => !!m) || matches[0];

  if (!pick) return null;
  try {
    const canvas = spriteService.renderToCanvas({ category: pick.category as any, id: pick.id, mutations: [] });
    const url = canvasToDataUrlSafe(canvas);
    if (url) spriteUrlCache.set(`${preferred.join(',')}:${norm}`, url);
    return url;
  } catch {
    return null;
  }
}

function overlayMutationSprites(base: HTMLCanvasElement, mutations: string[]): HTMLCanvasElement | null {
  if (!mutations.length) return base;
  const w = base.width;
  const h = base.height;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d');
  if (!ctx) return base;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(base, 0, 0);

  for (const mutRaw of mutations) {
    const mut = String(mutRaw || '').toLowerCase();
    const overlayUrl = getMutationOverlayDataUrl(mut);
    if (overlayUrl) {
      const img = new Image();
      img.src = overlayUrl;
      // Synchronous draw may fail if not yet loaded; fallback to filters
      if (img.complete) {
        ctx.drawImage(img, 0, 0, w, h);
      } else {
        img.onload = () => ctx.drawImage(img, 0, 0, w, h);
      }
    }
  }
  return out;
}

function drawGradient(ctx: CanvasRenderingContext2D, w: number, h: number, cfg: SpriteFilterConfig): void {
  const angle = (cfg.gradientAngle ?? 90) * Math.PI / 180;
  const half = Math.sqrt(w * w + h * h) / 2;
  const cx = w / 2;
  const cy = h / 2;
  const x0 = cx - Math.cos(angle) * half;
  const y0 = cy - Math.sin(angle) * half;
  const x1 = cx + Math.cos(angle) * half;
  const y1 = cy + Math.sin(angle) * half;
  const grad = ctx.createLinearGradient(x0, y0, x1, y1);
  const colors = cfg.colors && cfg.colors.length > 0 ? cfg.colors : ['rgba(255,255,255,0.7)'];
  colors.forEach((c, idx) => grad.addColorStop(colors.length === 1 ? 0 : idx / (colors.length - 1), c));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

function applyCanvasFilter(base: HTMLCanvasElement, filterName: string): HTMLCanvasElement | null {
  const cfg = mutationFilters[filterName.toLowerCase()];
  if (!cfg) return null;
  const w = base.width;
  const h = base.height;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(base, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = cfg.blendMode;
  if (cfg.alpha != null) ctx.globalAlpha = cfg.alpha;
  if (cfg.masked) {
    const mask = document.createElement('canvas');
    mask.width = w;
    mask.height = h;
    const mctx = mask.getContext('2d');
    if (mctx) {
      drawGradient(mctx, w, h, cfg);
      mctx.globalCompositeOperation = 'destination-in';
      mctx.drawImage(base, 0, 0);
      mctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(mask, 0, 0);
    }
  } else {
    drawGradient(ctx, w, h, cfg);
  }
  ctx.restore();
  return out;
}

function normalizeSpeciesName(species: string): string {
  const lower = String(species).toLowerCase();
  // Celestial crops: API returns "MoonCelestial", "DawnCelestial" but tileRefs has "MoonCelestialCrop", "DawnCelestialCrop"
  if (lower === 'mooncelestial') return 'mooncelestialcrop';
  if (lower === 'dawncelestial') return 'dawncelestialcrop';
  // Tulip variants: API may return "OrangeTulip", "WhiteTulip" etc but base is just "Tulip"
  if (lower.includes('tulip')) return 'tulip';
  return lower;
}

function normalizePetSpecies(species: string): string {
  // Normalize pet species to match petTileRefs (lowercase, no spaces/special chars)
  const lower = String(species).trim().toLowerCase();
  // Remove "egg" suffix for egg types to get base rarity
  const withoutEgg = lower.replace(/egg$/i, '').trim();
  // Return normalized key
  return withoutEgg || lower;
}

// Ability color info (from Pet Hub)
const ABILITY_COLOR_MAP = {
  plantGrowth: { base: '#2E7D32', glow: 'rgba(46,125,50,0.65)', text: '#C8E6C9' },
  eggGrowth: { base: '#FF7043', glow: 'rgba(255,112,67,0.65)', text: '#FFE0B2' },
  xp: { base: '#7C4DFF', glow: 'rgba(124,77,255,0.65)', text: '#EDE7F6' },
  coins: { base: '#FFB300', glow: 'rgba(255,179,0,0.65)', text: '#FFF8E1' },
  misc: { base: '#90A4AE', glow: 'rgba(144,164,174,0.6)', text: '#ECEFF1' },
  hunger: { base: '#26C6DA', glow: 'rgba(38,198,218,0.65)', text: '#E0F7FA' },
  mutation: { base: '#EC407A', glow: 'rgba(236,64,122,0.6)', text: '#FCE4EC' },
  rainbow: { base: '#7C4DFF', glow: 'rgba(124,77,255,0.7)', text: '#F3E5F5' },
  gold: { base: '#FDD835', glow: 'rgba(253,216,53,0.75)', text: '#FFFDE7' },
  default: { base: '#5E5CE6', glow: 'rgba(94,92,230,0.5)', text: '#E0E7FF' },
};

function getAbilityColor(abilityName: string): { base: string; glow: string; text: string } {
  const name = (abilityName || '').toLowerCase().replace(/\s+/g, '');
  
  // Rainbow and Gold special abilities - check exact matches first
  if (name.includes('rainbowgranter') || name.includes('rainbow')) return { base: 'linear-gradient(135deg, #FF0000 0%, #FF7F00 16.67%, #FFFF00 33.33%, #00FF00 50%, #0000FF 66.67%, #4B0082 83.33%, #9400D3 100%)', glow: 'rgba(124,77,255,0.7)', text: '#FFF' };
  if (name.includes('goldgranter') || name.includes('golden') || name === 'gold') return { base: 'linear-gradient(135deg, #FFD700 0%, #FFA500 50%, #FFD700 100%)', glow: 'rgba(255,215,0,0.75)', text: '#000' };
  
  // Coin abilities - Yellow/Gold (CoinFinderI, CoinFinderII, CoinFinderIII)
  if (name.includes('coinfinder')) return { base: '#FFD700', glow: 'rgba(255,215,0,0.65)', text: '#000' };
  
  // Produce/Crop abilities - Orange/Red tones
  if (name.includes('produceeater') || name.includes('cropeater')) return { base: '#FF5722', glow: 'rgba(255,87,34,0.6)', text: '#FFF' };
  if (name.includes('producerefund') || name.includes('croprefund')) return { base: '#FF5722', glow: 'rgba(255,87,34,0.6)', text: '#FFF' };
  if (name.includes('producescaleboost') || name.includes('cropsize')) return { base: '#4CAF50', glow: 'rgba(76,175,80,0.6)', text: '#FFF' };
  if (name.includes('producemutation') || name.includes('cropmutation')) return { base: '#E91E63', glow: 'rgba(233,30,99,0.6)', text: '#FFF' };
  
  // Seed abilities - Orange (SeedFinderI, SeedFinderII, SeedFinderIII)
  if (name.includes('seedfinder')) return { base: '#FF9800', glow: 'rgba(255,152,0,0.6)', text: '#FFF' };
  
  // Egg abilities - Purple/Magenta (EggGrowthBoostI, EggGrowthBoostII, EggGrowthBoostIII)
  if (name.includes('egggrowth')) return { base: '#9C27B0', glow: 'rgba(156,39,176,0.6)', text: '#FFF' };
  
  // Pet abilities
  if (name.includes('petrefund')) return { base: '#00BCD4', glow: 'rgba(0,188,212,0.6)', text: '#FFF' };
  if (name.includes('petmutation')) return { base: '#E91E63', glow: 'rgba(233,30,99,0.6)', text: '#FFF' };
  if (name.includes('petageboost') || name.includes('maxstrength') || name.includes('strengthboost')) return { base: '#673AB7', glow: 'rgba(103,58,183,0.6)', text: '#FFF' };
  if (name.includes('pethatchsizeboost') || name.includes('hatchxp')) return { base: '#7C4DFF', glow: 'rgba(124,77,255,0.65)', text: '#FFF' };
  
  // Sell abilities - Red (SellBoostI, SellBoostII, SellBoostIII)
  if (name.includes('sellboost')) return { base: '#F44336', glow: 'rgba(244,67,54,0.6)', text: '#FFF' };
  
  // Hunger abilities - Pink (HungerRestore, HungerRestoreII)
  if (name.includes('hunger')) return { base: '#EC407A', glow: 'rgba(236,64,122,0.6)', text: '#FFF' };
  
  // XP abilities - Blue (XPBoostI, XPBoostII, XPBoostIII)
  if (name.includes('xpboost')) return { base: '#2196F3', glow: 'rgba(33,150,243,0.6)', text: '#FFF' };
  
  // Plant/Produce Growth abilities - Teal/Cyan (PlantGrowthBoostI, PlantGrowthBoostII, PlantGrowthBoostIII)
  if (name.includes('plantgrowth') || name.includes('producegrowth')) return { base: '#26A69A', glow: 'rgba(38,166,154,0.6)', text: '#FFF' };
  
  // Weather/Special abilities - Blue (RainDance, DoubleHatch, DoubleHarvest)
  if (name.includes('raindance')) return { base: '#2196F3', glow: 'rgba(33,150,243,0.6)', text: '#FFF' };
  if (name.includes('doublehatch')) return { base: '#5C6BC0', glow: 'rgba(92,107,192,0.6)', text: '#FFF' };
  if (name.includes('doubleharvest')) return { base: '#1976D2', glow: 'rgba(25,118,210,0.6)', text: '#FFF' };
  
  // Default
  return { base: '#90A4AE', glow: 'rgba(144,164,174,0.6)', text: '#FFF' };
}

function renderAbilitySquares(abilities: string[]): string {
  if (!abilities || abilities.length === 0) return '';
  const displayed = abilities.slice(0, 4);
  return displayed.map(ability => {
    const colors = getAbilityColor(ability);
    return `<div class="pr-ability-square" title="${ability}" style="background:${colors.base};border:1px solid rgba(255,255,255,0.3);box-shadow:0 0 6px ${colors.glow};"></div>`;
  }).join('');
}

function getMutatedCropSpriteUrl(species: string | null | undefined, mutations: any[], tileId?: string | number | null): string | null {
  if (!species) return null;
  // tileId from API is garden position, not sprite index - use species name only
  const normalized = normalizeSpeciesName(species);
  const ordered = mutations.map((m) => String(m || '').toLowerCase()).filter(Boolean).slice(0, 4);
  const rendered = ordered.length ? getCropSpriteWithMutations(normalized, ordered) : getCropSpriteCanvas(normalized);
  const cacheKey = `crop:${normalized}:${ordered.join(',')}`;
  if (rendered) {
    const url = canvasToDataUrlSafe(rendered);
    if (url) {
      spriteUrlCache.set(cacheKey, url);
      return url;
    }
  }
  const cached = spriteUrlCache.get(cacheKey);
  if (cached) return cached;
  const url = renderSpriteByName(normalized, ['crop', 'plant', 'tallplant', 'seed']) || (tileId ? renderSpriteByName(String(tileId)) : null);
  if (url) spriteUrlCache.set(cacheKey, url);
  return url;
}

function getSeedSpriteUrl(seedName: string): string | null {
  let normalized = String(seedName).toLowerCase();
  // Tulip variants: API may return "OrangeTulip", "WhiteTulip" etc but seed is just "Tulip"
  if (normalized.includes('tulip')) normalized = 'tulip';
  const cacheKey = `seed:${normalized}`;
  const cached = spriteUrlCache.get(cacheKey);
  if (cached) return cached;
  const canvas = getCropSpriteCanvas(normalized);
  if (canvas) {
    const url = canvasToDataUrlSafe(canvas);
    if (url) {
      spriteUrlCache.set(cacheKey, url);
      return url;
    }
  }
  const url = renderSpriteByName(normalized, ['seed', 'crop', 'plant', 'tallplant']);
  if (url) spriteUrlCache.set(cacheKey, url);
  return url;
}

function renderMutationBadges(mutations: any[]): string {
  if (!mutations || mutations.length === 0) return '';
  const badges = mutations.slice(0, 4).map(mut => {
    const variant = findVariantBadge(String(mut));
    if (!variant) return '';
    const colorStyle = variant.gradient 
      ? `background: ${variant.gradient}; -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;`
      : `color: ${variant.color || '#aaa'};`;
    const weight = variant.bold ? 'font-weight: 700;' : '';
    return `<span class="pr-mut-badge" style="${colorStyle} ${weight}">${variant.label}</span>`;
  }).filter(Boolean).join('');
  return badges ? `<div class="pr-mut-badges">${badges}</div>` : '';
}

function renderOverviewPane(view: PlayerView, isFriend: boolean, privacy: PlayerView['privacy']): void {
  const allowProfile = isFriend || !!privacy?.showProfile;
  const allowCoins = isFriend || !!privacy?.showCoins;
  const name = allowProfile ? (view.playerName || inspectorState.targetPlayerName || 'Unknown player') : 'Hidden by privacy';
  const roomLabel = (view.room && (view.room.id || (view.room as any).roomId)) || '';
  const lastEvent = view.lastEventAt ? formatUpdatedAgo(view.lastEventAt) : 'n/a';
  const coins = allowCoins ? formatCoins(view.coins) : '—';

  setPaneContent('pr-overview-content', `
    <div class="pr-overview">
      ${renderAvatarBlock(view, name)}
      <div class="pr-overview-grid">
        <div class="pr-row"><span>Status</span><span>${view.isOnline ? '🟢 Online' : '⚪ Offline'}</span></div>
        <div class="pr-row"><span>Last event</span><span>${lastEvent}</span></div>
        <div class="pr-row"><span>Coins</span><span>${coins}</span></div>
      </div>
    </div>
  `);
}

function renderGardenPane(view: PlayerView, isFriend: boolean, privacy: PlayerView['privacy']): void {
  const allowGarden = true;
  const allowStats = true;

  const garden = allowGarden ? ((view as any).garden || (view as any).state?.garden) : null;
  const stats = allowStats ? ((view as any).stats || (view as any).state?.stats) : null;

  // Build 2x 10x10 garden grids using Aries mod tile pattern
  // Pattern: 115 tiles total, arranged as 2 separate 10x10 plots with boardwalk
  type GridTile = { tileId: number; species: string | null; mutations: any[]; isMultiHarvest: boolean; slots: any[]; exists: boolean; objectType?: string; eggId?: string; maturedAt?: number; plantedAt?: number };
  const leftPlot: GridTile[][] = [];
  const rightPlot: GridTile[][] = [];
  
  // Initialize 10x10 grids
  for (let row = 0; row < 10; row++) {
    leftPlot[row] = [];
    rightPlot[row] = [];
    for (let col = 0; col < 10; col++) {
      leftPlot[row]![col] = { tileId: -1, species: null, mutations: [], isMultiHarvest: false, slots: [], exists: false };
      rightPlot[row]![col] = { tileId: -1, species: null, mutations: [], isMultiHarvest: false, slots: [], exists: false };
    }
  }

  const tileObjects = garden?.tileObjects && typeof garden.tileObjects === 'object' ? garden.tileObjects : null;
  if (tileObjects) {
    // Aries pattern: tiles arranged in visual rows with gaps for boardwalk
    // Based on console analysis: 115 tiles forming 2 plots
    Object.entries(tileObjects).forEach(([tileIdStr, payload]) => {
      const tileId = parseInt(tileIdStr, 10);
      const tilePayload = payload as any;
      const objectType = tilePayload?.objectType;
      
      // Check if it's an egg
      if (objectType === 'egg') {
        const tile: GridTile = {
          tileId,
          species: null,
          mutations: [],
          isMultiHarvest: false,
          slots: [],
          exists: true,
          objectType: 'egg',
          eggId: tilePayload.eggId,
          maturedAt: tilePayload.maturedAt,
          plantedAt: tilePayload.plantedAt,
        };
        
        const row = Math.floor(tileId / 20);
        const col = tileId % 20;
        
        if (row >= 0 && row < 10) {
          if (col >= 0 && col < 10 && leftPlot[row]) {
            leftPlot[row]![col] = tile;
          } else if (col >= 10 && col < 20 && rightPlot[row]) {
            rightPlot[row]![col - 10] = tile;
          }
        }
        return;
      }
      
      const slotArr = safeArray(tilePayload?.slots);
      const primarySlot = slotArr[0];
      const species = primarySlot?.species ?? primarySlot?.plant ?? null;
      const tile: GridTile = {
        tileId,
        species,
        mutations: safeArray(primarySlot?.mutations),
        isMultiHarvest: slotArr.length > 1,
        slots: slotArr,
        exists: true,
      };
      
      // Map tile ID to visual grid position
      // Garden has 2 separate 10×10 dirt tile plots (left and right)
      // Boardwalk tiles are stored separately in garden.boardwalkTileObjects
      // 
      // VERIFIED tile mapping via QPM_CURRENT_TILE():
      // - Each row is 20 tiles wide (0-19, 20-39, 40-59, ...)
      // - Left plot occupies columns 0-9 of each row
      // - Right plot occupies columns 10-19 of each row
      // - 10 rows total (0-180 for left, 10-190 for right)
      const TILES_PER_ROW = 20;  // Total width including both plots
      
      const row = Math.floor(tileId / TILES_PER_ROW);
      const col = tileId % TILES_PER_ROW;
      
      if (row >= 0 && row < 10) {
        if (col >= 0 && col < 10 && leftPlot[row]) {
          // Left plot (columns 0-9)
          leftPlot[row]![col] = tile;
        } else if (col >= 10 && col < 20 && rightPlot[row]) {
          // Right plot (columns 10-19, mapped to grid columns 0-9)
          rightPlot[row]![col - 10] = tile;
        }
      }
      // Note: Tiles outside these ranges are likely boardwalk or other structures
    });
  }

  // Render garden grids - helper function
  const renderPlot = (plot: GridTile[][], plotName: string): string => {
    return plot.map(row => row.map(tile => {
      if (!tile.exists) {
        return `<div class="pr-garden-tile pr-garden-tile-empty" title="Empty"></div>`;
      }
      
      // Check if it's an egg
      const isEgg = tile.objectType === 'egg';
      if (isEgg && tile.eggId) {
        const eggSprite = getEggSpriteUrl(tile.eggId);
        const eggName = friendlyName(tile.eggId);
        const maturedAt = tile.maturedAt ? new Date(tile.maturedAt).toLocaleString() : 'Unknown';
        const plantedAt = tile.plantedAt ? new Date(tile.plantedAt).toLocaleString() : 'Unknown';
        const timeLeft = tile.maturedAt ? formatDuration(Math.max(0, tile.maturedAt - Date.now())) : 'N/A';
        const tooltipText = `Tile ${tile.tileId}: ${eggName}\nPlanted: ${plantedAt}\nMatured: ${maturedAt}\nTime left: ${timeLeft}`;
        return `
          <div class="pr-garden-tile pr-garden-tile-egg" title="${tooltipText.replace(/\n/g, '&#10;')}">
            ${eggSprite ? `<img src="${eggSprite}" alt="${eggName}" class="pr-garden-sprite" />` : '<div class="pr-garden-placeholder">🥚</div>'}
          </div>
        `;
      }
      
      if (!tile.species) {
        return `<div class="pr-garden-tile pr-garden-tile-empty" title="Tile ${tile.tileId}: Empty"></div>`;
      }
      
      const sprite = getMutatedCropSpriteUrl(String(tile.species).toLowerCase(), tile.mutations);
      const mutNames = tile.mutations.length > 0 ? tile.mutations.map(m => friendlyName(String(m))).join(', ') : 'None';
      const multiIcon = tile.isMultiHarvest ? `<span class="pr-multi-icon" title="Multi-harvest: ${tile.slots.length} slots">×${tile.slots.length}</span>` : '';
      const primarySlot = tile.slots[0] || {};
      const startTime = primarySlot.startTime ? new Date(primarySlot.startTime).toLocaleString() : 'Unknown';
      const endTime = primarySlot.endTime ? new Date(primarySlot.endTime).toLocaleString() : 'Unknown';
      const timeLeft = primarySlot.endTime ? formatDuration(Math.max(0, primarySlot.endTime - Date.now())) : 'N/A';
      const tooltipText = `Tile ${tile.tileId}: ${friendlyName(tile.species)}\nMutations: ${mutNames}\n${tile.isMultiHarvest ? `Multi-harvest (${tile.slots.length} slots)\n` : ''}Started: ${startTime}\nReady: ${endTime}\nTime left: ${timeLeft}`;
      return `
        <div class="pr-garden-tile" title="${tooltipText.replace(/\n/g, '&#10;')}">
          ${sprite ? `<img src="${sprite}" alt="${tile.species}" class="pr-garden-sprite" />` : '<div class="pr-garden-placeholder">🌱</div>'}
          ${multiIcon}
        </div>
      `;
    }).join('')).join('');
  };
  
  const leftHtml = renderPlot(leftPlot, 'Left');
  const rightHtml = renderPlot(rightPlot, 'Right');
  
  const gardenHtml = `
    <div class="pr-garden-plots">
      <div class="pr-garden-plot">
        <div class="pr-garden-plot-label">Left Plot</div>
        <div class="pr-garden-grid pr-garden-grid-10x10">${leftHtml}</div>
      </div>
      <div class="pr-garden-plot">
        <div class="pr-garden-plot-label">Right Plot</div>
        <div class="pr-garden-grid pr-garden-grid-10x10">${rightHtml}</div>
      </div>
    </div>
  `;

  const playerStats = stats?.player || stats?.Player || stats;
  const statsKeys = playerStats ? Object.keys(playerStats) : [];
  const statsRows = playerStats ? statsKeys.slice(0, 24).map(key => {
    // Normalize stat labels - remove prefixes and format
    let label = key;
    
    // Remove common prefixes
    label = label.replace(/^num/i, '').replace(/^total/i, '').replace(/^seconds/i, 'Seconds');
    
    // Add spaces before capital letters
    label = label.replace(/([A-Z])/g, ' $1').trim();
    
    // Add colon
    label = label + ':';
    
    const valRaw = playerStats[key];
    const val = typeof valRaw === 'object' ? JSON.stringify(valRaw) : (typeof valRaw === 'number' ? formatLargeNumber(valRaw, 1) : valRaw);
    
    return `<div class="pr-stat-row"><span class="pr-stat-label">${label}</span><span class="pr-stat-value">${val ?? '—'}</span></div>`;
  }).join('') : '';

  const countTiles = (plot: GridTile[][]) => {
    let active = 0;
    let total = 0;
    plot.forEach(row => row.forEach(tile => {
      if (tile.exists) {
        total++;
        if (tile.species) active++;
      }
    }));
    return { active, total };
  };
  const leftStats = countTiles(leftPlot);
  const rightStats = countTiles(rightPlot);
  const activePlots = leftStats.active + rightStats.active;
  const totalTiles = leftStats.total + rightStats.total;

  // Render journal progress with correct totals
  const journal = (view as any).state?.journal;
  let journalHtml = '';
  if (journal) {
    const petsJournal = journal.pets || {};
    const produceJournal = journal.produce || {};

    // Count unique species (pets) and variants (produce)
    let petsDiscovered = 0;
    Object.keys(petsJournal).forEach(species => {
      const entry = petsJournal[species];
      if (entry && (entry.variantsLogged?.length > 0 || entry.abilitiesLogged?.length > 0)) {
        petsDiscovered++;
      }
    });

    // Count produce variants across all species
    let produceVariantsDiscovered = 0;
    Object.keys(produceJournal).forEach(species => {
      const entry = produceJournal[species];
      if (entry && entry.variantsLogged?.length > 0) {
        produceVariantsDiscovered += entry.variantsLogged.length;
      }
    });

    const totalPets = 60; // Correct total from game
    const totalProduceVariants = 385; // Correct total from game (11 variants per crop × 35 crops)
    const petsPct = Math.min(100, (petsDiscovered / totalPets) * 100);
    const producePct = Math.min(100, (produceVariantsDiscovered / totalProduceVariants) * 100);

    // Check if journal is expanded (default to collapsed)
    const isJournalExpanded = storage.get<boolean>('player-inspector:journal-expanded', false);
    const activeJournalTab = storage.get<string>('player-inspector:journal-tab', 'crops');

    // Generate per-crop progress rows with sprites
    const cropRows = Object.entries(produceJournal)
      .filter(([_, entry]) => entry && (entry as any).variantsLogged?.length > 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([species, entry]) => {
        const variantsLogged = (entry as any).variantsLogged?.length || 0;
        const totalVariants = 11; // Each crop has 11 variants
        const pct = Math.min(100, (variantsLogged / totalVariants) * 100);
        const isComplete = variantsLogged === 11;
        
        // Get crop sprite - use rainbow variant if 11/11 complete
        const mutations = isComplete ? ['Rainbow'] : [];
        const cropSprite = getMutatedCropSpriteUrl(String(species).toLowerCase(), mutations);
        const spriteHtml = cropSprite 
          ? `<img src="${cropSprite}" alt="${species}" style="width:28px;height:28px;image-rendering:pixelated;border-radius:4px;border:1px solid rgba(168,139,250,0.3);margin-right:10px;" />`
          : '';
        
        // Rainbow styling for completed crops - use different gradient for name vs progress bar
        const rainbowNameText = isComplete ? 'background: linear-gradient(90deg, #e11d48, #f97316, #eab308, #22c55e, #3b82f6, #a855f7); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; font-weight: 700;' : '';
        const rainbowVariantText = isComplete ? 'background: linear-gradient(90deg, #dc2626, #ea580c, #facc15, #16a34a, #2563eb, #9333ea); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; font-weight: 700;' : '';
        
        return `
          <div class="pr-journal-detail-row">
            ${spriteHtml}
            <span class="pr-journal-species" style="${rainbowNameText}">${friendlyName(species)}</span>
            <span class="pr-journal-variants" style="${rainbowVariantText}">${variantsLogged}/11</span>
            <div class="pr-progress-bar-mini">
              <div class="pr-progress-fill-mini" style="width:${pct}%;background:${pct === 100 ? 'linear-gradient(90deg, #f43f5e, #fb923c, #fde047, #4ade80, #60a5fa, #c084fc)' : 'linear-gradient(90deg, #4CAF50, #2E7D32)'}"></div>
            </div>
          </div>
        `;
      }).join('') || '<div class="pr-pane-placeholder">No crops logged yet</div>';

    // Generate per-pet progress rows
    const petRows = Object.entries(petsJournal)
      .filter(([_, entry]) => entry && ((entry as any).variantsLogged?.length > 0 || (entry as any).abilitiesLogged?.length > 0))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([species, entry]) => {
        const abilitiesLogged = (entry as any).abilitiesLogged?.length || 0;
        const variantsLogged = (entry as any).variantsLogged?.length || 0;
        const totalAbilities = 3; // Most pets have up to 3 abilities
        const totalVariants = 3; // Base, Gold, Rainbow
        const abilityPct = Math.min(100, (abilitiesLogged / totalAbilities) * 100);
        const variantPct = Math.min(100, (variantsLogged / totalVariants) * 100);
        return `
          <div class="pr-journal-detail-row">
            <span class="pr-journal-species">${friendlyName(species)}</span>
            <span class="pr-journal-variants">${abilitiesLogged}/${totalAbilities} abilities, ${variantsLogged}/${totalVariants} variants</span>
            <div class="pr-progress-bar-mini">
              <div class="pr-progress-fill-mini" style="width:${abilityPct}%;background:${abilityPct === 100 ? 'linear-gradient(90deg, #a78bfa, #7c3aed)' : 'linear-gradient(90deg, #FF7043, #FF5722)'}"></div>
            </div>
          </div>
        `;
      }).join('') || '<div class="pr-pane-placeholder">No pets logged yet</div>';

    journalHtml = `
      <div class="pr-section pr-section-animated" data-expandable-section="journal">
        <div class="pr-section-head" style="cursor: pointer; user-select: none; display: flex; align-items: center; justify-content: space-between;" onclick="
          const section = this.closest('[data-expandable-section]');
          const content = section.querySelector('.pr-journal-container');
          const arrow = this.querySelector('.pr-expand-arrow');
          const isExpanded = content.style.display !== 'none';
          content.style.display = isExpanded ? 'none' : 'block';
          arrow.textContent = isExpanded ? '▶' : '▼';
          window.QPM?.storage?.set('player-inspector:journal-expanded', !isExpanded);
        ">
          <span>📖 Journal Progress</span>
          <span class="pr-expand-arrow" style="font-size: 12px; transition: transform 0.2s;">${isJournalExpanded ? '▼' : '▶'}</span>
        </div>
        <div class="pr-journal-container" style="display: ${isJournalExpanded ? 'block' : 'none'};">
          <!-- Original Progress Bars -->
          <div class="pr-journal-progress">
            <div class="pr-journal-item">
              <div class="pr-journal-header">
                <span>🐾 Pets Discovered</span>
                <span class="pr-journal-count">${petsDiscovered} / ${totalPets}</span>
              </div>
              <div class="pr-progress-bar">
                <div class="pr-progress-fill pr-progress-animated" style="width:${petsPct}%;background:${petsPct === 100 ? 'linear-gradient(90deg, #FF1744, #FF9100, #FFEA00, #00E676, #2979FF, #D500F9)' : 'linear-gradient(90deg, #FF7043, #FF5722)'};${petsPct === 100 ? 'animation: qpm-rainbow-progress 3s linear infinite; background-size: 200% 100%;' : ''}"></div>
              </div>
              <div class="pr-progress-pct">${petsPct.toFixed(1)}%</div>
            </div>
            <div class="pr-journal-item">
              <div class="pr-journal-header">
                <span>🌿 Crop Variants Discovered</span>
                <span class="pr-journal-count">${produceVariantsDiscovered} / ${totalProduceVariants}</span>
              </div>
              <div class="pr-progress-bar">
                <div class="pr-progress-fill pr-progress-animated" style="width:${producePct}%;background:${producePct === 100 ? 'linear-gradient(90deg, #FF1744, #FF9100, #FFEA00, #00E676, #2979FF, #D500F9)' : 'linear-gradient(90deg, #2E7D32, #4CAF50)'};${producePct === 100 ? 'animation: qpm-rainbow-progress 3s linear infinite; background-size: 200% 100%;' : ''}"></div>
              </div>
              <div class="pr-progress-pct">${producePct.toFixed(1)}%</div>
            </div>
          </div>

          <!-- Detailed Journal Stats - Crops Only -->
          <div class="pr-journal-details" style="margin-top: 16px;">
            <div class="pr-journal-tab-content" style="display: block;">
              ${cropRows}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  setPaneContent('pr-pets-content', `
    <div class="pr-section">
      <div class="pr-section-head">Virtual Garden (${activePlots} planted / ${totalTiles} tiles)</div>
      <div class="pr-garden-grid">${gardenHtml || '<div class="pr-pane-placeholder">No garden data.</div>'}</div>
    </div>
    ${journalHtml}
    ${allowStats ? `<div class="pr-section">
      <div class="pr-section-head">📊 Player Stats</div>
      ${playerStats ? `<div class="pr-stats-grid">${statsRows}</div>` : '<div class="pr-pane-placeholder">No stats shared.</div>'}
    </div>` : ''}
  `);


}

async function renderInventoryPane(view: PlayerView, isFriend: boolean, privacy: PlayerView['privacy']): Promise<void> {
  await spriteReadyPromise;

  const inventory = view.state?.inventory as any;
  const collected: Array<{ label: string; qty: number; sprite?: string | null; icon?: string | null; petLevel?: number | null; petMaxLevel?: number; isPet?: boolean; abilities?: string[]; xp?: number; targetScale?: number }> = [];

  const pushItem = (item: any, fallbackKey?: string): void => {
    if (!item) return;
    if (fallbackKey && (fallbackKey === 'FavoritedItemIDs' || fallbackKey.includes('Favorited'))) return;
    if (typeof item !== 'object' || Array.isArray(item)) return;

    const qtyRaw = item.quantity ?? item.qty ?? item.count ?? 1;
    const qty = Number.isFinite(Number(qtyRaw)) ? Number(qtyRaw) : 1;
    const isPet = item.itemType && String(item.itemType).toLowerCase().includes('pet');
    const isEgg = item.itemType && String(item.itemType).toLowerCase().includes('egg');
    const seedName = item.seedName || item.seed || item.crop || item.species || item.cropId;
    const petSpecies = isPet ? (item.petSpecies || item.species) : null;
    let eggRarity = null;
    if (isEgg && item.eggId) {
      const eggIdStr = String(item.eggId);
      eggRarity = eggIdStr.replace(/Egg$/i, '').trim() || 'Common';
    }
    let baseLabel = item.displayName || item.name || seedName || petSpecies || item.toolId || item.itemType || item.id || fallbackKey || 'Item';
    if (isEgg && eggRarity) {
      baseLabel = `${eggRarity} Egg`;
    }
    if (String(baseLabel).toLowerCase().includes('tulip')) {
      baseLabel = 'Tulip';
    }
    const isSeed = Boolean(seedName) && (!item.itemType || String(item.itemType).toLowerCase().includes('seed'));
    if (baseLabel.toLowerCase() === 'decor' && (item.id || item.decorId || item.itemId)) {
      baseLabel = item.displayName || item.name || item.id || item.decorId || item.itemId || 'Decor';
    }
    const label = friendlyName(isSeed ? `${baseLabel} Seeds` : baseLabel);

    let petLevel: number | null = null;
    let petMaxLevel: number = 30;
    if (isPet) {
      const xp = item.xp ?? item.petXP ?? item.petXp ?? 0;
      const targetScale = item.targetScale ?? item.petTargetScale ?? item.scale ?? 1;
      if (xp > 0 && petSpecies) {
        const maxStrength = calculateMaxStrength(targetScale, petSpecies);
        const xpPerLevel = getSpeciesXpPerLevel(petSpecies);
        if (xpPerLevel && xpPerLevel > 0 && maxStrength) {
          const level = Math.min(30, Math.floor(xp / xpPerLevel));
          const baseStrength = 50;
          const strengthPerLevel = (maxStrength - baseStrength) / 30;
          petLevel = Math.min(maxStrength, Math.round(baseStrength + level * strengthPerLevel));
          petMaxLevel = maxStrength;
        }
      }
    }
    const species = isPet ? petSpecies : seedName;
    const lowerLabel = label.toLowerCase();
    const petMut = isPet && (item.mutation || item.mutations) ? String(Array.isArray(item.mutations) ? item.mutations[0] : item.mutation).toLowerCase() : '';

    let sprite: string | null = null;
    const candidateNames = [label, baseLabel, seedName, petSpecies, item.decorId, item.id, item.itemId, fallbackKey]
      .map((n) => (n ? String(n) : null))
      .filter(Boolean) as string[];

    if (isSeed && species) {
      sprite = getSeedSpriteUrl(String(species).toLowerCase());
    } else if (isEgg) {
      sprite = item.eggId ? getEggSpriteUrl(String(item.eggId)) : null;
    } else if (isPet && species) {
      const normalized = normalizePetSpecies(String(species));
      const petCanvas = petMut ? getPetSpriteWithMutations(normalized, [petMut]) : getPetSpriteCanvas(normalized);
      sprite = canvasToDataUrlSafe(petCanvas);
    } else if (species) {
      sprite = getMutatedCropSpriteUrl(String(species).toLowerCase(), item.mutations || []);
    }

    if (!sprite) {
      sprite =
        getItemSpriteUrl(lowerLabel) ||
        getItemSpriteUrl(baseLabel.toLowerCase()) ||
        candidateNames.map((name) => renderSpriteByName(name, ['decor', 'item'])).find(Boolean) ||
        candidateNames.map((name) => renderSpriteByName(name, ['item', 'decor'])).find(Boolean) ||
        null;
    }

    let finalSprite = sprite;
    if (!finalSprite && getItemSpriteUrl(baseLabel.toLowerCase())) {
      finalSprite = getItemSpriteUrl(baseLabel.toLowerCase());
    }

    const fallbackIcon = itemIconMap[lowerLabel.replace(/\s+/g, '')];
    const abilities = isPet && item.abilities ? (Array.isArray(item.abilities) ? item.abilities : [item.abilities]) : [];
    const xp = isPet ? (item.xp ?? item.petXP ?? item.petXp ?? 0) : 0;
    const targetScale = isPet ? (item.targetScale ?? item.petTargetScale ?? item.scale ?? 1) : 1;
    collected.push({ label, qty, sprite: finalSprite || null, icon: fallbackIcon || null, petLevel, petMaxLevel, isPet, abilities, xp, targetScale } as any);
  };

  if (Array.isArray(inventory)) {
    inventory.forEach((item) => pushItem(item));
  } else if (inventory && typeof inventory === 'object') {
    Object.entries(inventory).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach((v) => pushItem(v, key));
      } else if (value && typeof value === 'object') {
        pushItem(value, key);
      }
    });
  }

  const storages = (view.state?.inventory as any)?.storages || [];
  const hutch = storages.find((s: any) => s.decorId === 'PetHutch' || s.type === 'hutch' || s.id === 'hutch');
  let hutchHtml = '';
  if (hutch && hutch.items && hutch.items.length > 0) {
    const hutchPets = hutch.items
      .map((pet: any) => {
        const species = pet.petSpecies || pet.species;
        const normalized = normalizePetSpecies(String(species));
        const name = pet.name || friendlyName(species);

        let sprite = canvasToDataUrlSafe(getPetSpriteCanvas(normalized));
        const petMut = (pet.mutation || pet.mutations) ? String(Array.isArray(pet.mutations) ? pet.mutations[0] : pet.mutation).toLowerCase() : '';
        if (sprite && petMut) {
          const petCanvas = getPetSpriteWithMutations(normalized, [petMut]);
          if (petCanvas) {
            const withMut = applyCanvasFilter(petCanvas, petMut);
            sprite = canvasToDataUrlSafe(withMut) || sprite;
          }
        }
        const xp = pet.xp || 0;
        const targetScale = pet.targetScale || 1;
        let strength = 50;
        const maxStrength = calculateMaxStrength(targetScale, species);
        const xpPerLevel = getSpeciesXpPerLevel(species);
        if (xpPerLevel && xpPerLevel > 0 && xp > 0 && maxStrength) {
          const level = Math.min(30, Math.floor(xp / xpPerLevel));
          const baseStrength = 50;
          const strengthPerLevel = (maxStrength - baseStrength) / 30;
          strength = Math.min(maxStrength, Math.round(baseStrength + level * strengthPerLevel));
        }
        const abilities = pet.abilities ? (Array.isArray(pet.abilities) ? pet.abilities : [pet.abilities]) : [];
        const abilitySquares = renderAbilitySquares(abilities);

        return `
        <div class="pr-inv-card pet-card">
          ${abilitySquares ? `<div class="pr-inv-abilities">${abilitySquares}</div>` : ''}
          <div class="pr-inv-sprite-container">
            ${sprite ? `<img src="${sprite}" alt="${name}" class="pr-inv-sprite" />` : '<div class="pr-inv-placeholder">?</div>'}
          </div>
          <div class="pr-inv-name">${name}</div>
          <div class="pr-inv-str">STR: ${strength}</div>
        </div>
      `;
      })
      .join('');

    hutchHtml = `
      <div class="pr-section">
        <div class="pr-section-head">🐾 Pet Hutch (${hutch.items.length} pets)</div>
        <div class="pr-card-grid">${hutchPets}</div>
      </div>
    `;
  }

  setPaneContent('pr-inventory-content', `
    <div class="pr-section">
      <div class="pr-section-head">🎒 Inventory (<span id="pr-inv-count">${collected.length}</span> items)</div>
      <div class="pr-card-grid" id="pr-inv-cards"></div>
    </div>
    ${hutchHtml}
  `);

  const cardsRoot = document.getElementById('pr-inv-cards');
  if (cardsRoot) {
    const buildPetCard = (item: any) => {
      const abilities = item.abilities || [];
      const abilitySquares = renderAbilitySquares(abilities);
      const currentSTR = item.petLevel ?? 0;
      return `
        <div class="pr-inv-card pet-card">
          ${abilitySquares ? `<div class="pr-inv-abilities">${abilitySquares}</div>` : ''}
          <div class="pr-inv-sprite-container">
            ${item.sprite ? `<img src="${item.sprite}" alt="${item.label}" class="pr-inv-sprite" />` : '<div class="pr-inv-placeholder">?</div>'}
          </div>
          <div class="pr-inv-name">${item.label}</div>
          <div class="pr-inv-str">STR: ${currentSTR}</div>
        </div>
      `;
    };

    const buildItemCard = (item: any) => {
      const fallback = item.icon || '?';
      return `
        <div class="pr-inv-card">
          <div class="pr-inv-sprite-container">
            ${item.sprite ? `<img src="${item.sprite}" alt="${item.label}" class="pr-inv-sprite" />` : `<div class="pr-inv-placeholder">${fallback}</div>`}
          </div>
          <div class="pr-inv-name">${item.label}</div>
          <div class="pr-inv-qty">x${item.qty}</div>
        </div>
      `;
    };

    const BATCH_SIZE = 32;
    let index = 0;
    const pump = () => {
      const start = performance.now();
      let chunk = '';
      let processed = 0;
      while (index < collected.length && processed < BATCH_SIZE && performance.now() - start < 10) {
        const item = collected[index++];
        if (!item) {
          continue;
        }
        chunk += item.isPet ? buildPetCard(item) : buildItemCard(item);
        processed += 1;
      }
      if (chunk) {
        cardsRoot.insertAdjacentHTML('beforeend', chunk);
      }
      if (index < collected.length) {
        requestAnimationFrame(pump);
      } else if (!cardsRoot.innerHTML.trim()) {
        cardsRoot.innerHTML = '<div class="pr-pane-placeholder">Inventory payload empty or private.</div>';
      }
    };

    if (!collected.length) {
      cardsRoot.innerHTML = '<div class="pr-pane-placeholder">Inventory payload empty or private.</div>';
    } else {
      requestAnimationFrame(pump);
    }
  }
}

function renderActivityPane(view: PlayerView, isFriend: boolean, privacy: PlayerView['privacy']): void {
  const logs = Array.isArray(view.state?.activityLog)
    ? view.state?.activityLog
    : (Array.isArray(view.state?.activityLogs) ? view.state?.activityLogs : []);

  if (!logs || logs.length === 0) {
    setPanePlaceholder('pr-activity-content', 'No activity shared in the payload.');
    return;
  }

  const parsed = logs.slice(0, 8).map((entry) => {
    let obj: any = entry;
    if (typeof entry === 'string') {
      try { obj = JSON.parse(entry); } catch { obj = { note: entry }; }
    }
    const rawAction = obj.action || obj.type || obj.event || obj.name || 'Activity';
    const action = friendlyName(rawAction);
    const timestamp = normalizeMillis(obj.timestamp ?? obj.time ?? obj.createdAt ?? null);
    const ago = timestamp ? formatUpdatedAgo(new Date(timestamp).toISOString()) : 'recently';
    const params = obj.parameters || obj;
    
    // Extract crop/pet/item info from parameters
    const crop = params?.species || params?.crop || params?.seed || obj.seed;
    const pet = params?.pet?.name || params?.pet?.petSpecies || params?.petSpecies || obj.pet;
    const mutations = params?.mutations || params?.mutation || [];
    let sprite = null;
    
    // Get appropriate sprite
    if (crop) {
      sprite = getMutatedCropSpriteUrl(String(crop).toLowerCase(), mutations);
    } else if (pet) {
      const petSpecies = params?.pet?.petSpecies || pet;
      sprite = canvasToDataUrlSafe(getPetSpriteCanvas(String(petSpecies).toLowerCase()));
    }

    // Build detailed description based on action type
    let detail = '';
    if (rawAction === 'feedPet') {
      const petName = params?.pet?.name || 'pet';
      detail = `Fed ${petName}`;
    } else if (rawAction === 'purchaseEgg') {
      const eggIds = params?.eggIds || [];
      const eggType = Array.isArray(eggIds) && eggIds.length > 0 ? eggIds[0] : 'egg';
      detail = `Purchased ${friendlyName(eggType)}`;
    } else if (rawAction === 'purchaseSeed') {
      const seedIds = params?.seedIds || [];
      const seedType = Array.isArray(seedIds) && seedIds.length > 0 ? seedIds[0] : 'seed';
      detail = `Purchased ${friendlyName(seedType)}`;
    } else if (rawAction === 'purchaseTool') {
      detail = `Purchased tool`;
    } else if (rawAction === 'harvest') {
      const crops = params?.crops || [];
      const cropCount = Array.isArray(crops) ? crops.length : 1;
      const cropSpecies = Array.isArray(crops) && crops.length > 0 ? crops[0].species : 'crops';
      detail = `Harvested ${cropCount} ${friendlyName(cropSpecies)}`;
    } else if (rawAction === 'plantEgg') {
      detail = `Planted an egg`;
    } else if (rawAction.startsWith('PetXpBoost')) {
      const bonusXp = params?.bonusXp || 0;
      const affected = params?.petsAffected?.length || 0;
      detail = `+${bonusXp} XP to ${affected} pet${affected !== 1 ? 's' : ''}`;
    } else if (rawAction === 'ProduceScaleBoostII' || rawAction === 'ProduceScaleBoost') {
      detail = `Crop size boost activated`;
    } else if (rawAction.includes('Kisser') || rawAction.includes('Granter')) {
      detail = `${action} ability triggered`;
    } else if (rawAction.toLowerCase().includes('hatch')) {
      detail = `Hatched ${friendlyName(pet || crop || 'pet')}`;
    } else if (rawAction.toLowerCase().includes('sell')) {
      detail = `Sold ${friendlyName(pet || crop || 'item')}`;
    } else if (params?.currency && params?.purchasePrice) {
      detail = `Spent ${params.purchasePrice} ${params.currency}`;
    } else {
      detail = previewData(params) || 'No details';
    }

    return { action, ago, detail, sprite };
  });

  const timeline = parsed.map(item => `
    <div class="pr-timeline-item">
      <div class="pr-timeline-dot"></div>
      ${item.sprite ? spriteCircle(item.sprite, '') : '<div style="width:10px"></div>'}
      <div class="pr-timeline-main">
        <div class="pr-timeline-title">${item.action}</div>
        <div class="pr-timeline-detail">${item.detail || 'No details'}</div>
      </div>
      <div class="pr-time-badge">${item.ago}</div>
    </div>
  `).join('');

  setPaneContent('pr-activity-content', `
    <div class="pr-section">
      <div class="pr-section-head">Recent Activity</div>
      <div class="pr-timeline">${timeline}</div>
      ${logs.length > 8 ? '<div class="pr-hint">Showing first 8 entries</div>' : ''}
    </div>
  `);
}

async function renderInspectorPanes(view: PlayerView, isFriend: boolean): Promise<void> {
  const privacy = view.privacy || {
    showProfile: true,
    showGarden: true,
    showInventory: true,
    showStats: true,
    showActivityLog: true,
    showJournal: true,
    showCoins: true,
  };

  renderOverviewPane(view, true, privacy);
  renderGardenPane(view, true, privacy);
  await renderInventoryPane(view, true, privacy);
  renderActivityPane(view, true, privacy);
}

async function refreshInspectorData(notify = false): Promise<void> {
  const shell = ensureInspectorShell();
  const targetId = inspectorState.targetPlayerId;

  if (!targetId) {
    setAllPanes('No player id available for this player yet.');
    return;
  }

  setAllPanes('Loading player view...');

  let friends: Set<string> | null = null;
  const myPlayerId = inferSelfPlayerId();
  if (myPlayerId) {
    try {
      friends = await getCachedFriendsSet(myPlayerId);
    } catch (err) {
      console.warn('[PublicRooms] Friends lookup failed', err);
    }
  }

  const res = await getPlayerView(targetId);
  if (!res || res.error || !res.data) {
    const msg = res?.status === 401 ? 'Unauthorized. Check your Basic token.' : (res?.error || 'Unable to load player view.');
    setAllPanes(msg);
    return;
  }

  const isFriend = true;
  await renderInspectorPanes(res.data, isFriend);
  if (notify) showToast('Inspector refreshed', 'success');
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

function setRoomStatPills(totalRooms: number, visibleRooms: number, lastUpdatedAt?: string | null): void {
  const totalEl = document.getElementById('pr-total-rooms-pill');
  const visibleEl = document.getElementById('pr-visible-rooms-pill');
  const updatedEl = document.getElementById('pr-last-updated-pill');
  if (totalEl) totalEl.textContent = `Rooms: ${totalRooms}`;
  if (visibleEl) visibleEl.textContent = `Showing: ${visibleRooms}`;
  if (updatedEl) {
    if (lastUpdatedAt) {
      const d = new Date(lastUpdatedAt);
      updatedEl.textContent = `Updated: ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else {
      updatedEl.textContent = 'Updated: --';
    }
  }
}

function formatUpdatedAgo(iso?: string | null): string {
  if (!iso) return 'n/a';
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return 'n/a';
  const diffMs = Date.now() - ts;
  const diffMin = Math.max(0, Math.floor(diffMs / 60000));
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function createAppContainer(): HTMLElement {
  const container = document.createElement('div');
  container.id = 'pr-app';

  container.innerHTML = `
    <div class="pr-hero">
      <div>
        <div style="font-size: 12px; letter-spacing: 0.3px; color: #94a3b8; text-transform: uppercase; font-weight: 700;">Live Directory</div>
        <h3 style="display: flex; align-items: center; gap: 8px;">
          🌐 Public Rooms
        </h3>
        <p>Discover active rooms and who is inside. Data via Aries API.</p>
        <div class="pr-hero-badges">
          <span class="pr-badge pr-badge-ghost">Powered by Aries</span>
          <span id="pr-connection-status" class="pr-badge pr-badge-status pr-status-connecting">🔄 Connecting...</span>
        </div>
      </div>
      <div style="display: flex; gap: 8px; align-items: center;">
        <button id="pr-refresh-btn" class="qpm-button qpm-button--positive" style="padding: 10px 16px; font-weight: 700;">🔄 Refresh</button>
      </div>
    </div>

    <div class="pr-stats">
      <div class="pr-stat">
        <div class="pr-stat-label">Rooms</div>
        <div id="pr-total-rooms-pill" class="pr-stat-value">Rooms: --</div>
      </div>
      <div class="pr-stat">
        <div class="pr-stat-label">Visible</div>
        <div id="pr-visible-rooms-pill" class="pr-stat-value">Showing: --</div>
      </div>
      <div class="pr-stat">
        <div class="pr-stat-label">Last Update</div>
        <div id="pr-last-updated-pill" class="pr-stat-value">Updated: --</div>
      </div>
    </div>

    <div class="pr-controls">
      <div class="pr-control">
        <label>🔎 Search rooms or players</label>
        <input type="text" id="pr-search-input" placeholder="Search by room code or player name..." />
      </div>
      <div class="pr-control">
        <label>👥 Player count</label>
        <select id="pr-player-filter">
          <option value="all">All Rooms</option>
          <option value="low">Few (1-2)</option>
          <option value="medium">Some (3-4)</option>
          <option value="high">Many (5-6)</option>
        </select>
      </div>
      <div class="pr-control">
        <label>📊 Sort by</label>
        <select id="pr-sort-by">
          <option value="name">Room Code</option>
          <option value="players-desc" selected>Most Players</option>
          <option value="players-asc">Least Players</option>
        </select>
      </div>
    </div>

    <div style="margin-top: 18px; display: flex; align-items: center; gap: 10px; color: #cbd5e1; font-weight: 700; letter-spacing: 0.2px;">
      <span style="font-size: 18px;">🎮</span> <span>Available Rooms</span>
    </div>
    <div id="pr-rooms-list" class="pr-grid">
      <p style="text-align: center; color: #aaa; grid-column: 1/-1; font-size: 14px;">Loading rooms...</p>
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

function avatarInitials(name?: string | null): string {
  if (!name) return '👤';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return '👤';
  const first = (parts[0] ?? '').charAt(0) || '';
  const last = parts.length > 1 ? (parts[parts.length - 1] ?? '').charAt(0) : '';
  const letters = `${first}${last}`.trim().toUpperCase();
  return letters || '👤';
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
  setRoomStatPills(totalRooms, roomKeys.length, getState().lastUpdatedAt);

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
      ? `<div class="pr-avatar-stack">${room.userSlots.slice(0, 6).map(slot => slot.avatarUrl
        ? `<span class="pr-avatar" data-room="${room.id}" data-player="${slot.name || ''}"><img src="${slot.avatarUrl}" alt="avatar"></span>`
        : `<span class="pr-avatar" data-room="${room.id}" data-player="${slot.name || ''}">${avatarInitials(slot.name)}</span>`).join('')}${room.userSlots.length > 6 ? `<span class="pr-avatar" style="background: rgba(148,163,184,0.2); color: #fff;">+${room.userSlots.length - 6}</span>` : ''}</div>`
      : '<div class="pr-players-empty">No visible players</div>';

    const roomCard = document.createElement('div');
    roomCard.className = 'pr-room-card';

    roomCard.innerHTML = `
      <div class="pr-room-header">
        <div class="pr-room-title">
          <span class="pr-pill ${room.isPrivate ? 'pr-pill-private' : 'pr-pill-public'}">${room.isPrivate ? '🔒 Private' : '🔓 Public'}</span>
          <span title="${room.id}" style="font-size: 18px;">${roomLabel}</span>
          <span class="pr-pill" style="background: ${originBgColor}; border: 1px solid ${originBadgeColor}; color: ${originBadgeColor};">${origin === 'Discord' ? '🛰️ Discord' : '🌐 Web'}</span>
        </div>
        <div class="pr-player-count" style="background: ${playerBgColor}; border-color: ${playerBadgeColor}; color: ${playerBadgeColor};">
          <span>👥</span><span>${playerCount}</span>
        </div>
      </div>
      <div class="pr-meta-line">
        <span><span class="pr-dot"></span> Updated ${formatUpdatedAgo(room.lastUpdatedAt)}</span>
        <span>Code: <code style="color: #e2e8f0;">${room.id}</code></span>
      </div>
      ${slotsHtml ? slotsHtml : ''}
      <div class="pr-hint-line">Tap an avatar to open the Inspector</div>
      <div class="pr-room-actions">
        <button
          class="qpm-button ${isFull ? 'qpm-button--negative' : 'qpm-button--positive'} pr-join-btn"
          data-room-code="${roomCode}"
          style="flex: 1; padding: 10px; font-size: 13px; font-weight: 700; ${isFull ? 'background: linear-gradient(135deg, rgba(229,57,53,0.85), rgba(183,28,28,0.9)); border: 2px solid rgba(229,57,53,0.9); color: #fff;' : ''}"
        >${isFull ? '⛔ Full' : '🚀 Join'}</button>
        <button class="qpm-button qpm-button--neutral pr-view-btn" data-room-code="${roomCode}" style="padding: 10px; font-size: 13px; font-weight: 700;">👁️ Players</button>
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

  roomsList.querySelectorAll('.pr-avatar').forEach(el => {
    el.addEventListener('click', (e) => {
      const target = e.currentTarget as HTMLElement;
      const roomId = target.getAttribute('data-room');
      const playerName = target.getAttribute('data-player') || '';
      if (!roomId) return;
      const room = getState().allRooms[roomId];
      if (!room) return;
      const slot = room.userSlots?.find(s => (s.name || '') === playerName) ?? null;
      openInspector(slot ?? null, room);
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

  if (!document.querySelector('#pr-style-block')) {
    const style = document.createElement('style');
    style.id = 'pr-style-block';
    style.textContent = `
      .hidden { display: none !important; }
      #pr-app { color: #e5e7eb; font-family: 'Inter', system-ui, -apple-system, sans-serif; padding: 16px; }
      .pr-hero { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 16px; padding: 18px; border-radius: 14px; background: linear-gradient(135deg, #0b1f2b, #0f2f3c 50%, #0b1b27); border: 1px solid rgba(100, 181, 246, 0.25); box-shadow: 0 12px 30px rgba(0,0,0,0.35); }
      .pr-hero h3 { margin: 6px 0; font-size: 22px; color: #f8fafc; letter-spacing: 0.2px; }
      .pr-hero p { margin: 0; color: #94a3b8; font-size: 13px; }
      .pr-hero-badges { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
      .pr-badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; letter-spacing: 0.1px; border: 1px solid transparent; }
      .pr-badge-ghost { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.08); color: #cbd5e1; }
      .pr-badge-status { background: rgba(100, 181, 246, 0.12); border-color: rgba(100, 181, 246, 0.4); color: #90caf9; }
      .pr-status-connecting { background: rgba(100, 181, 246, 0.12); color: #90caf9; border-color: rgba(100, 181, 246, 0.4); }
      .pr-status-connected { background: rgba(76, 175, 80, 0.12); color: #a5d6a7; border-color: rgba(76, 175, 80, 0.45); }
      .pr-status-failed { background: rgba(229, 57, 53, 0.12); color: #ef9a9a; border-color: rgba(229, 57, 53, 0.45); }
      .pr-status-retrying { background: rgba(255, 152, 0, 0.14); color: #ffcc80; border-color: rgba(255, 152, 0, 0.5); }
      .pr-controls { margin-top: 16px; padding: 16px; border-radius: 12px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
      .pr-control { display: flex; flex-direction: column; gap: 6px; }
      .pr-control label { font-size: 12px; color: #cbd5e1; letter-spacing: 0.2px; font-weight: 600; }
      .pr-control input, .pr-control select { width: 100%; padding: 11px 12px; border-radius: 10px; border: 1px solid rgba(148, 163, 184, 0.35); background: rgba(15, 23, 42, 0.6); color: #e2e8f0; font-size: 13px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.04); }
      .pr-control input:focus, .pr-control select:focus { outline: 2px solid rgba(100, 181, 246, 0.4); border-color: rgba(100, 181, 246, 0.6); }
      .pr-hint-line { margin: 6px 0 0; color: #9ca3af; font-size: 12px; letter-spacing: 0.1px; }
      .pr-stats { margin-top: 14px; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
      .pr-stat { padding: 12px 14px; border-radius: 12px; background: linear-gradient(135deg, rgba(148, 163, 184, 0.08), rgba(30, 41, 59, 0.6)); border: 1px solid rgba(148, 163, 184, 0.25); box-shadow: 0 6px 18px rgba(0,0,0,0.25); }
      .pr-stat-label { font-size: 12px; color: #94a3b8; letter-spacing: 0.2px; margin-bottom: 6px; }
      .pr-stat-value { font-size: 15px; font-weight: 700; color: #e2e8f0; }
      .pr-grid { margin-top: 16px; display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
      .pr-room-card { padding: 16px; border-radius: 14px; background: linear-gradient(145deg, rgba(255,255,255,0.04), rgba(15,23,42,0.7)); border: 1px solid rgba(148, 163, 184, 0.16); box-shadow: 0 10px 24px rgba(0,0,0,0.32); transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease; }
      .pr-room-card:hover { transform: translateY(-3px); border-color: rgba(100, 181, 246, 0.5); box-shadow: 0 14px 28px rgba(0,0,0,0.42); }
      .pr-room-header { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; }
      .pr-room-title { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 17px; font-weight: 700; color: #f8fafc; }
      .pr-room-badges { display: flex; gap: 6px; flex-wrap: wrap; }
      .pr-player-count { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 12px; font-weight: 700; font-size: 12px; border: 1px solid rgba(255,255,255,0.08); }
      .pr-player-list { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
      .pr-players-empty { color: #94a3b8; font-size: 12px; margin-top: 10px; }
      .pr-room-actions { display: flex; gap: 8px; margin-top: 14px; }
      .pr-pill { padding: 6px 10px; border-radius: 10px; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; }
      .pr-pill-private { background: rgba(229, 115, 115, 0.12); border: 1px solid rgba(229, 115, 115, 0.35); color: #ef9a9a; }
      .pr-pill-public { background: rgba(129, 199, 132, 0.12); border: 1px solid rgba(129, 199, 132, 0.35); color: #c8e6c9; }
      .pr-meta-line { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; color: #94a3b8; font-size: 12px; margin-top: 10px; }
      .pr-dot { width: 6px; height: 6px; border-radius: 50%; background: #4dd0e1; display: inline-block; }
      .pr-avatar-stack { display: flex; align-items: center; gap: 6px; margin-top: 10px; flex-wrap: wrap; }
      .pr-avatar { width: 28px; height: 28px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.06); display: grid; place-items: center; color: #cbd5e1; font-weight: 700; font-size: 12px; overflow: hidden; transition: transform 0.15s ease, box-shadow 0.15s ease; cursor: pointer; }
      .pr-avatar img { width: 100%; height: 100%; object-fit: cover; }
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
      }
      .pr-inspector { position: fixed; inset: 0; z-index: 10000; }
      .pr-inspector.hidden { display: none; }
      .pr-inspector-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.85); }
      .pr-inspector-panel { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(1000px, 96vw); max-height: 92vh; overflow: hidden; border-radius: 20px; background: linear-gradient(135deg, #0a1628 0%, #0f172a 30%, #1e1b4b 100%); border: 2px solid rgba(100,181,246,0.4); box-shadow: 0 25px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(100,181,246,0.2), inset 0 1px 0 rgba(255,255,255,0.1); display: flex; flex-direction: column; transition: left 0.2s ease, top 0.2s ease; }
      .pr-inspector-header { display: flex; justify-content: space-between; align-items: center; padding: 18px 24px; background: linear-gradient(135deg, rgba(100,181,246,0.15) 0%, rgba(139,92,246,0.1) 100%); border-bottom: 1px solid rgba(100,181,246,0.3); cursor: move; position: relative; overflow: hidden; }
      .pr-inspector-header:active { cursor: grabbing; }
      .pr-drag-indicator { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); font-size: 22px; color: rgba(255,255,255,0.25); pointer-events: none; letter-spacing: -4px; font-weight: 700; }
      .pr-inspector-identity { display: flex; align-items: center; gap: 12px; }
      .pr-inspector-avatar { width: 42px; height: 42px; border-radius: 12px; background: rgba(255,255,255,0.06); display: grid; place-items: center; color: #e2e8f0; font-weight: 800; font-size: 14px; background-size: cover; background-position: center; border: 1px solid rgba(255,255,255,0.08); }
      .pr-inspector-avatar.has-img { color: transparent; }
      .pr-inspector-name { font-size: 16px; font-weight: 800; color: #f8fafc; }
      .pr-inspector-sub { font-size: 12px; color: #9ca3af; }
      .pr-inspector-actions { display: flex; gap: 8px; position: relative; z-index: 10; }
      .pr-inspector-actions button { padding: 10px 14px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); border: 1px solid rgba(255,255,255,0.1); }
      .pr-inspector-actions button:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
      .pr-inspector-actions button:active { transform: translateY(0); }
      #pr-inspector-refresh { background: linear-gradient(135deg, rgba(100,181,246,0.2), rgba(139,92,246,0.15)); border-color: rgba(100,181,246,0.4); color: #7dd3fc; }
      #pr-inspector-refresh:hover { background: linear-gradient(135deg, rgba(100,181,246,0.3), rgba(139,92,246,0.25)); box-shadow: 0 4px 16px rgba(100,181,246,0.4); }
      #pr-inspector-close { background: rgba(239,68,68,0.15); border-color: rgba(239,68,68,0.4); color: #fca5a5; }
      #pr-inspector-close:hover { background: rgba(239,68,68,0.25); box-shadow: 0 4px 16px rgba(239,68,68,0.3); }
      .pr-inspector-tabs { display: flex; gap: 6px; padding: 12px 16px; background: linear-gradient(135deg, rgba(15,23,42,0.8) 0%, rgba(30,27,75,0.6) 100%); border-bottom: 1px solid rgba(100,181,246,0.2); }
      .pr-inspector-tab { padding: 10px 20px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); color: #e2e8f0; font-weight: 700; font-size: 14px; cursor: pointer; position: relative; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
      .pr-inspector-tab:hover { background: rgba(100,181,246,0.1); color: #e0e7ff; transform: translateY(-2px); border-color: rgba(100,181,246,0.3); }
      .pr-inspector-tab.active { background: linear-gradient(135deg, rgba(100,181,246,0.25), rgba(139,92,246,0.2)); border-color: rgba(100,181,246,0.5); color: #7dd3fc; box-shadow: 0 4px 12px rgba(100,181,246,0.3), inset 0 1px 0 rgba(255,255,255,0.1); }
      .pr-inspector-tab.active::after { content: ''; position: absolute; bottom: -1px; left: 50%; transform: translateX(-50%); width: 60%; height: 3px; background: linear-gradient(90deg, transparent, #38bdf8, transparent); border-radius: 999px; }
      .pr-inspector-body { padding: 12px; overflow: auto; flex: 1; display: grid; }
      .pr-inspector-pane { display: none; gap: 10px; }
      .pr-inspector-pane.active { display: grid; gap: 10px; }
      .pr-pane-card { border-radius: 12px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); padding: 12px; transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); }
      .pr-pane-card:hover { border-color: rgba(100,181,246,0.15); background: rgba(255,255,255,0.05); box-shadow: 0 4px 16px rgba(100,181,246,0.1); }
      .pr-pane-title { font-weight: 800; margin-bottom: 6px; color: #f8fafc; font-size: 15px; }
      .pr-pane-placeholder { color: #9ca3af; font-size: 13px; }
      .pr-overview { display: flex; flex-direction: column; gap: 12px; color: #e2e8f0; }
      .pr-avatar-block { display: flex; gap: 12px; align-items: center; padding: 12px; border-radius: 12px; background: linear-gradient(135deg, rgba(100,181,246,0.05), rgba(139,92,246,0.03)); border: 1px solid rgba(100,181,246,0.15); transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); }
      .pr-avatar-block:hover { background: linear-gradient(135deg, rgba(100,181,246,0.08), rgba(139,92,246,0.05)); border-color: rgba(100,181,246,0.25); box-shadow: 0 4px 12px rgba(100,181,246,0.15); }
      .pr-avatar-block-img { width: 50px; height: 50px; border-radius: 12px; background-size: cover; background-position: center; border: 1px solid rgba(255,255,255,0.08); }
      .pr-avatar-block-fallback { width: 50px; height: 50px; border-radius: 12px; display: grid; place-items: center; font-weight: 800; color: #cbd5e1; background: rgba(148,163,184,0.12); border: 1px solid rgba(255,255,255,0.08); }
      .pr-avatar-name { font-weight: 800; color: #f8fafc; }
      .pr-avatar-id { font-size: 12px; color: #94a3b8; }
      .pr-overview-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 8px; }
      .pr-row { display: flex; justify-content: space-between; gap: 8px; padding: 10px 12px; border-radius: 10px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); font-size: 13px; }
      .pr-row span:first-child { color: #94a3b8; }
      .pr-hint { color: #94a3af; font-size: 12px; }
      .pr-section { display: flex; flex-direction: column; gap: 12px; }
      .pr-section-head { font-weight: 800; color: #f8fafc; letter-spacing: 0.2px; display: flex; align-items: center; gap: 8px; }
      .pr-card-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; }
      .pr-garden-plots { display: flex; gap: 20px; justify-content: center; align-items: flex-start; flex-wrap: wrap; }
      .pr-garden-plot { display: flex; flex-direction: column; gap: 8px; }
      .pr-garden-plot-label { font-weight: 700; color: #94a3b8; font-size: 13px; text-align: center; letter-spacing: 0.5px; }
      .pr-garden-grid-10x10 { display: grid; grid-template-columns: repeat(10, 32px); grid-template-rows: repeat(10, 32px); gap: 2px; padding: 12px; background: rgba(15,23,42,0.5); border-radius: 8px; justify-content: center; max-width: fit-content; }
      .pr-garden-tile { width: 32px; height: 32px; border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; background: rgba(34,40,49,0.6); display: flex; align-items: center; justify-content: center; position: relative; cursor: help; transition: transform 0.15s ease, box-shadow 0.15s ease; }
      .pr-garden-tile:hover { transform: scale(1.15); box-shadow: 0 4px 12px rgba(56,189,248,0.4); z-index: 10; }
      .pr-garden-tile-empty { background: rgba(20,25,32,0.4); border-color: rgba(255,255,255,0.05); }
      .pr-garden-tile-egg { border-color: rgba(255,179,0,0.3); }
      .pr-garden-sprite { width: 100%; height: 100%; object-fit: contain; image-rendering: pixelated; }
      .pr-garden-placeholder { font-size: 16px; opacity: 0.3; }
      .pr-multi-icon { position: absolute; top: 0; right: 0; background: rgba(124,58,237,0.9); color: #fff; font-size: 9px; font-weight: 700; padding: 1px 3px; border-radius: 0 3px 0 4px; line-height: 1; }
      .pr-boardwalk-section { display: flex; flex-direction: column; gap: 8px; align-items: center; }
      .pr-boardwalk-grid-23x12 { display: grid; grid-template-columns: repeat(23, 20px); grid-template-rows: repeat(12, 20px); gap: 1px; padding: 8px; background: rgba(101, 67, 33, 0.2); border-radius: 8px; justify-content: center; border: 2px dashed rgba(139, 90, 43, 0.4); }
      .pr-boardwalk-tile { width: 20px; height: 20px; background: linear-gradient(135deg, #654321, #8B5A2B); border: 1px solid rgba(139, 90, 43, 0.6); border-radius: 3px; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: help; transition: transform 0.15s ease, box-shadow 0.15s ease; }
      .pr-boardwalk-tile:hover { transform: scale(1.15); box-shadow: 0 4px 12px rgba(139, 90, 43, 0.6); z-index: 10; }
      .pr-boardwalk-tile-empty { background: rgba(20,25,32,0.4); border-color: rgba(139, 90, 43, 0.2); }
      .pr-pet-str { color: #a78bfa; font-size: 13px; font-weight: 700; }
      .pr-journal-progress { display: flex; flex-direction: column; gap: 16px; }
      .pr-journal-item { display: flex; flex-direction: column; gap: 8px; padding: 14px; border-radius: 12px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); transition: transform 0.2s ease, box-shadow 0.2s ease; }
      .pr-journal-item:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.3); }
      .pr-journal-header { display: flex; justify-content: space-between; font-size: 14px; color: #cbd5e1; font-weight: 600; }
      .pr-journal-count { font-weight: 800; color: #7dd3fc; font-size: 15px; }
      .pr-progress-pct { font-size: 12px; color: #94a3b8; text-align: right; margin-top: 4px; }
      .pr-progress-bar { height: 12px; border-radius: 999px; background: rgba(0,0,0,0.3); overflow: hidden; border: 1px solid rgba(255,255,255,0.15); position: relative; box-shadow: inset 0 2px 4px rgba(0,0,0,0.3); }
      .pr-progress-fill { height: 100%; transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1); position: relative; }
      .pr-journal-tabs { display: flex; gap: 6px; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.08); }
      .pr-journal-tab { padding: 8px 16px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); color: #cbd5e1; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s ease; }
      .pr-journal-tab:hover { background: rgba(100,181,246,0.1); color: #e0e7ff; border-color: rgba(100,181,246,0.3); }
      .pr-journal-tab.active { background: linear-gradient(135deg, rgba(100,181,246,0.25), rgba(139,92,246,0.2)); border-color: rgba(100,181,246,0.5); color: #7dd3fc; box-shadow: 0 2px 8px rgba(100,181,246,0.3); }
      .pr-journal-tab-content { display: flex; flex-direction: column; gap: 8px; padding: 12px 0; max-height: 300px; overflow-y: auto; overflow-x: hidden; }
      .pr-journal-detail-row { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-radius: 8px; background: transparent; border: 1px solid rgba(255,255,255,0.08); transition: all 0.2s ease; min-width: 0; }
      .pr-journal-detail-row:hover { background: rgba(100,181,246,0.08); border-color: rgba(100,181,246,0.3); transform: translateX(2px); }
      .pr-journal-species { font-size: 12px; font-weight: 600; color: #e2e8f0; min-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
      .pr-journal-variants { font-size: 11px; color: #94a3b8; font-weight: 500; min-width: 120px; }
      .pr-progress-bar-mini { height: 8px; border-radius: 999px; background: rgba(0,0,0,0.3); overflow: hidden; border: 1px solid rgba(255,255,255,0.1); flex: 1; }
      .pr-progress-fill-mini { height: 100%; transition: width 0.4s ease; border-radius: 999px; }
      .pr-stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; }
      .pr-stat-row { display: flex; justify-content: space-between; padding: 12px 14px; border-radius: 10px; background: linear-gradient(135deg, rgba(100,181,246,0.05), rgba(139,92,246,0.03)); border: 1px solid rgba(255,255,255,0.1); transition: all 0.2s ease; }
      .pr-stat-row:hover { transform: translateX(4px); background: linear-gradient(135deg, rgba(100,181,246,0.1), rgba(139,92,246,0.05)); border-color: rgba(100,181,246,0.3); box-shadow: 0 4px 12px rgba(100,181,246,0.2); }
      .pr-stat-label { color: #cbd5e1; font-size: 13px; font-weight: 500; }
      .pr-stat-value { color: #7dd3fc; font-weight: 800; font-size: 14px; letter-spacing: 0.3px; }
      
      /* New vertical inventory cards - game style */
      .pr-inv-card { position: relative; padding: 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.12); background: rgba(20,25,35,0.85); box-shadow: 0 4px 12px rgba(0,0,0,0.4); transition: all 0.2s ease; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 6px; min-width: 100px; }
      .pr-inv-card:hover { transform: translateY(-3px); border-color: rgba(100,181,246,0.4); box-shadow: 0 6px 20px rgba(100,181,246,0.2); }
      .pr-inv-card.pet-card { background: rgba(30,20,45,0.9); border-color: rgba(168,139,250,0.2); position: relative; min-width: 130px; }
      .pr-inv-card.pet-card:hover { border-color: rgba(168,139,250,0.5); }
      .pr-inv-abilities { position: absolute; left: 12px; top: 48px; transform: translateY(-50%); display: flex; flex-direction: column; gap: 3px; z-index: 2; pointer-events: none; }
      .pr-inv-sprite-container { width: 64px; height: 64px; display: flex; align-items: center; justify-content: center; }
      .pr-inv-sprite { width: 100%; height: 100%; object-fit: contain; image-rendering: pixelated; }
      .pr-inv-placeholder { font-size: 32px; opacity: 0.4; }
      .pr-inv-name { font-size: 13px; font-weight: 700; color: #e2e8f0; text-align: center; line-height: 1.2; max-width: 100%; word-wrap: break-word; }
      .pr-inv-qty { font-size: 12px; font-weight: 700; color: #7dd3fc; background: rgba(56,189,248,0.15); padding: 3px 8px; border-radius: 6px; }
      .pr-inv-str { font-size: 12px; font-weight: 700; color: #a78bfa; background: rgba(168,139,250,0.15); padding: 3px 8px; border-radius: 6px; }
      .pr-ability-square { width: 14px; height: 14px; border-radius: 3px; box-shadow: 0 1px 4px rgba(0,0,0,0.5); cursor: help; flex-shrink: 0; }
      .pr-card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 10px; justify-items: center; }
      .pr-badge-soft { padding: 6px 8px; border-radius: 10px; background: rgba(148,163,184,0.12); color: #cbd5e1; font-size: 11px; font-weight: 700; }
      .pr-sprite-circle { width: 42px; height: 42px; border-radius: 12px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); display: grid; place-items: center; image-rendering: pixelated; background-size: contain; background-repeat: no-repeat; background-position: center; font-size: 18px; }
      .pr-chip { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 10px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); color: #cbd5e1; font-size: 12px; font-weight: 700; }
      .pr-mut-badges { display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap; }
      .pr-mut-badge { display: inline-flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; letter-spacing: 0.5px; }
      .pr-stack { display: flex; flex-direction: column; gap: 6px; }
      .pr-progress { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
      .pr-progress-track { width: 100%; height: 8px; border-radius: 999px; background: rgba(255,255,255,0.06); overflow: hidden; border: 1px solid rgba(255,255,255,0.08); }
      .pr-progress-fill { height: 100%; background: linear-gradient(90deg, #7c3aed, #38bdf8); border-radius: 999px; }
      .pr-progress-label { font-size: 12px; color: #cbd5e1; }
      .pr-pill-qty { padding: 6px 10px; border-radius: 10px; background: rgba(56,189,248,0.16); color: #7dd3fc; font-weight: 800; font-size: 12px; }
      .pr-timeline { display: flex; flex-direction: column; gap: 10px; }
      .pr-timeline-item { display: grid; grid-template-columns: auto auto 1fr auto; gap: 10px; align-items: center; padding: 12px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.08); background: linear-gradient(135deg, rgba(255,255,255,0.03), rgba(100,181,246,0.02)); transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); }
      .pr-timeline-item:hover { background: linear-gradient(135deg, rgba(100,181,246,0.08), rgba(139,92,246,0.05)); border-color: rgba(100,181,246,0.2); transform: translateX(4px); box-shadow: -4px 0 12px rgba(100,181,246,0.15); }
      .pr-timeline-dot { width: 10px; height: 10px; border-radius: 50%; background: linear-gradient(135deg, #38bdf8, #a855f7); box-shadow: 0 0 8px rgba(56,189,248,0.7); }
      .pr-timeline-main { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
      .pr-timeline-title { font-weight: 800; color: #f8fafc; }
      .pr-timeline-detail { color: #cbd5e1; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .pr-time-badge { padding: 6px 10px; border-radius: 999px; background: rgba(148,163,184,0.14); color: #cbd5e1; font-size: 12px; font-weight: 700; }
      .pr-inspector-footer { padding: 10px 12px; border-top: 1px solid rgba(255,255,255,0.05); color: #94a3b8; font-size: 11px; letter-spacing: 0.2px; }
      .pr-avatar:hover { transform: scale(1.14); box-shadow: 0 0 0 2px rgba(100,181,246,0.45); }
      
      /* Custom scrollbar styling */
      .pr-inspector-body::-webkit-scrollbar { width: 10px; }
      .pr-inspector-body::-webkit-scrollbar-track { background: rgba(15,23,42,0.5); border-radius: 10px; margin: 4px; }
      .pr-inspector-body::-webkit-scrollbar-thumb { background: linear-gradient(180deg, rgba(100,181,246,0.4), rgba(139,92,246,0.3)); border-radius: 10px; border: 2px solid rgba(15,23,42,0.5); }
      .pr-inspector-body::-webkit-scrollbar-thumb:hover { background: linear-gradient(180deg, rgba(100,181,246,0.6), rgba(139,92,246,0.5)); }
    `;
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

  // Debug hook: open inspector by playerId directly (no room required)
  if (!(window as any).QPM_INSPECT_PLAYER) {
    (window as any).QPM_INSPECT_PLAYER = (playerId: string, playerName?: string): void => openInspectorDirect(playerId, playerName);
  }
}
