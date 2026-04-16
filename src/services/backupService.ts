// src/services/backupService.ts — Settings backup/restore service
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
  name?: string;
  keyCount: number;
  data: Record<string, string>;
}

export interface BackupMeta {
  name: string;
  appVersion: string;
  createdAt: string;
  keyCount: number;
  sizeBytes: number;
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
// Constants
// ---------------------------------------------------------------------------

const BACKUP_REGISTRY_KEY = 'qpm.backups.v1';
const BACKUP_DATA_PREFIX = 'qpm.backup.data.';
const MAX_NAMED_BACKUPS = 3;

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

/** Import settings from a JSON file. Auto-backs up before destructive clear. */
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

  // Preserve existing backups through the clear
  const preservedRegistry = loadRegistry();
  const preservedBackupData: Array<{ key: string; value: string }> = [];
  for (const meta of preservedRegistry) {
    const dataKey = BACKUP_DATA_PREFIX + meta.name;
    const raw = storage.get<string | null>(dataKey, null);
    if (raw !== null) {
      preservedBackupData.push({ key: dataKey, value: JSON.stringify(raw) });
    }
  }

  // Auto-backup current state
  try {
    saveNamedBackupInternal('pre-import-auto', preservedRegistry);
  } catch { /* best effort */ }

  // Re-read registry after auto-backup (it may have added/evicted entries)
  const updatedRegistry = loadRegistry();
  const updatedBackupData: Array<{ key: string; value: string }> = [];
  for (const meta of updatedRegistry) {
    const dataKey = BACKUP_DATA_PREFIX + meta.name;
    const raw = storage.get<string | null>(dataKey, null);
    if (raw !== null) {
      updatedBackupData.push({ key: dataKey, value: JSON.stringify(raw) });
    }
  }

  // Clear and write imported data
  storage.clear();
  const keysWritten = importAllValues(envelope.data);

  // Restore backup registry + data
  storage.set(BACKUP_REGISTRY_KEY, updatedRegistry);
  for (const { key, value } of updatedBackupData) {
    try {
      storage.set(key, JSON.parse(value));
    } catch { /* skip */ }
  }

  return { ok: true, keysWritten, warnings };
}

// ---------------------------------------------------------------------------
// Named backups (in-storage)
// ---------------------------------------------------------------------------

function loadRegistry(): BackupMeta[] {
  return storage.get<BackupMeta[]>(BACKUP_REGISTRY_KEY, []);
}

function saveRegistry(registry: BackupMeta[]): void {
  storage.set(BACKUP_REGISTRY_KEY, registry);
}

function saveNamedBackupInternal(name: string, existingRegistry?: BackupMeta[]): BackupMeta {
  const snapshot = createSnapshot(name);
  const json = JSON.stringify(snapshot);

  const meta: BackupMeta = {
    name,
    appVersion: snapshot.appVersion,
    createdAt: snapshot.createdAt,
    keyCount: snapshot.keyCount,
    sizeBytes: json.length,
  };

  const registry = existingRegistry ?? loadRegistry();

  // Remove existing backup with same name
  const filtered = registry.filter(b => b.name !== name);

  // Enforce max backups — evict oldest non-auto first, then oldest auto
  while (filtered.length >= MAX_NAMED_BACKUPS) {
    const nonAutoIdx = filtered.findIndex(b => !b.name.endsWith('-auto'));
    const evictIdx = nonAutoIdx >= 0 ? nonAutoIdx : 0;
    const evicted = filtered.splice(evictIdx, 1)[0];
    if (evicted) storage.remove(BACKUP_DATA_PREFIX + evicted.name);
  }

  filtered.push(meta);
  saveRegistry(filtered);
  storage.set(BACKUP_DATA_PREFIX + name, snapshot);

  return meta;
}

/** Save a named in-storage backup. Max 3 total; oldest evicted. */
export function saveNamedBackup(name: string): BackupMeta {
  return saveNamedBackupInternal(name);
}

/** Restore from a named in-storage backup. Auto-backs up before destructive clear. */
export function restoreNamedBackup(name: string): ImportResult {
  const registry = loadRegistry();
  const meta = registry.find(b => b.name === name);
  if (!meta) {
    return { ok: false, keysWritten: 0, warnings: [`Backup "${name}" not found`] };
  }

  const snapshot = storage.get<BackupEnvelope | null>(BACKUP_DATA_PREFIX + name, null);
  if (!snapshot?.data) {
    return { ok: false, keysWritten: 0, warnings: [`Backup "${name}" data is missing or corrupt`] };
  }

  const warnings: string[] = [];
  const currentVer = getCurrentVersion();
  if (snapshot.appVersion !== currentVer) {
    warnings.push(`Backup from v${snapshot.appVersion}, current is v${currentVer}`);
  }

  // Capture all backup data into memory before clear
  const preservedRegistry = loadRegistry();
  const preservedBackupData: Array<{ key: string; value: string }> = [];
  for (const m of preservedRegistry) {
    const dataKey = BACKUP_DATA_PREFIX + m.name;
    const raw = storage.get<unknown>(dataKey, null);
    if (raw !== null) {
      preservedBackupData.push({ key: dataKey, value: JSON.stringify(raw) });
    }
  }

  // Auto-backup current state
  try {
    saveNamedBackupInternal('pre-restore-auto', preservedRegistry);
  } catch { /* best effort */ }

  // Re-read after auto-backup
  const updatedRegistry = loadRegistry();
  const updatedBackupData: Array<{ key: string; value: string }> = [];
  for (const m of updatedRegistry) {
    const dataKey = BACKUP_DATA_PREFIX + m.name;
    const raw = storage.get<unknown>(dataKey, null);
    if (raw !== null) {
      updatedBackupData.push({ key: dataKey, value: JSON.stringify(raw) });
    }
  }

  // Clear and restore
  storage.clear();
  const keysWritten = importAllValues(snapshot.data);

  // Restore backup registry + data
  storage.set(BACKUP_REGISTRY_KEY, updatedRegistry);
  for (const { key, value } of updatedBackupData) {
    try {
      storage.set(key, JSON.parse(value));
    } catch { /* skip */ }
  }

  return { ok: true, keysWritten, warnings };
}

/** Delete a named backup. */
export function deleteNamedBackup(name: string): void {
  const registry = loadRegistry();
  const filtered = registry.filter(b => b.name !== name);
  saveRegistry(filtered);
  storage.remove(BACKUP_DATA_PREFIX + name);
}

/** List all named backups. */
export function listBackups(): BackupMeta[] {
  return loadRegistry();
}
