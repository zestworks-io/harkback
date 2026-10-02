import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EXPLAIN_LANGUAGES } from "@harkback/core";
import { PRIVACY } from "../src/lib/pages/privacy";
import { isLang, quoteTitle, UI_LANGUAGES } from "../src/lib/ui/languages";
import { PAGE_STRINGS } from "../src/lib/ui/locales/pages";
import { UI_STRINGS } from "../src/lib/ui/locales/ui";
import { pick } from "../src/lib/ui/pick";
import { t, useStrings } from "../src/lib/ui/strings";
import { dueText } from "../src/lib/due";
import { withDefaults } from "../src/lib/settings";

const extra = UI_LANGUAGES.map((l) => l.code).filter((c) => c !== "zh" && c !== "en");

const STRING = String.raw`"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|` + "`(?:[^`\\\\]|\\\\.)*`";
const CALL = new RegExp(
  String.raw`(?<![\w.])(?:L\(\s*(?:${STRING})\s*,\s*(${STRING})|pick\(\s*[\w.]+\s*,\s*(?:${STRING})\s*,\s*(${STRING}))`,
  "g",
);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? (name === "locales" ? [] : sourceFiles(p)) : p.endsWith(".ts") ? [p] : [];
  });
}

/** Every English text passed to `L(zh, en)` or `pick(lang, zh, en)` in the sources. */
function englishTexts(): Set<string> {
  const found = new Set<string>();
  for (const file of sourceFiles(join(__dirname, "../src"))) {
    for (const m of readFileSync(file, "utf8").matchAll(CALL)) {
      const literal = (m[1] ?? m[2])!;
      found.add(
        literal
          .slice(1, -1)
          .replace(/\\n/g, "\n")
          .replace(/\\(["'`\\])/g, "$1"),
      );
    }
  }
  for (const line of PRIVACY.en) found.add(line);
  return found;
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("interface languages", () => {
  it("are all available as explanation languages, and every extra one has both tables", () => {
    for (const { code } of UI_LANGUAGES) expect(EXPLAIN_LANGUAGES.map((l) => l.code)).toContain(code);
    for (const code of extra) {
      expect(PAGE_STRINGS[code as keyof typeof PAGE_STRINGS], code).toBeDefined();
      expect(UI_STRINGS[code as keyof typeof UI_STRINGS], code).toBeDefined();
    }
  });

  it("translate every page text, and nothing that is no longer used", () => {
    const used = englishTexts();
    expect(used.size).toBeGreaterThan(100);
    for (const code of extra) {
      const table = PAGE_STRINGS[code as keyof typeof PAGE_STRINGS]!;
      expect(
        [...used].filter((en) => !(en in table)),
        `${code} is missing`,
      ).toEqual([]);
      expect(
        Object.keys(table).filter((en) => !used.has(en)),
        `${code} has unused`,
      ).toEqual([]);
    }
  });

  it("keep the placeholders of the English text", () => {
    for (const code of extra) {
      for (const [en, tr] of Object.entries(PAGE_STRINGS[code as keyof typeof PAGE_STRINGS]!)) {
        expect(placeholders(tr), `${code}: ${en}`).toEqual(placeholders(en));
        expect(tr.trim(), `${code}: ${en}`).not.toBe("");
      }
    }
  });

  it("look texts up by language and fall back to English", () => {
    expect(pick("ja", "完成", "Done")).toBe("完了");
    expect(pick("ja", "x", "Not in the table")).toBe("Not in the table");
    expect(pick("zh", "完成", "Done")).toBe("完成");
    expect(pick("de", "x", "Confirm delete {n}", { n: 3 })).toBe("Löschen von 3 bestätigen");
    useStrings("ko", UI_STRINGS.ko!);
    expect(t("ko", "explain")).toBe("설명");
    useStrings("fr", UI_STRINGS.fr!);
    useStrings("zh", {});
    expect(t("zh", "explain")).toBe("解释");
    expect(t("fr", "daysAgo", { n: 4 })).toBe("il y a 4 jours");
  });

  it("describe due dates in the chosen language", () => {
    const now = Date.parse("2026-10-01T00:00:00Z");
    expect(dueText(now - 1, now, "ja")).toBe("今すぐ復習");
    expect(dueText(now + 3 * 86_400_000, now, "es")).toContain("Toca repasar en 3 días");
  });

  it("quote source titles the way the language does", () => {
    expect(quoteTitle("X", "zh")).toBe("《X》");
    expect(quoteTitle("X", "ja")).toBe("《X》");
    expect(quoteTitle("X", "en")).toBe("“X”");
    expect(quoteTitle("X", "de")).toBe("“X”");
  });

  it("are accepted in saved settings", () => {
    expect(isLang("pt-BR")).toBe(true);
    expect(withDefaults({ language: "ko" }).language).toBe("ko");
    expect(withDefaults({ language: "xx" }).language).toBe("en");
  });
});
