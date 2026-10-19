import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { updateComplianceSettingsWorkflow } from "../../../../workflows/catalog-data";
import { complianceService } from "../../../lib/views";
import type { SettingsBodyType } from "../../../lib/schemas";

/** GET /admin/consumer-compliance/settings: the editable texts plus the effective plugin options. */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  const service = complianceService(req.scope);
  res.json({ options: service.resolvedOptions, settings: await service.getSettings() });
}

/** POST /admin/consumer-compliance/settings */
export async function POST(req: AuthenticatedMedusaRequest<SettingsBodyType>, res: MedusaResponse): Promise<void> {
  const { result } = await updateComplianceSettingsWorkflow(req.scope).run({ input: req.validatedBody as Record<string, unknown> });
  res.json({ settings: result });
}
