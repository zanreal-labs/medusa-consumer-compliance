import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { WITHDRAWAL_STATUSES } from "../../../../modules/consumer-compliance/types";
import { complianceService } from "../../../lib/views";

/** GET /admin/consumer-compliance/withdrawals?status=confirmed&order_id=...&offset=0&limit=50 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  const filters: Record<string, unknown> = {};
  const status = req.query.status;
  if (typeof status === "string" && (WITHDRAWAL_STATUSES as readonly string[]).includes(status)) {
    filters.status = status;
  } else {
    filters.status = ["confirmed", "processed", "rejected"];
  }
  if (typeof req.query.order_id === "string") {
    filters.order_id = req.query.order_id;
  }
  const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50) || 50));
  const offset = Math.max(0, Number(req.query.offset ?? 0) || 0);
  const [rows, count] = await complianceService(req.scope).listAndCountWithdrawalRequests(filters, {
    order: { submitted_at: "DESC" },
    skip: offset,
    take: limit,
  });
  res.json({
    count,
    limit,
    offset,
    withdrawals: rows.map((row) => ({ ...row, confirmation_token_hash: undefined })),
  });
}
