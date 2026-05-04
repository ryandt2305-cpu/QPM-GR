// All CSS for the pets window (base, manager, feeding, buttons).
// Compare styles are imported from compareStyles.ts and concatenated.

import { COMPARE_STYLES } from './compareStyles';

const BASE_STYLES = `
.qpm-pets {
  font-family: inherit;
  color: #e0e0e0;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.qpm-pets__tabs {
  display: flex;
  gap: 4px;
  padding: 10px 14px 0;
  border-bottom: 1px solid rgba(143,130,255,0.2);
  flex-shrink: 0;
}
.qpm-pets__tabs-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 30px;
}
.qpm-pets__stage-badge {
  align-self: center;
  margin-bottom: 7px;
  padding: 2px 9px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.22);
  background: rgba(255,255,255,0.08);
  color: rgba(240,242,250,0.92);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  line-height: 1.5;
  white-space: nowrap;
}
.qpm-pets__stage-badge--hidden { display: none; }
.qpm-pets__stage-badge--early {
  border-color: rgba(255,208,130,0.36);
  background: rgba(255,208,130,0.10);
}
.qpm-pets__stage-badge--mid {
  border-color: rgba(144,196,255,0.36);
  background: rgba(144,196,255,0.10);
}
.qpm-pets__stage-badge--late {
  border-color: rgba(142,255,200,0.36);
  background: rgba(142,255,200,0.10);
}
.qpm-pets__tab {
  padding: 7px 16px;
  font-size: 13px;
  color: rgba(224,224,224,0.55);
  cursor: pointer;
  border-radius: 6px 6px 0 0;
  border-bottom: 2px solid transparent;
  transition: color 0.15s, border-color 0.15s;
  user-select: none;
}
.qpm-pets__tab:hover { color: #e0e0e0; }
.qpm-pets__tab--active { color: #8f82ff; border-color: #8f82ff; }
.qpm-pets__settings-wrap {
  position: relative;
  margin-bottom: 6px;
}
.qpm-pets__settings-overlay {
  position: fixed;
  inset: 0;
  z-index: 2147483646;
  pointer-events: auto;
}
.qpm-pets__settings-btn {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  border: 1px solid rgba(143,130,255,0.42);
  background: rgba(143,130,255,0.12);
  color: rgba(230,230,255,0.95);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.qpm-pets__settings-btn:hover {
  background: rgba(143,130,255,0.2);
  border-color: rgba(143,130,255,0.62);
}
.qpm-pets__settings-btn[aria-expanded="true"] {
  background: rgba(143,130,255,0.24);
  border-color: rgba(143,130,255,0.72);
}
.qpm-pets__settings-popover {
  position: fixed;
  width: 320px;
  max-height: 420px;
  overflow: auto;
  z-index: 2147483647;
  pointer-events: auto;
  background: rgba(14,17,25,0.98);
  border: 1px solid rgba(143,130,255,0.35);
  border-radius: 10px;
  box-shadow: 0 8px 30px rgba(0,0,0,0.45);
  padding: 10px;
  display: grid;
  gap: 8px;
}
.qpm-pets__settings-title {
  font-size: 12px;
  font-weight: 700;
  color: #d8d4ff;
  letter-spacing: 0.02em;
}
.qpm-pets__settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 12px;
  color: rgba(224,224,224,0.88);
  padding: 7px 8px;
  border-radius: 8px;
  border: 1px solid rgba(143,130,255,0.18);
  background: rgba(255,255,255,0.03);
}
.qpm-pets__settings-row input[type="checkbox"] {
  accent-color: #8f82ff;
  width: 15px;
  height: 15px;
  cursor: pointer;
}
.qpm-pets__settings-subtle {
  color: rgba(224,224,224,0.5);
  font-size: 11px;
}
.qpm-pets__settings-divider {
  height: 1px;
  background: rgba(143,130,255,0.18);
  margin: 2px 0;
}
.qpm-pets__threshold {
  width: 66px;
  padding: 4px 6px;
  border-radius: 6px;
  border: 1px solid rgba(143,130,255,0.32);
  background: rgba(255,255,255,0.06);
  color: #e0e0e0;
  font-size: 12px;
  text-align: right;
  outline: none;
}
.qpm-pets__threshold:focus {
  border-color: rgba(143,130,255,0.62);
  box-shadow: 0 0 0 2px rgba(143,130,255,0.15);
}
.qpm-pets__rarity-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.qpm-pets__rarity-pill {
  border: 1px solid rgba(143,130,255,0.28);
  background: rgba(255,255,255,0.03);
  color: rgba(224,224,224,0.8);
  border-radius: 999px;
  padding: 4px 8px;
  font-size: 11px;
  cursor: pointer;
  user-select: none;
}
.qpm-pets__rarity-pill--active {
  border-color: rgba(143,130,255,0.7);
  background: rgba(143,130,255,0.2);
  color: #ded7ff;
}
.qpm-pets__body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.qpm-pets__panel { display: none; flex: 1; min-height: 0; overflow: hidden; }
.qpm-pets__panel--active { display: flex; flex-direction: column; min-height: 0; }

/* Manager tab */
.qpm-mgr {
  display: flex;
  gap: 0;
  flex: 1;
  overflow: hidden;
}
.qpm-mgr__list {
  width: 240px;
  flex-shrink: 0;
  min-height: 0;
  border-right: 1px solid rgba(143,130,255,0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.qpm-mgr__list-header {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
  border-bottom: 1px solid rgba(143,130,255,0.1);
}
.qpm-mgr__list-top {
  display: flex;
  gap: 6px;
  flex-wrap: nowrap;
}
.qpm-mgr__search {
  flex: 1;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(143,130,255,0.25);
  border-radius: 5px;
  color: #e0e0e0;
  font-size: 12px;
  padding: 5px 8px;
  outline: none;
}
.qpm-mgr__teams {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 6px 8px;
}
.qpm-team-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.12s;
  user-select: none;
}
.qpm-team-row:hover { background: rgba(143,130,255,0.08); }
.qpm-team-row--selected { background: rgba(143,130,255,0.16); }
.qpm-team-row--draggable { cursor: grab; }
.qpm-team-row--dragging { opacity: 0.55; }
.qpm-team-row--compare-a {
  background: rgba(88, 160, 255, 0.15);
  box-shadow: inset 0 0 0 1px rgba(88, 160, 255, 0.6);
}
.qpm-team-row--compare-b {
  background: rgba(100, 255, 150, 0.14);
  box-shadow: inset 0 0 0 1px rgba(100, 255, 150, 0.55);
}
.qpm-team-row__name {
  flex: 1;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.qpm-team-row__badge {
  font-size: 9px;
  padding: 2px 5px;
  border-radius: 3px;
  font-weight: 600;
  background: rgba(100,255,150,0.15);
  color: #64ff96;
  flex-shrink: 0;
}
.qpm-team-row__key {
  font-size: 10px;
  color: rgba(224,224,224,0.4);
  flex-shrink: 0;
}
.qpm-team-row__cmp-badge {
  font-size: 10px;
  font-weight: 700;
  min-width: 16px;
  height: 16px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.qpm-team-row__cmp-badge--a {
  background: rgba(88, 160, 255, 0.3);
  color: #b8dcff;
}
.qpm-team-row__cmp-badge--b {
  background: rgba(100, 255, 150, 0.24);
  color: #c8ffd9;
}
.qpm-mgr__editor {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.qpm-editor {
  padding: 16px;
  flex: 1;
  overflow-y: auto;
}
.qpm-editor__placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: rgba(224,224,224,0.35);
  font-size: 14px;
}
.qpm-editor__header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}
.qpm-editor__name {
  flex: 1;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(143,130,255,0.3);
  border-radius: 6px;
  color: #e0e0e0;
  font-size: 14px;
  padding: 7px 10px;
  outline: none;
}
.qpm-editor__name:focus { border-color: rgba(143,130,255,0.7); }
.qpm-editor__status {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
}
.qpm-editor__status--active { background: rgba(100,255,150,0.15); color: #64ff96; }
.qpm-editor__status--inactive { color: rgba(224,224,224,0.4); }
.qpm-slots { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
.qpm-slot {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(143,130,255,0.2);
  border-radius: 8px;
  padding: 10px 12px;
}
.qpm-slot__index {
  font-size: 11px;
  color: rgba(224,224,224,0.4);
  width: 16px;
  flex-shrink: 0;
  align-self: center;
}
.qpm-slot__sprite-wrap {
  width: 42px; height: 42px; flex-shrink: 0;
  background: rgba(143,130,255,0.07);
  border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  font-size: 20px;
  overflow: hidden;
}
.qpm-slot__sprite {
  width: 42px; height: 42px;
  image-rendering: pixelated; object-fit: contain;
}
.qpm-slot__info { flex: 1; min-width: 0; }
.qpm-slot__name {
  font-size: 13px; font-weight: 500;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.qpm-slot__str { font-size: 11px; color: rgba(224,224,224,0.5); margin-top: 2px; }
.qpm-slot__abilities { display: flex; gap: 3px; margin-top: 5px; flex-wrap: wrap; }
.qpm-slot__ability-dot { width: 8px; height: 8px; border-radius: 2px; flex-shrink: 0; }
.qpm-slot__empty { font-size: 13px; color: rgba(224,224,224,0.3); font-style: italic; align-self: center; }
.qpm-editor__controls {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.qpm-editor__keybind-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
  font-size: 12px;
  color: rgba(224,224,224,0.6);
}
.qpm-keybind-input {
  width: 90px;
  text-align: center;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(143,130,255,0.25);
  border-radius: 5px;
  color: #e0e0e0;
  font-family: inherit;
  font-size: 11px;
  padding: 5px;
  outline: none;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.qpm-keybind-input:focus {
  border-color: rgba(143,130,255,0.6);
  box-shadow: 0 0 0 2px rgba(143,130,255,0.12);
}
.qpm-select {
  padding: 4px 8px;
  border: 1px solid rgba(143,130,255,0.3);
  border-radius: 8px;
  background: rgba(20,24,36,0.65);
  color: #e0e0e0;
  font-size: 11px;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  color-scheme: dark;
}
.qpm-select:focus {
  border-color: #8f82ff;
  box-shadow: 0 0 0 2px rgba(143,130,255,0.18);
}
.qpm-select option {
  background: rgb(20, 24, 36);
  color: #e0e0e0;
}

/* Feeding tab */
.qpm-feed {
  padding: 14px; overflow-y: auto; flex: 1;
  display: flex; flex-direction: column; gap: 10px;
}
.qpm-section-title {
  font-size: 13px;
  font-weight: 600;
  color: #8f82ff;
  margin-bottom: 10px;
  margin-top: 16px;
}
.qpm-section-title:first-child { margin-top: 0; }
.qpm-toggle-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
}
.qpm-toggle {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: #8f82ff;
  flex-shrink: 0;
}
/* Feed globals bar */
.qpm-feed__globals {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  padding: 10px 12px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(143,130,255,0.15);
  border-radius: 8px;
}
.qpm-feed__globals-toggles { display: flex; flex-direction: column; gap: 6px; flex: 1; }
/* Per-pet feed card */
.qpm-feed__pet-card {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(143,130,255,0.2);
  border-radius: 8px;
  padding: 12px;
  display: flex; flex-direction: column; gap: 8px;
}
.qpm-feed__pet-header {
  display: flex; align-items: center; gap: 10px;
}
.qpm-feed__pet-sprite-wrap {
  width: 40px; height: 40px; flex-shrink: 0;
  background: rgba(143,130,255,0.07); border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  font-size: 20px; overflow: hidden;
}
.qpm-feed__pet-sprite {
  width: 40px; height: 40px;
  image-rendering: pixelated; object-fit: contain;
}
.qpm-feed__pet-info { flex: 1; min-width: 0; }
.qpm-feed__pet-name {
  font-size: 13px; font-weight: 500;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.qpm-feed__pet-hunger {
  display: flex; align-items: center; gap: 6px; margin-top: 3px;
}
.qpm-feed__hunger-pct { font-size: 11px; color: rgba(224,224,224,0.5); min-width: 28px; }
.qpm-feed__hunger-bar-wrap {
  flex: 1; height: 5px; background: rgba(255,255,255,0.1);
  border-radius: 3px; overflow: hidden;
}
.qpm-feed__hunger-bar { height: 100%; border-radius: 3px; }
/* Diet checkboxes */
.qpm-feed__diet-title {
  font-size: 11px; font-weight: 600;
  color: rgba(143,130,255,0.7); text-transform: uppercase; letter-spacing: 0.05em;
}
.qpm-feed__diet {
  display: flex; flex-wrap: wrap; gap: 6px 10px;
}
.qpm-feed__food-label {
  display: flex; align-items: center; gap: 4px;
  font-size: 12px; color: rgba(224,224,224,0.65);
  cursor: pointer; user-select: none;
}
.qpm-feed__food-label input { cursor: pointer; accent-color: #8f82ff; margin: 0; }
.qpm-feed__food-label--preferred { color: #ffd700; }
/* Pop-out button */
.qpm-feed__popout-btn {
  background: none;
  border: 1px solid rgba(143,130,255,0.25);
  border-radius: 5px;
  color: rgba(143,130,255,0.6);
  font-size: 11px; padding: 3px 6px; cursor: pointer;
  transition: color 0.12s, background 0.12s;
  flex-shrink: 0;
}
.qpm-feed__popout-btn:hover { color: #c4beff; background: rgba(143,130,255,0.15); }
.qpm-feed__popout-btn--active { color: #8f82ff; background: rgba(143,130,255,0.18); }
/* Team summary row */
.qpm-team-summary {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 8px 12px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(143,130,255,0.12);
  border-radius: 7px;
  margin-bottom: 12px;
  font-size: 11px;
}
.qpm-team-summary__stat { display: flex; flex-direction: column; align-items: center; gap: 1px; }
.qpm-team-summary__val { font-size: 13px; font-weight: 600; color: #c4beff; }
.qpm-team-summary__lbl { font-size: 9px; color: rgba(224,224,224,0.4); text-transform: uppercase; letter-spacing: 0.05em; }
.qpm-team-summary__sep { width: 1px; height: 28px; background: rgba(143,130,255,0.15); }
.qpm-team-summary__dots { display: flex; gap: 3px; align-items: center; flex-wrap: wrap; }
.qpm-team-summary__pill {
  display: inline-flex; align-items: center;
  border: 1px solid rgba(255,255,255,0.25);
  border-radius: 10px; padding: 2px 7px;
  font-size: 10px; font-weight: 700;
  white-space: nowrap;
  text-shadow: 0 1px 1px rgba(0,0,0,0.35);
  box-shadow: inset 0 0 0 1px rgba(0,0,0,0.15);
}
.qpm-team-summary__pill--ability {
  cursor: default;
}
.qpm-team-summary__pill--rainbow {
  border-color: rgba(255,255,255,0.45);
  text-shadow: 0 1px 1px rgba(0,0,0,0.6), 0 0 8px rgba(0,0,0,0.35);
}
.qpm-team-summary__pill-coin {
  width: 11px;
  height: 11px;
  image-rendering: pixelated;
  object-fit: contain;
  margin: 0 1px;
}
.qpm-team-summary__pill-suffix {
  font-size: 9px;
  font-weight: 700;
  opacity: 0.92;
}

/* Shared buttons */
.qpm-btn {
  padding: 7px 14px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  border: 1px solid rgba(143,130,255,0.35);
  background: rgba(143,130,255,0.1);
  color: #e0e0e0;
  transition: background 0.15s;
}
.qpm-btn:hover { background: rgba(143,130,255,0.2); }
.qpm-btn--primary {
  background: rgba(143,130,255,0.25);
  border-color: rgba(143,130,255,0.6);
  color: #d0c8ff;
  font-weight: 500;
}
.qpm-btn--primary:hover { background: rgba(143,130,255,0.38); }
.qpm-btn--danger {
  border-color: rgba(244,67,54,0.3);
  background: rgba(244,67,54,0.08);
  color: rgba(244,67,54,0.8);
}
.qpm-btn--danger:hover { background: rgba(244,67,54,0.16); }
.qpm-btn--sm { padding: 4px 10px; font-size: 11px; }
`;

const STYLES = BASE_STYLES + COMPARE_STYLES;

let stylesEl: HTMLStyleElement | null = null;

export function ensureStyles(doc: Document): void {
  if (doc.getElementById('qpm-pets-styles')) return;
  stylesEl = doc.createElement('style');
  stylesEl.id = 'qpm-pets-styles';
  stylesEl.textContent = STYLES;
  doc.head.appendChild(stylesEl);
}
