/**
 * Deciding what one price observation does to the history, as a pure function.
 *
 * The history is a set of intervals per (variant, pricing context): at most one
 * is open (`valid_to` null) and it holds the price a customer sees right now.
 * Recording is idempotent by construction - observing the same price again is
 * a no-op - so a subscriber that fires twice, a sweep that runs after an event
 * already recorded the change, or a backfill run on an already tracked catalog
 * all converge on the same rows.
 */

export interface OpenInterval {
  id: string;
  amount: number;
  original_amount: number | null;
  price_list_id: string | null;
  valid_from: Date;
}

/** What the pricing module answers for a variant in a context right now, or null for no price. */
export interface PriceObservation {
  amount: number;
  original_amount: number | null;
  price_list_id: string | null;
  price_list_type: string | null;
  tax_inclusive: boolean;
}

/** Scheduling of the price lists involved, so a sweep can date a change to when it really happened. */
export interface PriceListWindow {
  starts_at: Date | null;
  ends_at: Date | null;
}

export type RecordingDecision =
  | { action: "noop" }
  | {
      action: "transition";
      /** The open interval to close, if any. */
      closeId: string | null;
      at: Date;
      /** The interval to open, or null when the variant no longer has a price in this context. */
      open: PriceObservation | null;
    };

const MONEY_EPSILON = 0.000001;

function sameMoney(a: number | null, b: number | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return Math.abs(a - b) < MONEY_EPSILON;
}

export function samePrice(open: OpenInterval, observed: PriceObservation): boolean {
  return (
    sameMoney(open.amount, observed.amount) &&
    sameMoney(open.original_amount, observed.original_amount) &&
    (open.price_list_id ?? null) === (observed.price_list_id ?? null)
  );
}

/**
 * When the change most plausibly happened.
 *
 * An event-driven observation is a few seconds after the write, so `now` is
 * right. A sweep can run up to an hour after a price list started or ended on
 * its own schedule; there, the list's own boundary is the true moment. When
 * several boundaries fall inside the gap the EARLIEST is taken: if the new
 * price is lower that dates it conservatively (it makes the 30-day lowest price
 * lower, never higher), and if the old list simply ended it is exact.
 */
export function resolveTransitionTime(input: {
  now: Date;
  open: OpenInterval | null;
  observed: PriceObservation | null;
  lists: Record<string, PriceListWindow | undefined>;
}): Date {
  const { now, open, observed, lists } = input;
  if (!open) {
    return now;
  }
  const after = open.valid_from.getTime();
  const before = now.getTime();
  const candidates: number[] = [];

  const newList = observed?.price_list_id ? lists[observed.price_list_id] : undefined;
  if (newList?.starts_at && observed?.price_list_id !== open.price_list_id) {
    candidates.push(newList.starts_at.getTime());
  }
  const oldList = open.price_list_id ? lists[open.price_list_id] : undefined;
  if (oldList?.ends_at && observed?.price_list_id !== open.price_list_id) {
    candidates.push(oldList.ends_at.getTime());
  }

  const inside = candidates.filter((value) => value > after && value <= before);
  return inside.length === 0 ? now : new Date(Math.min(...inside));
}

export function decideRecording(input: {
  now: Date;
  open: OpenInterval | null;
  observed: PriceObservation | null;
  lists?: Record<string, PriceListWindow | undefined>;
}): RecordingDecision {
  const { open, observed } = input;
  if (!open && !observed) {
    return { action: "noop" };
  }
  if (open && observed && samePrice(open, observed)) {
    return { action: "noop" };
  }
  return {
    action: "transition",
    at: resolveTransitionTime({ ...input, lists: input.lists ?? {} }),
    closeId: open?.id ?? null,
    open: observed,
  };
}
