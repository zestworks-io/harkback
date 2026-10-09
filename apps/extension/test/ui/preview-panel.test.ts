// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import type { PreviewTerm } from "../../src/lib/explain/preview";
import { PreviewPanel, type PreviewHandlers } from "../../src/lib/ui/preview-panel";

function setup() {
  const handlers: PreviewHandlers = {
    onScan: vi.fn(),
    onExplain: vi.fn(async () => ({ ok: true as const, explanation: "Earlier text.", stored: true })),
    onClose: vi.fn(),
  };
  const panel = new PreviewPanel("en", handlers);
  document.body.append(panel.el);
  const q = (hb: string) => panel.el.querySelector<HTMLElement>(`[data-hb="${hb}"]`);
  return { panel, handlers, q };
}

const term = (name: string, status: PreviewTerm["status"]): PreviewTerm => ({
  term: name,
  conceptId: status === "new" ? null : `id-${name}`,
  name,
  status,
});

describe("PreviewPanel", () => {
  it("offers nothing to press until it knows which model would be used, then says where the page text goes", () => {
    const { panel, q } = setup();
    expect(q("preview-scan")).toBeNull();
    panel.offer({ model: "Ollama", remote: false });
    expect(q("preview-where")!.textContent).toBe("The page text stays on this computer: local model Ollama.");
    panel.offer({ model: "GPT", remote: true });
    expect(q("preview-where")!.textContent).toBe("The page text will be sent to the remote model GPT.");
    expect(q("preview-where")!.dataset.remote).toBe("true");
  });

  it("asks for a scan only when the reader presses Scan", () => {
    const { panel, handlers, q } = setup();
    panel.offer({ model: "Ollama", remote: false });
    expect(handlers.onScan).not.toHaveBeenCalled();
    q("preview-scan")!.click();
    expect(handlers.onScan).toHaveBeenCalledOnce();
  });

  it("gives the reason, and no Scan button, when a scan is impossible", () => {
    const { panel, q } = setup();
    panel.unavailable("needs_local_model");
    expect(q("error")!.textContent).toContain("local model");
    expect(q("preview-scan")).toBeNull();
  });

  it("groups terms, folds the known ones, and says what the scan left out", () => {
    const { panel, q } = setup();
    panel.show(
      [term("LoRA", "confused"), term("QLoRA", "new"), term("Softmax", "understood")],
      "Only the first 16000 of 40000 characters were scanned.",
    );
    const groups = [...panel.el.querySelectorAll("[data-hb=preview-group]")].map((g) => g.getAttribute("data-status"));
    expect(groups).toEqual(["confused", "new", "understood"]);
    expect(panel.el.querySelector("details[data-status=understood]")).not.toBeNull();
    expect(q("preview-note")!.textContent).toContain("40000");
    panel.show([term("LoRA", "confused")]);
    expect(q("preview-note")).toBeNull();
  });

  it("shows an explanation once and toggles it afterwards", async () => {
    const { panel, handlers } = setup();
    panel.show([term("LoRA", "confused")]);
    const open = panel.el.querySelector<HTMLButtonElement>("[data-hb=preview-open]")!;
    open.click();
    await vi.waitFor(() => expect(panel.el.querySelector("[data-hb=preview-text]")!.textContent).toBe("Earlier text."));
    open.click();
    expect(panel.el.querySelector<HTMLElement>(".hb-detail")!.hidden).toBe(true);
    expect(handlers.onExplain).toHaveBeenCalledOnce();
  });
});
