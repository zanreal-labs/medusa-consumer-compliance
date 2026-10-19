import { describe, expect, it } from "vitest";
import { parsePriceEvent, readIds } from "../events";

describe("parsePriceEvent", () => {
  it("reads products, variants and prices", () => {
    expect(parsePriceEvent("product.updated", { id: "prod_1" })).toEqual({ ids: ["prod_1"], subject: "product" });
    expect(parsePriceEvent("product-variant.updated", [{ id: "variant_1" }, { id: "variant_2" }])).toEqual({
      ids: ["variant_1", "variant_2"],
      subject: "variant",
    });
    expect(parsePriceEvent("pricing.price.created", { id: ["price_1", "price_2"] })).toEqual({ ids: ["price_1", "price_2"], subject: "price" });
  });

  it("schedules a catalog pass for deletions and price list events", () => {
    expect(parsePriceEvent("pricing.price.deleted", { id: "price_1" })).toEqual({ ids: [], subject: "catalog" });
    expect(parsePriceEvent("pricing.price-list.updated", { id: "plist_1" })).toEqual({ ids: [], subject: "catalog" });
  });

  it("ignores unrelated events and events without ids", () => {
    expect(parsePriceEvent("order.placed", { id: "order_1" })).toBeNull();
    expect(parsePriceEvent("product.updated", {})).toBeNull();
  });

  it("reads every id shape", () => {
    expect(readIds({ ids: ["a", "b"] })).toEqual(["a", "b"]);
    expect(readIds([{ id: "a" }, { id: "a" }, null])).toEqual(["a"]);
    expect(readIds({ id: "  " })).toEqual([]);
  });
});
