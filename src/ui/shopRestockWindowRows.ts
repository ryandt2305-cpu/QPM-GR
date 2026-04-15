// src/ui/shopRestockWindowRows.ts
// Prediction and history row builders for the Shop Restock window.
// Row builders receive callbacks instead of closing over render state.

import { openItemRestockDetail } from './itemRestockDetailWindow';
import { getItemName, getItemRarity, getItemPrice, getSpriteUrl, getCoinSpriteUrl } from './shopRestockWindowMeta';
import {
  rarityColor,
  rarityBorderStyle,
  formatETA,
  etaColor,
  ratePercent,
  rateColor,
  formatFrequency,
  formatAvgQty,
  formatPrice,
  formatRelative,
  formatClock,
  formatRelativeDay,
} from './shopRestockWindowFormatters';
import { getItemProbability } from '../utils/restockDataService';
import { isCelestial } from './shopRestockWindowMeta';
import { getSoundConfig } from './shopRestockAlerts/soundConfig';
import { showSoundPopover } from './shopRestockAlerts/soundPopover';
import type { RestockItem } from '../utils/restockDataService';

export type EtaRef = { el: HTMLElement; ts: number };

// ---------------------------------------------------------------------------
// Icon wrap element (shared between pred + hist rows)
// ---------------------------------------------------------------------------

export function makeIconWrap(item: RestockItem, size = 42): HTMLElement {
  const rarity  = getItemRarity(item.item_id, item.shop_type);
  const wrap    = document.createElement('div');
  const spriteSize = Math.round(size * 0.76);
  wrap.style.cssText = [
    `width:${size}px`, `height:${size}px`, 'border-radius:10px',
    'background:rgba(229,231,235,0.05)',
    rarityBorderStyle(rarity),
    'display:flex', 'align-items:center', 'justify-content:center',
    'flex-shrink:0', 'transition:border-color 0.2s',
  ].join(';');

  const url = getSpriteUrl(item);
  if (url) {
    const img = document.createElement('img');
    img.src = url;
    img.style.cssText = `width:${spriteSize}px;height:${spriteSize}px;image-rendering:pixelated;object-fit:contain;`;
    wrap.appendChild(img);
  }
  return wrap;
}

// ---------------------------------------------------------------------------
// Prediction row
// ---------------------------------------------------------------------------

