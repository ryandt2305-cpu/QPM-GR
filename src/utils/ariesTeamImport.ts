// src/utils/ariesTeamImport.ts
// One-time import of pet teams from Aries Mod's localStorage storage.
// Reads the Aries teams (keyed under qws:pets:teams:v1 and fallbacks),
// normalizes them, and merges into QPM's pet teams config.

import { readTeamsFromLocalStorage } from '../integrations/ariesBridge';
import { getTeamsConfig, createTeam, setTeamSlot } from '../store/petTeams';
import type { PetTeam } from '../types/petTeams';

export interface AriesImportResult {
  imported: number;
  skipped: number;
  available: boolean;
}

function slotsFingerprint(slots: (string | null)[]): string {
  return slots.slice(0, 3).map(s => s ?? '').join('|');
}

/**
 * Import pet teams from Aries Mod localStorage into QPM's pet teams config.
 * Deduplicates by name + slot fingerprint.
 * Returns how many teams were imported vs skipped.
 */
export function importAriesTeams(): AriesImportResult {
  const ariesTeams = readTeamsFromLocalStorage();

  // Exclude the synthetic "Active Pets" team
  const realTeams = ariesTeams.filter(t => t.source !== 'activePets');

  if (realTeams.length === 0) {
    return { imported: 0, skipped: 0, available: false };
  }

  const config = getTeamsConfig();

  // Build fingerprints of existing teams to detect duplicates
  const existingFingerprints = new Set<string>(
    config.teams.map(t => `${t.name}::${slotsFingerprint(t.slots)}`),
  );

  let imported = 0;
  let skipped = 0;

  for (const raw of realTeams) {
    const slots: PetTeam['slots'] = [
      raw.slotIds[0] ?? null,
      raw.slotIds[1] ?? null,
      raw.slotIds[2] ?? null,
    ];

    const fingerprint = `${raw.name}::${slotsFingerprint(slots)}`;
    if (existingFingerprints.has(fingerprint)) {
      skipped++;
      continue;
    }

    // Use createTeam + setTeamSlot so the store handles persistence correctly
    const newTeam = createTeam(raw.name);
    for (let i = 0; i < 3; i++) {
      if (slots[i]) {
        setTeamSlot(newTeam.id, i as 0 | 1 | 2, slots[i] ?? null);
      }
    }

    existingFingerprints.add(fingerprint);
    imported++;
  }

  return { imported, skipped, available: true };
}
