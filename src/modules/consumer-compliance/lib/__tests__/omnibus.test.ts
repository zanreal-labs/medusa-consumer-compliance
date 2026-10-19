import { describe, expect, it } from "vitest";
import { evaluateOmnibus, introducedAt, windowBefore, withLiveObservation } from "../omnibus";
import type { OmnibusRules, PriceInterval } from "../omnibus";

const d = (iso: string): Date => new Date(iso);

const PL_RULES: OmnibusRules = {
  gradualReductions: "per_change",
  reductionDetection: "sale_price_list",
  windowDays: 30,
};

function regular(amount: number, from: string, to: string | null): PriceInterval {
  return { amount, original_amount: amount, price_list_id: null, price_list_type: null, valid_from: d(from), valid_to: to ? d(to) : null };
}

function sale(amount: number, original: number, from: string, to: string | null, list = "plist_sale"): PriceInterval {
  return { amount, original_amount: original, price_list_id: list, price_list_type: "sale", valid_from: d(from), valid_to: to ? d(to) : null };
}

function run(intervals: PriceInterval[], now: string, extra: Partial<Parameters<typeof evaluateOmnibus>[0]> = {}) {
  return evaluateOmnibus({ intervals, mode: "standard", now: d(now), offeredSince: d("2025-01-01T00:00:00Z"), rules: PL_RULES, ...extra });
}

describe("evaluateOmnibus: basics", () => {
  it("reports no price when nothing covers now", () => {
    expect(run([], "2026-03-05T10:00:00Z").status).toBe("no_price");
    expect(run([regular(100, "2026-01-01T00:00:00Z", "2026-02-01T00:00:00Z")], "2026-03-05T10:00:00Z").status).toBe("no_price");
  });

  it("is not a reduction when the current price is a plain price", () => {
    const result = run([regular(100, "2026-01-01T00:00:00Z", "2026-02-10T00:00:00Z"), regular(90, "2026-02-10T00:00:00Z", null)], "2026-03-05T10:00:00Z");
    expect(result.is_reduced).toBe(false);
    expect(result.reference_price).toBeNull();
    expect(result.current_amount).toBe(90);
    // A silent price cut is not an announced reduction (UOKiK), but the rolling minimum is still offered.
    expect(result.lowest_price_in_window).toBe(90);
  });

  it("uses the regular price from the 30 days before a simple sale", () => {
    const result = run(
      [regular(100, "2026-01-01T00:00:00Z", "2026-03-01T10:00:00Z"), sale(80, 100, "2026-03-01T10:00:00Z", null)],
      "2026-03-05T10:00:00Z",
    );
    expect(result.is_reduced).toBe(true);
    expect(result.reference_price).toBe(100);
    expect(result.reduction_percent).toBe(20);
    expect(result.reference_label).toBe("lowest_30_days");
    expect(result.reference_basis).toBe("lowest_in_window");
    expect(result.reduction_started_at).toBe("2026-03-01T10:00:00.000Z");
    // Calendar days in Warsaw (UTC+1 in winter): window is 30 Jan 00:00 to 1 Mar 00:00 local.
    expect(result.window_end).toBe("2026-02-28T23:00:00.000Z");
    expect(result.window_start).toBe("2026-01-29T23:00:00.000Z");
    expect(result.reference_not_higher).toBe(false);
    expect(result.history_incomplete).toBe(false);
  });

  it("takes the lowest price inside the window, including an earlier promotion", () => {
    const result = run(
      [
        regular(100, "2026-01-01T00:00:00Z", "2026-02-10T00:00:00Z"),
        sale(90, 100, "2026-02-10T00:00:00Z", "2026-02-15T00:00:00Z", "plist_feb"),
        regular(100, "2026-02-15T00:00:00Z", "2026-03-01T10:00:00Z"),
        sale(85, 100, "2026-03-01T10:00:00Z", null),
      ],
      "2026-03-05T10:00:00Z",
    );
    expect(result.reference_price).toBe(90);
    expect(result.reduction_percent).toBe(5.6);
  });

  it("flags a 'reduction' that is not below the 30-day lowest price", () => {
    const result = run(
      [
        regular(100, "2026-01-01T00:00:00Z", "2026-02-20T00:00:00Z"),
        regular(70, "2026-02-20T00:00:00Z", "2026-02-21T00:00:00Z"),
        regular(100, "2026-02-21T00:00:00Z", "2026-03-01T10:00:00Z"),
        sale(80, 100, "2026-03-01T10:00:00Z", null),
      ],
      "2026-03-05T10:00:00Z",
    );
    expect(result.reference_price).toBe(70);
    expect(result.reference_not_higher).toBe(true);
    expect(result.reduction_percent).toBe(-14.3);
  });

  it("counts a price that applied for only one hour", () => {
    const result = run(
      [
        regular(100, "2026-01-01T00:00:00Z", "2026-02-20T10:00:00Z"),
        regular(60, "2026-02-20T10:00:00Z", "2026-02-20T11:00:00Z"),
        regular(100, "2026-02-20T11:00:00Z", "2026-03-01T10:00:00Z"),
        sale(80, 100, "2026-03-01T10:00:00Z", null),
      ],
      "2026-03-05T10:00:00Z",
    );
    expect(result.reference_price).toBe(60);
  });

  it("ignores prices that ended before the window", () => {
    const result = run(
      [regular(50, "2025-12-01T00:00:00Z", "2026-01-01T00:00:00Z"), regular(100, "2026-01-01T00:00:00Z", "2026-03-01T10:00:00Z"), sale(80, 100, "2026-03-01T10:00:00Z", null)],
      "2026-03-05T10:00:00Z",
    );
    expect(result.reference_price).toBe(100);
  });

  it("counts a price that started before the window and ran into it", () => {
    const result = run(
      [regular(60, "2026-01-01T00:00:00Z", "2026-01-31T12:00:00Z"), regular(100, "2026-01-31T12:00:00Z", "2026-03-01T10:00:00Z"), sale(80, 100, "2026-03-01T10:00:00Z", null)],
      "2026-03-05T10:00:00Z",
    );
    expect(result.reference_price).toBe(60);
  });

  it("does not count a price applied earlier on the day the reduction starts", () => {
    // The window's last day is the day before the reduced price could first be bought.
    const result = run(
      [
        regular(100, "2026-01-01T00:00:00Z", "2026-02-28T23:30:00Z"),
        regular(120, "2026-02-28T23:30:00Z", "2026-03-01T11:00:00Z"),
        sale(90, 120, "2026-03-01T11:00:00Z", null),
      ],
      "2026-03-05T10:00:00Z",
    );
    expect(result.reference_price).toBe(100);
  });

  it("keeps the same window for the whole campaign, even past 30 days", () => {
    const result = run(
      [regular(100, "2026-01-01T00:00:00Z", "2026-03-01T10:00:00Z"), sale(80, 100, "2026-03-01T10:00:00Z", null)],
      "2026-05-20T10:00:00Z",
    );
    expect(result.reference_price).toBe(100);
    expect(result.reduction_started_at).toBe("2026-03-01T10:00:00.000Z");
  });
});

