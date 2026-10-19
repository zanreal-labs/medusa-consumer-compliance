import { useTranslation } from "react-i18next";
import { buildStepChart } from "../lib/chart";
import type { ChartInterval } from "../lib/chart";
import { formatMoney } from "../lib/format";

const WIDTH = 640;
const HEIGHT = 180;
const PADDING = 16;

interface PriceHistoryChartProps {
  intervals: ChartInterval[];
  currency: string;
  from: number;
  to: number;
  reference: number | null;
  windowStart: string | null;
  windowEnd: string | null;
}

/** Step chart of the recorded prices, with the reference window shaded and the reference price drawn across it. */
export const PriceHistoryChart = ({ currency, from, intervals, reference, to, windowEnd, windowStart }: PriceHistoryChartProps) => {
  const { i18n, t } = useTranslation();
  const chart = buildStepChart(intervals, { from, height: HEIGHT, padding: PADDING, to, width: WIDTH });
  if (!chart) {
    return <p className="txt-small text-ui-fg-subtle">{t("consumerCompliance.history.noData")}</p>;
  }
  const x = (time: number) => PADDING + ((Math.min(Math.max(time, from), to) - from) / (to - from)) * (WIDTH - 2 * PADDING);
  const y = (amount: number) => PADDING + (1 - (amount - chart.yMin) / (chart.yMax - chart.yMin)) * (HEIGHT - 2 * PADDING);
  const shade =
    windowStart && windowEnd
      ? { width: Math.max(0, x(new Date(windowEnd).getTime()) - x(new Date(windowStart).getTime())), x: x(new Date(windowStart).getTime()) }
      : null;
  return (
    <figure className="flex flex-col gap-y-1">
      <svg
        aria-label={t("consumerCompliance.history.chartLabel")}
        className="w-full text-ui-fg-interactive"
        role="img"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      >
        {shade ? <rect className="fill-ui-bg-subtle-pressed" height={HEIGHT - 2 * PADDING} width={shade.width} x={shade.x} y={PADDING} /> : null}
        {reference !== null ? (
          <line className="stroke-ui-fg-muted" strokeDasharray="4 4" x1={PADDING} x2={WIDTH - PADDING} y1={y(reference)} y2={y(reference)} />
        ) : null}
        {chart.external.map((bar, index) => (
          <line className="stroke-ui-tag-orange-icon" key={index} strokeWidth={3} x1={bar.x} x2={bar.x + bar.width} y1={bar.y} y2={bar.y} />
        ))}
        <path d={chart.path} fill="none" stroke="currentColor" strokeWidth={2} />
      </svg>
      <figcaption className="txt-compact-xsmall text-ui-fg-subtle flex flex-wrap justify-between gap-x-4">
        <span>
          {formatMoney(chart.yMin, currency, i18n.language)} - {formatMoney(chart.yMax, currency, i18n.language)}
        </span>
        <span>{t("consumerCompliance.history.legend")}</span>
      </figcaption>
    </figure>
  );
};
