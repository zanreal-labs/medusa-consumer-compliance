import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { CONSUMER_COMPLIANCE_MODULE } from "../modules/consumer-compliance";
import type ConsumerComplianceModuleService from "../modules/consumer-compliance/service";
import { readIds } from "./lib/events";
import { failSafe } from "./lib/fail-safe";

/**
 * Drop the per-product and per-variant data of a deleted product. Soft
 * deletes, so a restored product gets its data back through the module's
 * restore. The price history is kept until retention removes it: it is the
 * record of what was charged, and a deleted product was still sold at those
 * prices. Re-running on the same event finds nothing left to delete.
 */
export default async function consumerComplianceProductDeletedHandler({
  container,
  event,
}: SubscriberArgs<unknown>): Promise<void> {
  await failSafe(container, "product cleanup", async () => {
  const productIds = readIds(event.data);
  if (productIds.length === 0) {
    return;
  }
  const service = container.resolve<ConsumerComplianceModuleService>(CONSUMER_COMPLIANCE_MODULE);
  const compliance = await service.listProductCompliances({ product_id: productIds }, { select: ["id"], take: null });
  const unitPricing = await service.listVariantUnitPricings({ product_id: productIds }, { select: ["id"], take: null });
  if (compliance.length > 0) {
    await service.softDeleteProductCompliances(compliance.map((row) => row.id));
  }
  if (unitPricing.length > 0) {
    await service.softDeleteVariantUnitPricings(unitPricing.map((row) => row.id));
  }
  });
}

export const config: SubscriberConfig = {
  context: { subscriberId: "consumer-compliance-product-deleted" },
  event: "product.deleted",
};
