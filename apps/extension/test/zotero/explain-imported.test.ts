// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { LIMITS, utf8Length } from "@harkback/spec";
import { importedExplanation, routeImported, unexplainedEncounters } from "../../src/lib/explain/imported";
import { explainImported, type ExplainImportedDeps } from "../../src/lib/pages/explain-imported";
import { withDefaults } from "../../src/lib/storage/settings";
import { world } from "../helpers";

const local = { id: "l", label: "Ollama", baseUrl: "http://127.0.0.1:11434/v1", apiKey: "", model: "m", provider: "custom" };
const remote = { id: "r", label: "OpenAI", baseUrl: "https://api.openai.com/v1", apiKey: "k", model: "gpt", provider: "openai" };

function records() {
  const w = world();
  w.source("arxiv:1", "normal", "LoRA paper");
  w.source("zotero:1/FILE", "sensitive", "lab notes.pdf");
  const lora = w.concept("LoRA");
  const notes = w.concept("Confidence interval");
  const explained = w.concept("Softmax");
  return {
    w,
    lora: w.encounter(lora, "arxiv:1", ""),
    notes: w.encounter(notes, "zotero:1/FILE", ""),
    softmax: w.encounter(explained, "arxiv:1", "Turns scores into probabilities."),
  };
}

describe("routeImported", () => {
  it("sends a term from a paper to the default model, and one from a sensitive file only to a local one", () => {
    const { w, lora, notes, softmax } = records();
    const state = w.state();
    expect(unexplainedEncounters(state)).toEqual([lora, notes]);
    const both = withDefaults({ models: [remote, local], defaultModelId: "r", localModelId: "l" });
    expect(routeImported(both, state, lora)).toMatchObject({ kind: "ok", remote: true, term: "LoRA", title: "LoRA paper" });
    expect(routeImported(both, state, notes)).toMatchObject({ kind: "ok", remote: false });
    const remoteOnly = withDefaults({ models: [remote], defaultModelId: "r" });
    expect(routeImported(remoteOnly, state, notes)).toEqual({ kind: "error", code: "needs_local_model" });
    expect(routeImported(both, state, softmax)).toEqual({ kind: "error", code: "expired" });
    w.source("doi:10.1/x", "normal", "Blog", { url: "https://blocked.example/post" });
    const blocked = w.encounter(w.concept("Adapters"), "doi:10.1/x", "");
    const disabled = withDefaults({ ...both, sites: [{ pattern: "blocked.example", disabled: true }] });
    expect(routeImported(disabled, w.state(), blocked)).toEqual({ kind: "error", code: "site_disabled" });
  });

  it("follows the site rules for arxiv.org and doi.org for a paper imported without an address", () => {
    const { w, lora } = records();
    w.source("doi:10.5555/x", "normal", "A journal paper", { doi: "10.5555/x" });
    const journal = w.encounter(w.concept("Dropout"), "doi:10.5555/x", "");
    const both = withDefaults({ models: [remote, local], defaultModelId: "r", localModelId: "l" });
    const arxivOff = withDefaults({ ...both, sites: [{ pattern: "arxiv.org", disabled: true }] });
    w.source("arxiv:1", "normal", "LoRA paper", { arxiv: "1" });
    expect(routeImported(arxivOff, w.state(), lora)).toEqual({ kind: "error", code: "site_disabled" });
    const doiSensitive = withDefaults({ ...both, sites: [{ pattern: "doi.org", sensitive: true }] });
    expect(routeImported(doiSensitive, w.state(), journal)).toMatchObject({ kind: "ok", remote: false });
  });
});

describe("importedExplanation", () => {
  it("keeps the event under the size limit however many bytes the characters take", () => {
    expect(importedExplanation("Low-rank adapters.", "m")).toEqual({
      text: "Low-rank adapters.",
      tier: "external_knowledge",
      evidence_span: null,
      model: "m",
    });
    for (const ch of ["\u4e2d", "\u{1F600}", "\u0001"]) {
      const { text } = importedExplanation(ch.repeat(20_000), "m");
      expect(utf8Length(JSON.stringify(text))).toBeLessThan(LIMITS.maxEventBytes - 1024);
      expect(text.length).toBeGreaterThan(0);
      // Never ends on half of a character.
      expect(text.endsWith(ch)).toBe(true);
    }
  });
});

