import { describe, expect, it } from "vitest";
import { decideRecording, resolveTransitionTime, samePrice } from "../price-recording";
import type { OpenInterval, PriceObservation } from "../price-recording";

const now = new Date("2026-03-05T12:00:00Z");
const open: OpenInterval = { amount: 100, id: "ccph_1", original_amount: 100, price_list_id: null, valid_from: new Date("2026-03-01T00:00:00Z") };
const plain: PriceObservation = { amount: 100, original_amount: 100, price_list_id: null, price_list_type: null, tax_inclusive: true };

describe("decideRecording", () => {
  it("does nothing when there was and is no price", () => {
    expect(decideRecording({ now, observed: null, open: null })).toEqual({ action: "noop" });
  });

  it("is idempotent for an unchanged price", () => {
    expect(decideRecording({ now, observed: plain, open })).toEqual({ action: "noop" });
  });

  it("opens the first row", () => {
    expect(decideRecording({ now, observed: plain, open: null })).toEqual({ action: "transition", at: now, closeId: null, open: plain });
  });

  it("closes and opens on a change of amount, original or price list", () => {
    for (const observed of [{ ...plain, amount: 90 }, { ...plain, original_amount: 120 }, { ...plain, price_list_id: "plist" }]) {
      expect(decideRecording({ now, observed, open })).toMatchObject({ action: "transition", closeId: "ccph_1", open: observed });
    }
  });

  it("closes without opening when the price disappeared", () => {
    expect(decideRecording({ now, observed: null, open })).toEqual({ action: "transition", at: now, closeId: "ccph_1", open: null });
  });

  it("ignores floating point noise", () => {
    expect(samePrice(open, { ...plain, amount: 100.0000000001 })).toBe(true);
  });
});

describe("resolveTransitionTime", () => {
  const saleObserved: PriceObservation = { ...plain, amount: 80, price_list_id: "plist_sale", price_list_type: "sale" };

  it("dates a sweep-detected sale to the price list start", () => {
    const at = resolveTransitionTime({
      lists: { plist_sale: { ends_at: null, starts_at: new Date("2026-03-05T11:00:00Z") } },
      now,
      observed: saleObserved,
      open,
    });
    expect(at.toISOString()).toBe("2026-03-05T11:00:00.000Z");
  });

  it("dates the end of a sale to the price list end", () => {
    const at = resolveTransitionTime({
      lists: { plist_sale: { ends_at: new Date("2026-03-05T11:30:00Z"), starts_at: null } },
      now,
      observed: plain,
      open: { ...open, amount: 80, price_list_id: "plist_sale" },
    });
    expect(at.toISOString()).toBe("2026-03-05T11:30:00.000Z");
  });

  it("takes the earliest boundary when one list ended and another started in the gap", () => {
    const at = resolveTransitionTime({
      lists: {
        plist_new: { ends_at: null, starts_at: new Date("2026-03-05T11:40:00Z") },
        plist_old: { ends_at: new Date("2026-03-05T11:10:00Z"), starts_at: null },
      },
      now,
      observed: { ...saleObserved, price_list_id: "plist_new" },
      open: { ...open, price_list_id: "plist_old" },
    });
    expect(at.toISOString()).toBe("2026-03-05T11:10:00.000Z");
  });

  it("ignores boundaries outside the gap and falls back to now", () => {
    const at = resolveTransitionTime({
      lists: { plist_sale: { ends_at: null, starts_at: new Date("2026-02-01T00:00:00Z") } },
      now,
      observed: saleObserved,
      open,
    });
    expect(at).toEqual(now);
  });

  it("uses now for a first observation", () => {
    expect(resolveTransitionTime({ lists: {}, now, observed: plain, open: null })).toEqual(now);
  });
});
