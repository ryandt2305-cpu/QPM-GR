export type ShopQuadModalId = 'seedShop' | 'toolShop' | 'eggShop' | 'decorShop';
export type ShopQuadPaneMode = 'live' | 'snapshot' | 'error';

export interface ShopQuadSurfacePaneState {
  mode: ShopQuadPaneMode;
  isActive: boolean;
  hasSnapshot: boolean;
  isStale: boolean;
  error: string | null;
  lastSnapshotAt: number | null;
}

export interface ShopQuadSurfaceRenderState {
  activePane: ShopQuadModalId | null;
  liveModalDetected: boolean;
  panes: Record<ShopQuadModalId, ShopQuadSurfacePaneState>;
}

export interface ShopQuadSurfaceOptions {
  onPaneActivate: (modalId: ShopQuadModalId) => void;
  onStop: () => void;
}

export interface ShopQuadSurfaceHandle {
  destroy: () => void;
  isMounted: () => boolean;
  getPaneRect: (modalId: ShopQuadModalId) => DOMRect | null;
  render: (
    state: ShopQuadSurfaceRenderState,
    snapshots: ReadonlyMap<ShopQuadModalId, HTMLElement>,
  ) => void;
}

interface PaneRefs {
  shell: HTMLElement;
  badge: HTMLElement;
  note: HTMLElement;
  viewport: HTMLElement;
}

const MODAL_DISPLAY_NAME: Record<ShopQuadModalId, string> = {
  seedShop: 'Seed Shop',
  toolShop: 'Tool Shop',
  eggShop: 'Egg Shop',
  decorShop: 'Decor Shop',
};

const MODAL_IDS: readonly ShopQuadModalId[] = ['seedShop', 'toolShop', 'eggShop', 'decorShop'];

function buildPane(modalId: ShopQuadModalId, parent: HTMLElement, onActivate: (id: ShopQuadModalId) => void): PaneRefs {
  const shell = document.createElement('div');
  shell.style.cssText =
    'position:relative;min-height:0;border:none;border-radius:0;background:transparent;overflow:hidden;cursor:pointer;';
  shell.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onActivate(modalId);
  });

  const header = document.createElement('div');
  header.style.cssText = 'display:none;';

  const title = document.createElement('div');
  title.textContent = MODAL_DISPLAY_NAME[modalId];
  title.style.cssText = 'font-size:11px;font-weight:700;color:#dbeafe;letter-spacing:0.2px;text-shadow:0 1px 2px rgba(2,6,23,0.7);';

  const badge = document.createElement('div');
  badge.style.cssText = 'display:none;';
  badge.textContent = 'Snapshot';

  header.append(title, badge);

  const note = document.createElement('div');
  note.style.cssText = 'display:none;';

  const viewport = document.createElement('div');
  viewport.style.cssText =
    'position:absolute;inset:0;overflow:hidden;padding:0;background:transparent;';

  shell.append(header, note, viewport);
  parent.appendChild(shell);
  return { shell, badge, note, viewport };
}

export function createShopQuadSurface(options: ShopQuadSurfaceOptions): ShopQuadSurfaceHandle {
  const root = document.createElement('div');
  root.id = 'qpm-shop-quad-surface';
  root.style.cssText =
    'position:fixed;inset:0;z-index:2147483200;background:transparent;pointer-events:auto;';
  root.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  const stopButton = document.createElement('button');
  stopButton.type = 'button';
  stopButton.textContent = 'Close Quad';
  stopButton.style.cssText =
    'position:fixed;top:8px;right:8px;z-index:2147483210;height:28px;padding:0 10px;border-radius:6px;border:1px solid rgba(251,146,60,0.45);background:rgba(194,65,12,0.25);color:#ffedd5;font-size:11px;cursor:pointer;opacity:0.86;';
  stopButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    options.onStop();
  });

  const grid = document.createElement('div');
  grid.style.cssText =
    'position:absolute;inset:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));gap:0;min-height:0;';

  const panes: Record<ShopQuadModalId, PaneRefs> = {
    seedShop: buildPane('seedShop', grid, options.onPaneActivate),
    toolShop: buildPane('toolShop', grid, options.onPaneActivate),
    eggShop: buildPane('eggShop', grid, options.onPaneActivate),
    decorShop: buildPane('decorShop', grid, options.onPaneActivate),
  };

  root.append(grid, stopButton);
  document.body.appendChild(root);

  const renderPane = (modalId: ShopQuadModalId, state: ShopQuadSurfacePaneState, snapshots: ReadonlyMap<ShopQuadModalId, HTMLElement>): void => {
    const pane = panes[modalId];
    const snapshot = snapshots.get(modalId);
    pane.viewport.innerHTML = '';

    const mountSnapshot = (): void => {
      if (!snapshot) {
        return;
      }
      const node = snapshot.cloneNode(true) as HTMLElement;
      const baseWidth = Math.max(220, Number(node.dataset.qpmQuadBaseWidth ?? '0') || node.getBoundingClientRect().width || 420);
      const baseHeight = Math.max(140, Number(node.dataset.qpmQuadBaseHeight ?? '0') || node.getBoundingClientRect().height || 520);
      const availW = Math.max(40, pane.viewport.clientWidth);
      const availH = Math.max(40, pane.viewport.clientHeight);
      const pad = 6;
      const maxW = Math.max(40, availW - pad * 2);
      const maxH = Math.max(40, availH - pad * 2);
      const scale = Math.min(maxW / baseWidth, maxH / baseHeight, 1);
      const renderedWidth = baseWidth * scale;
      const renderedHeight = baseHeight * scale;
      const left = Math.max(pad, (availW - renderedWidth) / 2);
      const top = Math.max(pad, (availH - renderedHeight) / 2);
      node.style.position = 'absolute';
      node.style.left = `${Math.round(left)}px`;
      node.style.top = `${Math.round(top)}px`;
      node.style.width = `${Math.round(baseWidth)}px`;
      node.style.height = `${Math.round(baseHeight)}px`;
      node.style.transformOrigin = 'top left';
      node.style.transform = scale < 0.999 ? `scale(${scale.toFixed(4)})` : 'none';
      node.style.pointerEvents = 'none';
      node.style.margin = '0';
      pane.viewport.appendChild(node);
    };

    if (state.mode === 'live') {
      pane.shell.style.border = 'none';
      pane.shell.style.boxShadow = 'none';
      return;
    }

    if (state.mode === 'error') {
      pane.shell.style.border = 'none';
      pane.shell.style.boxShadow = 'none';
      if (snapshot) {
        mountSnapshot();
      }
      return;
    }

    pane.shell.style.border = 'none';
    pane.shell.style.boxShadow = 'none';

    if (snapshot) {
      mountSnapshot();
    }
  };

  return {
    destroy: () => {
      root.remove();
    },
    isMounted: () => root.isConnected,
    getPaneRect: (modalId: ShopQuadModalId) => {
      const pane = panes[modalId];
      if (!pane || !pane.viewport.isConnected) {
        return null;
      }
      return pane.viewport.getBoundingClientRect();
    },
    render: (state: ShopQuadSurfaceRenderState, snapshots: ReadonlyMap<ShopQuadModalId, HTMLElement>) => {
      for (const modalId of MODAL_IDS) {
        renderPane(modalId, state.panes[modalId], snapshots);
      }
    },
  };
}
