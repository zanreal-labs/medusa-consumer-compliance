import type { Logger, MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { CONSUMER_COMPLIANCE_MODULE } from "../modules/consumer-compliance";
import type ConsumerComplianceModuleService from "../modules/consumer-compliance/service";

/**
 * Daily: expire unconfirmed withdrawal requests and drop price history past
 * retention (keeping whatever a running reduction still needs, see
 * `lib/retention.ts`).
 */
export default async function consumerComplianceHousekeeping(container: MedusaContainer): Promise<void> {
  const service = container.resolve<ConsumerComplianceModuleService>(CONSUMER_COMPLIANCE_MODULE);
  const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER);
  const now = new Date();

  const pending = await service.listWithdrawalRequests(
    { confirmation_expires_at: { $lt: now }, status: "pending_confirmation" },
    { select: ["id"], take: null },
  );
  if (pending.length > 0) {
    await service.updateWithdrawalRequests(
      pending.map((row) => ({ confirmation_token_hash: null, id: row.id, status: "expired" as const })),
    );
  }

  const cutoff = new Date(now.getTime() - service.resolvedOptions.omnibus.retentionDays * 24 * 60 * 60 * 1000);
  const candidates = await service.listPriceHistories({ valid_to: { $lt: cutoff } }, { select: ["variant_id"], take: null });
  const variantIds = [...new Set(candidates.map((row) => row.variant_id as string))];
  let deleted = 0;
  for (const variantId of variantIds) {
    deleted += await service.purgeVariantHistory(variantId, now);
  }
  if (pending.length > 0 || deleted > 0) {
    logger.info(`[consumer-compliance] housekeeping: ${pending.length} withdrawal request(s) expired, ${deleted} price history row(s) past retention removed`);
  }
}

export const config = {
  name: "consumer-compliance-housekeeping",
  schedule: "41 3 * * *",
};