describe("explainImported", () => {
  function setup(
    answers: Record<string, ReturnType<ExplainImportedDeps["explain"]> extends Promise<infer R> ? R[] : never>,
    sleep?: ExplainImportedDeps["sleep"],
  ) {
    let pending = Object.keys(answers);
    const slept: number[] = [];
    const deps: ExplainImportedDeps = {
      lang: () => "en",
      pending: () => pending,
      explain: vi.fn(async (id: string) => {
        const r = answers[id]!.shift()!;
        if (r.ok) pending = pending.filter((p) => p !== id);
        return r;
      }),
      reload: vi.fn(async () => draw()),
      draw: () => draw(),
      sleep: sleep ?? (async (ms) => void slept.push(ms)),
    };
    const bar = explainImported(deps);
    const draw = () => document.body.replaceChildren(...[bar.view()].filter((e): e is HTMLElement => e !== null));
    draw();
    const text = () => document.body.textContent;
    const click = (hb: string) => document.querySelector<HTMLElement>(`[data-hb="${hb}"]`)!.click();
    return { deps, text, click, slept };
  }

  it("explains each one, waits out the rate limit, and goes on past one that cannot be explained", async () => {
    const s = setup({
      a: [{ ok: false, code: "local_rate", retryAfterMs: 5000 }, { ok: true }],
      b: [{ ok: false, code: "needs_local_model" }],
      c: [{ ok: true }],
    });
    expect(s.text()).toBe("Look-ups from Zotero not explained yet: 3. Explain them with my model");
    s.click("explain-imported");
    await vi.waitFor(() => expect(s.text()).toContain("Explained: 2. Could not explain: 1."));
    expect(s.slept).toEqual([5250]);
    expect(s.text()).toContain("Look-ups from Zotero not explained yet: 1.");
    // The records are read again once, when the run ends, not after every term.
    expect(s.deps.reload).toHaveBeenCalledTimes(1);
  });

  it("ends the run when the rate limit asks for a long wait, leaving the rest to explain later", async () => {
    const s = setup({ a: [{ ok: true }], b: [{ ok: false, code: "local_rate", retryAfterMs: 30 * 60_000 }], c: [{ ok: true }] });
    s.click("explain-imported");
    await vi.waitFor(() => expect(s.text()).toMatch(/^Explained: 1\. .+Look-ups from Zotero not explained yet: 2\./));
    expect(s.deps.explain).toHaveBeenCalledTimes(2);
    expect(s.slept).toEqual([]);
  });

  it("stops when asked, and shows nothing once all are explained", async () => {
    const s = setup({ a: [{ ok: true }], b: [{ ok: true }] });
    s.click("explain-imported");
    s.click("explain-imported-stop");
    await vi.waitFor(() => expect(s.text()).toContain("Explained: 1."));
    expect(s.deps.explain).toHaveBeenCalledTimes(1);

    const done = setup({ a: [{ ok: true }] });
    done.click("explain-imported");
    await vi.waitFor(() => expect(done.text()).toBe("Explained: 1."));
  });

  it("ends a wait for the rate limit at once when stopped", async () => {
    // A wait that would never end by itself.
    const s = setup(
      { a: [{ ok: false, code: "local_rate", retryAfterMs: 60_000 }, { ok: true }], b: [{ ok: true }] },
      () => new Promise(() => undefined),
    );
    s.click("explain-imported");
    await vi.waitFor(() => expect(s.text()).toContain("waiting for the rate limit"));
    s.click("explain-imported-stop");
    await vi.waitFor(() => expect(s.text()).toContain("Explained: 0."));
    expect(s.deps.explain).toHaveBeenCalledTimes(1);
  });

  it("does not count a term as failed when Stop was pressed while the model was asked", async () => {
    let answer!: (r: { ok: false; code: "local_rate"; retryAfterMs: number }) => void;
    const s = setup({ a: [], b: [] });
    s.deps.explain = vi.fn(() => new Promise<{ ok: false; code: "local_rate"; retryAfterMs: number }>((r) => (answer = r)));
    s.click("explain-imported");
    await vi.waitFor(() => expect(s.deps.explain).toHaveBeenCalledTimes(1));
    s.click("explain-imported-stop");
    answer({ ok: false, code: "local_rate", retryAfterMs: 5000 });
    await vi.waitFor(() => expect(s.text()).toContain("Explained: 0."));
    expect(s.text()).not.toContain("Could not explain");
  });
});
