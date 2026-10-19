import { describe, expect, it } from "vitest";
import { computeUnitPrice, roundMoney, unitPricingIssues } from "../unit-price";

describe("unit price", () => {
  it("converts grams to a price per kilogram by default", () => {
    expect(computeUnitPrice(10, { net_quantity: 250, net_unit: "g" })).toMatchObject({ amount: 40, reference_label: "kg", reference_unit: "kg" });
  });

  it("supports 100 g and 100 ml when the store chooses them (par. 4 ust. 2)", () => {
    expect(computeUnitPrice(10, { net_quantity: 250, net_unit: "g", reference_unit: "per_100g" })?.amount).toBe(4);
    expect(computeUnitPrice(7.99, { net_quantity: 330, net_unit: "ml", reference_unit: "per_100ml" })?.amount).toBe(2.42);
  });

  it("handles litres, metres, area and volume", () => {
    expect(computeUnitPrice(5, { net_quantity: 500, net_unit: "ml" })?.amount).toBe(10);
    expect(computeUnitPrice(30, { net_quantity: 250, net_unit: "cm" })).toMatchObject({ amount: 12, reference_unit: "m" });
    expect(computeUnitPrice(99, { net_quantity: 1.65, net_unit: "m2" })?.amount).toBe(60);
    expect(computeUnitPrice(12, { net_quantity: 0.04, net_unit: "m3" })?.amount).toBe(300);
  });

  it("prices packs per piece or per 10 / 100 pieces (par. 4 ust. 3)", () => {
    expect(computeUnitPrice(12.5, { net_quantity: 50, net_unit: "piece" })).toMatchObject({ amount: 0.25, reference_label: "szt." });
    expect(computeUnitPrice(12.5, { net_quantity: 50, net_unit: "piece", reference_unit: "per_100_pieces" })?.amount).toBe(25);
    expect(computeUnitPrice(12.5, { net_quantity: 50, net_unit: "piece", reference_unit: "per_10_pieces" }, "en")?.reference_label).toBe("10 pieces");
  });

  it("uses the drained weight for food in a liquid medium (par. 6)", () => {
    expect(computeUnitPrice(6, { drained_quantity: 240, net_quantity: 400, net_unit: "g" })).toMatchObject({ amount: 25, based_on: "drained_quantity" });
  });

  it("flags a unit price equal to the selling price (par. 7 pkt 1)", () => {
    expect(computeUnitPrice(19.99, { net_quantity: 1, net_unit: "piece" })?.same_as_price).toBe(true);
    expect(computeUnitPrice(19.99, { net_quantity: 2, net_unit: "piece" })?.same_as_price).toBe(false);
  });

  it("returns nothing for exempt goods, missing data or no price", () => {
    expect(computeUnitPrice(10, { exempt_reason: "sold_as_set", net_quantity: 1, net_unit: "kg" })).toBeNull();
    expect(computeUnitPrice(10, { net_quantity: null, net_unit: "kg" })).toBeNull();
    expect(computeUnitPrice(null, { net_quantity: 1, net_unit: "kg" })).toBeNull();
  });

  it("reports what is wrong with the data", () => {
    expect(unitPricingIssues({ net_quantity: null, net_unit: null })).toEqual(["unit_missing", "quantity_missing"]);
    expect(unitPricingIssues({ net_quantity: 1, net_unit: "l", reference_unit: "kg" })).toEqual(["reference_unit_mismatch"]);
    expect(unitPricingIssues({ drained_quantity: 1, net_quantity: 1, net_unit: "l" })).toEqual(["drained_not_mass"]);
  });

  it("rounds half away from zero without the 1.005 trap", () => {
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(2.675)).toBe(2.68);
    expect(roundMoney(-1.005)).toBe(-1.01);
  });
});
