import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { updateWithdrawalStatusWorkflow } from "../../../../../workflows/withdrawal";
import { complianceService } from "../../../../lib/views";
import type { WithdrawalStatusBodyType } from "../../../../lib/schemas";

/** GET /admin/consumer-compliance/withdrawals/:id */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  const [row] = await complianceService(req.scope).listWithdrawalRequests({ id: req.params.id });
  if (!row) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Withdrawal ${req.params.id} not found`);
  }
  res.json({ withdrawal: { ...row, confirmation_token_hash: undefined } });
}

/** POST /admin/consumer-compliance/withdrawals/:id  { status: "processed" | "rejected" | "confirmed", note } */
export async function POST(req: AuthenticatedMedusaRequest<WithdrawalStatusBodyType>, res: MedusaResponse): Promise<void> {
  const { result } = await updateWithdrawalStatusWorkflow(req.scope).run({
    input: { actor_id: req.auth_context?.actor_id ?? null, id: req.params.id, note: req.validatedBody.note, status: req.validatedBody.status },
  });
  res.json({ withdrawal: { ...result, confirmation_token_hash: undefined } });
}
