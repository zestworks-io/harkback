import { describe, expect, it } from "vitest";
import { clozeHint } from "../../src/lib/review/cloze";

describe("clozeHint", () => {
  it("hides the term under any of its names", () => {
    const text = "LoRA adds small matrices to a frozen model. Low-Rank Adaptation keeps training cheap. The rest is unrelated.";
    expect(clozeHint(text, ["LoRA", "Low-Rank Adaptation"])).toBe("[…] adds small matrices to a frozen model. […] keeps training cheap.");
  });

  it("hides inflected forms and works on other scripts", () => {
    expect(clozeHint("Die Gradienten zeigen die Richtung.", ["Gradient"])).toBe("Die […] zeigen die Richtung.");
    expect(clozeHint("低秩适配是一种微调方法。它很便宜。", ["低秩适配"])).toBe("[…]是一种微调方法。");
  });

  it("hides every mention in a sentence, and plain-texts the formatting", () => {
    expect(clozeHint("**Attention** weighs tokens; attention is cheap.", ["attention"])).toBe("[…] weighs tokens; […] is cheap.");
  });

  it("does not hide a longer word that only contains the term", () => {
    expect(clozeHint("Self-attention is a kind of attentional pooling.", ["attentional pooling x"])).toBeNull();
    expect(clozeHint("The Transformer is large.", ["Transform"])).toBeNull();
  });

  it("keeps a name with a dot, a hash or a star whole", () => {
    expect(clozeHint("Node.js is a runtime. It is fast.", ["Node.js"])).toBe("[…] is a runtime.");
    expect(clozeHint("C# is typed.", ["C#"])).toBe("[…] is typed.");
    expect(clozeHint("A C*-algebra is closed.", ["C*-algebra"])).toBe("A […] is closed.");
  });

  it("is null when no sentence names the term", () => {
    expect(clozeHint("It is a method.", ["LoRA"])).toBeNull();
  });

  it("keeps the hint short", () => {
    const long = `LoRA ${"word ".repeat(200)}.`;
    expect(clozeHint(long, ["LoRA"])!.length).toBeLessThanOrEqual(401);
  });
});
