import { describe, expect, it } from "vitest";
import { languageOf, pickLocalized, sanitizeLocalized } from "../localized";

describe("localized texts", () => {
  it("normalises locale tags", () => {
    expect(languageOf("pl-PL")).toBe("pl");
    expect(languageOf("EN_gb")).toBe("en");
    expect(languageOf("")).toBeNull();
  });

  it("falls back from the requested language to the default and then to anything", () => {
    expect(pickLocalized({ en: "Hi", pl: "Cześć" }, "en-GB", "pl")).toBe("Hi");
    expect(pickLocalized({ pl: "Cześć" }, "de", "pl")).toBe("Cześć");
    expect(pickLocalized({ de: "Hallo" }, "en", "pl")).toBe("Hallo");
    expect(pickLocalized({ pl: "  " }, "pl", "pl")).toBeNull();
    expect(pickLocalized(null, "pl", "pl")).toBeNull();
  });

  it("sanitises input", () => {
    expect(sanitizeLocalized({ "pl-PL": " Tekst ", en: "", x: 1 })).toEqual({ pl: "Tekst" });
    expect(sanitizeLocalized("nope")).toBeNull();
    expect(sanitizeLocalized({})).toBeNull();
  });
});
