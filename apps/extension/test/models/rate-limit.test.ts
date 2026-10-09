import { describe, expect, it } from "vitest";
import { RateLimiter } from "../../src/lib/models/rate-limit";

const limits = { perMinute: 2, perHour: 10 };

describe("RateLimiter", () => {
  it("allows requests up to the per-minute budget, then says when to retry", () => {
    const r = new RateLimiter();
    expect(r.tryAcquire(limits, 1000)).toEqual({ ok: true });
    expect(r.tryAcquire(limits, 2000)).toEqual({ ok: true });
    expect(r.tryAcquire(limits, 3000)).toEqual({ ok: false, retryAfterMs: 58_000 });
  });

  it("gives a failed request back", () => {
    const r = new RateLimiter();
    r.tryAcquire(limits, 1000);
    r.tryAcquire(limits, 2000);
    r.release(2000);
    expect(r.tryAcquire(limits, 3000)).toEqual({ ok: true });
    expect(r.stamps()).toEqual([1000, 3000]);
  });

  it("gives back the request that failed, not a later one", () => {
    const r = new RateLimiter();
    r.tryAcquire(limits, 1000);
    r.tryAcquire(limits, 2000);
    r.release(1000);
    expect(r.stamps()).toEqual([2000]);
    r.release(5000);
    expect(r.stamps()).toEqual([2000]);
  });
});
