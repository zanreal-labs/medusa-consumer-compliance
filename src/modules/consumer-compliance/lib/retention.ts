/**
 * Which closed history rows are safe to delete.
 *
 * The obvious rule - drop everything older than `retentionDays` - is wrong for
 * a long sale. Under art. 4 ust. 5 a gradual reduction keeps the reference
 * price from the 30 days before its FIRST step, so a series that has run for
 * three months still needs the history from four months ago. The cutoff for a
 * series in a running reduction is therefore pulled back to the start of that
 * reduction's window, with a day of slack.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export function retentionCutoff(input: {
  now: Date;
  retentionDays: number;
  windowDays: number;
  /** Start of the running reduction for this series, if it is reduced right now. */
  reductionStartedAt?: Date | null;
}): Date {
  const plain = input.now.getTime() - input.retentionDays * DAY_MS;
  if (!input.reductionStartedAt) {
    return new Date(plain);
  }
  const needed = input.reductionStartedAt.getTime() - (input.windowDays + 1) * DAY_MS;
  return new Date(Math.min(plain, needed));
}

/** A closed row is deletable when it ended before the cutoff. Open rows never are. */
export function isDeletable(row: { valid_to: Date | null }, cutoff: Date): boolean {
  return row.valid_to !== null && row.valid_to.getTime() < cutoff.getTime();
}
