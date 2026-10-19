import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { deleteEconomicOperatorWorkflow, upsertEconomicOperatorWorkflow } from "../../../../../workflows/catalog-data";
import type { OperatorBodyType } from "../../../../lib/schemas";

/** POST /admin/consumer-compliance/operators/:id */
export async function POST(req: AuthenticatedMedusaRequest<OperatorBodyType>, res: MedusaResponse): Promise<void> {
  const { result } = await upsertEconomicOperatorWorkflow(req.scope).run({
    input: { data: req.validatedBody as Record<string, unknown>, id: req.params.id },
  });
  res.json({ operator: result });
}

/** DELETE /admin/consumer-compliance/operators/:id (refused while products reference it) */
export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  const { result } = await deleteEconomicOperatorWorkflow(req.scope).run({ input: { id: req.params.id } });
  res.json(result);
}
