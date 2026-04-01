// src/ui/toolsHubWindow.ts
// Tools Hub - quick links for QPM and external utilities

import { log } from '../utils/logger';
import { storage } from '../utils/storage';
import { getAnySpriteDataUrl, onSpritesReady, Sprites } from '../sprite-v2/compat';
import { toggleWindow } from './modalWindow';
import { createGuideSection } from './sections/guideSection';

const VISIBLE_TOOLS_KEY = 'qpm.toolsHub.visibleCards';
const SPRITE_CUSTOMISER_ICON_URL = new URL('../../docs/product/favicon-big.png', import.meta.url).href;

type ToolKey = 'guide' | 'decor-layout' | 'sprite-customizer' | 'celestial-layout';

type ToolIcon =
  | { kind: 'emoji'; value: string }
  | { kind: 'asset'; url: string; fallbackEmoji: string; pixelated?: boolean }
  | {
      kind: 'runtime';
      categories: readonly string[];
      id: string;
      fallbackEmoji: string;
      pixelated?: boolean;
    };

type BaseToolDef = {
  key: ToolKey;
  label: string;
  desc: string;
  icon: ToolIcon;
};

type GuideToolDef = BaseToolDef & {
  key: 'guide';
  kind: 'guide';
};

type ExternalToolDef = BaseToolDef & {
  key: 'decor-layout' | 'sprite-customizer' | 'celestial-layout';
  kind: 'external';
  url: string;
};

type ToolDef = GuideToolDef | ExternalToolDef;

const TOOL_DEFS: ToolDef[] = [
  {
    key: 'guide',
    label: 'Guide',
    desc: 'Open the Magic Garden Money Making Guide by bella.',
    kind: 'guide',
    icon: { kind: 'emoji', value: '\u{1F4D6}' },
  },
  {
    key: 'decor-layout',
    label: 'MG Decor Layout Customiser',
    desc: 'Design and preview different decor layouts.',
    kind: 'external',
    url: 'https://ryandt2305-cpu.github.io/MG-Decor-Layout-Customiser/',
    icon: {
      kind: 'runtime',
      categories: ['decor'],
      id: 'MiniWizardTower',
      fallbackEmoji: '\u{1F3F0}',
      pixelated: true,
    },
  },
  {
    key: 'sprite-customizer',
    label: 'MG Sprite Customiser V2',
    desc: 'Customise in-game sprites and assets and create your own scene/GIFS.',
    kind: 'external',
    url: 'https://ryandt2305-cpu.github.io/MG-Sprite-Customiser-V2/',
    icon: {
      kind: 'asset',
      url: SPRITE_CUSTOMISER_ICON_URL,
      fallbackEmoji: '\u{1F5BC}',
      pixelated: false,
    },
  },
  {
    key: 'celestial-layout',
    label: 'Celestial Position Layout Calculator',
    desc: 'Automatically calculate celestial positions to ensure they can all bind each other.',
    kind: 'external',
    url: 'https://ryandt2305-cpu.github.io/Celestial-Position-Layout-Calculator/',
    icon: {
      kind: 'runtime',
      categories: ['plant'],
      id: 'Starweaver',
      fallbackEmoji: '\u{1F31F}',
      pixelated: true,
    },
  },
];

function loadVisibleTools(): ToolKey[] {
  const saved = storage.get<ToolKey[] | null>(VISIBLE_TOOLS_KEY, null);
  if (Array.isArray(saved) && saved.length > 0) return saved;
  return TOOL_DEFS.map((tool) => tool.key);
}