export function buildPredRow(
  item: RestockItem,
  key: string,
  opts: {
    onUnpin(key: string): void;
    openDetail(item: RestockItem, name: string): void;
  },
): { row: HTMLElement; etaRef: EtaRef } {
  const ts       = item.estimated_next_timestamp ?? 0;
  const hasData  = (item.total_occurrences ?? 0) >= 2 && ts > 0;
  const rate     = getItemProbability(item);
  const rarity   = getItemRarity(item.item_id, item.shop_type);
  const cel      = isCelestial(item.item_id);

  const row = document.createElement('div');
  row.style.cssText = [
    'display:flex', 'align-items:center', 'justify-content:space-between', 'gap:12px',
    'padding:10px 12px', 'min-height:52px',
    `border:1px solid ${cel ? 'rgba(255,215,0,0.22)' : 'transparent'}`,
    `background:${cel ? 'rgba(255,215,0,0.04)' : 'color-mix(in srgb, rgba(30,30,40,0.5) 50%, transparent)'}`,
    'border-radius:10px', 'cursor:pointer',
    'transition:transform 0.15s, background 0.15s',
  ].join(';');
  row.title = 'Click to unpin';
  row.addEventListener('mouseenter', () => {
    row.style.transform  = 'scale(1.01)';
    row.style.background = cel ? 'rgba(255,215,0,0.09)' : 'rgba(255,255,255,0.06)';
  });
  row.addEventListener('mouseleave', () => {
    row.style.transform  = '';
    row.style.background = cel ? 'rgba(255,215,0,0.04)' : '';
  });

  // Left: icon-wrap + text
  const left = document.createElement('div');
  left.style.cssText = 'display:flex;align-items:center;gap:12px;min-width:0;flex:1;max-width:calc(100% - 220px);';
  left.appendChild(makeIconWrap(item, 42));

  const textBlock = document.createElement('div');
  textBlock.style.cssText = 'display:flex;flex-direction:column;gap:3px;min-width:0;';

  const nameEl = document.createElement('div');
  nameEl.style.cssText = `font-size:14px;font-weight:700;color:${rarityColor(rarity)};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`;
  nameEl.textContent = getItemName(item.item_id, item.shop_type);
  textBlock.appendChild(nameEl);

  const subEl = document.createElement('div');
  subEl.style.cssText = 'font-size:12px;opacity:0.7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
  if (!hasData) {
    const seen = item.total_occurrences ?? 0;
    subEl.textContent = seen > 0
      ? `${seen} sighting${seen !== 1 ? 's' : ''} recorded`
      : 'Not enough data';
  } else {
    subEl.textContent = item.last_seen ? `Seen ${formatRelative(item.last_seen)}` : 'Tracked';
  }
  textBlock.appendChild(subEl);
  left.appendChild(textBlock);
  row.appendChild(left);

  // Right: metrics
  const metrics = document.createElement('div');
  metrics.style.cssText = 'display:flex;gap:18px;align-items:center;flex-shrink:0;';

  const detailBtn = document.createElement('button');
  detailBtn.type = 'button';
  detailBtn.textContent = '\uD83D\uDCCA';
  detailBtn.title = 'View restock history';
  detailBtn.style.cssText = [
    'background:none', 'border:none', 'cursor:pointer',
    'font-size:14px', 'padding:2px 4px', 'opacity:0.72',
    'border-radius:4px', 'line-height:1', 'flex-shrink:0',
  ].join(';');
  detailBtn.addEventListener('mouseenter', () => { detailBtn.style.opacity = '1'; });
  detailBtn.addEventListener('mouseleave', () => { detailBtn.style.opacity = '0.72'; });
  detailBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    opts.openDetail(item, getItemName(item.item_id, item.shop_type));
  });
  metrics.appendChild(detailBtn);

  // Sound config button
  const hasSoundCfg = getSoundConfig(key) !== null;
  const soundBtn = document.createElement('button');
  soundBtn.type = 'button';
  soundBtn.textContent = hasSoundCfg ? '\uD83D\uDD14' : '\uD83D\uDD15'; // 🔔 / 🔕
  soundBtn.title = hasSoundCfg ? 'Sound alert configured' : 'Configure sound alert';
  soundBtn.style.cssText = [
    'background:none', 'border:none', 'cursor:pointer',
    'font-size:14px', 'padding:2px 4px',
    `opacity:${hasSoundCfg ? '0.9' : '0.45'}`,
    'border-radius:4px', 'line-height:1', 'flex-shrink:0',
  ].join(';');
  soundBtn.addEventListener('mouseenter', () => { soundBtn.style.opacity = '1'; });
  soundBtn.addEventListener('mouseleave', () => { soundBtn.style.opacity = hasSoundCfg ? '0.9' : '0.45'; });
  soundBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showSoundPopover(soundBtn, key, () => {
      // Update icon after save/clear
      const nowHasCfg = getSoundConfig(key) !== null;
      soundBtn.textContent = nowHasCfg ? '\uD83D\uDD14' : '\uD83D\uDD15';
      soundBtn.style.opacity = nowHasCfg ? '0.9' : '0.45';
    });
  });
  metrics.appendChild(soundBtn);

  if (!hasData) {
    const dash = document.createElement('div');
    dash.style.cssText = 'font-size:20px;color:#f87171;';
    dash.textContent = '--';
    metrics.appendChild(dash);
    row.addEventListener('click', () => { opts.onUnpin(key); });
    row.appendChild(metrics);
    return { row, etaRef: { el: document.createElement('span'), ts: 0 } };
  }

  const etaLabel = formatETA(ts);
  const etaCol   = etaColor(ts);

  const etaWrap = document.createElement('div');
  etaWrap.style.cssText = 'display:flex;flex-direction:column;align-items:flex-end;min-width:68px;width:68px;position:relative;';
  const etaEl = document.createElement('div');
  etaEl.style.cssText = `font-size:19px;font-weight:700;color:${etaCol};font-variant-numeric:tabular-nums;letter-spacing:-0.3px;line-height:1.15;white-space:nowrap;`;
  etaEl.textContent = etaLabel;
  const etaLbl = document.createElement('div');
  etaLbl.style.cssText = 'font-size:10px;opacity:0.5;text-transform:uppercase;letter-spacing:0.5px;';
  etaLbl.textContent = 'next';
  etaWrap.append(etaEl, etaLbl);
  metrics.appendChild(etaWrap);

  const freqLine  = formatFrequency(rate, item.shop_type);
  const avgLine   = formatAvgQty(item.average_quantity);
  const tooltipTx = [avgLine, freqLine].filter(Boolean).join('\n');

  const rateWrap = document.createElement('div');
  rateWrap.className = 'qpm-sr-metric';
  rateWrap.style.cssText = 'display:flex;flex-direction:column;align-items:flex-end;min-width:70px;width:70px;position:relative;cursor:help;';
  if (tooltipTx) rateWrap.dataset.tooltip = tooltipTx;
  const rateEl = document.createElement('div');
  rateEl.style.cssText = `font-size:19px;font-weight:700;color:${rateColor(rate)};font-variant-numeric:tabular-nums;letter-spacing:-0.3px;line-height:1.15;white-space:nowrap;`;
  rateEl.textContent = ratePercent(rate);
  const rateLbl = document.createElement('div');
  rateLbl.style.cssText = 'font-size:10px;opacity:0.5;text-transform:uppercase;letter-spacing:0.5px;';
  rateLbl.textContent = 'rate';
  rateWrap.append(rateEl, rateLbl);
  metrics.appendChild(rateWrap);

  row.appendChild(metrics);
  row.addEventListener('click', () => { opts.onUnpin(key); });
  return { row, etaRef: { el: etaEl, ts } };
}

