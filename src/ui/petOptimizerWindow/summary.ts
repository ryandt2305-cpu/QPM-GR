import type { OptimizerAnalysis } from '../../features/petOptimizer';
import { getGlobalState } from './windowState';

export function renderSummary(analysis: OptimizerAnalysis): void {
  const globalState = getGlobalState();
  if (!globalState) return;

  try {
    const modeLabel = analysis.activeMode === 'slot_efficiency' ? 'Slot Efficiency' : 'Specialist';
    const html = `
      <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">
        <span style="padding:3px 8px;border-radius:999px;border:1px solid rgba(66,165,245,0.35);background:rgba(66,165,245,0.12);font-size:11px;color:#8ec8ff;">Total ${analysis.totalPets}</span>
        <span style="padding:3px 8px;border-radius:999px;border:1px solid rgba(76,175,80,0.35);background:rgba(76,175,80,0.12);font-size:11px;color:#8ed89a;">Keep ${analysis.keep.length}</span>
        <span style="padding:3px 8px;border-radius:999px;border:1px solid rgba(244,67,54,0.35);background:rgba(244,67,54,0.12);font-size:11px;color:#ff9e95;">Sell ${analysis.sellCount}</span>
        <span style="padding:3px 8px;border-radius:999px;border:1px solid rgba(255,193,7,0.35);background:rgba(255,193,7,0.12);font-size:11px;color:#ffe08a;">Review ${analysis.reviewCount}</span>
        <span style="padding:3px 8px;border-radius:999px;border:1px solid rgba(143,130,255,0.35);background:rgba(143,130,255,0.12);font-size:11px;color:#d8d1ff;">Mode ${modeLabel}</span>
        <span style="font-size:11px;color:#888;">${analysis.activePets} active • ${analysis.inventoryPets} inv • ${analysis.hutchPets} hutch</span>
      </div>
    `;

    globalState.summaryContainer.innerHTML = html;
  } catch (error) {
    console.error('[Pet Optimizer] Error rendering summary:', error);
    globalState.summaryContainer.innerHTML = `<div style="color: #f44336;">Error rendering summary: ${error instanceof Error ? error.message : 'Unknown'}</div>`;
  }
}
