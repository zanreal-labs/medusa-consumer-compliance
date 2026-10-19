import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { upsertConsentDefinitionWorkflow } from "../../../../workflows/consents";
import { complianceService } from "../../../lib/views";
import type { ConsentDefinitionBodyType } from "../../../lib/schemas";

/** GET /admin/consumer-compliance/consents: every definition with its version history. */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  const service = complianceService(req.scope);
  const definitions = await service.listConsentDefinitionData();
  const versions = definitions.length
    ? await service.listConsentVersions({ consent_id: definitions.map((row) => row.id) }, { order: { version: "DESC" }, take: null })
    : [];
  res.json({
    consents: definitions.map((definition) => ({
      ...definition,
      versions: versions.filter((version) => version.consent_id === definition.id),
    })),
  });
}

/** POST /admin/consumer-compliance/consents: create a definition. */
export async function POST(req: AuthenticatedMedusaRequest<ConsentDefinitionBodyType>, res: MedusaResponse): Promise<void> {
  const { result } = await upsertConsentDefinitionWorkflow(req.scope).run({ input: { data: req.validatedBody as Record<string, unknown> } });
  res.status(201).json({ consent: result });
}
