/**
 * The Omnibus reference price, as a pure function of a price history.
 *
 * Polish law, art. 4 ustawy z dnia 9 maja 2014 r. o informowaniu o cenach
 * towarów i usług (t.j. Dz.U. 2023 poz. 168), in force since 1 January 2023 and
 * implementing art. 6a of Directive 98/6/EC as added by Directive (EU) 2019/2161:
 *
 * - ust. 2: whenever a price reduction is communicated, the lowest price of the
 *   product in the 30 days BEFORE the reduction must be shown next to it;
 * - ust. 3: a product offered for less than 30 days shows the lowest price since
 *   it was first offered;
 * - ust. 4: goods that spoil quickly or have a short shelf life show the price
 *   from before the FIRST reduction, and the 30-day rule does not apply.
 *
 * Poland did not take up the option in art. 6a(5) of the directive for
 * progressively increased reductions. The UOKiK guidance ("Informacja o obniżce
 * ceny. Wyjaśnienia Prezesa UOKiK", 2023) is explicit that each further step
 * is measured against the lowest price of the 30 days before THAT step, which
 * then includes the earlier promotional price. That is the `per_change`
 * default here; `keep_first` exists for stores in member states that did use
 * the option.
 *
 * The window is counted in calendar days of Polish civil time: its last day is
 * the day before the day on which the reduced price could first be bought
 * (UOKiK guidance, point on computing the period). A product withdrawn from
 * sale for more than 30 days counts as newly introduced when it returns.
 *
 * Nothing here touches a database or Medusa, so every one of those rules is a
 * unit test (see `__tests__/omnibus.test.ts`).
 */
import type { GradualReductionMode, OmnibusMode, ReductionDetection } from "../types";
import { addDays, endOfWarsawDay, warsawDate } from "./calendar";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How far apart the first recorded price and the variant's creation may be
 * while the history still counts as complete. A price written through an
 * admin workflow is recorded seconds after it lands; the hourly sweep is the
 * slowest path. Anything later means the plugin was installed after the
 * variant already had a price, so the history before that moment is unknown.
 */
export const HISTORY_COMPLETENESS_TOLERANCE_MS = 2 * 60 * 60 * 1000;

/** A break in sale longer than this makes a returning product "newly introduced" (UOKiK guidance). */
export const RELAUNCH_GAP_DAYS = 30;

/** One price, valid from `valid_from` until `valid_to` (exclusive), or still current when `valid_to` is null. */
export interface PriceInterval {
  amount: number;
  /** The regular price at the time (Medusa's `original_amount`), used to tell a reduction from a plain price. */
  original_amount: number | null;
  price_list_id: string | null;
  price_list_type: string | null;
  valid_from: Date;
  valid_to: Date | null;
  /**
   * `observed` (default): the price the store offered, as recorded from the
   * pricing module. `external`: a price obtainable another way for a while,
   * entered by the operator - typically a publicly announced discount code,
   * which UOKiK counts as a reference price for later promotions. External
   * rows count towards the lowest price but never as the current price.
   */
  kind?: "observed" | "external";
}

export interface OmnibusRules {
  windowDays: number;
  gradualReductions: GradualReductionMode;
  reductionDetection: ReductionDetection;
  ignoredPriceListIds?: readonly string[];
}

export interface OmnibusInput {
  intervals: readonly PriceInterval[];
  now: Date;
  mode: OmnibusMode;
  rules: OmnibusRules;
  /** When the variant was created, if known. */
  offeredSince?: Date | null;
  /**
   * Evaluate a reduction that is not a price list, for example a discount
   * code campaign, starting at this moment. The current price is then treated
   * as reduced from this time regardless of how Medusa labels it.
   */
  externalReductionStartedAt?: Date | null;
}

export type ReferenceBasis =
  | "lowest_in_window"
  | "lowest_since_first_offered"
  | "price_before_first_reduction";

/**
 * The label the storefront must use, per UOKiK guidance (point on labels):
 * - `lowest_30_days`: "Najniższa cena z 30 dni przed obniżką"
 * - `lowest_since_introduction`: "Najniższa cena od wprowadzenia towaru"
 * - `price_before_reduction`: "Cena przed obniżką" (perishable goods)
 * Labels such as "cena referencyjna", "cena omnibus" or "było" are not allowed.
 */
export type ReferenceLabel = "lowest_30_days" | "lowest_since_introduction" | "price_before_reduction";

