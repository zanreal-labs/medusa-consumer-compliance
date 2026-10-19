import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { parseContextKey } from "../../../../../../../modules/consumer-compliance/types";
import { listVariants } from "../../../../../../../workflows/lib/catalog";
import { complianceService } from "../../../../../../lib/views";
import type { ExternalPriceBodyType } from "../../../../../../lib/schemas";

/**
 * POST /admin/consumer-compliance/variants/:id/price-history/external
 *
 * Record a price that was obtainable for a while outside price lists, such as
 * a publicly announced discount code. It then counts towards the lowest price
 * of later reductions, as UOKiK expects. The window must be in the past or
 * running; it is never the current price.
 */
export async function POST(req: AuthenticatedMedusaRequest<ExternalPriceBodyType>, res: MedusaResponse): Promise<void> {
  const body = req.validatedBody;
  const context = parseContextKey(body.context_key);
  if (!context) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "context_key must look like pln|reg_123 or pln|*.");
  }
  if (!(body.valid_to.getTime() > body.valid_from.getTime())) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "valid_to must be after valid_from.");
  }
  if (body.valid_from.getTime() > Date.now()) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "An external price window cannot start in the future.");
  }
  const [variant] = await listVariants(req.scope, [req.params.id]);
  if (!variant) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Variant ${req.params.id} not found`);
  }
  const row = await complianceService(req.scope).addExternalInterval({
    amount: body.amount,
    context_key: body.context_key,
    currency_code: context.currency_code,
    note: body.note ?? null,
    product_id: variant.product_id,
    region_id: context.region_id ?? null,
    valid_from: body.valid_from,
    valid_to: body.valid_to,
    variant_id: variant.id,
  });
  res.status(201).json({ entry: row });
}