describe("evaluateOmnibus: gradual reductions", () => {
  // The UOKiK example: 10 zl from 1 May, -20% to 8 zl on 10 June, 4 zl on 15 June.
  const steps = [
    regular(10, "2026-05-01T00:00:00Z", "2026-06-10T08:00:00Z"),
    sale(8, 10, "2026-06-10T08:00:00Z", "2026-06-15T08:00:00Z"),
    sale(4, 10, "2026-06-15T08:00:00Z", null),
  ];

  it("measures each step against the 30 days before it under Polish law (per_change)", () => {
    const result = run(steps, "2026-06-16T10:00:00Z");
    expect(result.reference_price).toBe(8);
    expect(result.reduction_percent).toBe(50);
    expect(result.reduction_started_at).toBe("2026-06-15T08:00:00.000Z");
  });

  it("keeps the first reference with keep_first (art. 6a(5) member states)", () => {
    const result = run(steps, "2026-06-16T10:00:00Z", { rules: { ...PL_RULES, gradualReductions: "keep_first" } });
    expect(result.reference_price).toBe(10);
    expect(result.reduction_percent).toBe(60);
    expect(result.reduction_started_at).toBe("2026-06-10T08:00:00.000Z");
  });

  it("treats an unchanged reduced price moving to another price list as the same reduction", () => {
    const result = run(
      [
        regular(100, "2026-05-01T00:00:00Z", "2026-06-10T08:00:00Z"),
        sale(80, 100, "2026-06-10T08:00:00Z", "2026-06-15T08:00:00Z", "plist_a"),
        sale(80, 100, "2026-06-15T08:00:00Z", null, "plist_b"),
      ],
      "2026-06-16T10:00:00Z",
    );
    expect(result.reference_price).toBe(100);
    expect(result.reduction_started_at).toBe("2026-06-10T08:00:00.000Z");
  });

  it("starts a new reduction after the price returned to regular, even with keep_first", () => {
    const result = run(
      [
        regular(100, "2026-05-01T00:00:00Z", "2026-06-01T00:00:00Z"),
        sale(70, 100, "2026-06-01T00:00:00Z", "2026-06-05T00:00:00Z"),
        regular(100, "2026-06-05T00:00:00Z", "2026-06-10T00:00:00Z"),
        sale(80, 100, "2026-06-10T00:00:00Z", null),
      ],
      "2026-06-12T10:00:00Z",
      { rules: { ...PL_RULES, gradualReductions: "keep_first" } },
    );
    expect(result.reduction_started_at).toBe("2026-06-10T00:00:00.000Z");
    expect(result.reference_price).toBe(70);
  });

  it("treats a gap in the price as an interruption of the series", () => {
    const result = run(
      [
        regular(100, "2026-05-01T00:00:00Z", "2026-06-01T00:00:00Z"),
        sale(70, 100, "2026-06-01T00:00:00Z", "2026-06-05T00:00:00Z"),
        sale(60, 100, "2026-06-07T00:00:00Z", null),
      ],
      "2026-06-12T10:00:00Z",
      { rules: { ...PL_RULES, gradualReductions: "keep_first" } },
    );
    expect(result.reduction_started_at).toBe("2026-06-07T00:00:00.000Z");
    expect(result.reference_price).toBe(70);
  });
});

