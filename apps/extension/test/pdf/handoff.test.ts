import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { putHandoff, takeHandoff } from "../../src/lib/pdf/handoff";

const setup = () => ({ factory: new IDBFactory() as unknown as IDBFactory, now: () => clock.t });
const clock = { t: 1_000_000 };

describe("PDF handoff", () => {
  it("hands a file to the reader once", async () => {
    const o = setup();
    const id = await putHandoff("data:application/pdf;base64,QUJD", o);
    expect(await takeHandoff(id, o)).toBe("data:application/pdf;base64,QUJD");
    expect(await takeHandoff(id, o)).toBeNull();
  });

  it("gives every file its own id and answers null for unknown ids", async () => {
    const o = setup();
    const a = await putHandoff("a", o);
    const b = await putHandoff("b", o);
    expect(a).not.toBe(b);
    expect(await takeHandoff("nope", o)).toBeNull();
    expect(await takeHandoff(b, o)).toBe("b");
    expect(await takeHandoff(a, o)).toBe("a");
  });

  it("forgets files nobody picked up", async () => {
    const o = setup();
    const stale = await putHandoff("old", o);
    clock.t += 11 * 60_000;
    await putHandoff("new", o);
    expect(await takeHandoff(stale, o)).toBeNull();
  });
});
