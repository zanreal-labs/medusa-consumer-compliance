import { describe, expect, it } from "vitest";
import { easterSunday, endOfWarsawDay, isPolishNonWorkingDay, periodEnd, polishPublicHolidays, warsawDate } from "../calendar";

describe("calendar", () => {
  it("computes Easter", () => {
    expect(easterSunday(2025)).toEqual({ day: 20, month: 4, year: 2025 });
    expect(easterSunday(2026)).toEqual({ day: 5, month: 4, year: 2026 });
    expect(easterSunday(2027)).toEqual({ day: 28, month: 3, year: 2027 });
  });

  it("lists Polish public holidays, Christmas Eve from 2025", () => {
    const holidays2026 = polishPublicHolidays(2026);
    for (const day of ["1-1", "1-6", "4-5", "4-6", "5-1", "5-3", "5-24", "6-4", "8-15", "11-1", "11-11", "12-24", "12-25", "12-26"]) {
      expect(holidays2026.has(day)).toBe(true);
    }
    expect(polishPublicHolidays(2024).has("12-24")).toBe(false);
  });

  it("knows weekends and holidays", () => {
    expect(isPolishNonWorkingDay({ day: 17, month: 10, year: 2026 })).toBe(true); // Saturday
    expect(isPolishNonWorkingDay({ day: 19, month: 10, year: 2026 })).toBe(false); // Monday
    expect(isPolishNonWorkingDay({ day: 11, month: 11, year: 2026 })).toBe(true); // Wednesday, holiday
  });

  it("reads civil dates in Warsaw", () => {
    expect(warsawDate(new Date("2026-06-30T22:30:00Z"))).toEqual({ day: 1, month: 7, year: 2026 });
  });

  it("ends a day at 23:59:59.999 local time in winter and summer", () => {
    expect(endOfWarsawDay({ day: 15, month: 1, year: 2026 }).toISOString()).toBe("2026-01-15T22:59:59.999Z");
    expect(endOfWarsawDay({ day: 15, month: 7, year: 2026 }).toISOString()).toBe("2026-07-15T21:59:59.999Z");
    // The night the clocks go back: 25 Oct 2026 ends in winter time.
    expect(endOfWarsawDay({ day: 25, month: 10, year: 2026 }).toISOString()).toBe("2026-10-25T22:59:59.999Z");
  });

  it("counts 14 days without the delivery day (UOKiK example: 4 April -> 18 April)", () => {
    expect(periodEnd(new Date("2025-04-04T10:00:00Z"), 14, false).toISOString()).toBe("2025-04-18T21:59:59.999Z");
  });

  it("moves an end on Saturday or a holiday to the next working day (art. 115 KC)", () => {
    // Delivered Saturday 3 Oct 2026: day 14 is Saturday 17 Oct, so Monday 19 Oct.
    expect(periodEnd(new Date("2026-10-03T09:00:00Z"), 14, true).toISOString()).toBe("2026-10-19T21:59:59.999Z");
    expect(periodEnd(new Date("2026-10-03T09:00:00Z"), 14, false).toISOString()).toBe("2026-10-17T21:59:59.999Z");
    // Delivered 10 Dec 2026: day 14 is Thursday 24 Dec (holiday), then 25, 26, 27 -> Monday 28 Dec.
    expect(periodEnd(new Date("2026-12-10T12:00:00Z"), 14, true).toISOString()).toBe("2026-12-28T22:59:59.999Z");
  });

  it("uses the Warsaw date of a late-evening delivery", () => {
    // 23:30 local on 4 April is 21:30 UTC, still 4 April in Warsaw.
    expect(periodEnd(new Date("2025-04-04T21:30:00Z"), 14, false).toISOString()).toBe("2025-04-18T21:59:59.999Z");
  });
});
