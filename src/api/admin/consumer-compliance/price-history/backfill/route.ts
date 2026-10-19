import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { recordPriceHistoryWorkflow } from "../../../../../workflows/record-price-history";

/**
 * POST /admin/consumer-compliance/price-history/backfill
 *
 * Record the current price of every variant now instead of waiting for the
 * next hourly sweep. Idempotent. Runs in the background and answers 202,
 * because a large catalog takes longer than an admin request should.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  const logger = req.scope.resolve<Logger>(ContainerRegistrationKeys.LOGGER);
  recordPriceHistoryWorkflow(req.scope)
    .run({ input: { source: "backfill", variant_ids: null } })
    .catch((error: unknown) => {
      logger.error(`[consumer-compliance] backfill failed: ${error instanceof Error ? error.message : String(error)}`);
    });
  res.status(202).json({ started: true });
}
