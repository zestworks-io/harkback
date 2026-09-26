const MINUTE = 60_000;
const HOUR = 3_600_000;

export interface RateLimits {
  perMinute: number;
  perHour: number;
}

export type RateResult = { ok: true } | { ok: false; retryAfterMs: number };

export class RateLimiter {
  private times: number[] = [];

  load(times: readonly number[]): void {
    this.times = times.filter((t) => Number.isFinite(t)).sort((a, b) => a - b);
  }

  stamps(): number[] {
    return [...this.times];
  }

  tryAcquire(limits: RateLimits, now: number): RateResult {
    this.times = this.times.filter((t) => t <= now && now - t < HOUR);
    const lastMinute = this.times.filter((t) => now - t < MINUTE);
    if (lastMinute.length >= limits.perMinute) return { ok: false, retryAfterMs: lastMinute[0]! + MINUTE - now };
    if (this.times.length >= limits.perHour) return { ok: false, retryAfterMs: this.times[0]! + HOUR - now };
    this.times.push(now);
    return { ok: true };
  }
}
