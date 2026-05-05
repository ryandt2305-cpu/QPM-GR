// src/ui/hubWindow/groups/configGroup.ts

import type { HubGroupDef, ExpandableCardConfig } from '../cards/types';
import { toggleWindow } from '../../modalWindow';
import { log } from '../../../utils/logger';
import {
  getAutoReconnectConfig,
  updateAutoReconnectConfig,
  subscribeToAutoReconnectConfig,
} from '../../../features/autoReconnect';
import {
  isShopKeybindsEnabled,
  setShopKeybindsEnabled,
  getAllShopKeybinds,
  setShopKeybind,
  clearShopKeybind,
  SHOP_LABELS,
  type ShopId,
} from '../../../features/shopKeybinds';
import { normalizeKeybind, formatKeybind } from '../../petsWindow/helpers';

const SHOP_IDS: readonly ShopId[] = ['seedShop', 'eggShop', 'toolShop', 'decorShop'];

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildToggleRow(label: string, checked: boolean, onChange: (v: boolean) => void): { row: HTMLElement; input: HTMLInputElement } {
  const row = document.createElement('label');
  row.style.cssText = [
    'display:flex',
    'align-items:center',
    'justify-content:space-between',
    'gap:10px',
    'padding:8px 10px',
    'border-radius:8px',
    'border:1px solid rgba(255,255,255,0.08)',
    'background:rgba(255,255,255,0.03)',
    'cursor:pointer',
  ].join(';');

  const text = document.createElement('div');
  text.style.cssText = 'font-size:13px;font-weight:600;color:#e0e0e0;';
  text.textContent = label;

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.style.cssText = 'width:18px;height:18px;cursor:pointer;accent-color:#8f82ff;';
  input.addEventListener('change', () => onChange(input.checked));

  row.append(text, input);
  return { row, input };
}

// ── Auto Reconnect ───────────────────────────────────────────────────────────

function renderAutoReconnectExpanded(container: HTMLElement): () => void {
  const cleanups: Array<() => void> = [];
  container.style.cssText = 'display:flex;flex-direction:column;gap:10px;';

  const cfg = getAutoReconnectConfig();

  // Toggle
  const { row: toggleRow, input: toggleInput } = buildToggleRow('Enabled', cfg.enabled, (v) => {
    updateAutoReconnectConfig({ enabled: v });
  });
  container.appendChild(toggleRow);

  // Delay slider
  const sliderWrap = document.createElement('div');
  sliderWrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding:4px 2px;';

  const sliderLabel = document.createElement('div');
  sliderLabel.style.cssText = 'font-size:12px;color:rgba(224,224,224,0.7);';

  function formatDelay(ms: number): string {
    const s = Math.round(ms / 1000);
    return s === 0 ? 'Instant' : `${s}s`;
  }
  sliderLabel.textContent = `Delay: ${formatDelay(cfg.delayMs)}`;

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '300';
  slider.step = '5';
  slider.value = String(Math.round(cfg.delayMs / 1000));
  slider.style.cssText = 'width:100%;accent-color:#8f82ff;cursor:pointer;';
  slider.addEventListener('input', () => {
    const seconds = Number(slider.value);
    sliderLabel.textContent = `Delay: ${formatDelay(seconds * 1000)}`;
    updateAutoReconnectConfig({ delayMs: seconds * 1000 });
  });

  sliderWrap.append(sliderLabel, slider);
  container.appendChild(sliderWrap);

  // Subscribe to external changes
  const unsub = subscribeToAutoReconnectConfig((c) => {
    toggleInput.checked = c.enabled;
    const s = Math.round(c.delayMs / 1000);
    slider.value = String(s);
    sliderLabel.textContent = `Delay: ${formatDelay(c.delayMs)}`;
  });
  cleanups.push(unsub);

  return () => { cleanups.forEach(fn => fn()); };
}

// ── Shop Keybinds ────────────────────────────────────────────────────────────