function normalizeToken(value: string): string {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseSpriteKey(rawKey: string): { category: string; base: string } {
  const key = String(rawKey ?? '').trim().replace(/^\/+|\/+$/g, '');
  if (!key) return { category: '', base: '' };

  const parts = key.split('/').filter(Boolean);
  if (!parts.length) return { category: '', base: '' };

  const first = normalizeToken(parts[0] ?? '');
  const core = (first === 'sprite' || first === 'sprites') ? parts.slice(1) : parts;
  if (!core.length) return { category: '', base: '' };

  const category = core[0] ?? '';
  const tail = core[core.length - 1] ?? '';
  const base = tail.replace(/\.[^.]+$/, '');
  return { category, base };
}

function resolveRuntimeSpriteKey(categories: readonly string[], id: string): string | null {
  const inventory = Sprites.lists().all;
  if (!Array.isArray(inventory) || inventory.length === 0) return null;

  const categorySet = new Set(categories.map((cat) => normalizeToken(cat)));
  const targetId = normalizeToken(id);
  const matches: string[] = [];

  for (const key of inventory) {
    const parsed = parseSpriteKey(key);
    const keyCategory = normalizeToken(parsed.category);
    const keyBase = normalizeToken(parsed.base);
    if (!categorySet.has(keyCategory)) continue;
    if (keyBase !== targetId) continue;
    matches.push(key);
  }

  if (!matches.length) return null;
  matches.sort((a, b) => a.length - b.length || a.localeCompare(b));
  return matches[0] ?? null;
}

function getRuntimeSpriteUrl(categories: readonly string[], id: string): string {
  const resolvedKey = resolveRuntimeSpriteKey(categories, id);
  if (!resolvedKey) return '';
  return getAnySpriteDataUrl(resolvedKey) || '';
}

function buildIconElement(icon: ToolIcon): HTMLElement {
  const iconEl = document.createElement('div');
  iconEl.style.cssText = 'font-size:28px;line-height:1;flex-shrink:0;user-select:none;display:flex;align-items:center;justify-content:center;width:30px;height:30px;';

  if (icon.kind === 'emoji') {
    iconEl.textContent = icon.value;
    return iconEl;
  }

  const src = icon.kind === 'asset'
    ? icon.url
    : getRuntimeSpriteUrl(icon.categories, icon.id);

  if (!src) {
    iconEl.textContent = icon.fallbackEmoji;
    return iconEl;
  }

  const img = document.createElement('img');
  img.src = src;
  img.alt = '';
  img.style.cssText = [
    'width:28px',
    'height:28px',
    'object-fit:contain',
    icon.pixelated ? 'image-rendering:pixelated' : 'image-rendering:auto',
  ].join(';');
  iconEl.appendChild(img);
  return iconEl;
}

function openExternalUrl(url: string): void {
  const gmOpen = (globalThis as any).GM_openInTab || (globalThis as any).GM?.openInTab;
  if (typeof gmOpen === 'function') {
    try {
      gmOpen(url, { active: true, insert: true, setParent: true });
      return;
    } catch (error) {
      log('GM_openInTab failed in Tools Hub, falling back', error);
    }
  }

  const win = window.open(url, '_blank', 'noopener,noreferrer');
  if (!win) window.location.href = url;
}

function openGuideWindow(): void {
  toggleWindow(
    'tools-guide',
    '\u{1F4D6} Guide',
    (windowRoot) => {
      windowRoot.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0;overflow-y:auto;padding:12px;';
      windowRoot.appendChild(createGuideSection());
    },
    '1020px',
    '90vh',
  );
}

function openTool(tool: ToolDef): void {
  if (tool.kind === 'guide') {
    openGuideWindow();
    return;
  }
  openExternalUrl(tool.url);
}

function buildToolCard(tool: ToolDef): HTMLElement {
  const card = document.createElement('div');
  card.style.cssText = [
    'border:1px solid rgba(143,130,255,0.18)',
    'background:rgba(255,255,255,0.03)',
    'border-radius:10px',
    'padding:14px 16px',
    'display:flex',
    'align-items:center',
    'gap:14px',
    'transition:border-color 0.15s,background 0.15s',
  ].join(';');
  card.addEventListener('mouseenter', () => {
    card.style.background = 'rgba(143,130,255,0.06)';
    card.style.borderColor = 'rgba(143,130,255,0.35)';
  });
  card.addEventListener('mouseleave', () => {
    card.style.background = 'rgba(255,255,255,0.03)';
    card.style.borderColor = 'rgba(143,130,255,0.18)';
  });

  const info = document.createElement('div');
  info.style.cssText = 'flex:1;min-width:0;';

  const nameEl = document.createElement('div');
  nameEl.style.cssText = 'font-size:14px;font-weight:600;color:#e0e0e0;margin-bottom:3px;';
  nameEl.textContent = tool.label;

  const descEl = document.createElement('div');
  descEl.style.cssText = 'font-size:11px;color:rgba(224,224,224,0.45);line-height:1.5;';
  descEl.textContent = tool.desc;

  info.append(nameEl, descEl);

  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.textContent = 'Open \u2192';
  openBtn.style.cssText = [
    'padding:6px 12px',
    'font-size:12px',
    'border:1px solid rgba(143,130,255,0.3)',
    'border-radius:6px',
    'background:rgba(143,130,255,0.12)',
    'color:#c8c0ff',
    'cursor:pointer',
    'white-space:nowrap',
    'flex-shrink:0',
    'transition:background 0.15s,border-color 0.15s',
  ].join(';');
  openBtn.addEventListener('mouseenter', () => {
    openBtn.style.background = 'rgba(143,130,255,0.24)';
    openBtn.style.borderColor = 'rgba(143,130,255,0.55)';
  });
  openBtn.addEventListener('mouseleave', () => {
    openBtn.style.background = 'rgba(143,130,255,0.12)';
    openBtn.style.borderColor = 'rgba(143,130,255,0.3)';
  });
  openBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openTool(tool);
  });

  card.append(buildIconElement(tool.icon), info, openBtn);
  card.addEventListener('click', () => openTool(tool));
  return card;
}

