// src/ui/sections/statsHeaderSection.ts — Dashboard stats header section
import { type UIState } from '../panelState';
import { ensureTurtleTimerConfig, updateTurtleTimerViews } from '../turtleTimerLogic';
import { btn, parseFocusTargetKey, formatDurationPretty } from '../panelHelpers';
import {
  onTurtleTimerState,
  setTurtleTimerEnabled,
  configureTurtleTimer,
  getTurtleTimerState,
} from '../../features/turtleTimer.ts';
import type { TurtleTimerState } from '../../features/turtleTimer.ts';
import { calculateItemStats, initializeRestockTracker, onRestockUpdate } from '../../features/shopRestockTracker';
import { startLiveShopTracking } from '../../features/shopRestockLiveTracker';
import { canvasToDataUrl } from '../../utils/canvasHelpers';
import { getCropSpriteCanvas, getPetSpriteCanvas, onSpritesReady } from '../../sprite-v2/compat';
import { log } from '../../utils/logger';

function createMinimalCard(icon: string, title: string, bgColor: string): HTMLElement {
  const card = document.createElement('div');
  card.style.cssText = `padding:8px 10px;border-radius:6px;background:${bgColor};border:1px solid ${bgColor.replace('0.15', '0.25')};display:flex;flex-direction:column;gap:4px;`;

  const header = document.createElement('div');
  header.className = 'indicator-header';
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:2px;';

  const titleEl = document.createElement('div');
  titleEl.style.cssText = 'font-size:11px;font-weight:600;color:#b0b0b0;letter-spacing:0.3px;';
  titleEl.textContent = `${icon} ${title}`;

  header.appendChild(titleEl);
  card.appendChild(header);

  return card;
}

