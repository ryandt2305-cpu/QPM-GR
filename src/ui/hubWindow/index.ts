// src/ui/hubWindow/index.ts — Public API

import type { HubGroupDef, HubGroupId } from './cards/types';
import { toggleWindow } from '../modalWindow';
import { renderHub } from './hubWindow';
import { setActiveGroup } from './state';

export type { HubGroupDef, HubGroupId, CardConfig, CardIcon } from './cards/types';
export type { InlineToggleConfig, ExpandableCardConfig, LauncherCardConfig } from './cards/types';

export const HUB_WINDOW_ID = 'qpm-hub';

let registeredGroups: ReadonlyArray<HubGroupDef> = [];

export function registerHubGroups(groups: ReadonlyArray<HubGroupDef>): void {
  registeredGroups = groups;
}

export function toggleHub(): void {
  toggleWindow(HUB_WINDOW_ID, '🔮 QPM Hub', (root) => {
    root.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden;padding:0;';
    const { element, cleanup } = renderHub(registeredGroups);
    root.appendChild(element);

    // Store cleanup for when window closes
    (root as unknown as Record<string, unknown>).__hubCleanup = cleanup;
  }, '800px', '85vh');
}

export function openHubToGroup(groupId: HubGroupId): void {
  setActiveGroup(groupId);
  toggleHub();
}
