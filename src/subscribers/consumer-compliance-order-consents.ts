import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { CONSUMER_COMPLIANCE_MODULE } from "../modules/consumer-compliance";
import { isExternalMarketplaceOrder } from "../modules/consumer-compliance/lib/external";
import type ConsumerComplianceModuleService from "../modules/consumer-compliance/service";
import type { QueryGraph } from "../workflows/lib/catalog";
import { snapshotOrderConsentsWorkflow } from "../workflows/consents";
import { failSafe } from "./lib/fail-safe";

/**
 * When a cart becomes an order, freeze its accepted consents onto the order.
 *
 * `order.placed` also fires for Allegro orders (medusa-allegro emits it for
 * the orders it creates through `createOrderWorkflow`). Those are recognised
 * first and left untouched: no query beyond the order itself, no snapshot, no
 * write. Orders without a cart are skipped as well. Everything runs fail-safe,
 * and the snapshot step is idempotent.
 */
export default async function consumerComplianceOrderConsentsHandler({
  container,
  event,
}: SubscriberArgs<{ id: string }>): Promise<void> {
  await failSafe(container, "order consent snapshot", async () => {
    const orderId = event.data?.id;
    if (!orderId) {
      return;
    }
    const service = container.resolve<ConsumerComplianceModuleService>(CONSUMER_COMPLIANCE_MODULE);
    const query = container.resolve<QueryGraph>(ContainerRegistrationKeys.QUERY);
    const { data } = await query.graph({ entity: "order", fields: ["id", "metadata", "sales_channel_id"], filters: { id: orderId } });
    const order = data[0];
    if (!order) {
      return;
    }
    if (
      isExternalMarketplaceOrder(
        { metadata: (order.metadata as Record<string, unknown> | null) ?? null, sales_channel_id: (order.sales_channel_id as string | null) ?? null },
        service.resolvedOptions,
      )
    ) {
      return;
    }
    const { data: links } = await query.graph({ entity: "order", fields: ["id", "cart.id"], filters: { id: orderId } });
    const cartId = (links[0]?.cart as { id?: string } | null | undefined)?.id;
    if (!cartId) {
      return;
    }
    await snapshotOrderConsentsWorkflow(container).run({ input: { cart_id: cartId, order_id: orderId } });
  });
}

export const config: SubscriberConfig = {
  context: { subscriberId: "consumer-compliance-order-consents" },
  event: "order.placed",
};