export function createStatsHeader(
  uiState: UIState,
  cfg: any,
  saveCfg: () => void,
  resetAllStats: () => void,
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'qpm-card';
  container.dataset.qpmSection = 'header';
  container.style.cssText = 'background: linear-gradient(135deg, rgba(143,130,255,0.08), rgba(143,130,255,0.03)); border: 1px solid rgba(143,130,255,0.15);';

  const headerRow = document.createElement('div');
  headerRow.className = 'qpm-card__header';

  const headerTitle = document.createElement('div');
  headerTitle.className = 'qpm-card__title';
  headerTitle.textContent = 'Session Overview';
  headerTitle.style.cssText = 'font-size: 14px; font-weight: 700; letter-spacing: 0.3px;';

  const resetButton = btn('♻ Reset Stats', resetAllStats);
  resetButton.classList.add('qpm-button--accent');
  resetButton.style.fontSize = '11px';
  resetButton.title = 'Reset header and detailed stats counters';

  headerRow.append(headerTitle, resetButton);
  container.appendChild(headerRow);

  // Create indicators grid - clean, minimal cards
  const indicatorsGrid = document.createElement('div');
  indicatorsGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-top:10px;';
  container.appendChild(indicatorsGrid);

  // === Bella's Turtle Temple Indicator ===
  const turtleCfg = ensureTurtleTimerConfig(cfg);
  const turtleCard = createMinimalCard('🐢', 'Bella\'s Turtle Temple', 'rgba(0,150,136,0.15)');

  // Enable/Disable toggle in card header
  const turtleHeader = turtleCard.querySelector('.indicator-header') as HTMLElement;
  const turtleToggle = document.createElement('button');
  turtleToggle.type = 'button';
  turtleToggle.className = 'qpm-chip';
  turtleToggle.style.cssText = 'cursor:pointer;user-select:none;font-size:9px;padding:2px 6px;';
  turtleHeader.appendChild(turtleToggle);

  // Plant name (clickable)
  const plantNameRow = document.createElement('div');
  plantNameRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:4px;cursor:pointer;padding:4px 6px;background:rgba(255,255,255,0.04);border-radius:4px;margin:4px 0;transition:background 0.2s;';
  plantNameRow.title = 'Click to select a different plant';

  const plantNameText = document.createElement('div');
  plantNameText.style.cssText = 'font-size:12px;font-weight:600;color:#e0f2f1;flex:1;';
  plantNameText.textContent = 'Loading...';
  plantNameRow.appendChild(plantNameText);

  const plantDropdownIcon = document.createElement('span');
  plantDropdownIcon.style.cssText = 'font-size:9px;color:#80cbc4;';
  plantDropdownIcon.textContent = '▼';
  plantNameRow.appendChild(plantDropdownIcon);

  turtleCard.appendChild(plantNameRow);

  // Plant selector dropdown
  const plantSelector = document.createElement('select');
  plantSelector.className = 'qpm-select';
  plantSelector.style.cssText = 'display:none;width:100%;padding:4px 6px;font-size:10px;background:rgba(0,0,0,0.3);border:1px solid rgba(0,150,136,0.3);border-radius:4px;color:#e0e0e0;margin-bottom:6px;';
  turtleCard.appendChild(plantSelector);

  const plantPlaceholder = document.createElement('option');
  plantPlaceholder.value = '';
  plantPlaceholder.textContent = 'Select a plant...';
  plantPlaceholder.disabled = true;
  plantSelector.appendChild(plantPlaceholder);

  // Toggle dropdown
  plantNameRow.addEventListener('click', (e) => {
    e.stopPropagation();
    const isHidden = plantSelector.style.display === 'none';
    plantSelector.style.display = isHidden ? 'block' : 'none';
    plantDropdownIcon.textContent = isHidden ? '▲' : '▼';
    if (isHidden) updatePlantSelectorOptions();
  });

  plantNameRow.addEventListener('mouseenter', () => {
    plantNameRow.style.background = 'rgba(255,255,255,0.08)';
  });
  plantNameRow.addEventListener('mouseleave', () => {
    plantNameRow.style.background = 'rgba(255,255,255,0.04)';
  });

  plantSelector.addEventListener('change', () => {
    const selectedKey = plantSelector.value;
    if (selectedKey) {
      const { tileId, slotIndex } = parseFocusTargetKey(selectedKey);
      cfg.turtleTimer = {
        ...ensureTurtleTimerConfig(cfg),
        focus: 'specific',
        focusTargetTileId: tileId,
        focusTargetSlotIndex: slotIndex,
      };
      saveCfg();
      configureTurtleTimer({
        focus: 'specific',
        focusTargetTileId: tileId,
        focusTargetSlotIndex: slotIndex,
      });
      plantSelector.style.display = 'none';
      plantDropdownIcon.textContent = '▼';
    }
  });

  const updatePlantSelectorOptions = () => {
    const state = getTurtleTimerState();
    while (plantSelector.options.length > 1) {
      plantSelector.remove(1);
    }
    for (const target of state.plantTargets) {
      const option = document.createElement('option');
      option.value = target.key;
      const speciesLabel = target.species ?? 'Unknown';
      const timingLabel = target.remainingMs != null ? formatDurationPretty(target.remainingMs) : 'Ready';
      option.textContent = `${speciesLabel} - ${timingLabel}`;
      plantSelector.appendChild(option);
    }
  };

  const turtleStatus = document.createElement('div');
  turtleStatus.style.cssText = 'font-size:11px;color:#e0f2f1;font-weight:500;margin-bottom:2px;';
  turtleCard.appendChild(turtleStatus);

  const turtleDetail = document.createElement('div');
  turtleDetail.style.cssText = 'font-size:10px;color:#b2dfdb;line-height:1.4;';
  turtleCard.appendChild(turtleDetail);

  const turtleFooter = document.createElement('div');
  turtleFooter.style.cssText = 'font-size:9px;color:#80cbc4;margin-top:4px;';
  turtleCard.appendChild(turtleFooter);

  // Boardwalk checkbox removed (no longer needed)

  turtleToggle.addEventListener('click', () => {
    const nextEnabled = !(cfg.turtleTimer?.enabled ?? true);
    cfg.turtleTimer = { ...ensureTurtleTimerConfig(cfg), enabled: nextEnabled };
    saveCfg();
    setTurtleTimerEnabled(nextEnabled);
  });

  uiState.turtleStatus = turtleStatus;
  uiState.turtleDetail = turtleDetail;
  uiState.turtleFooter = turtleFooter;
  uiState.turtleEnableButtons.push(turtleToggle);

  uiState.turtlePlantNameText = plantNameText;

  if (uiState.turtleUnsubscribe) {
    uiState.turtleUnsubscribe();
  }
  uiState.turtleUnsubscribe = onTurtleTimerState((snapshot: TurtleTimerState) => {
    updateTurtleTimerViews(uiState, snapshot);
  });

  indicatorsGrid.appendChild(turtleCard);

  // === Shop Restock Tracker Cards ===
  const shopRestockTitle = document.createElement('div');
  shopRestockTitle.style.cssText = 'font-size:12px;font-weight:600;color:#64b5f6;margin-top:16px;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;';
  shopRestockTitle.textContent = '🏪 Shop Restock Tracker';
  container.appendChild(shopRestockTitle);

  const shopRestockGrid = document.createElement('div');
  shopRestockGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;';
  container.appendChild(shopRestockGrid);

  const trackedShopItems = [
    { name: 'Starweaver', emoji: '⭐', color: 'rgba(255,215,0,0.2)', textColor: '#FFD700' },
    { name: 'Dawnbinder', emoji: '🌅', color: 'rgba(255,152,0,0.2)', textColor: '#FF9800' },
    { name: 'Moonbinder', emoji: '🌙', color: 'rgba(156,39,176,0.2)', textColor: '#CE93D8' },
    { name: 'Mythical Eggs', emoji: '🥚', color: 'rgba(66,165,245,0.2)', textColor: '#42A5F5' },
  ];

  const formatDaysAgo = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor(diff / (1000 * 60));

    if (days > 0) {
      return days === 1 ? '1 day ago' : `${days} days ago`;
    } else if (hours > 0) {
      return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
    } else if (minutes > 0) {
      return minutes === 1 ? '1 min ago' : `${minutes} mins ago`;
    } else {
      return 'Just now';
    }
  };

  const updateShopRestockCards = () => {
    // Clear existing cards
    shopRestockGrid.innerHTML = '';

    const itemStats = calculateItemStats();

    trackedShopItems.forEach(itemConfig => {
      // Try exact match first, then fuzzy match (e.g., "Moonbinder" matches "Moonbinder Pod")
      let stat = itemStats.get(itemConfig.name);
      if (!stat) {
        // Try finding by partial match
        for (const [itemName, itemStat] of itemStats.entries()) {
          if (itemName.includes(itemConfig.name) || itemConfig.name.includes(itemName)) {
            stat = itemStat;
            break;
          }
        }
      }
      const card = document.createElement('div');
      card.style.cssText = `
        padding:12px;
        background:${itemConfig.color};
        border-radius:8px;
        border:2px solid ${itemConfig.textColor}40;
        box-shadow:0 2px 8px rgba(0,0,0,0.2);
        transition:all 0.2s ease;
        cursor:default;
      `;

      // Hover effect
      card.addEventListener('mouseenter', () => {
        card.style.transform = 'translateY(-2px)';
        card.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
      });
      card.addEventListener('mouseleave', () => {
        card.style.transform = 'translateY(0)';
        card.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
      });

      // Header with sprite icon
      const header = document.createElement('div');
      header.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:8px;';

      // Get sprite based on item name
      let spriteUrl: string | null = null;
      let spriteType: 'pet' | 'crop' = 'crop';
      let spriteId = itemConfig.name;

      if (itemConfig.name === 'Mythical Eggs') {
        spriteType = 'pet';
        spriteId = 'MythicalEgg';
        spriteUrl = canvasToDataUrl(getPetSpriteCanvas('MythicalEgg'));
      } else {
        // Starweaver, Dawnbinder, Moonbinder are crops
        spriteUrl = canvasToDataUrl(getCropSpriteCanvas(itemConfig.name));
      }

      const iconContainer = document.createElement('div');
      iconContainer.style.cssText = 'width:24px;height:24px;display:flex;align-items:center;justify-content:center;flex-shrink:0;';

      // Always create img element with data attribute for sprite refresh
      const spriteImg = document.createElement('img');
      spriteImg.dataset.qpmSprite = `${spriteType}:${spriteId}`;
      spriteImg.alt = itemConfig.name;
      spriteImg.style.cssText = 'width:100%;height:100%;object-fit:contain;image-rendering:pixelated;';

      if (spriteUrl) {
        spriteImg.src = spriteUrl;
        iconContainer.appendChild(spriteImg);
      } else {
        // Show emoji initially, sprite will be loaded when ready
        spriteImg.style.display = 'none';
        iconContainer.appendChild(spriteImg);
        const emojiSpan = document.createElement('span');
        emojiSpan.textContent = itemConfig.emoji;
        emojiSpan.style.fontSize = '18px';
        emojiSpan.className = 'qpm-sprite-fallback';
        iconContainer.appendChild(emojiSpan);
      }

      const title = document.createElement('div');
      title.style.cssText = `font-size:11px;font-weight:700;color:${itemConfig.textColor};text-transform:uppercase;letter-spacing:0.5px;`;
      title.textContent = itemConfig.name;

      header.appendChild(iconContainer);
      header.appendChild(title);
      card.appendChild(header);

      if (stat && stat.lastSeen) {
        const lastSeenDate = new Date(stat.lastSeen);
        const timeString = lastSeenDate.toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });
        const dateString = lastSeenDate.toLocaleDateString([], {
          month: 'short',
          day: 'numeric',
        });
        const daysAgo = formatDaysAgo(stat.lastSeen);

        // Date and time
        const dateTimeDiv = document.createElement('div');
        dateTimeDiv.style.cssText = 'margin-bottom:4px;';

        const dateDiv = document.createElement('div');
        dateDiv.style.cssText = 'font-size:13px;color:#fff;font-weight:600;';
        dateDiv.textContent = `${dateString} ${timeString}`;
        dateTimeDiv.appendChild(dateDiv);

        card.appendChild(dateTimeDiv);

        // Days ago badge
        const daysAgoDiv = document.createElement('div');
        daysAgoDiv.style.cssText = `font-size:10px;color:${itemConfig.textColor};font-weight:600;background:rgba(0,0,0,0.2);padding:3px 8px;border-radius:4px;display:inline-block;`;
        daysAgoDiv.textContent = daysAgo;
        card.appendChild(daysAgoDiv);
      } else {
        const noDataDiv = document.createElement('div');
        noDataDiv.style.cssText = 'font-size:11px;color:#999;font-style:italic;text-align:center;padding:12px 0;';
        noDataDiv.textContent = 'No data yet';
        card.appendChild(noDataDiv);
      }

      shopRestockGrid.appendChild(card);
    });
  };

  // Initialize the shop restock tracker
  initializeRestockTracker();

  // Start live tracking (async - shop stock store initialization)
  startLiveShopTracking().catch(error => {
    log('⚠️ Failed to start live shop tracking', error);
  });

  // Subscribe to restock updates to refresh cards (with debouncing)
  let debounceTimer: number | null = null;
  if (uiState.headerRestockCleanup) {
    uiState.headerRestockCleanup();
  }
  uiState.headerRestockCleanup = onRestockUpdate(() => {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = window.setTimeout(() => {
      debounceTimer = null;
      updateShopRestockCards();
    }, 500); // Debounce 500ms to batch rapid updates
  });

  // Initial render
  updateShopRestockCards();

  // Re-render when sprites become available (they load in background)
  if (uiState.headerSpritesCleanup) {
    uiState.headerSpritesCleanup();
  }
  uiState.headerSpritesCleanup = onSpritesReady(() => {
    updateShopRestockCards();
  });

  return container;
}
