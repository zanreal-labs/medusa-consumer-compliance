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
  if (result.order.external) {
    // Marketplace order (Allegro): its consents and withdrawals belong to the
    // marketplace. Answer with a pointer instead of running this flow.
    res.json({
      assessment: null,
      external_marketplace_order: {
        ...result.order.external,
        message: "This order was placed on an external marketplace. Withdrawal follows the marketplace's own process.",
      },
      order: { display_id: result.order.display_id, id: result.order.id },
    });
    return;
  }
  res.json({
    assessment: result.assessment,
    external_marketplace_order: null,
    order: {
      canceled: result.order.facts.canceled,
      display_id: result.order.display_id,
      id: result.order.id,
      placed_at: result.order.facts.placed_at,
    },
  });
}
