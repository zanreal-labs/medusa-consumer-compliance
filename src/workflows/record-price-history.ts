import { WorkflowResponse, createWorkflow } from "@medusajs/framework/workflows-sdk";
import { recordPriceHistoryStep } from "./steps/record-price-history-step";
import type { RecordPriceHistoryInput } from "./steps/record-price-history-step";

/**
 * Record the current price of the given variants (or the whole catalog) in
 * every tracked context. Idempotent: unchanged prices write nothing.
 */
export const recordPriceHistoryWorkflow = createWorkflow(
  "record-price-history",
  (input: RecordPriceHistoryInput) => {
    const result = recordPriceHistoryStep(input);
    return new WorkflowResponse(result);
  },
);
