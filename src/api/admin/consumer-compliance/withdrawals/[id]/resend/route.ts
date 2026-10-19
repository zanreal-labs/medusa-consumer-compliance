import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { resendWithdrawalAcknowledgementWorkflow } from "../../../../../../workflows/withdrawal";
import type { WithdrawalRow } from "../../../../../../workflows/steps/withdrawal-steps";
import { complianceService } from "../../../../../lib/views";

/** POST /admin/consumer-compliance/withdrawals/:id/resend: send the acknowledgement again. */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  const [row] = (await complianceService(req.scope).listWithdrawalRequests({ id: req.params.id })) as unknown as WithdrawalRow[];
  if (!row || !row.submitted_at) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Only a submitted withdrawal can be acknowledged.");
  }
  const { result } = await resendWithdrawalAcknowledgementWorkflow(req.scope).run({ input: { withdrawal: row } });
  res.json({ withdrawal: { ...result, confirmation_token_hash: undefined } });
}
