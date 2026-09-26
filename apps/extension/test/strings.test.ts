import { describe, expect, it } from "vitest";
import type { ErrorCode } from "../src/lib/messages";
import { errorText, t } from "../src/lib/ui/strings";

const codes: ErrorCode[] = [
  "site_disabled", "no_model", "needs_local_model", "insecure_model", "sensitive_compare", "empty_selection",
  "auth", "rate_limited", "timeout", "network", "http", "insecure", "aborted", "local_rate", "expired", "internal",
];

describe("strings", () => {
  it("fills variables", () => {
    expect(t("zh", "askSame", { name: "LoRA", days: 12 })).toBe("这是你 12 天前查过的「LoRA」吗？");
    expect(t("en", "daysAgo", { n: 3 })).toBe("3 days ago");
  });

  it("has an error message for every code in both languages", () => {
    for (const code of codes) {
      expect(errorText("zh", code).length).toBeGreaterThan(0);
      expect(errorText("en", code).length).toBeGreaterThan(0);
    }
    expect(errorText("zh", "local_rate", 12_300)).toBe("解释太频繁了，请 13 秒后再试。");
  });
});
