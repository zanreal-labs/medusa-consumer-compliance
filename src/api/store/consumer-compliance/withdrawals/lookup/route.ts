import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { assessWithdrawalOrderStep } from "../../../../../workflows/steps/withdrawal-steps";
import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import type { OrderReference } from "../../../../../workflows/steps/withdrawal-steps";
import type { WithdrawalLookupBodyType } from "../../../../lib/schemas";

const lookupWithdrawalOrderWorkflow = createWorkflow(
  "lookup-withdrawal-order",
  (input: OrderReference) => new WorkflowResponse(assessWithdrawalOrderStep(input)),
);

/**
 * POST /store/consumer-compliance/withdrawals/lookup
 *
 * Which items of an order can be withdrawn from, and until when. A guest sends
 * `display_id` + `email`; a logged-in customer may send `order_id` alone. A
 * mismatch and an unknown order give the same 404.
 */
export async function POST(
  req: AuthenticatedMedusaRequest<WithdrawalLookupBodyType>,
  res: MedusaResponse,
): Promise<void> {
  const body = req.validatedBody;
  const { result } = await lookupWithdrawalOrderWorkflow(req.scope).run({
    input: {
      customer_id: req.auth_context?.actor_id ?? null,
      display_id: body.display_id ?? null,
      email: body.email ?? null,
      order_id: body.order_id ?? null,
    },
  });
  res.json({
    assessment: result.assessment,
    order: {
      canceled: result.order.facts.canceled,
      display_id: result.order.display_id,
      id: result.order.id,
      placed_at: result.order.facts.placed_at,
    },
  });
}
