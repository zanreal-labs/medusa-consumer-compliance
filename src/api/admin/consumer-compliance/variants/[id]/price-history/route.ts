import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import type { OmnibusMode } from "../../../../../../modules/consumer-compliance/types";
import { listVariants, resolveContexts } from "../../../../../../workflows/lib/catalog";
import { evaluateSeries } from "../../../../../../modules/consumer-compliance/service";
import { complianceService } from "../../../../../lib/views";

/**
 * GET /admin/consumer-compliance/variants/:id/price-history?context_key=pln|reg_1
 *
 * The recorded history of one variant in one context, with the Omnibus
 * evaluation as of now and the list of contexts that have history.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  const service = complianceService(req.scope);
  const [variant] = await listVariants(req.scope, [req.params.id]);
  if (!variant) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Variant ${req.params.id} not found`);
  }
  const all = await service.listSeries(variant.id, null);
  const tracked = await resolveContexts(req.scope, service.resolvedOptions.omnibus.priceContexts);
  const keys = [...new Set([...tracked.map((context) => context.key), ...all.map((row) => row.context_key)])];
  const requested = (req.query.context_key as string | undefined) ?? keys[0] ?? null;
  const rows = all.filter((row) => row.context_key === requested);
  const [compliance] = variant.product_id
    ? ((await service.listProductCompliances({ product_id: variant.product_id })) as unknown as { omnibus_mode: OmnibusMode }[])
    : [];
  const evaluation = evaluateSeries(service.resolvedOptions, {
    mode: compliance?.omnibus_mode ?? "standard",
    offeredSince: variant.created_at,
    rows,
  });
  res.json({
    context_key: requested,
    contexts: keys,
    evaluation,
    history: rows,
    retention_days: service.resolvedOptions.omnibus.retentionDays,
    variant_id: variant.id,
  });
}
