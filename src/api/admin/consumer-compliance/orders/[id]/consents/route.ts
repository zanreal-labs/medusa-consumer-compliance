import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { isExternalMarketplaceOrder } from "../../../../../../modules/consumer-compliance/lib/external";
import type { QueryGraph } from "../../../../../../workflows/lib/catalog";
import { complianceService } from "../../../../../lib/views";

/**
 * GET /admin/consumer-compliance/orders/:id/consents
 *
 * The consents frozen onto the order at checkout, verbatim. For a marketplace
 * order (Allegro) `external_marketplace_order` is set and the list is empty:
 * the marketplace collected the consents.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  const service = complianceService(req.scope);
  const query = req.scope.resolve<QueryGraph>(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({ entity: "order", fields: ["id", "metadata", "sales_channel_id"], filters: { id: req.params.id } });
  const order = data[0];
  if (!order) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Order ${req.params.id} not found`);
  }
  const external = isExternalMarketplaceOrder(
    { metadata: (order.metadata as Record<string, unknown> | null) ?? null, sales_channel_id: (order.sales_channel_id as string | null) ?? null },
    service.resolvedOptions,
  );
  const consents = external ? [] : await service.listOrderConsents({ order_id: req.params.id }, { order: { accepted_at: "ASC" }, take: null });
  res.json({ consents, external_marketplace_order: external, order_id: req.params.id });
}