describe("evaluateOmnibus: perishable goods (art. 4 ust. 4)", () => {
  it("uses the price before the first reduction, whatever happened within 30 days", () => {
    const result = run(
      [
        regular(50, "2026-05-01T00:00:00Z", "2026-05-20T00:00:00Z"),
        regular(100, "2026-05-20T00:00:00Z", "2026-06-10T08:00:00Z"),
        sale(80, 100, "2026-06-10T08:00:00Z", "2026-06-12T08:00:00Z"),
        sale(50, 100, "2026-06-12T08:00:00Z", null),
      ],
      "2026-06-12T10:00:00Z",
      { mode: "perishable" },
    );
    expect(result.reference_price).toBe(100);
    expect(result.reference_basis).toBe("price_before_first_reduction");
    expect(result.reference_label).toBe("price_before_reduction");
    expect(result.window_start).toBeNull();
    expect(result.reduction_percent).toBe(50);
  });

  it("has no reference when the product was reduced from the start", () => {
    const result = run([sale(80, 100, "2026-06-10T08:00:00Z", null)], "2026-06-12T10:00:00Z", { mode: "perishable" });
    expect(result.reference_price).toBeNull();
    expect(result.reason).toBe("no_prior_price");
  });
});

describe("evaluateOmnibus: products on offer for less than 30 days (art. 4 ust. 3)", () => {
  it("uses the lowest price since introduction and the matching label", () => {
    const result = run(
      [regular(100, "2026-06-01T10:00:00Z", "2026-06-10T08:00:00Z"), sale(80, 100, "2026-06-10T08:00:00Z", null)],
      "2026-06-12T10:00:00Z",
      { offeredSince: d("2026-06-01T09:59:00Z") },
    );
    expect(result.offered_less_than_window).toBe(true);
    expect(result.reference_price).toBe(100);
    expect(result.reference_label).toBe("lowest_since_introduction");
    expect(result.reference_basis).toBe("lowest_since_first_offered");
    expect(result.history_incomplete).toBe(false);
  });

  it("falls back to the same-day price for a product introduced and reduced on one day", () => {
    const result = run(
      [regular(100, "2026-06-10T06:00:00Z", "2026-06-10T10:00:00Z"), sale(80, 100, "2026-06-10T10:00:00Z", null)],
      "2026-06-10T12:00:00Z",
      { offeredSince: d("2026-06-10T06:00:00Z") },
    );
    expect(result.reference_price).toBe(100);
    expect(result.reference_label).toBe("lowest_since_introduction");
  });

  it("has no reference for a product on sale from its first minute", () => {
    const result = run([sale(80, 100, "2026-06-10T06:00:00Z", null)], "2026-06-12T12:00:00Z", { offeredSince: d("2026-06-10T06:00:00Z") });
    expect(result.is_reduced).toBe(true);
    expect(result.reference_price).toBeNull();
    expect(result.reason).toBe("no_prior_price");
  });

  it("treats a return after more than 30 days off sale as a new introduction", () => {
    const result = run(
      [regular(100, "2026-01-01T00:00:00Z", "2026-02-01T00:00:00Z"), regular(120, "2026-04-01T00:00:00Z", "2026-04-10T00:00:00Z"), sale(90, 120, "2026-04-10T00:00:00Z", null)],
      "2026-04-12T00:00:00Z",
    );
    expect(result.offered_less_than_window).toBe(true);
    expect(result.reference_price).toBe(120);
  });

  it("does not reset for a break shorter than 30 days", () => {
    const result = run(
      [regular(100, "2026-01-01T00:00:00Z", "2026-03-20T00:00:00Z"), regular(120, "2026-03-25T00:00:00Z", "2026-04-10T00:00:00Z"), sale(90, 120, "2026-04-10T00:00:00Z", null)],
      "2026-04-12T00:00:00Z",
    );
    expect(result.offered_less_than_window).toBe(false);
    expect(result.reference_price).toBe(100);
  });
});

