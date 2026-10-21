/**
 * Runs `task` when asked, never two at once: asks made while it runs share one more run after it, which starts no sooner than
 * `gapMs` after the last one began. A burst of changes (explaining many terms, an import in another tab) is then read a few
 * times, not once per change.
 */
export function coalesce(
  task: () => Promise<void>,
  gapMs: number,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  now: () => number = Date.now,
): () => Promise<void> {
  let running: Promise<void> | null = null;
  let queued: Promise<void> | null = null;
  let last = -Infinity;
  const go = async (): Promise<void> => {
    const delay = last + gapMs - now();
    if (delay > 0) await wait(delay);
    last = now();
    await task();
  };
  const start = (): Promise<void> => (running = go().finally(() => (running = null)));
  return () => {
    if (queued) return queued;
    if (!running) return start();
    queued = running
      .catch(() => undefined)
      .then(() => {
        queued = null;
        return start();
      });
    return queued;
  };
}