function buildCustomizeOverlay(
  container: HTMLElement,
  onClose: () => void,
  onSave: (selected: ToolKey[]) => void,
): HTMLElement {
  const overlay = document.createElement('div');
  overlay.style.cssText = [
    'position:absolute',
    'inset:0',
    'z-index:20',
    'pointer-events:none',
  ].join(';');

  const panel = document.createElement('div');
  panel.style.cssText = [
    'position:absolute',
    'inset:0 18px 18px 0',
    'background:rgba(10,12,18,0.97)',
    'display:flex',
    'flex-direction:column',
    'padding:20px',
    'gap:10px',
    'min-height:0',
    'box-sizing:border-box',
    'pointer-events:auto',
  ].join(';');
  overlay.appendChild(panel);

  const title = document.createElement('div');
  title.style.cssText = 'font-size:15px;font-weight:700;color:#e0e0e0;';
  title.textContent = '\u2699 Customize Cards';
  panel.appendChild(title);

  const subtext = document.createElement('div');
  subtext.style.cssText = 'font-size:12px;color:rgba(224,224,224,0.45);margin-bottom:4px;';
  subtext.textContent = 'Select which tool cards to show in the Tools hub.';
  panel.appendChild(subtext);

  const list = document.createElement('div');
  list.style.cssText = 'display:flex;flex-direction:column;gap:10px;flex:1;min-height:0;overflow-y:auto;padding-right:2px;';
  panel.appendChild(list);

  const current = loadVisibleTools();
  const checkboxes = new Map<ToolKey, HTMLInputElement>();

  for (const tool of TOOL_DEFS) {
    const row = document.createElement('label');
    row.style.cssText = [
      'display:flex',
      'align-items:center',
      'gap:10px',
      'padding:10px 12px',
      'border-radius:8px',
      'border:1px solid rgba(143,130,255,0.14)',
      'background:rgba(255,255,255,0.03)',
      'cursor:pointer',
      'transition:background 0.12s',
    ].join(';');
    row.addEventListener('mouseenter', () => { row.style.background = 'rgba(143,130,255,0.07)'; });
    row.addEventListener('mouseleave', () => { row.style.background = 'rgba(255,255,255,0.03)'; });

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = current.includes(tool.key);
    cb.style.cssText = 'accent-color:#8f82ff;width:16px;height:16px;cursor:pointer;flex-shrink:0;';

    const icon = buildIconElement(tool.icon);
    icon.style.cssText += ';font-size:18px;width:20px;height:20px;';

    const labelText = document.createElement('span');
    labelText.style.cssText = 'font-size:13px;color:#e0e0e0;flex:1;';
    labelText.textContent = tool.label;

    row.append(cb, icon, labelText);
    list.appendChild(row);
    checkboxes.set(tool.key, cb);
  }

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:8px;padding-top:8px;flex-shrink:0;';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = [
    'flex:1', 'padding:9px', 'border-radius:7px', 'cursor:pointer',
    'background:rgba(255,255,255,0.05)', 'border:1px solid rgba(255,255,255,0.1)',
    'color:rgba(224,224,224,0.65)', 'font-size:13px',
  ].join(';');

  let onKey: ((e: KeyboardEvent) => void) | null = null;
  const closeWithCleanup = () => {
    if (onKey) document.removeEventListener('keydown', onKey);
    onClose();
  };
  cancelBtn.addEventListener('click', closeWithCleanup);

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.textContent = 'Save';
  saveBtn.style.cssText = [
    'flex:1', 'padding:9px', 'border-radius:7px', 'cursor:pointer',
    'background:rgba(143,130,255,0.2)', 'border:1px solid rgba(143,130,255,0.4)',
    'color:#c8c0ff', 'font-size:13px', 'font-weight:600',
  ].join(';');
  saveBtn.addEventListener('click', () => {
    const selected = TOOL_DEFS
      .map((tool) => tool.key)
      .filter((key) => checkboxes.get(key)?.checked) as ToolKey[];
    if (onKey) document.removeEventListener('keydown', onKey);
    onSave(selected);
  });

  btnRow.append(cancelBtn, saveBtn);
  panel.appendChild(btnRow);

  onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeWithCleanup();
  };
  document.addEventListener('keydown', onKey);

  void container;
  return overlay;
}

