// src/services/backupService.ts — Settings export/import service
//
// No side effects on import. No init step required.

import { storage, exportAllValues, importAllValues } from '../utils/storage';
import { getCurrentVersion } from '../utils/versionChecker';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BackupEnvelope {
  _format: 'qpm-backup';
  _version: 1;
  appVersion: string;
  createdAt: string;
  name?: string | undefined;
  keyCount: number;
  data: Record<string, string>;
}

export interface ImportResult {
  ok: boolean;
  keysWritten: number;
  warnings: string[];
}

interface ValidationSuccess {
  valid: true;
  envelope: BackupEnvelope;
  warnings: string[];
}

interface ValidationFailure {
  valid: false;
  reason: string;
}

type ValidationResult = ValidationSuccess | ValidationFailure;

// ---------------------------------------------------------------------------
// Snapshot / Validate
// ---------------------------------------------------------------------------

/** Create a snapshot envelope from current storage state. */
export function createSnapshot(name?: string): BackupEnvelope {
  const data = exportAllValues();
  return {
    _format: 'qpm-backup',
    _version: 1,
    appVersion: getCurrentVersion(),
    createdAt: new Date().toISOString(),
    name,
    keyCount: Object.keys(data).length,
    data,
  };
}

/** Validate a parsed JSON object as a BackupEnvelope. */
export function validateEnvelope(raw: unknown): ValidationResult {
  if (raw == null || typeof raw !== 'object') {
    return { valid: false, reason: 'Not a valid JSON object' };
  }

  const obj = raw as Record<string, unknown>;

  if (obj._format !== 'qpm-backup') {
    return { valid: false, reason: 'Missing or invalid _format field (expected "qpm-backup")' };
  }

  if (obj._version !== 1) {
    return { valid: false, reason: `Unsupported backup version: ${String(obj._version)}` };
  }

  if (typeof obj.data !== 'object' || obj.data == null || Array.isArray(obj.data)) {
    return { valid: false, reason: 'Missing or invalid data field' };
  }

  const data = obj.data as Record<string, unknown>;
  const warnings: string[] = [];

  // Validate all values are strings
  let nonStringCount = 0;
  for (const val of Object.values(data)) {
    if (typeof val !== 'string') nonStringCount++;
  }
  if (nonStringCount > 0) {
    warnings.push(`${nonStringCount} non-string value(s) will be skipped`);
  }

  // Version mismatch warning
  const currentVer = getCurrentVersion();
  if (typeof obj.appVersion === 'string' && obj.appVersion !== currentVer) {
    warnings.push(`Backup from v${obj.appVersion}, current is v${currentVer}`);
  }

  const envelope: BackupEnvelope = {
    _format: 'qpm-backup',
    _version: 1,
    appVersion: typeof obj.appVersion === 'string' ? obj.appVersion : 'unknown',
    createdAt: typeof obj.createdAt === 'string' ? obj.createdAt : new Date().toISOString(),
    name: typeof obj.name === 'string' ? obj.name : undefined,
    keyCount: Object.keys(data).length,
    data: Object.fromEntries(
      Object.entries(data).filter(([, v]) => typeof v === 'string'),
    ) as Record<string, string>,
  };

  return { valid: true, envelope, warnings };
}

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

/** Trigger a browser file download of the current settings. */
export function downloadBackup(): void {
  const envelope = createSnapshot();
  const json = JSON.stringify(envelope, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  link.href = url;
  link.download = `qpm-settings-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Import from file
// ---------------------------------------------------------------------------

/** Import settings from a JSON file. Clears existing settings before writing. */
export async function importFromFile(file: File): Promise<ImportResult> {
  const text = await file.text();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, keysWritten: 0, warnings: ['Invalid JSON file'] };
  }

  const result = validateEnvelope(parsed);
  if (!result.valid) {
    return { ok: false, keysWritten: 0, warnings: [result.reason] };
  }

  const { envelope, warnings } = result;

  // Clear and write imported data
  storage.clear();
  const keysWritten = importAllValues(envelope.data);

  return { ok: true, keysWritten, warnings };
}
