// src/ui/shopHistoryWindow.ts — shop history modal renderer
import { type ShopCategoryKey } from '../store/stats';

export async function renderShopHistoryWindow(root: HTMLElement): Promise<void> {
  root.style.cssText = 'display: flex; flex-direction: column; gap: 12px; min-width: 800px; max-width: 1000px;';

  const { getStatsSnapshot } = await import('../store/stats');
  const stats = getStatsSnapshot();

  // Header with summary
  const header = document.createElement('div');
  header.style.cssText = 'display: flex; justify-content: space-between; align-items: flex-start; padding: 12px 16px; background: linear-gradient(135deg, rgba(255, 152, 0, 0.15), rgba(255, 152, 0, 0.05)); border-radius: 8px; border: 1px solid rgba(255, 152, 0, 0.3);';

  const summaryLeft = document.createElement('div');
  summaryLeft.style.cssText = 'display: flex; flex-direction: column; gap: 6px;';

  const totalPurchasesRow = document.createElement('div');
  totalPurchasesRow.style.cssText = 'font-size: 13px; font-weight: 600; color: #4CAF50;';
  totalPurchasesRow.textContent = `✅ Total Purchases: ${stats.shop.totalPurchases}`;
  summaryLeft.appendChild(totalPurchasesRow);

  const totalFailuresRow = document.createElement('div');
  totalFailuresRow.style.cssText = 'font-size: 13px; font-weight: 600; color: #ef5350;';
  totalFailuresRow.textContent = `❌ Total Failures: ${stats.shop.totalFailures || 0}`;
  summaryLeft.appendChild(totalFailuresRow);

  const summaryRight = document.createElement('div');
  summaryRight.style.cssText = 'display: flex; flex-direction: column; gap: 4px; text-align: right;';

  const coinsRow = document.createElement('div');
  coinsRow.style.cssText = 'font-size: 12px; color: #FFD700;';
  coinsRow.textContent = `💰 ${stats.shop.totalSpentCoins.toLocaleString()} coins spent`;
  summaryRight.appendChild(coinsRow);

  if (stats.shop.totalSpentCredits > 0) {
    const creditsRow = document.createElement('div');
    creditsRow.style.cssText = 'font-size: 12px; color: #64B5F6;';
    creditsRow.textContent = `💎 ${stats.shop.totalSpentCredits.toLocaleString()} credits spent`;
    summaryRight.appendChild(creditsRow);
  }

  header.append(summaryLeft, summaryRight);
  root.appendChild(header);

  // Category breakdown
  const categoryBreakdown = document.createElement('div');
  categoryBreakdown.style.cssText = 'display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;';

  const categories: Array<{ key: ShopCategoryKey; icon: string; label: string }> = [
    { key: 'seeds', icon: '🌱', label: 'Seeds' },
    { key: 'eggs', icon: '🥚', label: 'Eggs' },
    { key: 'tools', icon: '🔧', label: 'Tools' },
    { key: 'decor', icon: '🎨', label: 'Decor' },
  ];

  for (const cat of categories) {
    const catCard = document.createElement('div');
    catCard.style.cssText = 'padding: 8px; background: rgba(255, 255, 255, 0.05); border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.1);';

    const catHeader = document.createElement('div');
    catHeader.style.cssText = 'font-size: 11px; font-weight: 600; color: #ccc; margin-bottom: 4px;';
    catHeader.textContent = `${cat.icon} ${cat.label}`;

    const catPurchases = document.createElement('div');
    catPurchases.style.cssText = 'font-size: 10px; color: #4CAF50;';
    catPurchases.textContent = `✓ ${stats.shop.purchasesByCategory[cat.key] || 0} purchases`;

    const catFailures = document.createElement('div');
    catFailures.style.cssText = 'font-size: 10px; color: #ef5350;';
    catFailures.textContent = `✗ ${stats.shop.failuresByCategory?.[cat.key] || 0} failures`;

    catCard.append(catHeader, catPurchases, catFailures);
    categoryBreakdown.appendChild(catCard);
  }
  root.appendChild(categoryBreakdown);

  // History table with toggle for full history
  const historySection = document.createElement('div');
  historySection.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

  // Header row with title and toggle button
  const historyHeaderRow = document.createElement('div');
  historyHeaderRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding-bottom: 4px; border-bottom: 2px solid rgba(255, 152, 0, 0.3);';

  const historyHeader = document.createElement('div');
  historyHeader.style.cssText = 'font-size: 13px; font-weight: 700; color: #FF9800;';
  historyHeader.textContent = 'Recent Purchase History';

  // Toggle button for full history
  let showFullHistory = false;
  const toggleButton = document.createElement('button');
  toggleButton.style.cssText = 'padding: 4px 12px; font-size: 11px; font-weight: 600; background: rgba(255, 152, 0, 0.2); color: #FF9800; border: 1px solid rgba(255, 152, 0, 0.4); border-radius: 4px; cursor: pointer; transition: all 0.2s;';
  toggleButton.textContent = 'Show Full History';
  toggleButton.onmouseover = () => {
    toggleButton.style.background = 'rgba(255, 152, 0, 0.3)';
    toggleButton.style.borderColor = 'rgba(255, 152, 0, 0.6)';
  };
  toggleButton.onmouseout = () => {
    toggleButton.style.background = 'rgba(255, 152, 0, 0.2)';
    toggleButton.style.borderColor = 'rgba(255, 152, 0, 0.4)';
  };

  historyHeaderRow.append(historyHeader, toggleButton);
  historySection.appendChild(historyHeaderRow);

  const historyList = document.createElement('div');
  historyList.style.cssText = 'display: flex; flex-direction: column; gap: 6px; max-height: 400px; overflow-y: auto; padding-right: 8px;';

  function renderHistoryEntries() {
    // Clear existing entries
    historyList.innerHTML = '';

    if (!stats.shop.history || stats.shop.history.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.style.cssText = 'font-size: 11px; color: #888; font-style: italic; padding: 16px; text-align: center;';
      emptyMsg.textContent = 'No purchase history yet.';
      historyList.appendChild(emptyMsg);
      return;
    }

    // Show history in reverse order (most recent first)
    const sortedHistory = [...stats.shop.history].reverse();
    const displayHistory = showFullHistory ? sortedHistory : sortedHistory.slice(0, 12);

    for (const entry of displayHistory) {
      const entryCard = document.createElement('div');
      entryCard.style.cssText = `
        padding: 10px;
        background: ${entry.success ? 'rgba(76, 175, 80, 0.08)' : 'rgba(239, 83, 80, 0.08)'};
        border-left: 3px solid ${entry.success ? '#4CAF50' : '#ef5350'};
        border-radius: 4px;
        font-size: 11px;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
      `;

      const entryLeft = document.createElement('div');
      entryLeft.style.cssText = 'flex: 1; display: flex; flex-direction: column; gap: 4px;';

      const itemRow = document.createElement('div');
      itemRow.style.cssText = 'font-weight: 600; color: #fff;';
      const statusIcon = entry.success ? '✅' : '❌';
      const categoryIcons: Record<string, string> = { seeds: '🌱', eggs: '🥚', tools: '🔧', decor: '🎨' };
      itemRow.textContent = `${statusIcon} ${categoryIcons[entry.category] || ''} ${entry.itemName}`;

      const detailRow = document.createElement('div');
      detailRow.style.cssText = 'color: #bbb; font-size: 10px;';
      if (entry.success) {
        const parts = [`×${entry.count}`];
        if (entry.coins > 0) parts.push(`💰 ${entry.coins.toLocaleString()} coins`);
        if (entry.credits > 0) parts.push(`💎 ${entry.credits.toLocaleString()} credits`);
        detailRow.textContent = parts.join(' • ');
      } else {
        detailRow.textContent = `Reason: ${entry.failureReason || 'Unknown'}`;
        detailRow.style.color = '#ff8a80';
      }

      entryLeft.append(itemRow, detailRow);

      const entryRight = document.createElement('div');
      entryRight.style.cssText = 'text-align: right; font-size: 10px; color: #888;';
      const date = new Date(entry.timestamp);
      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const dateStr = date.toLocaleDateString();
      entryRight.textContent = `${timeStr}\n${dateStr}`;
      entryRight.style.whiteSpace = 'pre-line';

      entryCard.append(entryLeft, entryRight);
      historyList.appendChild(entryCard);
    }

    // Update header to show count when in full history mode
    if (showFullHistory && sortedHistory.length > 12) {
      historyHeader.textContent = `Full Purchase History (${sortedHistory.length} entries)`;
    } else {
      historyHeader.textContent = 'Recent Purchase History';
    }
  }

  // Toggle button click handler
  toggleButton.onclick = () => {
    showFullHistory = !showFullHistory;
    toggleButton.textContent = showFullHistory ? 'Show Recent Only' : 'Show Full History';
    renderHistoryEntries();
  };

  // Initial render
  renderHistoryEntries();

  historySection.appendChild(historyList);
  root.appendChild(historySection);
}
