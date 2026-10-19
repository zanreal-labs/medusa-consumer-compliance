import type { Logger, MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { StepResponse, createStep } from "@medusajs/framework/workflows-sdk";
import { CONSUMER_COMPLIANCE_MODULE } from "../../modules/consumer-compliance";
import type ConsumerComplianceModuleService from "../../modules/consumer-compliance/service";
import type { SeriesDecision } from "../../modules/consumer-compliance/service";
import { decideRecording } from "../../modules/consumer-compliance/lib/price-recording";
import type { PriceObservation } from "../../modules/consumer-compliance/lib/price-recording";
import { PAGE_SIZE, listVariants, loadPriceListWindows, observePrices, resolveContexts } from "../lib/catalog";

export interface RecordPriceHistoryInput {
  /** Variants to look at, or null for the whole catalog. */
  variant_ids: string[] | null;
  source: "event" | "sweep" | "backfill";
}

export interface RecordPriceHistoryOutput {
  variants: number;
  contexts: number;
  changed: number;
}

interface Applied {
  created_ids: string[];
  closed_ids: string[];
}

interface LockingService {
  execute<T>(keys: string | string[], job: () => Promise<T>, args?: { timeout?: number }): Promise<T>;
}

const LOCK_KEY = "consumer-compliance:price-history";

async function withLock<T>(container: MedusaContainer, job: () => Promise<T>): Promise<T> {
  let locking: LockingService | null = null;
  try {
    locking = container.resolve<LockingService>(Modules.LOCKING);
  } catch {
    locking = null;
  }
  return locking ? locking.execute(LOCK_KEY, job, { timeout: 120 }) : job();
}

/**
 * Observe the current price of each variant in every context and record the
 * ones that changed. Runs under a lock so the event path, the sweep and a
 * backfill never interleave their close-and-open pairs.
 */
export const recordPriceHistoryStep = createStep(
  "record-price-history",
  async (input: RecordPriceHistoryInput, { container }) => {
    const service = container.resolve<ConsumerComplianceModuleService>(CONSUMER_COMPLIANCE_MODULE);
    const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER);
    const contexts = await resolveContexts(container, service.resolvedOptions.omnibus.priceContexts);
    const variants = await listVariants(container, input.variant_ids);
    const applied: Applied = { closed_ids: [], created_ids: [] };
    let changed = 0;

    await withLock(container, async () => {
      for (let offset = 0; offset < variants.length; offset += PAGE_SIZE) {
        const batch = variants.slice(offset, offset + PAGE_SIZE);
        const open = await service.getOpenIntervals(batch.map((variant) => variant.id));
        const now = new Date();
        const decisions: SeriesDecision[] = [];
        const observedByContext = new Map<string, Map<string, PriceObservation | null>>();
        const listIds: string[] = [];

        for (const context of contexts) {
          const observed = await observePrices(container, batch, context);
          observedByContext.set(context.key, observed);
          observed.forEach((value) => value?.price_list_id && listIds.push(value.price_list_id));
        }
        open.forEach((value) => value.price_list_id && listIds.push(value.price_list_id));
        const lists = await loadPriceListWindows(container, listIds);

        for (const context of contexts) {
          const observed = observedByContext.get(context.key) ?? new Map<string, PriceObservation | null>();
          for (const variant of batch) {
            const decision = decideRecording({
              lists,
              now,
              observed: observed.get(variant.id) ?? null,
              open: open.get(`${variant.id}|${context.key}`) ?? null,
            });
            if (decision.action === "transition") {
              decisions.push({
                context_key: context.key,
                currency_code: context.currency_code,
                decision,
                product_id: variant.product_id,
                region_id: context.region_id ?? null,
                variant_id: variant.id,
              });
            }
          }
        }

        if (decisions.length > 0) {
          const result = await service.applyRecordingDecisions(decisions, input.source);
          changed += result.changed;
          applied.created_ids.push(...result.created_ids);
          applied.closed_ids.push(...result.closed_ids);
        }
      }
    });

    if (changed > 0) {
      logger.info(`[consumer-compliance] recorded ${changed} price change(s) across ${variants.length} variant(s) (${input.source})`);
    }
    return new StepResponse<RecordPriceHistoryOutput, Applied>(
      { changed, contexts: contexts.length, variants: variants.length },
      applied,
    );
  },
  async (applied, { container }) => {
    if (!applied || (applied.created_ids.length === 0 && applied.closed_ids.length === 0)) {
      return;
    }
    const service = container.resolve<ConsumerComplianceModuleService>(CONSUMER_COMPLIANCE_MODULE);
    await service.revertRecording(applied);
  },
);
