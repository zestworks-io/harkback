// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import type { ReunionCard } from "../src/lib/reunion-cards";
import { reunionCardView } from "../src/lib/ui/reunion-layer";

const card: ReunionCard = {
  kind: "direct",
  conceptId: "01J00000000000000000000001",
  conceptName: "LoRA",
  viaName: null,
  start: 0,
  end: 4,
  encounterId: "01J00000000000000000000002",
  daysAgo: 12,
  sourceTitle: "QLoRA",
  section: "3",
  tier: "defined_in_source",
  preview: "在冻结的权重旁加两个低秩矩阵……",
};

describe("reunionCardView", () => {
  it("shows when and where the concept was understood, with four actions", () => {
    const act = vi.fn();
    const el = reunionCardView(card, "zh", act);
    expect(el.querySelector('[data-hb="reunion-title"]')!.textContent).toBe("LoRA · 12 天前 · 《QLoRA》 §3");
    expect(el.textContent).toContain("原文定义");
    expect(el.textContent).toContain("当时的解释：在冻结的权重旁加两个低秩矩阵……");
    expect([...el.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["想起来了", "再解释一次", "对比两处用法", "不再提示"]);
    el.querySelector<HTMLButtonElement>('[data-hb="compare"]')!.click();
    expect(act).toHaveBeenCalledWith("compare");
  });

  it("phrases related reunions around the concept understood before", () => {
    const el = reunionCardView({ ...card, kind: "related", conceptName: "QLoRA", viaName: "LoRA" }, "zh", () => {});
    expect(el.querySelector('[data-hb="reunion-title"]')!.textContent).toBe("你没查过「QLoRA」，但 12 天前弄懂了「LoRA」");
  });

  it("inserts page-derived text as text", () => {
    const el = reunionCardView({ ...card, sourceTitle: "<img src=x>", preview: "<b>x</b>" }, "en", () => {});
    expect(el.querySelector("img, b")).toBeNull();
    expect(el.textContent).toContain("<img src=x>");
  });
});
