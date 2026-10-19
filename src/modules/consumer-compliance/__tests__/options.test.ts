import { describe, expect, it } from "vitest";
import { contextKey, parseContextKey, resolveOptions } from "../types";

describe("resolveOptions", () => {
  it("defaults to Polish law", () => {
    const options = resolveOptions(undefined);
    expect(options.omnibus).toMatchObject({ gradualReductions: "per_change", reductionDetection: "sale_price_list", windowDays: 30 });
    expect(options.withdrawal).toMatchObject({ extendOverNonWorkingDays: true, periodDays: 14, rejectOutsidePeriod: false });
    expect(options.defaultLocale).toBe("pl");
  });

  it("never goes below the statutory minimums", () => {
    const options = resolveOptions({ omnibus: { retentionDays: 5, windowDays: 7 }, withdrawal: { periodDays: 3 } });
    expect(options.omnibus.windowDays).toBe(30);
    expect(options.omnibus.retentionDays).toBe(31);
    expect(options.withdrawal.periodDays).toBe(14);
  });

  it("accepts more generous values", () => {
    const options = resolveOptions({ omnibus: { windowDays: 45 }, withdrawal: { periodDays: 30 } });
    expect(options.omnibus.windowDays).toBe(45);
    expect(options.withdrawal.periodDays).toBe(30);
  });

  it("normalises price contexts", () => {
    const options = resolveOptions({ omnibus: { priceContexts: [{ currency_code: " PLN " }] } });
    expect(options.omnibus.priceContexts).toEqual([{ currency_code: "pln", region_id: null }]);
  });
});

describe("context keys", () => {
  it("round-trips", () => {
    expect(contextKey({ currency_code: "PLN", region_id: "reg_1" })).toBe("pln|reg_1");
    expect(contextKey({ currency_code: "eur" })).toBe("eur|*");
    expect(parseContextKey("pln|*")).toEqual({ currency_code: "pln", region_id: null });
    expect(parseContextKey("pln|reg_1")).toEqual({ currency_code: "pln", region_id: "reg_1" });
    expect(parseContextKey("bad")).toBeNull();
  });
});
