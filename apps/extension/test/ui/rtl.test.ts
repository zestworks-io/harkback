// @vitest-environment happy-dom
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyLanguage, dirOf, fillVars, htmlLang, quoteTitle, UI_LANGUAGES } from "../../src/lib/ui/languages";
import { PAGE_STRINGS } from "../../src/lib/ui/locales/pages";
import { UI_STRINGS } from "../../src/lib/ui/locales/ui";
import { pick } from "../../src/lib/ui/pick";
import { STYLES } from "../../src/lib/ui/styles";
import { t, useStrings } from "../../src/lib/ui/strings";
import { ExplainCard } from "../../src/lib/ui/explain-card";
import { dueText } from "../../src/lib/review/due";
import { placeNear } from "../../src/lib/ui/overlay";

describe("writing direction", () => {
  it("is right to left only for Arabic", () => {
    expect(UI_LANGUAGES.filter((l) => l.dir === "rtl").map((l) => l.code)).toEqual(["ar"]);
    expect(dirOf("ar")).toBe("rtl");
    expect(dirOf("en")).toBe("ltr");
    expect(dirOf("ja")).toBe("ltr");
  });

  it("is set with the language on an element", () => {
    const el = document.createElement("div");
    applyLanguage(el, "ar");
    expect([el.lang, el.dir]).toEqual(["ar", "rtl"]);
    applyLanguage(el, "zh");
    expect([el.lang, el.dir]).toEqual(["zh-CN", "ltr"]);
    expect(htmlLang("pt-BR")).toBe("pt-BR");
  });

  it("is carried by the cards drawn on the page", () => {
    useStrings("ar", UI_STRINGS.ar!);
    const card = new ExplainCard("ar", {} as never);
    expect([card.el.dir, card.el.lang]).toEqual(["rtl", "ar"]);
    expect(new ExplainCard("en", {} as never).el.dir).toBe("ltr");
  });

  it("puts a card at the right end of the selection in right-to-left text", () => {
    Object.defineProperty(document.documentElement, "clientWidth", { value: 1000, configurable: true });
    const card = document.createElement("div");
    const rect = { left: 500, right: 700, bottom: 100 } as DOMRect;
    placeNear(card, rect, 400, false);
    expect(card.style.left).toBe("500px");
    placeNear(card, rect, 400, true);
    expect(card.style.left).toBe("300px");
    placeNear(card, { ...rect, right: 200 } as DOMRect, 400, true);
    expect(card.style.left).toBe("8px");
  });
});

describe("Arabic text", () => {
  it("picks the plural form by the number", () => {
    const days = (n: number) => t("ar", "daysAgo", { n });
    expect(days(1)).toBe("منذ يوم واحد");
    expect(days(2)).toBe("منذ يومين");
    expect(days(3)).toBe("منذ 3 أيام");
    expect(days(11)).toBe("منذ 11 يومًا");
    expect(days(100)).toBe("منذ 100 يوم");
    useStrings("ar", UI_STRINGS.ar!);
    expect(pick("ar", "x", "{n} days", { n: 4 })).not.toContain("#");
  });

  it("falls back to the other form, and leaves a missing number alone", () => {
    expect(fillVars("{n#one=a|other=b #}", { n: 7 }, "en")).toBe("b 7");
    expect(fillVars("{n#one=a}", { n: 7 }, "en")).toBe("");
    expect(fillVars("{n#one=a|other=b}", {}, "en")).toBe("{n#one=a|other=b}");
  });

  it("isolates what is put into a sentence, so a Latin term cannot disturb the punctuation", () => {
    expect(t("ar", "openLink", { url: "https://a.b" })).toBe("فتح الرابط: ⁨https://a.b⁩");
    expect(fillVars("{n}: {name}", { n: 3, name: "LoRA" }, "ar")).toBe("3: ⁨LoRA⁩");
    expect(fillVars("{name}", { name: "LoRA" }, "en")).toBe("LoRA");
  });

  it("describes due dates with Western digits", () => {
    const now = Date.parse("2026-10-01T00:00:00Z");
    expect(dueText(now + 3 * 86_400_000, now, "ar")).toMatch(/^موعد المراجعة بعد ⁨?3 أيام/);
    expect(dueText(now + 3 * 86_400_000, now, "ar")).toMatch(/[0-9]/);
    expect(dueText(now + 3 * 86_400_000, now, "ar")).not.toMatch(/[٠-٩]/);
  });

  it("quotes a source title with guillemets", () => {
    expect(quoteTitle("X", "ar")).toBe("«X»");
  });

  it("has a table that is complete", () => {
    expect(Object.keys(PAGE_STRINGS.ar!).length).toBeGreaterThan(300);
    expect(Object.keys(UI_STRINGS.ar!).length).toBeGreaterThan(70);
  });
});

describe("layout", () => {
  const PHYSICAL = /(^|[\s;{"'`])((margin|padding|border)-(left|right)(-\w+)?|(left|right)\s*:|float\s*:|text-align\s*:\s*(left|right))/;

  /** The CSS in a source file: the style blocks of a page, or the text of a stylesheet. */
  const rules = (file: string): string[] => {
    const text = readFileSync(file, "utf8");
    return text.split("\n").filter((l) => PHYSICAL.test(l));
  };

  it("uses logical properties in the page and card styles", () => {
    const root = join(__dirname, "../../src");
    const files = [
      ...["library", "options", "onboarding"].map((p) => join(root, "entrypoints", p, "index.html")),
      join(root, "lib/ui/tokens.css"),
    ];
    for (const f of files) expect(rules(f), f).toEqual([]);
    expect(STYLES.split("\n").filter((l) => PHYSICAL.test(l.replace(/^\s*/, " ")))).toEqual([]);
  });

  it("keeps no physical properties anywhere in the sources, apart from where text is placed by coordinates", () => {
    const allowed = new Set(["overlay.ts", "app.ts"]);
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? (e.name === "locales" || e.name === "pdf" ? [] : walk(join(dir, e.name))) : [join(dir, e.name)],
      );
    for (const f of walk(join(__dirname, "../../src")).filter((f) => /\.(css|html|ts)$/.test(f))) {
      if (allowed.has(f.split("/").pop()!)) continue;
      expect(
        rules(f).filter((l) => /(margin|padding|border)-(left|right)|text-align/.test(l)),
        f,
      ).toEqual([]);
    }
  });
});
