import type { MedusaContainer } from "@medusajs/framework/types";
import { recordPriceHistoryWorkflow } from "../workflows/record-price-history";

/**
 * Hourly reconciliation of the whole catalog against the price history.
 *
 * The event path cannot see a price list that starts or ends on its own
 * schedule: nothing is written at that moment, so nothing is emitted. This
 * sweep observes every variant, and the record step dates such a transition
 * to the list's own `starts_at` / `ends_at` rather than to the sweep time.
 * On a fresh install the first run is the backfill: it opens a row for every
 * variant's current price.
 */
export default async function consumerCompliancePriceSweep(container: MedusaContainer): Promise<void> {
  await recordPriceHistoryWorkflow(container).run({ input: { source: "sweep", variant_ids: null } });
}

export const config = {
  name: "consumer-compliance-price-sweep",
  schedule: "17 * * * *",
};
