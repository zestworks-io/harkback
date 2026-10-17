import { describe, expect, it } from "vitest";
import { isOpenLicense, licenseCode } from "../../src";

describe("licenseCode", () => {
  it("reads Creative Commons and arXiv licence links", () => {
    expect(licenseCode("http://creativecommons.org/licenses/by/4.0/")).toBe("cc-by-4.0");
    expect(licenseCode("https://creativecommons.org/licenses/by-nc-sa/4.0/deed.en")).toBe("cc-by-nc-sa-4.0");
    expect(licenseCode("http://creativecommons.org/publicdomain/zero/1.0/")).toBe("cc0-1.0");
    expect(licenseCode("https://creativecommons.org/publicdomain/mark/1.0/")).toBe("public-domain");
    expect(licenseCode("http://arxiv.org/licenses/nonexclusive-distrib/1.0/")).toBe("arxiv-nonexclusive");
  });

  it("reads written names and codes", () => {
    expect(licenseCode("CC BY 4.0")).toBe("cc-by-4.0");
    expect(licenseCode("CC-BY-SA-4.0")).toBe("cc-by-sa-4.0");
    expect(licenseCode("cc0 1.0")).toBe("cc0-1.0");
    expect(licenseCode("cc-by-4.0")).toBe("cc-by-4.0");
  });

  it("calls anything else unknown", () => {
    expect(licenseCode(null)).toBe("unknown");
    expect(licenseCode("All rights reserved")).toBe("unknown");
    expect(licenseCode("https://example.com/terms")).toBe("unknown");
  });
});

describe("isOpenLicense", () => {
  it("accepts Creative Commons and the public domain only", () => {
    expect(isOpenLicense("cc-by-4.0")).toBe(true);
    expect(isOpenLicense("cc0-1.0")).toBe(true);
    expect(isOpenLicense("public-domain")).toBe(true);
    expect(isOpenLicense("arxiv-nonexclusive")).toBe(false);
    expect(isOpenLicense("unknown")).toBe(false);
  });
});
