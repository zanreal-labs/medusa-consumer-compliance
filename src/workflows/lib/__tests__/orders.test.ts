import { describe, expect, it } from "vitest";
import { parseDate, parseDisplayId } from "../orders";

describe("order helpers", () => {
  it("reads dates from Date objects, ISO strings and epoch numbers", () => {
    const date = new Date("2026-10-19T10:00:00Z");
    expect(parseDate(date)).toBe(date);
    expect(parseDate("2026-10-19T10:00:00Z")?.toISOString()).toBe("2026-10-19T10:00:00.000Z");
    expect(parseDate(date.getTime())?.getTime()).toBe(date.getTime());
    expect(parseDate("not a date")).toBeNull();
    expect(parseDate(null)).toBeNull();
  });

  it("reads display ids typed by people", () => {
    expect(parseDisplayId("#1042")).toBe(1042);
    expect(parseDisplayId(" 7 ")).toBe(7);
    expect(parseDisplayId("abc")).toBeNull();
  });
});
