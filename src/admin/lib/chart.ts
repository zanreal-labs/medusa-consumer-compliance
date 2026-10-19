/**
 * Geometry for the step chart of a price history, kept out of the component
 * so it can be unit tested. Prices hold until they change, so the line is a
 * step function: horizontal while a price applies, vertical at a change.
 */
export interface ChartInterval {
  amount: number;
  valid_from: string;
  valid_to: string | null;
  kind?: "observed" | "external";
}

export interface StepChart {
  path: string;
  external: { x: number; y: number; width: number }[];
  yMin: number;
  yMax: number;
  from: number;
  to: number;
}

export function buildStepChart(
  intervals: readonly ChartInterval[],
  input: { width: number; height: number; padding: number; from: number; to: number },
): StepChart | null {
  const observed = intervals.filter((interval) => interval.kind !== "external");
  const visible = intervals.filter(
    (interval) => new Date(interval.valid_from).getTime() < input.to && (interval.valid_to === null || new Date(interval.valid_to).getTime() > input.from),
  );
  if (visible.length === 0 || observed.length === 0) {
    return null;
  }
  const amounts = visible.map((interval) => interval.amount);
  let yMin = Math.min(...amounts);
  let yMax = Math.max(...amounts);
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }
  const span = input.to - input.from;
  const x = (time: number) => input.padding + ((Math.min(Math.max(time, input.from), input.to) - input.from) / span) * (input.width - 2 * input.padding);
  const y = (amount: number) => input.padding + (1 - (amount - yMin) / (yMax - yMin)) * (input.height - 2 * input.padding);

  const segments: string[] = [];
  let previousEnd: number | null = null;
  for (const interval of [...observed].sort((a, b) => a.valid_from.localeCompare(b.valid_from))) {
    const start = new Date(interval.valid_from).getTime();
    const end = interval.valid_to ? new Date(interval.valid_to).getTime() : input.to;
    if (end <= input.from || start >= input.to) {
      previousEnd = end;
      continue;
    }
    const command = previousEnd !== null && Math.abs(previousEnd - start) < 1000 && segments.length > 0 ? "L" : "M";
    segments.push(`${command}${x(start).toFixed(1)},${y(interval.amount).toFixed(1)}`, `L${x(end).toFixed(1)},${y(interval.amount).toFixed(1)}`);
    previousEnd = end;
  }
  const external = intervals
    .filter((interval) => interval.kind === "external")
    .map((interval) => {
      const start = x(new Date(interval.valid_from).getTime());
      const end = x(interval.valid_to ? new Date(interval.valid_to).getTime() : input.to);
      return { width: Math.max(1, end - start), x: start, y: y(interval.amount) };
    });
  return { external, from: input.from, path: segments.join(" "), to: input.to, yMax, yMin };
}
