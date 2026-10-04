import { describe, expect, it } from "vitest";
import { ankiTsv } from "../src/lib/anki";
import { world } from "./helpers";

describe("ankiTsv", () => {
  it("writes a header and one tab-separated card per studied concept", () => {
    const w = world();
    w.source("s1", "normal", "Paper <One>");
    const lora = w.concept("LoRA", ["Low-Rank Adaptation"]);
    const enc = w.encounter(lora, "s1", "LoRA freezes weights.\nIt trains\tlow-rank matrices & <more>.");
    w.events.push(w.f.make("encounter.action", { encounter_id: enc, action: "marked_confused" }));
    w.concept("Placeholder");
    const muted = w.concept("Muted");
    w.encounter(muted, "s1");
    w.events.push(w.f.make("concept.muted", { concept_id: muted }));
    const lines = ankiTsv(w.state()).trimEnd().split("\n");
    expect(lines.slice(0, 3)).toEqual(["#separator:tab", "#html:true", "#tags column:3"]);
    expect(lines).toHaveLength(4);
    const [front, back, tags] = lines[3]!.split("\t");
    expect(front).toBe("<b>LoRA</b><br><small>Low-Rank Adaptation</small>");
    expect(back).toContain("LoRA freezes weights.<br>It trains low-rank matrices &amp; &lt;more&gt;.");
    expect(back).toContain("Paper &lt;One&gt;");
    expect(tags).toBe("harkback ml confused");
  });

  it("never starts a field with a double quote, which the importer would read as a quoted field", () => {
    const w = world();
    w.source("s1", "normal", "Paper");
    w.encounter(w.concept("LoRA"), "s1", '"Frozen" weights');
    const [, back] = ankiTsv(w.state()).trimEnd().split("\n")[3]!.split("\t");
    expect(back).toMatch(/^&quot;Frozen&quot; weights/);
  });

  it("is only the header for an empty library", () => {
    expect(ankiTsv(world().state()).trimEnd().split("\n")).toHaveLength(3);
  });
});
