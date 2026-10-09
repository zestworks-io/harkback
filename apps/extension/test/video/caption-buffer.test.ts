import { describe, expect, it } from "vitest";
import { CaptionBuffer } from "../../src/lib/video/caption-buffer";

describe("CaptionBuffer.add", () => {
  it("keeps lines in the order they were shown", () => {
    const b = new CaptionBuffer();
    b.add(10, ["we fine-tune with LoRA"]);
    b.add(14, ["which trains low rank adapters"]);
    expect(b.text()).toBe("we fine-tune with LoRA which trains low rank adapters");
  });

  it("ignores blank lines and tidies whitespace", () => {
    const b = new CaptionBuffer();
    b.add(1, ["", "  a \n  b  "]);
    expect(b.text()).toBe("a b");
  });

  it("does not repeat a line that is still on screen or has scrolled up", () => {
    const b = new CaptionBuffer();
    b.add(10, ["line one", "line two"]);
    b.add(13, ["line two", "line three"]);
    b.add(13, ["line two", "line three"]);
    expect(b.text()).toBe("line one line two line three");
    expect(b.size).toBe(3);
  });

  it("replaces a line with its longer self as auto-captions fill in", () => {
    const b = new CaptionBuffer();
    b.add(20, ["we apply"]);
    b.add(21, ["we apply low rank"]);
    b.add(22, ["we apply low rank adaptation"]);
    expect(b.text()).toBe("we apply low rank adaptation");
    expect(b.size).toBe(1);
  });

  it("keeps a short line that begins like the line before it", () => {
    const b = new CaptionBuffer();
    b.add(10, ["Yes we can use LoRA here"]);
    b.add(13, ["Yes"]);
    expect(b.size).toBe(2);
  });

  it("starts a new line after a pause, even when it begins with the last one", () => {
    const b = new CaptionBuffer();
    b.add(10, ["So"]);
    b.add(20, ["So what is LoRA"]);
    expect(b.size).toBe(2);
    expect(b.text()).toBe("So So what is LoRA");
  });

  it("does not grow a line by half a word", () => {
    const b = new CaptionBuffer();
    b.add(10, ["we apply low"]);
    b.add(11, ["we apply lower bounds"]);
    expect(b.size).toBe(2);
  });

  it("keeps a repeated line when it is said again much later", () => {
    const b = new CaptionBuffer();
    b.add(10, ["as I said"]);
    b.add(500, ["as I said"]);
    expect(b.size).toBe(2);
  });

  it("does not duplicate lines after a rewind", () => {
    const b = new CaptionBuffer();
    b.add(100, ["alpha"]);
    b.add(105, ["beta"]);
    b.add(100, ["alpha"]);
    expect(b.text()).toBe("alpha beta");
  });

  it("drops the oldest lines past its limit and always keeps the newest", () => {
    const b = new CaptionBuffer();
    for (let i = 0; i < 100; i++) b.add(i * 20, [`${"x".repeat(80)} ${i}`]);
    expect(b.text().length).toBeLessThanOrEqual(4100);
    expect(b.text().endsWith(" 99")).toBe(true);
    expect(b.text()).not.toContain(" 0 ");
  });

  it("can be cleared", () => {
    const b = new CaptionBuffer();
    b.add(1, ["a"]);
    b.clear();
    expect(b.size).toBe(0);
    expect(b.text()).toBe("");
  });
});

describe("CaptionBuffer.context", () => {
  const seen = () => {
    const b = new CaptionBuffer();
    b.add(30, ["so the idea is that we freeze the weights"]);
    b.add(35, ["and train low rank adaptation matrices"]);
    b.add(41, ["called LoRA adapters for short"]);
    return b;
  };

  it("returns the text around the selection with the line's position", () => {
    const c = seen().context("LoRA");
    expect(c).not.toBeNull();
    expect(c!.t).toBe(41);
    expect(c!.paragraph).toContain("freeze the weights");
    expect(c!.prefix.endsWith("matrices called")).toBe(true);
    expect(c!.suffix.startsWith("adapters for short")).toBe(true);
  });

  it("matches without regard to case", () => {
    expect(seen().context("lora")?.t).toBe(41);
  });

  it("uses the most recent occurrence", () => {
    const b = new CaptionBuffer();
    b.add(10, ["LoRA is small"]);
    b.add(300, ["and LoRA is cheap"]);
    expect(b.context("LoRA")?.t).toBe(300);
  });

  it("limits prefix and suffix to 64 characters", () => {
    const b = new CaptionBuffer();
    b.add(1, [`${"a ".repeat(100)}TERM${" b".repeat(100)}`]);
    const c = b.context("TERM")!;
    expect(c.prefix.length).toBeLessThanOrEqual(64);
    expect(c.suffix.length).toBeLessThanOrEqual(64);
  });

  it("limits the paragraph to 2000 characters and keeps the selection in it", () => {
    const b = new CaptionBuffer();
    for (let i = 0; i < 30; i++) b.add(i * 20, [`${"filler ".repeat(20)}${i === 15 ? "NEEDLE" : i}`]);
    const c = b.context("NEEDLE")!;
    expect(c.paragraph.length).toBeLessThanOrEqual(2000);
    expect(c.paragraph).toContain("NEEDLE");
  });

  it("is null for text that was never shown", () => {
    expect(seen().context("transformer")).toBeNull();
    expect(seen().context("   ")).toBeNull();
    expect(new CaptionBuffer().context("LoRA")).toBeNull();
  });

  it("keeps offsets right after a letter whose lower case is longer", () => {
    const b = new CaptionBuffer();
    b.add(1, ["İstanbul talks about LoRA adapters today"]);
    const c = b.context("LoRA")!;
    expect(c.matched).toBe("LoRA");
    expect(c.prefix.endsWith("talks about")).toBe(true);
    expect(c.suffix.startsWith("adapters today")).toBe(true);
  });

  it("finds a selection that ran across a line break, and returns it with its space", () => {
    const b = new CaptionBuffer();
    b.add(5, ["we fine-tune with low-rank", "adaptation modules"]);
    const c = b.context("low-rankadaptation")!;
    expect(c.matched).toBe("low-rank adaptation");
    expect(c.suffix.startsWith("modules")).toBe(true);
  });

  it("treats the characters of the selection literally", () => {
    const b = new CaptionBuffer();
    b.add(1, ["the loss L(x) is a+b [see eq. 3]"]);
    expect(b.context("L(x)")?.matched).toBe("L(x)");
    expect(b.context("[see eq. 3]")?.matched).toBe("[see eq. 3]");
    expect(b.context("a.b")).toBeNull();
  });
});
