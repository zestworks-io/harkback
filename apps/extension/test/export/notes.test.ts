import { describe, expect, it } from "vitest";
import { conceptDetail } from "../../src/lib/records/concept-detail";
import { conceptNote, mergeNote, NOTE_END, noteFilename, noteFiles, writeNoteFiles } from "../../src/lib/export/notes";
import { world } from "../helpers";

function build() {
  const w = world();
  w.source("s1", "normal", "Paper One");
  const lora = w.concept("LoRA", ["Low-Rank Adaptation"]);
  const enc = w.encounter(lora, "s1", "LoRA freezes weights.\nIt trains low-rank matrices.");
  w.events.push(w.f.make("encounter.action", { encounter_id: enc, action: "marked_understood" }));
  const rank = w.concept("Matrix rank");
  w.encounter(rank, "s1");
  const qlora = w.concept("QLoRA");
  w.encounter(qlora, "s1");
  const peft = w.concept("PEFT");
  const edge = (from: string, rel: "prerequisite" | "variant_of" | "related", to: string) =>
    w.events.push(w.f.make("edge.proposed", { from, to, rel, source: "llm_explain", confidence: 0.9, evidence: {} }));
  edge(lora, "prerequisite", rank);
  edge(lora, "prerequisite", peft);
  edge(qlora, "variant_of", lora);
  return { w, lora };
}

describe("noteFilename", () => {
  it("keeps readable names and removes characters files cannot hold", () => {
    expect(noteFilename("LoRA")).toBe("LoRA.md");
    expect(noteFilename("Low-Rank Adaptation")).toBe("Low-Rank Adaptation.md");
    expect(noteFilename("a/b:c*d?e")).toBe("a b c d e.md");
    expect(noteFilename("  ..  ")).toBe("concept.md");
    expect(noteFilename("v1.")).toBe("v1.md");
    expect(noteFilename("CON")).toBe("CON_.md");
    expect(noteFilename("x".repeat(300)).length).toBeLessThanOrEqual(123);
  });
});

describe("conceptNote", () => {
  it("writes front matter, linked relations and the timeline", () => {
    const { w, lora } = build();
    const note = conceptNote(conceptDetail(w.state(), lora)!, "en");
    expect(note.startsWith("---\n")).toBe(true);
    expect(note).toContain("aliases:\n  - Low-Rank Adaptation");
    expect(note).toContain("domain: ml");
    expect(note).toContain("status: understood");
    expect(note).toContain("# LoRA");
    expect(note).toContain("## Prerequisites\n- [[Matrix rank]]\n- [[PEFT]]");
    expect(note).toContain("## Variants\n- [[QLoRA]]");
    expect(note).toContain("“Paper One”");
    expect(note).toContain("> LoRA freezes weights. It trains low-rank matrices.");
  });

  it("uses Chinese headings and omits empty groups", () => {
    const { w, lora } = build();
    const note = conceptNote(conceptDetail(w.state(), lora)!, "zh");
    expect(note).toContain("## 前置概念");
    expect(note).toContain("《Paper One》");
    expect(note).not.toContain("## 相关");
  });

  it("keeps a wiki link from breaking on brackets or pipes in a name", () => {
    const w = world();
    w.source("s1");
    const a = w.concept("A");
    w.encounter(a, "s1");
    const b = w.concept("Weird [[name]] | x");
    w.encounter(b, "s1");
    w.events.push(w.f.make("edge.proposed", { from: a, to: b, rel: "related", source: "llm_explain", confidence: 0.9, evidence: {} }));
    const note = conceptNote(conceptDetail(w.state(), a)!, "en");
    expect(note).toContain("- [[Weird name x]]");
  });
});

describe("noteFiles", () => {
  it("writes one file per studied concept and skips placeholders", () => {
    const { w } = build();
    const files = noteFiles(w.state(), "en");
    expect(files.map((f) => f.filename).sort()).toEqual(["LoRA.md", "Matrix rank.md", "QLoRA.md"]);
  });

  it("keeps file names unique and links pointing at the right file", () => {
    const w = world();
    w.source("s1");
    const a = w.concept("A/B");
    w.encounter(a, "s1");
    const b = w.concept("A:B");
    w.encounter(b, "s1");
    const c = w.concept("Hub");
    w.encounter(c, "s1");
    for (const target of [a, b])
      w.events.push(
        w.f.make("edge.proposed", { from: c, to: target, rel: "related", source: "llm_explain", confidence: 0.9, evidence: {} }),
      );
    const files = noteFiles(w.state(), "en");
    const names = files.map((f) => f.filename);
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(names.length);
    expect(names).toEqual(expect.arrayContaining(["A B.md", "A B (2).md", "Hub.md"]));
    const hub = files.find((f) => f.filename === "Hub.md")!.content;
    expect(hub).toContain("[[A B]]");
    expect(hub).toContain("[[A B (2)]]");
  });

  it("is empty without records", () => {
    expect(noteFiles(world().state(), "en")).toEqual([]);
  });
});