describe("evaluateOmnibus: history completeness", () => {
  it("flags history that starts inside the window for a product that existed before", () => {
    const result = run([regular(100, "2026-06-05T00:00:00Z", "2026-06-10T00:00:00Z"), sale(80, 100, "2026-06-10T00:00:00Z", null)], "2026-06-12T00:00:00Z", {
      offeredSince: d("2026-01-01T00:00:00Z"),
    });
    expect(result.history_incomplete).toBe(true);
    expect(result.reference_price).toBe(100);
  });

  it("flags it too when the creation date is unknown", () => {
    const result = run([regular(100, "2026-06-05T00:00:00Z", "2026-06-10T00:00:00Z"), sale(80, 100, "2026-06-10T00:00:00Z", null)], "2026-06-12T00:00:00Z", {
      offeredSince: null,
    });
    expect(result.history_incomplete).toBe(true);
  });

  it("is complete when the first record follows the creation within the tolerance", () => {
    const result = run([regular(100, "2026-06-05T00:30:00Z", "2026-06-10T00:00:00Z"), sale(80, 100, "2026-06-10T00:00:00Z", null)], "2026-06-12T00:00:00Z", {
      offeredSince: d("2026-06-05T00:00:00Z"),
    });
    expect(result.history_incomplete).toBe(false);
  });
});

describe("evaluateOmnibus: what counts as a reduction", () => {
  const history = (list: Partial<PriceInterval>) => [
    regular(100, "2026-01-01T00:00:00Z", "2026-03-01T00:00:00Z"),
    { ...sale(80, 100, "2026-03-01T00:00:00Z", null), ...list },
  ];

  it("ignores configured price lists", () => {
    const result = run(history({ price_list_id: "plist_b2b" }), "2026-03-05T00:00:00Z", { rules: { ...PL_RULES, ignoredPriceListIds: ["plist_b2b"] } });
    expect(result.is_reduced).toBe(false);
  });

  it("does not treat an override list as a reduction by default", () => {
    expect(run(history({ price_list_type: "override" }), "2026-03-05T00:00:00Z").is_reduced).toBe(false);
  });

  it("treats any price below the original as a reduction with lower_than_original", () => {
    const result = run(history({ price_list_type: "override" }), "2026-03-05T00:00:00Z", {
      rules: { ...PL_RULES, reductionDetection: "lower_than_original" },
    });
    expect(result.is_reduced).toBe(true);
    expect(result.reference_price).toBe(100);
  });

  it("does not treat a sale list priced at or above the original as a reduction", () => {
    expect(run(history({ amount: 100 }), "2026-03-05T00:00:00Z").is_reduced).toBe(false);
  });

  it("returns exempt without a reference for exempt products", () => {
    const result = run(history({}), "2026-03-05T00:00:00Z", { mode: "exempt" });
    expect(result.status).toBe("exempt");
    expect(result.is_reduced).toBe(true);
    expect(result.reference_price).toBeNull();
  });
});

