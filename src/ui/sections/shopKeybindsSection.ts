import { createCard } from '../panelHelpers';
import { createKeybindButton } from '../petsWindow/helpers';
import {
  getShopKeybind,
  setShopKeybind,
  clearShopKeybind,
  isShopKeybindsEnabled,
  setShopKeybindsEnabled,
  SHOP_LABELS,
  type ShopId,
} from '../../features/shopKeybinds';

const SHOP_IDS: readonly ShopId[] = ['seedShop', 'eggShop', 'toolShop', 'decorShop'];

export function createShopKeybindsSection(): HTMLElement {
  const { root, body } = createCard('Shop Keybinds');
  root.dataset.qpmSection = 'shop-keybinds';

  // Toggle row
  const toggleRow = document.createElement('label');
  toggleRow.style.cssText = [
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

  const toggleTitle = document.createElement('div');
  toggleTitle.style.cssText = 'font-size:13px;font-weight:600;color:var(--qpm-text,#fff);';
  toggleTitle.textContent = 'Enable Shop Keybinds';

  const toggleInput = document.createElement('input');
  toggleInput.type = 'checkbox';
  toggleInput.checked = isShopKeybindsEnabled();
  toggleInput.style.cssText = 'width:18px;height:18px;cursor:pointer;accent-color:var(--qpm-accent,#8f82ff);';

  toggleRow.append(toggleTitle, toggleInput);
  body.appendChild(toggleRow);

  // Keybind rows container
  const bindsWrap = document.createElement('div');
  bindsWrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
  body.appendChild(bindsWrap);

  function syncEnabled(): void {
    const on = toggleInput.checked;
    bindsWrap.style.opacity = on ? '1' : '0.45';
    bindsWrap.style.pointerEvents = on ? '' : 'none';
  }

  toggleInput.addEventListener('change', () => {
    setShopKeybindsEnabled(toggleInput.checked);
    syncEnabled();
  });

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
    label.style.cssText = 'font-size:13px;font-weight:600;color:var(--qpm-text,#fff);';
    label.textContent = SHOP_LABELS[shopId];

    const kbBtn = createKeybindButton({
      onSet: (combo) => setShopKeybind(shopId, combo),
      onClear: () => clearShopKeybind(shopId),
      readCurrent: () => getShopKeybind(shopId),
      width: '120px',
    });

    row.append(label, kbBtn);
    bindsWrap.appendChild(row);
  }

  syncEnabled();
  return root;
}
