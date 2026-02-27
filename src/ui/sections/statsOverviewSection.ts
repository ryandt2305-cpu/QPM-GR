import { subscribeToStats, getStatsSnapshot, resetStats } from '../../store/stats';
import { getMutationValueSnapshot, subscribeToMutationValueTracking, resetMutationValueTracking } from '../../features/mutationValueTracking';
import { getWeatherMutationSnapshot, subscribeToWeatherMutationTracking } from '../../features/weatherMutationTracking';
import { getAbilityDefinition } from '../../data/petAbilities';
import { createCard, btn } from '../panelHelpers';
import { log } from '../../utils/logger';

// Value-generating abilities only
const VALUE_ABILITIES = new Set([
  'GoldGranter', 'RainbowGranter',
  'ProduceScaleBoost', 'ProduceScaleBoostII',
  'ProduceRefund', 'DoubleHarvest',
  'SellBoostI', 'SellBoostII', 'SellBoostIII', 'SellBoostIV',
  'CoinFinderI', 'CoinFinderII', 'CoinFinderIII',
  'PetRefund', 'PetRefundII'
]);

export function createStatsOverviewSection(): HTMLElement {
  const { root, body } = createCard('📊 Statistics Overview', {
    subtitle: 'Session performance and value tracking',
  });
  root.dataset.qpmSection = 'stats-overview';

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const formatDurationLocal = (ms: number): string => {
    const hours = Math.floor(ms / (60 * 60 * 1000));
    const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const createStatRow = (label: string, value: string, icon: string = '•') => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #2a2a2a;font-size:11px;';
    row.innerHTML = `
      <span style="color:#888;">${icon} ${label}</span>
      <span style="color:#FFD700;font-weight:bold;">${value}</span>
    `;
    return row;
  };

  const createCategoryHeader = (title: string, icon: string) => {
    const header = document.createElement('div');
    header.style.cssText = 'font-weight:bold;font-size:13px;color:#FFD700;margin:16px 0 8px 0;padding-bottom:4px;border-bottom:2px solid #FFD700;';
    header.textContent = `${icon} ${title}`;
    return header;
  };

  const updateStats = () => {
    body.innerHTML = '';

    // Get mutation value tracking data
    const mutationData = getMutationValueSnapshot();
    const qpmStats = getStatsSnapshot();
    const weatherData = getWeatherMutationSnapshot();

    // Session Stats
    body.appendChild(createCategoryHeader('Current Session', '⏱️'));
    const sessionDuration = Date.now() - mutationData.stats.sessionStart;
    body.appendChild(createStatRow('Session Duration', formatDurationLocal(sessionDuration), '⏱️'));
    body.appendChild(createStatRow('Session Value', formatNumber(mutationData.stats.sessionValue) + ' coins', '💰'));

    const valuePerHour = sessionDuration > 0
      ? Math.round((mutationData.stats.sessionValue / sessionDuration) * (60 * 60 * 1000))
      : 0;
    body.appendChild(createStatRow('Value per Hour', formatNumber(valuePerHour) + ' coins/hr', '📊'));

    // Mutation Value Tracking
    body.appendChild(createCategoryHeader('Mutation Value', '💎'));
    body.appendChild(createStatRow('Gold Procs', mutationData.stats.goldProcs + ' (' + mutationData.stats.goldPerHour.toFixed(1) + '/hr)', '🟡'));
    body.appendChild(createStatRow('Gold Value', formatNumber(mutationData.stats.goldTotalValue) + ' coins', '💰'));
    body.appendChild(createStatRow('Rainbow Procs', mutationData.stats.rainbowProcs + ' (' + mutationData.stats.rainbowPerHour.toFixed(1) + '/hr)', '🌈'));
    body.appendChild(createStatRow('Rainbow Value', formatNumber(mutationData.stats.rainbowTotalValue) + ' coins', '💰'));
    body.appendChild(createStatRow('Crop Boost Procs', mutationData.stats.cropBoostProcs + ' (' + mutationData.stats.cropBoostPerHour.toFixed(1) + '/hr)', '📈'));
    body.appendChild(createStatRow('Boost Value', formatNumber(mutationData.stats.cropBoostTotalValue) + ' coins', '💰'));

    // Personal Records
    body.appendChild(createCategoryHeader('Personal Records', '🏆'));
    if (mutationData.stats.bestHourValue > 0) {
      body.appendChild(createStatRow('Best Hour', formatNumber(mutationData.stats.bestHourValue) + ' coins', '⭐'));
      if (mutationData.stats.bestHourTime) {
        const date = new Date(mutationData.stats.bestHourTime);
        body.appendChild(createStatRow('Best Hour Date', date.toLocaleDateString(), '📅'));
      }
    }
    if (mutationData.stats.bestSessionValue > 0) {
      body.appendChild(createStatRow('Best Session', formatNumber(mutationData.stats.bestSessionValue) + ' coins', '🌟'));
      if (mutationData.stats.bestSessionTime) {
        const date = new Date(mutationData.stats.bestSessionTime);
        body.appendChild(createStatRow('Best Session Date', date.toLocaleDateString(), '📅'));
      }
    }
    if (mutationData.stats.bestHourValue === 0 && mutationData.stats.bestSessionValue === 0) {
      const recordsNote = document.createElement('div');
      recordsNote.style.cssText = 'padding:8px;background:rgba(139,195,74,0.1);border-radius:4px;font-size:10px;color:#8BC34A;margin-top:4px;';
      recordsNote.innerHTML = 'ℹ️ Personal records will be tracked as you play.';
      body.appendChild(recordsNote);
    }

    // Weather Mutation Stats
    const totalWeatherProcs =
      weatherData.stats.wetCount +
      weatherData.stats.chilledCount +
      weatherData.stats.frozenCount +
      weatherData.stats.dawnlitCount +
      weatherData.stats.dawnboundCount +
      weatherData.stats.amberlitCount +
      weatherData.stats.amberboundCount;

    const totalWeatherProcsPerHour =
      weatherData.stats.wetPerHour +
      weatherData.stats.chilledPerHour +
      weatherData.stats.frozenPerHour +
      weatherData.stats.dawnlitPerHour +
      weatherData.stats.dawnboundPerHour +
      weatherData.stats.amberlitPerHour +
      weatherData.stats.amberboundPerHour;

    const totalWeatherValue =
      weatherData.stats.wetTotalValue +
      weatherData.stats.chilledTotalValue +
      weatherData.stats.frozenTotalValue +
      weatherData.stats.dawnlitTotalValue +
      weatherData.stats.dawnboundTotalValue +
      weatherData.stats.amberlitTotalValue +
      weatherData.stats.amberboundTotalValue;

    if (totalWeatherProcs > 0) {
      body.appendChild(createCategoryHeader('Weather Mutations', '🌤️'));
      body.appendChild(createStatRow('Total Weather Procs', formatNumber(totalWeatherProcs), '🌤️'));
      body.appendChild(createStatRow('Procs per Hour', totalWeatherProcsPerHour.toFixed(1), '⚡'));
      body.appendChild(createStatRow('Total Value', formatNumber(totalWeatherValue) + ' coins', '💰'));
    }

    // Ability Performance by Value
    body.appendChild(createCategoryHeader('Top Abilities by Value', '⚡'));
    const valueAbilities = Object.entries(qpmStats.abilities.valueByAbility)
      .filter(([abilityId]) => VALUE_ABILITIES.has(abilityId))
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, 5);

    if (valueAbilities.length > 0) {
      valueAbilities.forEach(([abilityId, value]) => {
        const def = getAbilityDefinition(abilityId);
        const name = def?.name || abilityId;
        const procs = (qpmStats.abilities.procsByAbility as Record<string, number>)[abilityId] || 0;
        const labelText = name + " (" + String(procs) + "x)";
        const valueDisplay = formatNumber(value as number) + " coins";
        body.appendChild(createStatRow(labelText, valueDisplay, "▸"));
      });
    } else {
      const abilityNote = document.createElement('div');
      abilityNote.style.cssText = 'padding:8px;background:rgba(139,195,74,0.1);border-radius:4px;font-size:10px;color:#8BC34A;margin-top:4px;';
      abilityNote.innerHTML = 'ℹ️ Ability stats will appear as your pets proc abilities.';
      body.appendChild(abilityNote);
    }

    // Week-over-week trends (if we have session history)
    if (mutationData.sessions && mutationData.sessions.length > 0) {
      body.appendChild(createCategoryHeader('Session History', '📈'));

      const last7Days = mutationData.sessions.slice(-7);
      const totalValue = last7Days.reduce((sum, s) => sum + s.value, 0);
      const avgValue = totalValue / last7Days.length;

      body.appendChild(createStatRow('Sessions Logged', mutationData.sessions.length.toString(), '📝'));
      const avgLabel = formatNumber(Math.round(avgValue)) + " coins/session";
      body.appendChild(createStatRow("Last 7 Days Avg", avgLabel, "📊"));

      // Trend indicator
      if (last7Days.length >= 2) {
        const recent = last7Days.slice(-3).reduce((sum, s) => sum + s.value, 0) / Math.min(3, last7Days.length);
        const older = last7Days.slice(0, -3).reduce((sum, s) => sum + s.value, 0) / Math.max(1, last7Days.length - 3);
        const trend = recent > older ? '📈 Improving' : recent < older ? '📉 Declining' : '➡️ Stable';
        body.appendChild(createStatRow('Trend', trend, '📉'));
      }
    }

    // Garden Insights (only show if there's data)
    if (qpmStats.garden.totalHarvested > 0) {
      body.appendChild(createCategoryHeader('Garden Insights', '🌱'));
      body.appendChild(createStatRow('Total Harvested', formatNumber(qpmStats.garden.totalHarvested), '🌾'));

      const harvestRate = sessionDuration > 0
        ? Math.round((qpmStats.garden.totalHarvested / sessionDuration) * (60 * 60 * 1000))
        : 0;
      body.appendChild(createStatRow('Harvest Rate', harvestRate + '/hr', '⚡'));

      if (qpmStats.garden.totalWateringCans > 0) {
        body.appendChild(createStatRow('Watering Cans Used', formatNumber(qpmStats.garden.totalWateringCans), '💧'));
      }
    }

    // Reset stats button
    const resetButton = btn('🗑️ Reset All Stats', async () => {
      if (!confirm('⚠️ This will reset ALL statistics including:\n\n• Session value tracking\n• Mutation records\n• Ability performance\n• Garden metrics\n\nThis action cannot be undone. Continue?')) {
        return;
      }

      resetButton.disabled = true;
      resetButton.textContent = '⏳ Resetting...';

      try {
        const { resetPetHatchingTracker } = await import('../../store/petHatchingTracker');
        resetStats();
        resetPetHatchingTracker();
        resetMutationValueTracking();

        resetButton.textContent = '✅ Reset Complete!';
        setTimeout(() => {
          resetButton.textContent = '🗑️ Reset All Stats';
          resetButton.disabled = false;
          updateStats();
        }, 2000);
      } catch (error) {
        log('Error resetting stats:', error);
        resetButton.textContent = '❌ Error';
        setTimeout(() => {
          resetButton.textContent = '🗑️ Reset All Stats';
          resetButton.disabled = false;
        }, 2000);
      }
    });
    resetButton.style.cssText = 'width:100%;margin-top:16px;background:#d32f2f;';
    resetButton.title = 'Reset all QPM statistics';
    body.appendChild(resetButton);
  };

  // Initial update
  updateStats();

  // Subscribe to all relevant data sources for live updates
  const unsubscribe1 = subscribeToStats(() => updateStats());
  const unsubscribe2 = subscribeToMutationValueTracking(() => updateStats());
  const unsubscribe3 = subscribeToWeatherMutationTracking(() => updateStats());

  // Cleanup on element removal
  const observer = new MutationObserver(() => {
    if (!document.contains(root)) {
      unsubscribe1();
      unsubscribe2();
      unsubscribe3();
      observer.disconnect();
    }
  });
  queueMicrotask(() => {
    observer.observe(root.parentElement ?? document.body, { childList: true, subtree: true });
  });

  return root;
}