describe("evaluateOmnibus: external price windows and code campaigns", () => {
  it("counts a public discount code price towards a later reduction", () => {
    const result = run(
      [
        regular(100, "2026-01-01T00:00:00Z", "2026-03-01T00:00:00Z"),
        { ...regular(85, "2026-02-10T00:00:00Z", "2026-02-12T00:00:00Z"), kind: "external", original_amount: null },
        sale(90, 100, "2026-03-01T00:00:00Z", null),
      ],
      "2026-03-05T00:00:00Z",
    );
    expect(result.reference_price).toBe(85);
  });

  it("never treats an external window as the current price", () => {
    const result = run(
      [regular(100, "2026-01-01T00:00:00Z", null), { ...regular(85, "2026-03-01T00:00:00Z", "2026-03-10T00:00:00Z"), kind: "external" }],
      "2026-03-05T00:00:00Z",
    );
    expect(result.current_amount).toBe(100);
    expect(result.is_reduced).toBe(false);
  });

  it("evaluates a code campaign that is not a price list from its start date", () => {
    const result = run(
      [regular(100, "2026-01-01T00:00:00Z", "2026-02-20T00:00:00Z"), regular(90, "2026-02-20T00:00:00Z", "2026-02-22T00:00:00Z"), regular(100, "2026-02-22T00:00:00Z", null)],
      "2026-03-05T00:00:00Z",
      { externalReductionStartedAt: d("2026-03-01T00:00:00Z") },
    );
    expect(result.is_reduced).toBe(true);
    expect(result.reference_price).toBe(90);
    expect(result.reduction_started_at).toBe("2026-03-01T00:00:00.000Z");
  });
});

describe("windowBefore", () => {
  it("counts calendar days in Warsaw across the switch to summer time", () => {
    const window = windowBefore(d("2026-03-30T10:00:00Z"), 30);
    expect(window.end.toISOString()).toBe("2026-03-29T22:00:00.000Z"); // 30 Mar 00:00 CEST
    expect(window.start.toISOString()).toBe("2026-02-27T23:00:00.000Z"); // 28 Feb 00:00 CET
  });

  it("puts a reduction at 00:30 local time on the day it starts", () => {
    const window = windowBefore(d("2026-06-09T22:30:00Z"), 30); // 10 Jun 00:30 CEST
    expect(window.end.toISOString()).toBe("2026-06-09T22:00:00.000Z");
  });
});

describe("introducedAt", () => {
  it("returns the start of the last continuous stretch", () => {
    expect(introducedAt([])).toBeNull();
    expect(
      introducedAt([regular(1, "2026-01-01T00:00:00Z", "2026-01-10T00:00:00Z"), regular(1, "2026-01-20T00:00:00Z", "2026-02-01T00:00:00Z")])?.toISOString(),
    ).toBe("2026-01-01T00:00:00.000Z");
    expect(
      introducedAt([regular(1, "2026-01-01T00:00:00Z", "2026-01-10T00:00:00Z"), regular(1, "2026-02-20T00:00:00Z", null)])?.toISOString(),
    ).toBe("2026-02-20T00:00:00.000Z");
  });
});

describe("withLiveObservation", () => {
  const now = d("2026-03-05T12:00:00Z");
  const open = regular(100, "2026-01-01T00:00:00Z", null);
  const live = { amount: 100, original_amount: 100, price_list_id: null, price_list_type: null };

  it("leaves the history alone when the live price matches", () => {
    expect(withLiveObservation([open], live, now)).toEqual([open]);
  });

  it("closes the open row at now and appends the live price when it differs", () => {
    const result = withLiveObservation([open], { ...live, amount: 80, original_amount: 100, price_list_id: "plist", price_list_type: "sale" }, now);
    expect(result).toHaveLength(2);
    expect(result[0].valid_to).toEqual(now);
    expect(result[1]).toMatchObject({ amount: 80, valid_from: now, valid_to: null });
  });

  it("appends the live price when nothing was recorded yet", () => {
    expect(withLiveObservation([], live, now)).toHaveLength(1);
  });

  it("closes the open row when the variant lost its price", () => {
    const result = withLiveObservation([open], null, now);
    expect(result).toHaveLength(1);
    expect(result[0].valid_to).toEqual(now);
  });

  it("makes a fresh sale visible to the evaluation before the history caught up", () => {
    const intervals = withLiveObservation([open], { amount: 70, original_amount: 100, price_list_id: "plist", price_list_type: "sale" }, now);
    const result = evaluateOmnibus({ intervals, mode: "standard", now, offeredSince: d("2025-01-01T00:00:00Z"), rules: PL_RULES });
    expect(result.is_reduced).toBe(true);
    expect(result.reference_price).toBe(100);
  });
});
