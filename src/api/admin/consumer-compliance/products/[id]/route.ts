import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { computeUnitPrice, unitPricingIssues } from "../../../../../modules/consumer-compliance/lib/unit-price";
import type { UnitPricingData } from "../../../../../modules/consumer-compliance/lib/unit-price";
import { upsertProductComplianceWorkflow } from "../../../../../workflows/catalog-data";
import { complianceService, loadProductBundle, normalizeUnitRow } from "../../../../lib/views";
import type { ProductComplianceBodyType } from "../../../../lib/schemas";

/**
 * GET /admin/consumer-compliance/products/:id
 *
 * The product's compliance record, its GPSR gaps, the operators it points at
 * and the unit pricing of each variant.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  const bundle = await loadProductBundle(req.scope, req.params.id);
  if (!bundle) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Product ${req.params.id} not found`);
  }
  const service = complianceService(req.scope);
  const variants = (bundle.product.variants as { id: string; title: string; sku: string | null }[] | null) ?? [];
  const units = variants.length
    ? ((await service.listVariantUnitPricings({ variant_id: variants.map((variant) => variant.id) }, { take: null })) as unknown as Record<
        string,
        unknown
      >[])
    : [];
  const byVariant = new Map(units.map((row) => [row.variant_id as string, normalizeUnitRow(row)]));
  res.json({
    compliance: bundle.compliance,
    gpsr_issues: bundle.issues,
    operators: bundle.operators,
    product_id: req.params.id,
    variants: variants.map((variant) => {
      const row = byVariant.get(variant.id) ?? null;
      const data = row as unknown as UnitPricingData | null;
      return {
        sku: variant.sku,
        title: variant.title,
        unit_pricing: row,
        unit_pricing_issues: data && (data.exempt_reason ?? "none") === "none" ? unitPricingIssues(data) : [],
        unit_price_per_10: data ? computeUnitPrice(10, data, "pl") : null,
        variant_id: variant.id,
      };
    }),
  });
}

/** POST /admin/consumer-compliance/products/:id: create or update the product's compliance record. */
export async function POST(req: AuthenticatedMedusaRequest<ProductComplianceBodyType>, res: MedusaResponse): Promise<void> {
  const { result } = await upsertProductComplianceWorkflow(req.scope).run({
    input: { data: req.validatedBody as Record<string, unknown>, product_id: req.params.id },
  });
  res.json({ compliance: result });
}