describe("front matter quoting", () => {
  it("quotes aliases that YAML would read as a list item, number or boolean", () => {
    const w = world();
    w.source("s1");
    const c = w.concept("Thing", ["- x", "123", "yes", "plain alias"]);
    w.encounter(c, "s1");
    const note = conceptNote(conceptDetail(w.state(), c)!, "en");
    expect(note).toContain('  - "- x"\n  - "123"\n  - "yes"\n  - plain alias\n');
  });
});

describe("mergeNote", () => {
  it("keeps what the reader wrote below the marker and ignores files without one", () => {
    const old = `old generated\n${NOTE_END}\nMy own thoughts\n`;
    expect(mergeNote(`new generated\n${NOTE_END}\n`, old)).toBe(`new generated\n${NOTE_END}\nMy own thoughts\n`);
    expect(mergeNote(`new\n${NOTE_END}\n`, `old\n${NOTE_END}\n\n`)).toBe(`new\n${NOTE_END}\n`);
    expect(mergeNote("new", "an older export without a marker")).toBe("new");
    expect(mergeNote("new", null)).toBe("new");
  });

  it("is stable when exporting twice", () => {
    const { w, lora } = build();
    const note = conceptNote(conceptDetail(w.state(), lora)!, "en");
    expect(note.endsWith(`${NOTE_END}\n`)).toBe(true);
    expect(mergeNote(note, note)).toBe(note);
  });
});

describe("writeNoteFiles", () => {
  it("does not overwrite what the reader wrote under an existing note", async () => {
    const existing = new Map([["a.md", `stale\n${NOTE_END}\nMy notes\n`]]);
    const { dir, files } = fakeDir(undefined, existing);
    await writeNoteFiles(dir, [{ filename: "a.md", content: `fresh\n${NOTE_END}\n` }]);
    expect(files.get("a.md")).toBe(`fresh\n${NOTE_END}\nMy notes\n`);
  });

  it("leaves a file alone that has text but no marker, and says so", async () => {
    const mine = "My own note about LoRA, written before Harkback.\n";
    const { dir, files } = fakeDir(undefined, new Map([["a.md", mine]]));
    const result = await writeNoteFiles(dir, [
      { filename: "a.md", content: `fresh\n${NOTE_END}\n` },
      { filename: "b.md", content: "B" },
    ]);
    expect(files.get("a.md")).toBe(mine);
    expect(result).toEqual({ written: 1, failed: ["a.md"] });
  });

  it("writes into a file that exists but is empty", async () => {
    const { dir, files } = fakeDir(undefined, new Map([["a.md", ""]]));
    expect(await writeNoteFiles(dir, [{ filename: "a.md", content: "A" }])).toEqual({ written: 1, failed: [] });
    expect(files.get("a.md")).toBe("A");
  });

  function fakeDir(failOn?: string, files = new Map<string, string>()) {
    const sub = {
      getFileHandle: async (name: string) => ({
        getFile: async () => {
          if (!files.has(name)) throw new Error("not found");
          return { text: async () => files.get(name)! };
        },
        createWritable: async () => {
          if (name === failOn) throw new Error("denied");
          let text = "";
          return { write: async (c: string) => void (text += c), close: async () => void files.set(name, text) };
        },
      }),
    };
    const folders: string[] = [];
    const dir = {
      getDirectoryHandle: async (name: string) => {
        folders.push(name);
        return sub;
      },
    };
    return { dir: dir as unknown as FileSystemDirectoryHandle, files, folders };
  }

  it("writes inside a Harkback folder and keeps going after a failure", async () => {
    const { dir, files, folders } = fakeDir("b.md");
    const result = await writeNoteFiles(dir, [
      { filename: "a.md", content: "A" },
      { filename: "b.md", content: "B" },
      { filename: "c.md", content: "C" },
    ]);
    expect(folders).toEqual(["Harkback"]);
    expect(result).toEqual({ written: 2, failed: ["b.md"] });
    expect([...files.keys()]).toEqual(["a.md", "c.md"]);
  });
});