export interface OmnibusResult {
  status: "ok" | "no_price" | "exempt";
  current_amount: number | null;
  original_amount: number | null;
  is_reduced: boolean;
  price_list_id: string | null;
  /** When the current reduction started (for perishables and `keep_first`, the first step of the series). */
  reduction_started_at: string | null;
  /** The price to show next to the reduced price. Null when there is no reduction or no prior price. */
  reference_price: number | null;
  reference_basis: ReferenceBasis | null;
  reference_label: ReferenceLabel | null;
  window_days: number;
  /** Inclusive start and exclusive end of the reference window, ISO. */
  window_start: string | null;
  window_end: string | null;
  /** The product was first offered (or reintroduced) less than `window_days` before the reduction (art. 4 ust. 3). */
  offered_less_than_window: boolean;
  /** The plugin has no record of part of the window, because it was installed after the product was already on sale. */
  history_incomplete: boolean;
  /** Reduction against the reference price in percent, one decimal (CJEU C-330/23: a percentage must use the prior price). */
  reduction_percent: number | null;
  /**
   * The reference price is not higher than the current price: the product was
   * this cheap or cheaper within the window, so presenting the current price
   * as a reduction would be misleading. Shown as a warning in the admin.
   */
  reference_not_higher: boolean;
  /** Lowest price over the `window_days` calendar days before today, for promotions that are not price lists. */
  lowest_price_in_window: number | null;
  reason: "no_prior_price" | null;
}

export function isReduction(interval: PriceInterval, rules: OmnibusRules): boolean {
  if (interval.kind === "external") {
    return false;
  }
  if (interval.price_list_id && rules.ignoredPriceListIds?.includes(interval.price_list_id)) {
    return false;
  }
  if (interval.original_amount === null || !(interval.amount < interval.original_amount)) {
    return false;
  }
  return rules.reductionDetection === "lower_than_original" || interval.price_list_type === "sale";
}

function sortIntervals(intervals: readonly PriceInterval[]): PriceInterval[] {
  return [...intervals].sort((a, b) => a.valid_from.getTime() - b.valid_from.getTime());
}

function endOf(interval: PriceInterval): number {
  return interval.valid_to === null ? Number.POSITIVE_INFINITY : interval.valid_to.getTime();
}

function covers(interval: PriceInterval, at: number): boolean {
  return interval.valid_from.getTime() <= at && endOf(interval) > at;
}

/** Whether `next` starts where `previous` ended, so the price had no gap between them. */
function contiguous(previous: PriceInterval, next: PriceInterval): boolean {
  if (previous.valid_to === null) {
    return true;
  }
  // A one-second tolerance absorbs the two writes of a close-and-open pair.
  return Math.abs(next.valid_from.getTime() - previous.valid_to.getTime()) <= 1000;
}

function sameAmount(a: PriceInterval, b: PriceInterval): boolean {
  return Math.abs(a.amount - b.amount) < 0.000001;
}

function minAmountOverlapping(intervals: readonly PriceInterval[], from: number, to: number): number | null {
  let lowest: number | null = null;
  for (const interval of intervals) {
    if (interval.valid_from.getTime() < to && endOf(interval) > from) {
      lowest = lowest === null ? interval.amount : Math.min(lowest, interval.amount);
    }
  }
  return lowest;
}

/** Midnight (start) of the Warsaw calendar day containing `at`. */
export function startOfWarsawDay(at: Date): Date {
  return new Date(endOfWarsawDay(addDays(warsawDate(at), -1)).getTime() + 1);
}

/** `[start, end)` of the `days` calendar days ending the day before `at`, in Warsaw time. */
export function windowBefore(at: Date, days: number): { start: Date; end: Date } {
  const end = startOfWarsawDay(at);
  const start = startOfWarsawDay(new Date(endOfWarsawDay(addDays(warsawDate(at), -days)).getTime()));
  return { end, start };
}

/**
 * The start of the latest stretch in which the product was continuously on
 * offer, ignoring breaks of up to `RELAUNCH_GAP_DAYS`. A longer break means the
 * product counts as newly introduced on its return.
 */
