import type { MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { buildVariantViews, parseExternalReductionStart, resolveRequestContext } from "../../../../../lib/views";
import { visibleVariantIds } from "../../route";

/** GET /store/consumer-compliance/variants/:id/omnibus?region_id=... */
export async function GET(req: MedusaStoreRequest, res: MedusaResponse): Promise<void> {
  const [visible] = await visibleVariantIds(req.scope, [req.params.id], req.publishable_key_context?.sales_channel_ids);
  if (!visible) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Variant ${req.params.id} not found`);
  }
  const context = await resolveRequestContext(req.scope, {
    currency_code: req.query.currency_code as string | undefined,
    region_id: req.query.region_id as string | undefined,
  });
  const [view] = await buildVariantViews(
    req.scope,
    [visible],
    context,
    (req.query.locale as string | undefined) ?? null,
    parseExternalReductionStart(req.query.reduction_started_at),
  );
  res.json({ currency_code: view.currency_code, omnibus: view.omnibus, tax_inclusive: view.tax_inclusive, variant_id: view.variant_id });
}
