/**
 * Calendar arithmetic in Polish civil time (Europe/Warsaw).
 *
 * Statutory deadlines are counted in calendar days of the place of the
 * contract, not in 24-hour blocks of UTC: per art. 111 par. 2 of the Civil Code
 * the day of the triggering event is not counted, and per art. 111 par. 1 the
 * period ends when its last day ends. So "14 days from delivery on Monday
 * 3 March at 18:00" ends at 23:59:59.999 Warsaw time on Monday 17 March.
 */

export const WARSAW_TZ = "Europe/Warsaw";

export interface CivilDate {
  year: number;
  month: number; // 1-12
  day: number;
}

const formatter = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
  minute: "2-digit",
  month: "2-digit",
  second: "2-digit",
  timeZone: WARSAW_TZ,
  year: "numeric",
});

function parts(date: Date): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") {
      out[part.type] = Number(part.value);
    }
  }
  return out;
}

/** The civil date in Warsaw at an instant. */
export function warsawDate(date: Date): CivilDate {
  const p = parts(date);
  return { day: p.day, month: p.month, year: p.year };
}

/** Offset of Warsaw from UTC, in minutes, at an instant (60 in winter, 120 in summer). */
export function warsawOffsetMinutes(date: Date): number {
  const p = parts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

export function addDays(date: CivilDate, days: number): CivilDate {
  const utc = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { day: utc.getUTCDate(), month: utc.getUTCMonth() + 1, year: utc.getUTCFullYear() };
}

/** The last millisecond of a civil date in Warsaw, as an instant. */
export function endOfWarsawDay(date: CivilDate): Date {
  const naiveEnd = Date.UTC(date.year, date.month - 1, date.day, 23, 59, 59, 999);
  // The offset at the end of the day is what matters (DST switches happen at night).
  const guess = new Date(naiveEnd - 60 * 60000);
  const offset = warsawOffsetMinutes(new Date(naiveEnd - warsawOffsetMinutes(guess) * 60000));
  return new Date(naiveEnd - offset * 60000);
}

/** Easter Sunday (Gregorian), Anonymous Gregorian algorithm. */
export function easterSunday(year: number): CivilDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { day, month, year };
}

function key(date: CivilDate): string {
  return `${date.month}-${date.day}`;
}

/**
 * Statutory public holidays in Poland (ustawa z dnia 18 stycznia 1951 r. o
 * dniach wolnych od pracy, art. 1). Christmas Eve (24 December) is a day off
 * from 2025 under the 2024 amendment.
 */
export function polishPublicHolidays(year: number): Set<string> {
  const easter = easterSunday(year);
  const fixed = ["1-1", "1-6", "5-1", "5-3", "8-15", "11-1", "11-11", "12-25", "12-26"];
  if (year >= 2025) {
    fixed.push("12-24");
  }
  const movable = [
    easter,
    addDays(easter, 1), // Easter Monday
    addDays(easter, 49), // Pentecost Sunday
    addDays(easter, 60), // Corpus Christi
  ];
  return new Set([...fixed, ...movable.map(key)]);
}

export function isPolishNonWorkingDay(date: CivilDate): boolean {
  const weekday = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
  if (weekday === 0 || weekday === 6) {
    return true;
  }
  return polishPublicHolidays(date.year).has(key(date));
}

/**
 * End of a period of `days` calendar days that starts on the day of `event`.
 * With `extendOverNonWorkingDays`, a period whose last day is a Saturday,
 * Sunday or public holiday ends on the next working day (art. 115 KC).
 */
export function periodEnd(event: Date, days: number, extendOverNonWorkingDays: boolean): Date {
  let last = addDays(warsawDate(event), days);
  if (extendOverNonWorkingDays) {
    while (isPolishNonWorkingDay(last)) {
      last = addDays(last, 1);
    }
  }
  return endOfWarsawDay(last);
}
