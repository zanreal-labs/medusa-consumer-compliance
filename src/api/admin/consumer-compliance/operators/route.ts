import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { upsertEconomicOperatorWorkflow } from "../../../../workflows/catalog-data";
import { complianceService } from "../../../lib/views";
import type { OperatorBodyType } from "../../../lib/schemas";

/** GET /admin/consumer-compliance/operators?role=manufacturer */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  const filters: Record<string, unknown> = {};
  if (typeof req.query.role === "string") {
    filters.role = req.query.role;
  }
  const operators = await complianceService(req.scope).listEconomicOperators(filters, { order: { name: "ASC" }, take: null });
  res.json({ operators });
}

/** POST /admin/consumer-compliance/operators */
export async function POST(req: AuthenticatedMedusaRequest<OperatorBodyType>, res: MedusaResponse): Promise<void> {
  const { result } = await upsertEconomicOperatorWorkflow(req.scope).run({ input: { data: req.validatedBody as Record<string, unknown> } });
  res.status(201).json({ operator: result });
}
