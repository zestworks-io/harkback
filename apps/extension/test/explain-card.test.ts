// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { ExplainCard, type ExplainCardHandlers } from "../src/lib/ui/explain-card";

function setup() {
  const handlers: ExplainCardHandlers = {
    onAnswer: vi.fn(),
    onAction: vi.fn(),
    onFollowUp: vi.fn(),
    onMarkSensitive: vi.fn(),
    onRetry: vi.fn(),
    onClose: vi.fn(),
  };
  const card = new ExplainCard("zh", handlers);
  document.body.append(card.el);
  const q = (hb: string) => card.el.querySelector<HTMLElement>(`[data-hb="${hb}"]`);
  return { card, handlers, q };
}

describe("ExplainCard", () => {
  it("streams Markdown, then shows the tier", () => {
    const { card, q } = setup();
    expect(q("explanation")!.textContent).toBe("正在解释…");
    card.setStreaming("**低秩**适配");
    expect(q("explanation")!.querySelector("strong")!.textContent).toBe("低秩");
    card.setExplained("低秩适配。", "defined_in_source");
    expect(q("tier")!.textContent).toBe("原文定义");
  });

  it("asks whether it is the same concept and answers once", () => {
    const { card, handlers, q } = setup();
    card.ask("LoRA", 12);
    expect(q("ask")!.textContent).toContain("这是你 12 天前查过的「LoRA」吗？");
    q("ask-yes")!.click();
    q("ask-yes")?.click();
    card.close();
    expect(handlers.onAnswer).toHaveBeenCalledTimes(1);
    expect(handlers.onAnswer).toHaveBeenCalledWith(true);
  });

  it("answers no when closed during the question", () => {
    const { card, handlers } = setup();
    card.ask("LoRA", 1);
    card.close();
    expect(handlers.onAnswer).toHaveBeenCalledWith(false);
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
    expect(card.el.isConnected).toBe(false);
  });

  it("offers understood / confused once after recording", () => {
    const { card, handlers, q } = setup();
    card.done(true);
    q("understood")!.click();
    expect(handlers.onAction).toHaveBeenCalledWith("marked_understood");
    expect((q("confused") as HTMLButtonElement).disabled).toBe(true);
  });

  it("explains when nothing was recorded", () => {
    const { card, q } = setup();
    card.done(false);
    expect(q("note")!.textContent).toBe("无痕窗口：只解释，不记录。");
    expect((q("understood") as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps what was already received when a later step fails, and offers a retry", () => {
    const { card, handlers, q } = setup();
    card.setStreaming("低秩适配的前半");
    card.error("network");
    expect(q("explanation")!.textContent).toBe("低秩适配的前半");
    expect(q("error")!.textContent).toContain("连不上模型服务");
    q("retry")!.click();
    expect(handlers.onRetry).toHaveBeenCalledTimes(1);
    const fresh = setup();
    fresh.card.error("local_rate", 5000);
    expect(fresh.q("explanation")!.textContent).toBe("解释太频繁了，请 5 秒后再试。");
    expect(fresh.q("retry")).toBeNull();
  });

  it("asks before opening a link", () => {
    const { card, q } = setup();
    card.setExplained("见 [论文](https://arxiv.org/abs/2106.09685)", "external_knowledge");
    card.el.querySelector<HTMLElement>(".hb-link")!.click();
    expect(q("link-confirm")!.textContent).toBe("打开链接：https://arxiv.org/abs/2106.09685");
    expect(q("link-open")).not.toBeNull();
  });

  it("shows a failed follow-up in the answer area and keeps the recorded card's actions", () => {
    const { card, handlers, q } = setup();
    card.done(true);
    q("followup-open")!.click();
    card.followUpError("network");
    expect(q("followup-answer")!.textContent).toContain("连不上模型服务");
    expect(q("retry")).toBeNull();
    q("understood")!.click();
    expect(handlers.onAction).toHaveBeenCalledWith("marked_understood");
  });

  it("sends follow-up questions and shows the answer", () => {
    const { card, handlers, q } = setup();
    card.done(true);
    q("followup-open")!.click();
    (q("followup-input") as HTMLInputElement).value = "  和全量微调比呢？ ";
    q("followup-send")!.click();
    expect(handlers.onFollowUp).toHaveBeenCalledWith("和全量微调比呢？");
    card.followUpDone("省下 99% 参数。");
    expect(q("followup-answer")!.textContent).toBe("省下 99% 参数。");
  });
});
