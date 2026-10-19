import type { MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { assertStoreVisible, buildSafetyView, buildVariantViews, complianceService, loadProductBundle, resolveRequestContext } from "../../../../lib/views";

/**
 * GET /store/products/:id/compliance?region_id=...&locale=pl
 *
 * Everything a product page needs in one read: the Omnibus reference price and
 * unit price per variant, and the GPSR safety block. Nested under
 * /store/products on purpose, so a deployment that only exposes GET
 * /store/products* publicly needs no ingress change for it.
 */
export async function GET(req: MedusaStoreRequest, res: MedusaResponse): Promise<void> {
  const locale = (req.query.locale as string | undefined) ?? null;
  const bundle = await loadProductBundle(req.scope, req.params.id);
  if (!bundle) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Product with id: ${req.params.id} was not found`);
  }
  assertStoreVisible(bundle.product, req.publishable_key_context?.sales_channel_ids);
  const context = await resolveRequestContext(req.scope, {
    currency_code: req.query.currency_code as string | undefined,
    region_id: req.query.region_id as string | undefined,
  });
  const variantIds = ((bundle.product.variants as { id: string }[] | null) ?? []).map((variant) => variant.id);
  const variants = await buildVariantViews(req.scope, variantIds, context, locale);
  const defaultLocale = complianceService(req.scope).resolvedOptions.defaultLocale;
  res.json({
    product_id: req.params.id,
    safety: buildSafetyView(bundle, locale, defaultLocale),
    variants,
  });
}