function renderToolsHub(root: HTMLElement): void {
  root.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0;position:relative;';

  const header = document.createElement('div');
  header.style.cssText = [
    'display:flex',
    'align-items:center',
    'padding:12px 14px 10px',
    'border-bottom:1px solid rgba(143,130,255,0.2)',
    'flex-shrink:0',
    'gap:8px',
  ].join(';');

  const headerTitle = document.createElement('span');
  headerTitle.style.cssText = 'font-size:13px;font-weight:600;color:rgba(224,224,224,0.8);flex:1;';
  headerTitle.textContent = 'Tools';

  const customizeBtn = document.createElement('button');
  customizeBtn.type = 'button';
  customizeBtn.textContent = '\u2699 Customize';
  customizeBtn.style.cssText = [
    'padding:5px 11px',
    'font-size:11px',
    'border:1px solid rgba(143,130,255,0.28)',
    'border-radius:5px',
    'background:rgba(143,130,255,0.1)',
    'color:rgba(200,192,255,0.85)',
    'cursor:pointer',
    'transition:background 0.15s',
  ].join(';');
  customizeBtn.addEventListener('mouseenter', () => { customizeBtn.style.background = 'rgba(143,130,255,0.2)'; });
  customizeBtn.addEventListener('mouseleave', () => { customizeBtn.style.background = 'rgba(143,130,255,0.1)'; });

  header.append(headerTitle, customizeBtn);
  root.appendChild(header);

  const cardsArea = document.createElement('div');
  cardsArea.style.cssText = [
    'flex:1',
    'overflow-y:auto',
    'padding:14px',
    'display:flex',
    'flex-direction:column',
    'gap:10px',
  ].join(';');
  root.appendChild(cardsArea);

  let overlayEl: HTMLElement | null = null;

  const renderCards = () => {
    cardsArea.innerHTML = '';
    const visible = loadVisibleTools();
    const visibleTools = TOOL_DEFS.filter((tool) => visible.includes(tool.key));

    if (!visibleTools.length) {
      const empty = document.createElement('div');
      empty.style.cssText =
        'text-align:center;color:rgba(224,224,224,0.35);font-size:13px;padding:40px 20px;line-height:1.6;';
      empty.textContent = 'No cards selected.\nClick \u2699 Customize to add tool cards.';
      cardsArea.appendChild(empty);
      return;
    }

    for (const tool of visibleTools) {
      cardsArea.appendChild(buildToolCard(tool));
    }
  };

  const closeOverlay = () => {
    overlayEl?.remove();
    overlayEl = null;
  };

  const openOverlay = () => {
    if (overlayEl) { closeOverlay(); return; }
    overlayEl = buildCustomizeOverlay(root, closeOverlay, (selected) => {
      storage.set(VISIBLE_TOOLS_KEY, selected);
      closeOverlay();
      renderCards();
    });
    root.appendChild(overlayEl);
  };

  const stopSpritesReady = onSpritesReady(() => {
    renderCards();
  });

  const detachObserver = new MutationObserver(() => {
    if (root.isConnected) return;
    detachObserver.disconnect();
    stopSpritesReady();
  });
  detachObserver.observe(document.body, { childList: true, subtree: true });

  customizeBtn.addEventListener('click', openOverlay);
  renderCards();
}

export function openToolsHubWindow(): void {
  toggleWindow('tools-hub', '\u{1F9F0} Tools', renderToolsHub, '520px', '90vh');
}

/** Open the guide window. Used by window persistence. */
export { openGuideWindow };
