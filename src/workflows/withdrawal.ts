import { emitEventStep } from "@medusajs/medusa/core-flows";
import { WorkflowResponse, createWorkflow, transform } from "@medusajs/framework/workflows-sdk";
import {
  assessWithdrawalOrderStep,
  confirmWithdrawalStep,
  createWithdrawalStep,
  sendWithdrawalAcknowledgementStep,
  updateWithdrawalStatusStep,
} from "./steps/withdrawal-steps";
import type { OrderReference } from "./steps/withdrawal-steps";

export const WITHDRAWAL_CONFIRMED_EVENT = "consumer_compliance.withdrawal.confirmed";

export interface RequestWithdrawalInput extends OrderReference {
  customer_name: string;
  /** Where the acknowledgement goes (the "electronic means" of art. 11a(2)(c)). */
  contact_email: string;
  locale?: string | null;
  items?: { line_item_id: string; quantity: number }[] | null;
  statement?: string | null;
  reason?: string | null;
}

/** Step one of the withdrawal function: the statement, not yet submitted. */
export const requestWithdrawalWorkflow = createWorkflow(
  "request-withdrawal",
  (input: RequestWithdrawalInput) => {
    const reference = transform({ input }, ({ input }) => ({
      customer_id: input.customer_id,
      display_id: input.display_id,
      email: input.email,
      order_id: input.order_id,
    }));
    const assessed = assessWithdrawalOrderStep(reference);
    const createInput = transform({ assessed, input }, ({ assessed, input }) => ({
      assessment: assessed.assessment,
      customer_name: input.customer_name,
      email: input.contact_email,
      items: input.items,
      locale: input.locale,
      order: assessed.order,
      reason: input.reason,
      statement: input.statement,
    }));
    return new WorkflowResponse(createWithdrawalStep(createInput));
  },
);

/** Step two: the consumer confirms, which submits the statement; then the acknowledgement goes out. */
export const confirmWithdrawalWorkflow = createWorkflow(
  "confirm-withdrawal",
  (input: { id: string; token: string }) => {
    const confirmed = confirmWithdrawalStep(input);
    emitEventStep({
      data: transform({ confirmed }, ({ confirmed }) => ({ id: confirmed.id, order_id: confirmed.order_id })),
      eventName: WITHDRAWAL_CONFIRMED_EVENT,
    });
    const acknowledged = sendWithdrawalAcknowledgementStep({ withdrawal: confirmed });
    return new WorkflowResponse(acknowledged);
  },
);

/** Resend the acknowledgement from the admin, for example after a provider outage. */
export const resendWithdrawalAcknowledgementWorkflow = createWorkflow(
  "resend-withdrawal-acknowledgement",
  (input: { withdrawal: Parameters<typeof sendWithdrawalAcknowledgementStep>[0]["withdrawal"] }) =>
    new WorkflowResponse(sendWithdrawalAcknowledgementStep(input)),
);

export const updateWithdrawalStatusWorkflow = createWorkflow(
  "update-withdrawal-status",
  (input: { id: string; status: "processed" | "rejected" | "confirmed"; note?: string | null; actor_id?: string | null }) =>
    new WorkflowResponse(updateWithdrawalStatusStep(input)),
);
