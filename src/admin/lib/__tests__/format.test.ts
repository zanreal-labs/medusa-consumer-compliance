import { describe, expect, it } from "vitest";
import { buildStepChart } from "../chart";
import { formatContextKey, formatMoney, parseDecimal } from "../format";

describe("admin formatting", () => {
  it("parses decimals typed with a comma", () => {
    expect(parseDecimal("1,5")).toBe(1.5);
    expect(parseDecimal(" 250 ")).toBe(250);
    expect(parseDecimal("")).toBeNull();
    expect(Number.isNaN(parseDecimal("abc") as number)).toBe(true);
  });

  it("formats money and contexts", () => {
    expect(formatMoney(null, "pln", "pl")).toBe("-");
    expect(formatMoney(12.5, "pln", "en")).toContain("12.50");
    expect(formatContextKey("pln|*")).toBe("PLN");
    expect(formatContextKey("pln|reg_1")).toBe("PLN, reg_1");
  });
});

describe("buildStepChart", () => {
  const from = Date.parse("2026-01-01T00:00:00Z");
  const to = Date.parse("2026-01-31T00:00:00Z");
  const size = { from, height: 100, padding: 0, to, width: 300 };

  it("draws a continuous step line", () => {
    const chart = buildStepChart(
      [
        { amount: 100, valid_from: "2026-01-01T00:00:00Z", valid_to: "2026-01-16T00:00:00Z" },
        { amount: 80, valid_from: "2026-01-16T00:00:00Z", valid_to: null },
      ],
      size,
    );
    expect(chart?.path).toBe("M0.0,0.0 L150.0,0.0 L150.0,100.0 L300.0,100.0");
    expect(chart?.yMin).toBe(80);
    expect(chart?.yMax).toBe(100);
  });

  it("returns null when nothing is visible", () => {
    expect(buildStepChart([], size)).toBeNull();
  });

  it("pads a flat line so it stays drawable", () => {
    const chart = buildStepChart([{ amount: 50, valid_from: "2025-12-01T00:00:00Z", valid_to: null }], size);
    expect(chart?.yMin).toBe(49);
    expect(chart?.yMax).toBe(51);
  });
});
