// Compact/Minimal Mode - Panel display mode management
// Provides 4 display levels: full, compact, minimal, hidden

import { log } from '../utils/logger';
import { storage } from '../utils/storage';

/**
 * Display mode levels
 */
export type DisplayMode = 'full' | 'compact' | 'minimal' | 'hidden';

/**
 * Event types that can trigger auto-expand
 */
export type AutoExpandEvent = 'hunger' | 'harvest' | 'weather' | 'ability';

/**
 * Compact mode configuration
 */
export interface CompactModeConfig {
  level: DisplayMode;
  keybind: string;
  expandOnHover: boolean;
  autoExpandEvents: AutoExpandEvent[];
  autoCompactAtOpacity: number; // 0-100, auto-switch to minimal at threshold
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: CompactModeConfig = {
  level: 'full',
  keybind: 'Alt+M',
  expandOnHover: false,
  autoExpandEvents: ['hunger', 'weather'],
  autoCompactAtOpacity: 20,
};

// Private state
let config: CompactModeConfig = { ...DEFAULT_CONFIG };
let expandedSections: Set<string> = new Set();
let modeChangeCallback: ((mode: DisplayMode) => void) | null = null;
let expandedSectionsCallback: ((sections: Set<string>) => void) | null = null;

// Storage keys
const CONFIG_KEY = 'qpm:compactMode:config';
const EXPANDED_SECTIONS_KEY = 'qpm:compactMode:expandedSections';

/**
 * Initialize compact mode system
 */
export function initializeCompactMode(): void {
  loadConfig();
  loadExpandedSections();
  registerKeybind();
  log('✅ Compact mode initialized:', config.level);
}

/**
 * Load configuration from storage
 */
function loadConfig(): void {
  const saved = storage.get<CompactModeConfig>(CONFIG_KEY, DEFAULT_CONFIG);
  config = { ...DEFAULT_CONFIG, ...saved };
}

/**
 * Save configuration to storage
 */
function saveConfig(): void {
  storage.set(CONFIG_KEY, config);
}

/**
 * Load expanded sections from storage
 */
function loadExpandedSections(): void {
  const saved = storage.get<string[]>(EXPANDED_SECTIONS_KEY, []);
  expandedSections = new Set(saved);
}

/**
 * Save expanded sections to storage
 */
function saveExpandedSections(): void {
  storage.set(EXPANDED_SECTIONS_KEY, Array.from(expandedSections));
}

/**
 * Register keyboard shortcut
 */
function registerKeybind(): void {
  document.addEventListener('keydown', (event: KeyboardEvent) => {
    if (isKeybindMatch(event, config.keybind)) {
      event.preventDefault();
      cycleDisplayMode();
    }
  });
}

/**
 * Check if keyboard event matches keybind
 */
function isKeybindMatch(event: KeyboardEvent, keybind: string): boolean {
  const parts = keybind.toLowerCase().split('+');
  const hasAlt = parts.includes('alt') && event.altKey;
  const hasCtrl = parts.includes('ctrl') && event.ctrlKey;
  const hasShift = parts.includes('shift') && event.shiftKey;
  const key = parts[parts.length - 1];

  // Check modifiers
  const modifiersMatch =
    (parts.includes('alt') ? hasAlt : !event.altKey) &&
    (parts.includes('ctrl') ? hasCtrl : !event.ctrlKey) &&
    (parts.includes('shift') ? hasShift : !event.shiftKey);

  return modifiersMatch && event.key.toLowerCase() === key;
}

/**
 * Cycle through display modes
 */
export function cycleDisplayMode(): void {
  const modes: DisplayMode[] = ['full', 'compact', 'minimal', 'hidden'];
  const currentIndex = modes.indexOf(config.level);
  const nextIndex = (currentIndex + 1) % modes.length;
  const nextMode = modes[nextIndex];
  if (nextMode) {
    setDisplayMode(nextMode);
  }
}

/**
 * Set display mode
 */
export function setDisplayMode(mode: DisplayMode): void {
  config.level = mode;
  saveConfig();
  log(`🔄 Display mode changed to: ${mode}`);
  modeChangeCallback?.(mode);
}

/**
 * Get current display mode
 */
export function getDisplayMode(): DisplayMode {
  return config.level;
}

/**
 * Toggle section expanded state (for compact mode)
 */
export function toggleSectionExpanded(sectionId: string): void {
  if (expandedSections.has(sectionId)) {
    expandedSections.delete(sectionId);
  } else {
    expandedSections.add(sectionId);
  }
  saveExpandedSections();
  expandedSectionsCallback?.(expandedSections);
}

/**
 * Check if section is expanded
 */
export function isSectionExpanded(sectionId: string): boolean {
  return expandedSections.has(sectionId);
}

/**
 * Expand all sections (for compact mode)
 */
export function expandAllSections(): void {
  // Will be populated with actual section IDs when sections are created
  expandedSectionsCallback?.(expandedSections);
}

/**
 * Collapse all sections (for compact mode)
 */
export function collapseAllSections(): void {
  expandedSections.clear();
  saveExpandedSections();
  expandedSectionsCallback?.(expandedSections);
}

/**
 * Auto-expand on important event
 */
export function handleAutoExpandEvent(eventType: AutoExpandEvent): void {
  if (config.autoExpandEvents.includes(eventType)) {
    if (config.level === 'minimal' || config.level === 'hidden') {
      setDisplayMode('compact');
      log(`📣 Auto-expanded due to ${eventType} event`);
    }
  }
}

/**
 * Check opacity and auto-compact if below threshold
 */
export function checkAutoCompact(opacity: number): void {
  if (config.autoCompactAtOpacity > 0 && opacity <= config.autoCompactAtOpacity) {
    if (config.level === 'full' || config.level === 'compact') {
      setDisplayMode('minimal');
      log(`🔽 Auto-compacted due to low opacity: ${opacity}%`);
    }
  }
}

/**
 * Set mode change callback
 */
export function onModeChange(callback: (mode: DisplayMode) => void): void {
  modeChangeCallback = callback;
}

/**
 * Set expanded sections change callback
 */
export function onExpandedSectionsChange(callback: (sections: Set<string>) => void): void {
  expandedSectionsCallback = callback;
}

/**
 * Get current configuration
 */
export function getConfig(): CompactModeConfig {
  return { ...config };
}

/**
 * Update configuration
 */
export function updateConfig(updates: Partial<CompactModeConfig>): void {
  config = { ...config, ...updates };
  saveConfig();
  log('⚙️ Compact mode config updated');
}

/**
 * Get expanded sections
 */
export function getExpandedSections(): Set<string> {
  return new Set(expandedSections);
}

/**
 * Reset to defaults
 */
export function resetToDefaults(): void {
  config = { ...DEFAULT_CONFIG };
  expandedSections.clear();
  saveConfig();
  saveExpandedSections();
  modeChangeCallback?.(config.level);
  expandedSectionsCallback?.(expandedSections);
  log('🔄 Compact mode reset to defaults');
}
