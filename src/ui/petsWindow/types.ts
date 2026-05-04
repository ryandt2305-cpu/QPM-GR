// Shared types for the petsWindow subfolder.

import type { CompareStage } from '../../data/petCompareRules';

export interface CompareUiState {
  selectedTeamAId?: string;
  selectedTeamBId?: string;
  abilityByPair?: Record<string, string>;
}

export interface PetTeamsUiState {
  compare?: CompareUiState;
}

export interface ManagerState {
  selectedTeamId: string | null;
  searchTerm: string;
  selectTeam: (teamId: string | null) => void;
  cleanups: Array<() => void>;
}

export interface ComparePanelHandle {
  root: HTMLElement;
  setPair: (teamAId: string | null, teamBId: string | null) => void;
  refresh: () => void;
}

export interface CompareStateChange {
  visible: boolean;
  stage: CompareStage | null;
}
