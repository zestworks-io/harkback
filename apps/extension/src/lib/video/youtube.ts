import { formatTimestamp } from "@harkback/core";
import type { DetectedSource } from "../source/source-id";

export { formatTimestamp };

const ID = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = /^(?:www\.|m\.|music\.)?youtube(?:-nocookie)?\.com$/;

/** The video a YouTube address points at, whichever of its forms it is written in; null for anything else. */
export function videoIdFromUrl(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  let id: string | null | undefined;
  if (u.hostname === "youtu.be") id = u.pathname.split("/")[1];
  else if (HOSTS.test(u.hostname)) {
    const [, kind, rest] = u.pathname.split("/");
    id = kind === "watch" ? u.searchParams.get("v") : kind === "embed" || kind === "shorts" || kind === "live" ? rest : null;
  }
  return id && ID.test(id) ? id : null;
}

/** Only `www.youtube.com/watch` is read; shorts, embeds and other hosts are not. */
export function isWatchPage(url: string): boolean {
  try {
    const u = new URL(url);
    return (u.hostname === "www.youtube.com" || u.hostname === "youtube.com") && u.pathname === "/watch" && videoIdFromUrl(url) !== null;
  } catch {
    return false;
  }
}

export const sourceIdFor = (videoId: string): string => `youtube:${videoId}`;

/** The video of a recorded source id, or null when the source is not a video. */
export function videoIdFromSourceId(sourceId: string): string | null {
  const id = sourceId.startsWith("youtube:") ? sourceId.slice("youtube:".length) : null;
  return id && ID.test(id) ? id : null;
}

/** One address per video: no start time, playlist or tracking parameters, whichever link the reader came from. */
export const watchUrl = (videoId: string): string => `https://www.youtube.com/watch?v=${videoId}`;

/** The video opened at a position. */
export const watchUrlAt = (videoId: string, seconds: number): string => `${watchUrl(videoId)}&t=${Math.max(0, Math.floor(seconds))}s`;

export function youtubeSource(videoId: string, title: string): DetectedSource {
  return {
    source_id: sourceIdFor(videoId),
    ids: { url: watchUrl(videoId) },
    title: title.replace(/\s+/g, " ").trim(),
    license: "unknown",
  };
}
