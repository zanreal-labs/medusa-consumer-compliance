import { describe, expect, it } from "vitest";
import { omnibusLabel, withdrawalLabels } from "../labels";

describe("labels", () => {
  it("returns the UOKiK wording for each reference basis", () => {
    expect(omnibusLabel("lowest_30_days", "pl")).toBe("Najniższa cena z 30 dni przed obniżką");
    expect(omnibusLabel("lowest_since_introduction", "pl")).toBe("Najniższa cena od wprowadzenia towaru");
    expect(omnibusLabel("price_before_reduction", "pl-PL")).toBe("Cena przed obniżką");
    expect(omnibusLabel(null, "pl")).toBeNull();
  });

  it("returns the statutory withdrawal button labels", () => {
    expect(withdrawalLabels("pl")).toEqual({ confirm: "Potwierdź odstąpienie od umowy", entry: "Odstąp od umowy tutaj" });
    expect(withdrawalLabels("en")).toEqual({ confirm: "Confirm withdrawal", entry: "Withdraw from contract here" });
  });

  it("never uses wording UOKiK rules out", () => {
    for (const locale of ["pl", "en"]) {
      for (const key of ["lowest_30_days", "lowest_since_introduction", "price_before_reduction"] as const) {
        expect(omnibusLabel(key, locale)?.toLowerCase()).not.toMatch(/omnibus|referencyjna|odniesienia|ostatnich 30 dni|było/u);
      }
    }
  });
});
