import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { deleteConsentDefinitionWorkflow, upsertConsentDefinitionWorkflow } from "../../../../../workflows/consents";
import type { ConsentDefinitionBodyType } from "../../../../lib/schemas";

/** POST /admin/consumer-compliance/consents/:id: update; a text or link change bumps the version. */
export async function POST(req: AuthenticatedMedusaRequest<ConsentDefinitionBodyType>, res: MedusaResponse): Promise<void> {
  const { result } = await upsertConsentDefinitionWorkflow(req.scope).run({
    input: { data: req.validatedBody as Record<string, unknown>, id: req.params.id },
  });
  res.json({ consent: result });
}

/** DELETE /admin/consumer-compliance/consents/:id. Recorded acceptances and order snapshots are kept. */
export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  const { result } = await deleteConsentDefinitionWorkflow(req.scope).run({ input: { id: req.params.id } });
  res.json(result);
}
