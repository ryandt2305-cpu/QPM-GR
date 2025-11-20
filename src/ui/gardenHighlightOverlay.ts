// src/ui/gardenHighlightOverlay.ts
// Stub for garden highlight overlay (feature not currently active)

export interface HighlightOptions {
  color?: string;
  opacity?: number;
  borderWidth?: number;
  label?: string;
}

export function highlightGardenSlot(slotId: string | number, options?: HighlightOptions): void {
  // Stub - no-op
}

export function clearGardenHighlights(): void {
  // Stub - no-op
}

export function removeGardenHighlight(slotId: string | number): void {
  // Stub - no-op
}

export function updateGardenHighlightOverlay(matches?: any, snapshot?: any): void {
  // Stub - no-op
}

export function clearGardenHighlightOverlay(): void {
  // Stub - no-op
}

export function disposeGardenHighlightOverlay(): void {
  // Stub - no-op
}