export function introducedAt(observed: readonly PriceInterval[]): Date | null {
  if (observed.length === 0) {
    return null;
  }
  let start = observed[0].valid_from.getTime();
  let reach = endOf(observed[0]);
  for (const interval of observed.slice(1)) {
    const from = interval.valid_from.getTime();
    if (from - reach > RELAUNCH_GAP_DAYS * DAY_MS) {
      start = from;
    }
    reach = Math.max(reach, endOf(interval));
  }
  return new Date(start);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function evaluateOmnibus(input: OmnibusInput): OmnibusResult {
  const { mode, rules } = input;
  const nowDate = input.now;
  const now = nowDate.getTime();
  const all = sortIntervals(input.intervals).filter((interval) => interval.valid_from.getTime() <= now);
  const observed = all.filter((interval) => interval.kind !== "external");
  const currentIndex = observed.findIndex((interval) => covers(interval, now));
  const current = currentIndex === -1 ? null : observed[currentIndex];
  const rolling = windowBefore(nowDate, rules.windowDays);

  const base: OmnibusResult = {
    current_amount: current?.amount ?? null,
    history_incomplete: false,
    is_reduced: false,
    lowest_price_in_window: current ? minAmountOverlapping(all, rolling.start.getTime(), rolling.end.getTime()) : null,
    offered_less_than_window: false,
    original_amount: current?.original_amount ?? null,
    price_list_id: current?.price_list_id ?? null,
    reason: null,
    reduction_percent: null,
    reduction_started_at: null,
    reference_basis: null,
    reference_label: null,
    reference_not_higher: false,
    reference_price: null,
    status: "ok",
    window_days: rules.windowDays,
    window_end: null,
    window_start: null,
  };

  if (!current) {
    return { ...base, status: "no_price" };
  }
  const externalStart = input.externalReductionStartedAt ? input.externalReductionStartedAt.getTime() : null;
  const reducedByList = isReduction(current, rules);
  if (mode === "exempt") {
    return { ...base, is_reduced: reducedByList || externalStart !== null, status: "exempt" };
  }
  if (!reducedByList && externalStart === null) {
    return base;
  }

  // Find where the reduction being announced started.
  let reductionStart: number;
  if (externalStart !== null && !reducedByList) {
    reductionStart = Math.min(externalStart, now);
  } else {
    let firstIndex = currentIndex;
    const followChain = mode === "perishable" || rules.gradualReductions === "keep_first";
    while (firstIndex > 0) {
      const previous = observed[firstIndex - 1];
      const next = observed[firstIndex];
      if (!isReduction(previous, rules) || !contiguous(previous, next)) {
        break;
      }
      // Under `per_change` only an unchanged reduced price continues the same
      // reduction (UOKiK: the window stays put while the terms are unchanged).
      if (!followChain && !sameAmount(previous, next)) {
        break;
      }
      firstIndex -= 1;
    }
    reductionStart = observed[firstIndex].valid_from.getTime();
    if (externalStart !== null) {
      reductionStart = Math.min(reductionStart, externalStart);
    }
  }

  const result: OmnibusResult = {
    ...base,
    is_reduced: true,
    reduction_started_at: new Date(reductionStart).toISOString(),
  };
  const before = all.filter((interval) => interval.valid_from.getTime() < reductionStart);
  let reference: number | null;

  if (mode === "perishable") {
    const lastObserved = before.filter((interval) => interval.kind !== "external").at(-1);
    reference = lastObserved ? lastObserved.amount : null;
    result.reference_basis = reference === null ? null : "price_before_first_reduction";
    result.reference_label = reference === null ? null : "price_before_reduction";
  } else {
    const window = windowBefore(new Date(reductionStart), rules.windowDays);
    result.window_start = window.start.toISOString();
    result.window_end = window.end.toISOString();
    const priorObserved = observed.filter((interval) => interval.valid_from.getTime() < reductionStart);
    const introduced = introducedAt(priorObserved);
    const created = input.offeredSince ? input.offeredSince.getTime() : null;
    const offeredFrom = Math.max(introduced?.getTime() ?? -Infinity, created ?? -Infinity);
    const offeredRecently = Number.isFinite(offeredFrom) && offeredFrom > window.start.getTime();
    result.offered_less_than_window = offeredRecently;

    reference = minAmountOverlapping(before, window.start.getTime(), window.end.getTime());
    if (reference === null && offeredRecently) {
      // Introduced and reduced on the same calendar day: art. 4 ust. 3 still
      // asks for the lowest price since introduction, which only exists before
      // the reduction on that same day.
      reference = minAmountOverlapping(before, offeredFrom, reductionStart);
    }

    const firstKnown = observed[0].valid_from.getTime();
    result.history_incomplete =
      firstKnown > window.start.getTime() &&
      (created === null || firstKnown - Math.max(created, window.start.getTime()) > HISTORY_COMPLETENESS_TOLERANCE_MS);
    result.reference_basis = reference === null ? null : offeredRecently ? "lowest_since_first_offered" : "lowest_in_window";
    result.reference_label = reference === null ? null : offeredRecently ? "lowest_since_introduction" : "lowest_30_days";
  }

  if (reference === null) {
    return { ...result, reason: "no_prior_price" };
  }
  result.reference_price = reference;
  result.reference_not_higher = reference <= current.amount;
  result.reduction_percent = reference > 0 ? round1(((reference - current.amount) / reference) * 100) : null;
  return result;
}

/**
 * Overlay the live price on a recorded history.
 *
 * The history can trail a write by the few seconds the event path debounces
 * (or by up to an hour for a scheduled price list, until the sweep). A
 * storefront must never show a reference price computed against a price that
 * is no longer the one on the page, so reads evaluate the history as if the
 * live price had been recorded at `now`. Nothing is written.
 */
export function withLiveObservation(
  intervals: readonly PriceInterval[],
  live: Omit<PriceInterval, "valid_from" | "valid_to" | "kind"> | null,
  now: Date,
): PriceInterval[] {
  const sorted = sortIntervals(intervals);
  const openIndex = sorted.findIndex((interval) => interval.valid_to === null && interval.kind !== "external");
  const open = openIndex === -1 ? null : sorted[openIndex];
  const same =
    open &&
    live &&
    Math.abs(open.amount - live.amount) < 0.000001 &&
    (open.original_amount ?? null) === (live.original_amount ?? null) &&
    (open.price_list_id ?? null) === (live.price_list_id ?? null);
  if (same || (!open && !live)) {
    return sorted;
  }
  const result = sorted.map((interval, index) => (index === openIndex ? { ...interval, valid_to: now } : interval));
  if (live) {
    result.push({ ...live, kind: "observed", valid_from: now, valid_to: null });
  }
  return result;
}
