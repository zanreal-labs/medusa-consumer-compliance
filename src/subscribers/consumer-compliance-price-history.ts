import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import type { Logger, MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { listVariantIdsByPriceIds, listVariantIdsByProductIds } from "../workflows/lib/catalog";
import { recordPriceHistoryWorkflow } from "../workflows/record-price-history";
import { createCoalescingQueue } from "./lib/coalescing-queue";
import type { CoalescingQueue } from "./lib/coalescing-queue";
import { PRICE_HISTORY_EVENTS, parsePriceEvent } from "./lib/events";
import { failSafe } from "./lib/fail-safe";

/**
 * Record a price change for the Omnibus history within seconds of it
 * happening. The hourly sweep (`src/jobs/consumer-compliance-price-sweep.ts`)
 * covers whatever this misses: scheduled price list starts and ends, a dropped
 * event, a write that bypassed the event bus.
 *
 * Idempotent: the record workflow writes only when the observed price differs
 * from the open row, so duplicate deliveries are no-ops.
 */
export default async function consumerCompliancePriceHistoryHandler({
  container,
  event,
}: SubscriberArgs<unknown>): Promise<void> {
  await failSafe(container, "price history event", async () => {
    await handle(container, event.name, event.data);
  });
}

async function handle(container: MedusaContainer, name: string, data: unknown): Promise<void> {
  const event = { data, name };
  const parsed = parsePriceEvent(event.name, event.data);
  if (!parsed) {
    return;
  }
  const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER);
  const queue = queueFor(container, logger);
  if (parsed.subject === "catalog") {
    queue.addAll();
    return;
  }
  try {
    const ids =
      parsed.subject === "variant"
        ? parsed.ids
        : parsed.subject === "product"
          ? await listVariantIdsByProductIds(container, parsed.ids)
          : await listVariantIdsByPriceIds(container, parsed.ids);
    queue.add(ids);
  } catch (error) {
    logger.warn(
      `[consumer-compliance] could not resolve ${event.name} to variants (${error instanceof Error ? error.message : String(error)}); the hourly sweep will record it.`,
    );
  }
}

const queues = new WeakMap<MedusaContainer, CoalescingQueue>();

function queueFor(container: MedusaContainer, logger: Logger): CoalescingQueue {
  const existing = queues.get(container);
  if (existing) {
    return existing;
  }
  const queue = createCoalescingQueue({
    flush: async (variantIds) => {
      await recordPriceHistoryWorkflow(container).run({ input: { source: "event", variant_ids: variantIds } });
    },
    onError: (error) => {
      logger.error(
        `[consumer-compliance] event-driven price recording failed: ${error instanceof Error ? error.message : String(error)}. The hourly sweep will retry.`,
      );
    },
  });
  queues.set(container, queue);
  return queue;
}

export const config: SubscriberConfig = {
  context: { subscriberId: "consumer-compliance-price-history" },
  event: [...PRICE_HISTORY_EVENTS],
};
