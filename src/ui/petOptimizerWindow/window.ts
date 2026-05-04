import { getOptimizerAnalysis } from '../../features/petOptimizer';
import { toggleWindow } from '../modalWindow';
import { renderFamilyNav } from './familyNav';
import { renderFilters } from './filters';
import { renderResults } from './results';
import { renderSummary } from './summary';
import {
  clearFiltersCleanup,
  getGlobalState,
  setGlobalState,
} from './windowState';

function updateFamilyNav(): void {
  const globalState = getGlobalState();
  if (!globalState?.currentAnalysis || !globalState.navContainer) return;
  globalState.navContainer.innerHTML = '';
  const nav = renderFamilyNav(globalState.currentAnalysis, globalState.resultsContainer);
  globalState.navContainer.appendChild(nav);
}

function renderCurrentAnalysis(): void {
  const globalState = getGlobalState();
  if (!globalState?.currentAnalysis) return;
  const savedScroll = globalState.root.scrollTop;
  renderResults(
    globalState.currentAnalysis,
    () => void refreshAnalysis(true),
    () => renderCurrentAnalysis(),
  );
  updateFamilyNav();
  globalState.root.scrollTop = savedScroll;
}

async function refreshAnalysis(forceRefresh = false): Promise<void> {
  const globalState = getGlobalState();
  if (!globalState) return;

  const savedScroll = globalState.root.scrollTop;

  globalState.summaryContainer.innerHTML = '<div style="color: #aaa;">⏳ Loading pets...</div>';
  globalState.resultsContainer.innerHTML = '';

  try {
    const progressDiv = document.createElement('div');
    progressDiv.style.cssText = 'color: #aaa; display: flex; align-items: center; gap: 10px;';
    const label = document.createElement('div');
    label.textContent = '⏳ Analyzing pets...';
    const progressEl = document.createElement('div');
    progressEl.style.cssText = 'font-weight: bold; color: var(--qpm-accent, #8f82ff);';
    progressEl.textContent = '0%';
    progressDiv.append(label, progressEl);

    globalState.summaryContainer.innerHTML = '';
    globalState.summaryContainer.appendChild(progressDiv);

    const analysis = await getOptimizerAnalysis(forceRefresh, (percent) => {
      progressEl.textContent = `${percent}%`;
    });

    if (!analysis || analysis.totalPets === 0) {
      globalState.summaryContainer.innerHTML = `
        <div style="color: #FF9800; padding: 20px; text-align: center;">
          <div style="font-size: 18px; margin-bottom: 8px;">⚠️ No Pets Found</div>
          <div style="font-size: 13px; color: #aaa;">
            No pets detected in active slots, inventory, or hutch.
            <br>Make sure you have pets and try refreshing.
          </div>
        </div>
      `;
      globalState.resultsContainer.innerHTML = '';
      return;
    }

    globalState.currentAnalysis = analysis;
    renderSummary(analysis);
    renderResults(
      analysis,
      () => void refreshAnalysis(true),
      () => renderCurrentAnalysis(),
    );
    updateFamilyNav();
    // Restore scroll after content is rebuilt. Re-read state in case window
    // was torn down and rebuilt during the async fetch.
    const stateAfter = getGlobalState();
    if (stateAfter) stateAfter.root.scrollTop = savedScroll;
  } catch (error) {
    console.error('[Pet Optimizer] Error:', error);
    globalState.summaryContainer.innerHTML = `
      <div style="color: var(--qpm-danger, #f44336); padding: 20px;">
        <div style="font-size: 18px; margin-bottom: 8px;">❌ Analysis Failed</div>
        <div style="font-size: 13px; color: #aaa;">
          ${error instanceof Error ? error.message : 'Unknown error'}
        </div>
        <div style="font-size: 12px; color: #666; margin-top: 8px;">
          Check browser console for details
        </div>
      </div>
    `;
  }
}

export function openPetOptimizerWindow(): void {
  toggleWindow(
    'pet-optimizer',
    '🎯 Pet Optimizer',
    renderPetOptimizerWindow,
    '900px',
    '85vh',
  );
}

export function renderPetOptimizerWindow(body: HTMLElement): void {
  clearFiltersCleanup();
  body.innerHTML = '';

  const root = document.createElement('div');
  root.className = 'qpm-pet-optimizer-root';
  root.style.cssText = `
    color: #fff;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  `;

  const styleEl = document.createElement('style');
  styleEl.textContent = `
    @keyframes shimmer {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }
  `;
  root.appendChild(styleEl);

  const header = document.createElement('div');
  header.style.cssText = 'margin-bottom: 10px;';
  header.innerHTML = `
    <div style="font-size: 17px; font-weight: 700;">
      🎯 Pet Optimizer
    </div>
  `;
  root.appendChild(header);

  const summaryContainer = document.createElement('div');
  summaryContainer.style.cssText = `
    background: rgba(0, 0, 0, 0.22);
    border-radius: 8px;
    padding: 10px 12px;
    margin-bottom: 10px;
    border: 1px solid var(--qpm-border, #444);
  `;
  root.appendChild(summaryContainer);

  const filtersContainer = document.createElement('div');
  filtersContainer.style.cssText = `
    background: rgba(0, 0, 0, 0.22);
    border-radius: 8px;
    padding: 10px 12px;
    margin-bottom: 12px;
    border: 1px solid var(--qpm-border, #444);
  `;
  root.appendChild(filtersContainer);

  const navContainer = document.createElement('div');
  navContainer.style.cssText = 'margin-bottom:8px;position:sticky;top:0;z-index:10;background:rgba(18,20,26,0.97);padding:4px 0;';
  root.appendChild(navContainer);

  const resultsContainer = document.createElement('div');
  resultsContainer.style.cssText = 'min-height: 200px;';
  root.appendChild(resultsContainer);

  body.appendChild(root);

  setGlobalState({
    root,
    summaryContainer,
    filtersContainer,
    navContainer,
    resultsContainer,
    currentAnalysis: null,
  });

  renderFilters(
    () => renderCurrentAnalysis(),
    (forceRefresh) => {
      void refreshAnalysis(!!forceRefresh);
    },
  );
  void refreshAnalysis();
}
