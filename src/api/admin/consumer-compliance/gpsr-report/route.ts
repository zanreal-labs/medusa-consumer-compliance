import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { QueryGraph } from "../../../../workflows/lib/catalog";
import { loadProductBundle } from "../../../lib/views";

const PAGE = 50;

/**
 * GET /admin/consumer-compliance/gpsr-report?offset=0&status=published
 *
 * One page of products with their GPSR gaps, for the settings page's "missing
 * data" list. Products marked as not covered by GPSR come back with no gaps.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  const query = req.scope.resolve<QueryGraph>(ContainerRegistrationKeys.QUERY);
  const offset = Math.max(0, Number(req.query.offset ?? 0) || 0);
  const status = typeof req.query.status === "string" ? req.query.status : "published";
  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "title"],
    filters: { status },
    pagination: { skip: offset, take: PAGE },
  });
  const products: { id: unknown; title: unknown; issues: string[]; not_applicable: boolean }[] = [];
  for (const row of data) {
    const bundle = await loadProductBundle(req.scope, row.id as string);
    if (bundle) {
      products.push({ id: row.id, issues: bundle.issues, not_applicable: !!bundle.compliance?.gpsr_not_applicable, title: row.title });
    }
  }
  res.json({ has_more: data.length === PAGE, next_offset: offset + data.length, products });
}