// ---------------------------------------------------------------------------
// History table row
// ---------------------------------------------------------------------------

export function buildHistRow(
  item: RestockItem,
  key: string,
  opts: {
    onPin(key: string): void;
    openDetail(item: RestockItem, name: string): void;
  },
): { row: HTMLElement } {
  const rarity = getItemRarity(item.item_id, item.shop_type);
  const price  = getItemPrice(item.item_id, item.shop_type);
  const cel    = isCelestial(item.item_id);

  const tr = document.createElement('tr');
  tr.className = 'qpm-sr-tr';
  tr.title = 'Click to pin to predictions';
  if (cel) tr.style.background = 'rgba(255,215,0,0.025)';

  // Item cell: icon-wrap (42px) + name (rarity color) + price
  const itemTd = document.createElement('td');
  itemTd.style.cssText = 'padding:8px 12px;';
  const itemCell = document.createElement('div');
  itemCell.style.cssText = 'display:flex;align-items:center;gap:12px;padding:4px 0;';
  itemCell.appendChild(makeIconWrap(item, 42));

  const itemInfo = document.createElement('div');
  itemInfo.style.cssText = 'display:flex;flex-direction:column;justify-content:center;gap:3px;min-width:0;';
  const nameEl = document.createElement('div');
  nameEl.style.cssText = `font-weight:700;font-size:14px;color:${rarityColor(rarity)};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.2;`;
  nameEl.textContent = getItemName(item.item_id, item.shop_type);
  itemInfo.appendChild(nameEl);

  if (price > 0) {
    const priceRow = document.createElement('div');
    priceRow.style.cssText = 'font-size:12px;opacity:0.9;display:flex;align-items:center;gap:3px;line-height:1;';
    const coinSrc = getCoinSpriteUrl();
    const coinSpan = coinSrc ? document.createElement('img') : document.createElement('span');
    if (coinSrc && coinSpan instanceof HTMLImageElement) {
      coinSpan.src = coinSrc;
      coinSpan.alt = 'Coin';
      coinSpan.style.cssText = 'width:11px;height:11px;object-fit:contain;image-rendering:auto;opacity:0.95;';
    } else {
      coinSpan.style.cssText = `color:#FFC734;font-weight:700;font-size:11px;`;
      coinSpan.textContent = 'C';
    }
    const priceSpan = document.createElement('span');
    priceSpan.style.cssText = `color:#FFC734;font-weight:700;`;
    priceSpan.textContent = formatPrice(price);
    priceRow.append(coinSpan, priceSpan);
    itemInfo.appendChild(priceRow);
  }
  itemCell.appendChild(itemInfo);
  itemTd.appendChild(itemCell);

  // Qty cell
  const qtyTd = document.createElement('td');
  qtyTd.style.cssText = 'padding:8px 12px;text-align:center;font-variant-numeric:tabular-nums;font-weight:600;opacity:0.9;';
  qtyTd.textContent = formatPrice(item.total_quantity ?? 0);

  // Last seen cell
  const lastTd = document.createElement('td');
  lastTd.title = item.last_seen ? new Date(item.last_seen).toLocaleString() : '--';
  const timeCell = document.createElement('div');
  timeCell.style.cssText = 'display:flex;flex-direction:column;align-items:flex-end;font-variant-numeric:tabular-nums;font-weight:600;opacity:0.9;line-height:1.1;white-space:nowrap;padding:8px 12px;';
  const clockEl = document.createElement('div');
  clockEl.textContent = formatClock(item.last_seen);
  const relDay = formatRelativeDay(item.last_seen);
  timeCell.appendChild(clockEl);
  if (relDay) {
    const relEl = document.createElement('div');
    relEl.style.cssText = 'opacity:0.7;font-size:11px;';
    relEl.textContent = relDay;
    timeCell.appendChild(relEl);
  }
  lastTd.appendChild(timeCell);

  const detailTd = document.createElement('td');
  detailTd.style.cssText = 'padding:8px 6px;text-align:center;';
  const detailBtn = document.createElement('button');
  detailBtn.textContent = '\uD83D\uDCCA';
  detailBtn.title = 'View restock history';
  detailBtn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:14px;padding:2px 4px;opacity:0.6;border-radius:4px;line-height:1;';
  detailBtn.addEventListener('mouseenter', () => { detailBtn.style.opacity = '1'; });
  detailBtn.addEventListener('mouseleave', () => { detailBtn.style.opacity = '0.6'; });
  detailBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    opts.openDetail(item, getItemName(item.item_id, item.shop_type));
  });
  detailTd.appendChild(detailBtn);

  tr.append(itemTd, qtyTd, lastTd, detailTd);
  tr.addEventListener('click', () => { opts.onPin(key); });

  return { row: tr };
}
