import { getMutationValueSnapshot, subscribeToMutationValueTracking } from '../../features/mutationValueTracking';
import { getWeatherMutationSnapshot, subscribeToWeatherMutationTracking } from '../../features/weatherMutationTracking';
import { createCard, btn } from '../panelHelpers';
import { log } from '../../utils/logger';
import type { UIState } from '../panelState';

export function createMutationValueSection(cfg: any, saveCfg: () => void): HTMLElement {
  const { root, body } = createCard('💎 Mutation Value & Reminders', {
    subtitle: 'Gold/Rainbow generation and mutation alerts',
    collapsible: true,
  });
  root.dataset.qpmSection = 'mutation-value';

  const info = document.createElement('div');
  info.style.cssText = 'padding:10px;background:#1a1a2a;border-radius:6px;font-size:11px;line-height:1.5;margin-bottom:12px;';
  info.innerHTML = `
    <strong>💰 Value generation tracking:</strong> Gold/Rainbow proc rates, session value, and best records.
  `;
  body.appendChild(info);

  // Mutation Reminder Controls
  const reminderSection = document.createElement('div');
  reminderSection.style.cssText = 'margin-bottom:16px;padding:12px;background:#2a1a3a;border-radius:6px;border-left:3px solid #9C27B0;';

  const reminderHeader = document.createElement('div');
  reminderHeader.style.cssText = 'font-weight:bold;font-size:12px;margin-bottom:8px;color:#9C27B0;';
  reminderHeader.textContent = '🧬 Mutation Reminder';
  reminderSection.appendChild(reminderHeader);

  const reminderInfo = document.createElement('div');
  reminderInfo.innerHTML = '💡 Detects weather events (Rain/Snow/Dawn/Amber) and notifies which plants to place for mutations.';
  reminderInfo.style.cssText = 'font-size:10px;line-height:1.5;color:#aaa;margin-bottom:8px;';
  reminderSection.appendChild(reminderInfo);

  const reminderToggle = btn(cfg.mutationReminder?.enabled ? '✓ Reminders Enabled' : '✗ Reminders Disabled', async () => {
    if (!cfg.mutationReminder) return;
    cfg.mutationReminder.enabled = !cfg.mutationReminder.enabled;
    reminderToggle.textContent = cfg.mutationReminder.enabled ? '✓ Reminders Enabled' : '✗ Reminders Disabled';
    reminderToggle.classList.toggle('qpm-button--positive', cfg.mutationReminder.enabled);
    reminderToggle.classList.toggle('qpm-button--accent', cfg.mutationReminder.enabled);
    try {
      const { setMutationReminderEnabled } = await import('../../features/mutationReminder');
      setMutationReminderEnabled(cfg.mutationReminder.enabled);
      saveCfg();
    } catch (err) {
      // Revert optimistic UI toggle on failure
      cfg.mutationReminder.enabled = !cfg.mutationReminder.enabled;
      reminderToggle.textContent = cfg.mutationReminder.enabled ? '✓ Reminders Enabled' : '✗ Reminders Disabled';
      reminderToggle.classList.toggle('qpm-button--positive', cfg.mutationReminder.enabled);
      reminderToggle.classList.toggle('qpm-button--accent', cfg.mutationReminder.enabled);
    }
  });
  reminderToggle.style.cssText = 'width:100%;margin-bottom:6px;';
  if (cfg.mutationReminder?.enabled) {
    reminderToggle.classList.add('qpm-button--positive', 'qpm-button--accent');
  }
  reminderSection.appendChild(reminderToggle);

  const checkBtn = btn('🔍 Check Now', async () => {
    checkBtn.disabled = true;
    checkBtn.textContent = '⏳ Checking...';
    try {
      const { checkForMutations } = await import('../../features/mutationReminder');
      await checkForMutations();
      checkBtn.textContent = '✅ Done!';
      setTimeout(() => {
        checkBtn.textContent = '🔍 Check Now';
        checkBtn.disabled = false;
      }, 2000);
    } catch (error) {
      checkBtn.textContent = '❌ Error';
      log('Error checking mutations:', error);
      setTimeout(() => {
        checkBtn.textContent = '🔍 Check Now';
        checkBtn.disabled = false;
      }, 2000);
    }
  });
  checkBtn.style.cssText = 'width:100%;background:#9C27B0;';
  checkBtn.title = 'Manually check for mutation opportunities';
  reminderSection.appendChild(checkBtn);

  body.appendChild(reminderSection);


  const valueContainer = document.createElement('div');
  valueContainer.style.cssText = 'display:flex;flex-direction:column;gap:12px;';
  body.appendChild(valueContainer);

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const formatTimeAgo = (timestamp: number): string => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h ${minutes % 60}m ago`;
    return `${minutes}m ago`;
  };

  const render = () => {
    const snapshot = getMutationValueSnapshot();
    const weatherSnapshot = getWeatherMutationSnapshot();
    valueContainer.innerHTML = '';

    const stats = snapshot.stats;
    const weatherStats = weatherSnapshot.stats;

    // Calculate total weather procs
    const totalWeatherProcs =
      weatherStats.wetCount +
      weatherStats.chilledCount +
      weatherStats.frozenCount +
      weatherStats.dawnlitCount +
      weatherStats.dawnboundCount +
      weatherStats.amberlitCount +
      weatherStats.amberboundCount;

    const totalWeatherProcsPerHour =
      weatherStats.wetPerHour +
      weatherStats.chilledPerHour +
      weatherStats.frozenPerHour +
      weatherStats.dawnlitPerHour +
      weatherStats.dawnboundPerHour +
      weatherStats.amberlitPerHour +
      weatherStats.amberboundPerHour;

    // Session Value Summary
    const sessionCard = document.createElement('div');
    sessionCard.style.cssText = 'padding:12px;background:linear-gradient(135deg,rgba(255,215,0,0.1),rgba(139,69,19,0.1));border-radius:6px;border-left:3px solid #FFD700;';
    sessionCard.innerHTML = `
      <div style="font-weight:bold;font-size:12px;margin-bottom:8px;">💰 Current Session Value</div>
      <div style="font-size:20px;font-weight:bold;color:#FFD700;">${formatNumber(stats.sessionValue)}</div>
      <div style="font-size:10px;color:#888;margin-top:4px;">Session started ${formatTimeAgo(stats.sessionStart)}</div>
    `;
    valueContainer.appendChild(sessionCard);

    // Proc Rates Grid (2x2 layout)
    const ratesGrid = document.createElement('div');
    ratesGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;';

    ratesGrid.innerHTML = `
      <div style="padding:10px;background:#1a1a2a;border-radius:6px;text-align:center;">
        <div style="font-size:18px;margin-bottom:4px;">🟡</div>
        <div style="font-size:14px;font-weight:bold;color:#FFD700;">${stats.goldProcs}</div>
        <div style="font-size:9px;color:#888;margin-top:2px;">Gold Procs</div>
        <div style="font-size:10px;color:#4CAF50;margin-top:4px;">${stats.goldPerHour.toFixed(1)}/hr</div>
      </div>
      <div style="padding:10px;background:#1a1a2a;border-radius:6px;text-align:center;">
        <div style="font-size:18px;margin-bottom:4px;">🌈</div>
        <div style="font-size:14px;font-weight:bold;color:#FFD700;">${stats.rainbowProcs}</div>
        <div style="font-size:9px;color:#888;margin-top:2px;">Rainbow Procs</div>
        <div style="font-size:10px;color:#4CAF50;margin-top:4px;">${stats.rainbowPerHour.toFixed(1)}/hr</div>
      </div>
      <div style="padding:10px;background:#1a1a2a;border-radius:6px;text-align:center;">
        <div style="font-size:18px;margin-bottom:4px;">📈</div>
        <div style="font-size:14px;font-weight:bold;color:#FFD700;">${stats.cropBoostProcs}</div>
        <div style="font-size:9px;color:#888;margin-top:2px;">Crop Boosts</div>
        <div style="font-size:10px;color:#4CAF50;margin-top:4px;">${stats.cropBoostPerHour.toFixed(1)}/hr</div>
      </div>
      <div style="padding:10px;background:#1a1a2a;border-radius:6px;text-align:center;">
        <div style="font-size:18px;margin-bottom:4px;">☁️</div>
        <div style="font-size:14px;font-weight:bold;color:#FFD700;">${totalWeatherProcs}</div>
        <div style="font-size:9px;color:#888;margin-top:2px;">Weather Procs</div>
        <div style="font-size:10px;color:#4CAF50;margin-top:4px;">${totalWeatherProcsPerHour.toFixed(1)}/hr</div>
      </div>
    `;
    valueContainer.appendChild(ratesGrid);

    // Best Records
    if (stats.bestSessionValue > 0 || stats.bestHourValue > 0) {
      const recordsCard = document.createElement('div');
      recordsCard.style.cssText = 'padding:10px;background:#1a1a2a;border-radius:6px;';
      recordsCard.innerHTML = `
        <div style="font-weight:bold;font-size:11px;margin-bottom:8px;">🏆 Best Records</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:10px;">
          <div><span style="color:#888;">Best Hour:</span> <strong style="color:#FFD700;">${formatNumber(stats.bestHourValue)}</strong></div>
          <div><span style="color:#888;">Best Session:</span> <strong style="color:#FFD700;">${formatNumber(stats.bestSessionValue)}</strong></div>
        </div>
      `;
      valueContainer.appendChild(recordsCard);
    }
  };

  render();
  const unsubscribe = subscribeToMutationValueTracking(render);
  const weatherUnsubscribe = subscribeToWeatherMutationTracking(render);

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.removedNodes.forEach((node) => {
        if (node === root || (node as HTMLElement).contains?.(root)) {
          unsubscribe();
          weatherUnsubscribe();
          observer.disconnect();
        }
      });
    });
  });
  queueMicrotask(() => {
    observer.observe(root.parentElement ?? document.body, { childList: true, subtree: true });
  });

  return root;
}

export function createMutationSection(uiState: UIState, cfg: any, saveCfg: () => void): HTMLElement {
  const statusChip = document.createElement('span');
  statusChip.className = 'qpm-chip';
  statusChip.textContent = cfg.mutationReminder?.enabled ? 'Enabled' : 'Disabled';

  const { root, body } = createCard('🧬 Mutation Reminder', {
    collapsible: true,
    startCollapsed: true,
    subtitleElement: statusChip,
  });
  root.dataset.qpmSection = 'mutation-reminder';

  const mStatus = document.createElement('div');
  mStatus.textContent = 'Monitoring weather...';
  mStatus.className = 'qpm-section-muted';
  body.appendChild(mStatus);

  const infoBox = document.createElement('div');
  infoBox.innerHTML = '💡 <strong>How it works:</strong><br>• Detects weather events (Rain/Snow/Dawn/Amber)<br>• Scans your plant inventory for mutations (F/W/C/D/A)<br>• Notifies which plants to place for mutations<br>• Example: Wet plant + Snow → Frozen mutation!';
  infoBox.style.cssText = 'background:#333;padding:8px;border-radius:4px;font-size:10px;line-height:1.5;border-left:3px solid #9C27B0';
  body.appendChild(infoBox);

  const mToggle = btn(cfg.mutationReminder?.enabled ? '✓ Reminders Enabled' : '✗ Reminders Disabled', async () => {
    if (!cfg.mutationReminder) return;
    cfg.mutationReminder.enabled = !cfg.mutationReminder.enabled;
    mToggle.textContent = cfg.mutationReminder.enabled ? '✓ Reminders Enabled' : '✗ Reminders Disabled';
    mToggle.classList.toggle('qpm-button--positive', cfg.mutationReminder.enabled);
    mToggle.classList.toggle('qpm-button--accent', cfg.mutationReminder.enabled);
    statusChip.textContent = cfg.mutationReminder.enabled ? 'Enabled' : 'Disabled';
    try {
      // Actually enable/disable the mutation reminder system
      const { setMutationReminderEnabled } = await import('../../features/mutationReminder');
      setMutationReminderEnabled(cfg.mutationReminder.enabled);
      saveCfg();
    } catch (err) {
      // Revert optimistic UI toggle on failure
      cfg.mutationReminder.enabled = !cfg.mutationReminder.enabled;
      mToggle.textContent = cfg.mutationReminder.enabled ? '✓ Reminders Enabled' : '✗ Reminders Disabled';
      mToggle.classList.toggle('qpm-button--positive', cfg.mutationReminder.enabled);
      mToggle.classList.toggle('qpm-button--accent', cfg.mutationReminder.enabled);
      statusChip.textContent = cfg.mutationReminder.enabled ? 'Enabled' : 'Disabled';
    }
  });
  mToggle.style.width = '100%';
  if (cfg.mutationReminder?.enabled) {
    mToggle.classList.add('qpm-button--positive', 'qpm-button--accent');
  }
  body.appendChild(mToggle);

  // Add "Check Now" button
  const checkBtn = btn('🔍 Check Now', async () => {
    checkBtn.disabled = true;
    checkBtn.textContent = '⏳ Checking...';
    try {
      const { checkForMutations } = await import('../../features/mutationReminder');
      await checkForMutations();
      checkBtn.textContent = '✅ Done!';
      setTimeout(() => {
        checkBtn.textContent = '🔍 Check Now';
        checkBtn.disabled = false;
      }, 2000);
    } catch (error) {
      checkBtn.textContent = '❌ Error';
      log('Error checking mutations:', error);
      setTimeout(() => {
        checkBtn.textContent = '🔍 Check Now';
        checkBtn.disabled = false;
      }, 2000);
    }
  });
  checkBtn.style.width = '100%';
  checkBtn.style.background = '#9C27B0';
  checkBtn.title = 'Manually check for mutation opportunities';
  body.appendChild(checkBtn);

  uiState.mutationStatus = mStatus;

  return root;
}
