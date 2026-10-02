import { DAY_MS } from "@harkback/core";

const BACKUP_KEEP = 4;
const BACKUP_INTERVAL_DAYS = 7;

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

type DownloadState = "in_progress" | "interrupted" | "complete";

/** The part of `chrome.downloads` that `waitForDownload` uses; tests supply a fake. */
export interface DownloadsApi {
  search(query: { id: number }): Promise<{ state: DownloadState }[]>;
  onChanged: {
    addListener(l: (delta: { id: number; state?: { current?: DownloadState } }) => void): void;
    removeListener(l: (delta: { id: number; state?: { current?: DownloadState } }) => void): void;
  };
}

/** Resolves when the browser has finished or given up on a download; one that never settles counts as interrupted. */
export function waitForDownload(api: DownloadsApi, id: number, timeoutMs = 120_000): Promise<"complete" | "interrupted"> {
  return new Promise((resolve) => {
    const settle = (state: "complete" | "interrupted") => {
      clearTimeout(timer);
      api.onChanged.removeListener(listener);
      resolve(state);
    };
    const listener = (delta: { id: number; state?: { current?: DownloadState } }) => {
      const state = delta.state?.current;
      if (delta.id === id && (state === "complete" || state === "interrupted")) settle(state);
    };
    const timer = setTimeout(() => settle("interrupted"), timeoutMs);
    api.onChanged.addListener(listener);
    // It may have finished before the listener was in place.
    void api
      .search({ id })
      .then(([d]) => {
        if (d && (d.state === "complete" || d.state === "interrupted")) settle(d.state);
      })
      .catch(() => undefined);
  });
}
