import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { confirmWithdrawalWorkflow } from "../../../../../../workflows/withdrawal";
import type { WithdrawalConfirmBodyType } from "../../../../../lib/schemas";
import { toPublicWithdrawal } from "../../serialize";

/**
 * POST /store/consumer-compliance/withdrawals/:id/confirm  { token }
 *
 * Step two: the consumer's explicit confirmation. This is the moment the
 * statement is submitted (`submitted_at`), the
 * `consumer_compliance.withdrawal.confirmed` event is emitted and the
 * acknowledgement is sent.
 */
export async function POST(req: MedusaRequest<WithdrawalConfirmBodyType>, res: MedusaResponse): Promise<void> {
  const { result } = await confirmWithdrawalWorkflow(req.scope).run({
    input: { id: req.params.id, token: req.validatedBody.token },
  });
  res.json({ withdrawal: toPublicWithdrawal(result) });
}
