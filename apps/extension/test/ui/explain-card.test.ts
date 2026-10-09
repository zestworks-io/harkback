// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { ExplainCard, type ExplainCardHandlers } from "../../src/lib/ui/explain-card";

function setup(models: { id: string; label: string }[] = []) {
  const handlers: ExplainCardHandlers = {
    onAnswer: vi.fn(),
    onAction: vi.fn(),
    onFollowUp: vi.fn(),
    onMarkSensitive: vi.fn(),
    onRetry: vi.fn(),
    onRetryWith: vi.fn(),
    onCancel: vi.fn(),
    onClose: vi.fn(),
  };
  const card = new ExplainCard("zh", handlers, models);
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

  it("shows each question above its answer, keeps earlier ones and locks sending until the answer arrives", () => {
    const { card, handlers, q } = setup();
    card.done(true);
    q("followup-open")!.click();
    const input = q("followup-input") as HTMLInputElement;
    const send = q("followup-send") as HTMLButtonElement;
    input.value = "第一个问题";
    send.click();
    expect(q("followup-question")!.textContent).toBe("第一个问题");
    expect(send.textContent).toBe("停止");
    input.value = "太快了";
    send.click();
    expect(handlers.onFollowUp).toHaveBeenCalledTimes(1);
    card.followUpDelta("答案一");
    card.followUpDone("答案一。");
    expect(send.textContent).toBe("发送");

    input.value = "第二个问题";
    send.click();
    card.followUpDone("答案二。");
    expect(handlers.onFollowUp).toHaveBeenLastCalledWith("第二个问题");
    const thread = [...card.el.querySelectorAll(".hb-thread > div")].map((el) => el.textContent);
    expect(thread).toEqual(["第一个问题", "答案一。", "第二个问题", "答案二。"]);
    expect(card.el.querySelectorAll('[data-hb="followup-answer"]')).toHaveLength(1);
  });

  it("keeps the question box outside the scrolling part of the card", () => {
    const { card, q } = setup();
    card.done(true);
    q("followup-open")!.click();
    expect(card.el.querySelector(".hb-scroll")!.contains(q("followup-input"))).toBe(false);
    expect(card.el.querySelector(".hb-compose")!.contains(q("followup-send"))).toBe(true);
  });

  it("keeps the tier and the action buttons above the scrolling explanation and hides Ask more once the question box is open", () => {
    const { card, q } = setup();
    card.setExplained("低秩适配。", "defined_in_source");
    card.done(true);
    const head = card.el.querySelector(".hb-head")!;
    expect(head.contains(q("tier"))).toBe(true);
    expect(head.contains(q("understood"))).toBe(true);
    expect(head.nextElementSibling!.contains(q("explanation"))).toBe(true);
    q("followup-open")!.click();
    expect(q("followup-open")).toBeNull();
    card.done(true);
    expect(q("followup-open")).toBeNull();
    expect(q("understood")).not.toBeNull();
  });
});

describe("ExplainCard: stop and other models", () => {
  it("offers Stop while the explanation is written and removes it once it is complete", () => {
    const { card, handlers, q } = setup();
    q("stop")!.click();
    expect(handlers.onCancel).toHaveBeenCalledTimes(1);
    card.setStreaming("text");
    card.setExplained("text.", "external_knowledge");
    expect(q("stop")).toBeNull();
  });

  it("turns Send into Stop while a follow-up answer is written", () => {
    const { card, handlers, q } = setup();
    card.setExplained("text.", "external_knowledge");
    card.done(true);
    q("followup-open")!.click();
    const input = q("followup-input") as HTMLInputElement;
    input.value = "why?";
    q("followup-send")!.click();
    expect(handlers.onFollowUp).toHaveBeenCalledWith("why?");
    expect(q("followup-send")!.textContent).toBe("停止");
    q("followup-send")!.click();
    expect(handlers.onCancel).toHaveBeenCalledTimes(1);
    expect(handlers.onFollowUp).toHaveBeenCalledTimes(1);
    card.followUpError("aborted");
    expect(q("followup-send")!.textContent).toBe("发送");
  });

  it("offers the configured models after a failure, and Retry after a cancel", () => {
    const { card, handlers, q } = setup([
      { id: "a", label: "Local" },
      { id: "b", label: "Cloud" },
    ]);
    card.error("timeout");
    const buttons = [...card.el.querySelectorAll<HTMLElement>('[data-hb="retry-model"]')];
    expect(buttons.map((b) => b.textContent)).toEqual(["改用 Local", "改用 Cloud"]);
    buttons[1]!.click();
    expect(handlers.onRetryWith).toHaveBeenCalledWith("b");
    card.error("aborted");
    expect(q("retry")).not.toBeNull();
  });

  it("does not offer other models for errors they cannot fix, or when there is only one", () => {
    const many = setup([
      { id: "a", label: "Local" },
      { id: "b", label: "Cloud" },
    ]);
    many.card.error("site_disabled");
    expect(many.card.el.querySelector('[data-hb="retry-model"]')).toBeNull();
    const one = setup([{ id: "a", label: "Local" }]);
    one.card.error("timeout");
    expect(one.card.el.querySelector('[data-hb="retry-model"]')).toBeNull();
    expect(one.q("retry")).not.toBeNull();
  });
});
