import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { upsertUnitPricingWorkflow } from "../../../../../../workflows/catalog-data";
import type { QueryGraph } from "../../../../../../workflows/lib/catalog";
import type { UnitPricingBodyType } from "../../../../../lib/schemas";

/** POST /admin/consumer-compliance/products/:id/unit-pricing  { variants: [...] } */
export async function POST(req: AuthenticatedMedusaRequest<UnitPricingBodyType>, res: MedusaResponse): Promise<void> {
  const query = req.scope.resolve<QueryGraph>(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({ entity: "product_variant", fields: ["id"], filters: { product_id: req.params.id } });
  const owned = new Set(data.map((row) => row.id as string));
  const foreign = req.validatedBody.variants.find((variant) => !owned.has(variant.variant_id));
  if (foreign) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `Variant ${foreign.variant_id} does not belong to product ${req.params.id}`);
  }
  const { result } = await upsertUnitPricingWorkflow(req.scope).run({
    input: {
      items: req.validatedBody.variants.map(({ variant_id, ...rest }) => ({
        data: rest as Record<string, unknown>,
        product_id: req.params.id,
        variant_id,
      })),
    },
  });
  res.json({ unit_pricing: result });
}
