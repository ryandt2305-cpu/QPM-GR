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

/** Inline styles matching .qpm-keybind-input so the button renders correctly
 *  even when the pets window stylesheet hasn't been injected. */
const KEYBIND_BTN_STYLE = [
  'width:110px',
  'text-align:center',
  'background:rgba(255,255,255,0.06)',
  'border:1px solid rgba(143,130,255,0.25)',
  'border-radius:5px',
  'color:#e0e0e0',
  'font-family:inherit',
  'font-size:11px',
  'padding:5px 8px',
  'outline:none',
  'cursor:pointer',
  'white-space:nowrap',
  'overflow:hidden',
  'text-overflow:ellipsis',
].join(';');

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
    });
    kbBtn.style.cssText = KEYBIND_BTN_STYLE;

    row.append(label, kbBtn);
    bindsWrap.appendChild(row);
  }

  syncEnabled();
  return root;
}
