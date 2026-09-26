const DAY_MS = 86_400_000;

export const BACKUP_KEEP = 4;
export const BACKUP_INTERVAL_DAYS = 7;

export interface BackupState {
  lastAt: number | null;
  /** chrome.downloads ids of the files we wrote, oldest first. */
  downloadIds: number[];
}

export const EMPTY_BACKUP_STATE: BackupState = { lastAt: null, downloadIds: [] };

export function isBackupDue(state: BackupState, now: number, intervalDays = BACKUP_INTERVAL_DAYS): boolean {
  return state.lastAt === null || now - state.lastAt >= intervalDays * DAY_MS;
}

/** Relative to the Downloads folder. */
export function backupFilename(device: string, now: number): string {
  return `harkback/backup-${device}-${new Date(now).toISOString().slice(0, 10)}.jsonl`;
}

export function applyRetention(ids: readonly number[], newId: number, keep = BACKUP_KEEP): { keep: number[]; remove: number[] } {
  const all = [...ids, newId];
  const cut = Math.max(0, all.length - keep);
  return { keep: all.slice(cut), remove: all.slice(0, cut) };
}