function renderShopKeybindsExpanded(container: HTMLElement): () => void {
  container.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

  // Toggle
  const { row: toggleRow, input: toggleInput } = buildToggleRow('Enabled', isShopKeybindsEnabled(), (v) => {
    setShopKeybindsEnabled(v);
    syncEnabled();
  });
  container.appendChild(toggleRow);

  // Binds
  const bindsWrap = document.createElement('div');
  bindsWrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
  container.appendChild(bindsWrap);

  function syncEnabled(): void {
    const on = toggleInput.checked;
    bindsWrap.style.opacity = on ? '1' : '0.45';
    bindsWrap.style.pointerEvents = on ? '' : 'none';
  }

  for (const shopId of SHOP_IDS) {
    const row = document.createElement('div');
    row.style.cssText = [
      'display:flex',
      'align-items:center',
      'justify-content:space-between',
      'gap:10px',
      'padding:8px 10px',
      'border-radius:8px',
      'border:1px solid rgba(255,255,255,0.08)',
      'background:rgba(255,255,255,0.03)',
    ].join(';');

    const label = document.createElement('div');
    label.style.cssText = 'font-size:13px;font-weight:600;color:#e0e0e0;';
    label.textContent = SHOP_LABELS[shopId];

    const right = document.createElement('div');
    right.style.cssText = 'display:flex;align-items:center;gap:6px;';

    const kbDisplay = document.createElement('button');
    kbDisplay.type = 'button';
    kbDisplay.style.cssText = [
      'min-width:90px',
      'text-align:center',
      'background:rgba(255,255,255,0.06)',
      'border:1px solid rgba(143,130,255,0.25)',
      'border-radius:5px',
      'color:#e0e0e0',
      'font-family:inherit',
      'font-size:11px',
      'padding:5px 8px',
      'cursor:pointer',
      'white-space:nowrap',
    ].join(';');

    let recording = false;

    function updateDisplay(): void {
      const binds = getAllShopKeybinds();
      const combo = binds[shopId];
      kbDisplay.textContent = recording ? 'Press keys...' : (combo ? formatKeybind(combo) : '\u2014');
      kbDisplay.style.borderColor = recording ? '#8f82ff' : 'rgba(143,130,255,0.25)';
    }
    updateDisplay();

    function onKeyDown(e: KeyboardEvent): void {
      e.preventDefault();
      e.stopPropagation();
      const combo = normalizeKeybind(e);
      if (!combo || combo === 'Escape') {
        stopRecording();
        return;
      }
      setShopKeybind(shopId, combo);
      stopRecording();
    }

    function startRecording(): void {
      recording = true;
      updateDisplay();
      document.addEventListener('keydown', onKeyDown, true);
    }

    function stopRecording(): void {
      recording = false;
      document.removeEventListener('keydown', onKeyDown, true);
      updateDisplay();
    }

    kbDisplay.addEventListener('click', () => {
      if (recording) stopRecording();
      else startRecording();
    });

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.textContent = '×';
    resetBtn.title = 'Reset to default';
    resetBtn.style.cssText = [
      'background:rgba(255,100,100,0.1)',
      'border:1px solid rgba(255,100,100,0.25)',
      'color:#ff8888',
      'font-size:14px',
      'cursor:pointer',
      'padding:2px 6px',
      'border-radius:4px',
      'line-height:1',
    ].join(';');
    resetBtn.addEventListener('click', () => {
      clearShopKeybind(shopId);
      updateDisplay();
    });

    right.append(kbDisplay, resetBtn);
    row.append(label, right);
    bindsWrap.appendChild(row);
  }

  syncEnabled();
  return () => {};
}

// ── Group definition ─────────────────────────────────────────────────────────

export function getConfigGroup(): HubGroupDef {
  const autoReconnectCard: ExpandableCardConfig = {
    key: 'auto-reconnect',
    label: 'Auto Reconnect',
    description: 'Reconnect automatically after a disconnect',
    icon: { kind: 'sprite', value: '↻', spriteKey: 'sprite/ui/ProgressStar', fallback: '↻' },
    tier: 'expandable',
    renderSummary: (el) => {
      el.style.cssText = 'font-size:11px;color:rgba(224,224,224,0.45);margin-top:2px;';
      function update(): void {
        const cfg = getAutoReconnectConfig();
        const s = Math.round(cfg.delayMs / 1000);
        el.textContent = cfg.enabled
          ? `Enabled · ${s === 0 ? 'Instant' : `${s}s delay`}`
          : 'Disabled';
      }
      update();
      const unsub = subscribeToAutoReconnectConfig(update);
      return unsub;
    },
    renderExpanded: renderAutoReconnectExpanded,
  };

  const controllerCard: ExpandableCardConfig = {
    key: 'controller',
    label: 'Controller',
    description: 'Gamepad support: analog cursor, D-pad, rebindable buttons',
    icon: { kind: 'sprite', value: '🎮', spriteKey: 'sprite/ui/Touchpad', fallback: '🎮' },
    labelColor: '#60a5fa',
    tier: 'expandable',
    renderSummary: (el) => {
      el.style.cssText = 'font-size:11px;color:rgba(224,224,224,0.45);margin-top:2px;';
      el.textContent = 'Bindings · Deadzone · Cursor';
    },
    renderExpanded: (container) => {
      // overflow left to parent hub scroll container
      import('../../sections/controllerSection').then(({ createControllerSection }) => {
        container.appendChild(createControllerSection(null, null));
      }).catch(e => log('⚠️ Failed to load Controller', e));
    },
    detachWindowId: 'utility-feature-controller',
    onDetach: () => {
      toggleWindow('utility-feature-controller', '🎮 Controller Settings', (root) => {
        root.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0;overflow-y:auto;padding:12px;';
        import('../../sections/controllerSection').then(({ createControllerSection }) => {
          root.appendChild(createControllerSection(null, null));
        }).catch(e => log('⚠️ Failed to load Controller', e));
      }, '580px', '78vh');
    },
  };

  const shopKeybindsCard: ExpandableCardConfig = {
    key: 'shop-keybinds',
    label: 'Shop Keybinds',
    description: 'Keyboard shortcuts to open game shops',
    icon: { kind: 'sprite', value: '⌨️', spriteKey: 'sprite/ui/ArrowKeys', fallback: '⌨️' },
    tier: 'expandable',
    renderSummary: (el) => {
      el.style.cssText = 'font-size:11px;color:rgba(224,224,224,0.45);margin-top:2px;';
      el.textContent = isShopKeybindsEnabled() ? 'Enabled' : 'Disabled';
    },
    renderExpanded: renderShopKeybindsExpanded,
  };

  return {
    id: 'config',
    label: 'Config',
    icon: { kind: 'emoji', value: '⚙️' },
    cards: [autoReconnectCard, controllerCard, shopKeybindsCard],
  };
}
