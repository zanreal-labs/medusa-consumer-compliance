import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { requestWithdrawalWorkflow } from "../../../../workflows/withdrawal";
import { complianceService } from "../../../lib/views";
import type { WithdrawalRequestBodyType } from "../../../lib/schemas";
import { toPublicWithdrawal } from "./serialize";

/**
 * POST /store/consumer-compliance/withdrawals
 *
 * Step one of the withdrawal function: records the statement as
 * `pending_confirmation` and returns a one-time `confirmation_token`. Nothing
 * is submitted until the consumer confirms in step two.
 */
export async function POST(
  req: AuthenticatedMedusaRequest<WithdrawalRequestBodyType>,
  res: MedusaResponse,
): Promise<void> {
  const body = req.validatedBody;
  const { result } = await requestWithdrawalWorkflow(req.scope).run({
    input: {
      contact_email: body.contact_email,
      customer_id: req.auth_context?.actor_id ?? null,
      customer_name: body.customer_name,
      display_id: body.display_id ?? null,
      email: body.email ?? null,
      items: body.items ?? null,
      locale: body.locale ?? null,
      order_id: body.order_id ?? null,
      reason: body.reason ?? null,
      statement: body.statement ?? null,
    },
  });
  res.status(201).json({
    confirmation_token: result.confirmation_token,
    withdrawal: toPublicWithdrawal(result.withdrawal),
  });
}

/** GET /store/consumer-compliance/withdrawals: the logged-in customer's own withdrawals. */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  const service = complianceService(req.scope);
  const rows = await service.listWithdrawalRequests(
    { customer_id: req.auth_context.actor_id, status: ["confirmed", "processed", "rejected"] },
    { order: { submitted_at: "DESC" }, take: 100 },
  );
  res.json({ withdrawals: rows.map((row) => toPublicWithdrawal(row as never)) });
}
