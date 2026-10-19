import type { MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { buildVariantViews, parseExternalReductionStart, resolveRequestContext } from "../../../lib/views";
import type { QueryGraph } from "../../../../workflows/lib/catalog";

const MAX_IDS = 100;

/**
 * Only variants of published products in the caller's sales channels are
 * answered; anything else is silently dropped, as if it did not exist.
 */
export async function visibleVariantIds(
  scope: MedusaStoreRequest["scope"],
  ids: string[],
  salesChannelIds: string[] | undefined,
): Promise<string[]> {
  const query = scope.resolve<QueryGraph>(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "product_variant",
    fields: ["id", "product.status", "product.sales_channels.id"],
    filters: { id: ids },
  });
  return data
    .filter((row) => {
      const product = row.product as { status?: string; sales_channels?: { id: string }[] } | null;
      if (!product || product.status !== "published") {
        return false;
      }
      if (!salesChannelIds || salesChannelIds.length === 0) {
        return true;
      }
      return (product.sales_channels ?? []).some((channel) => salesChannelIds.includes(channel.id));
    })
    .map((row) => row.id as string);
}

/**
 * GET /store/consumer-compliance/variants?ids=variant_1,variant_2&region_id=...
 *
 * The batch read for listing pages: Omnibus and unit price for up to 100
 * variants in one call.
 */
export async function GET(req: MedusaStoreRequest, res: MedusaResponse): Promise<void> {
  const raw = req.query.ids;
  const ids = [...new Set((Array.isArray(raw) ? raw : String(raw ?? "").split(",")).map(String).map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "ids is required.");
  }
  if (ids.length > MAX_IDS) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `At most ${MAX_IDS} ids per request.`);
  }
  const context = await resolveRequestContext(req.scope, {
    currency_code: req.query.currency_code as string | undefined,
    region_id: req.query.region_id as string | undefined,
  });
  const visible = await visibleVariantIds(req.scope, ids, req.publishable_key_context?.sales_channel_ids);
  const variants = await buildVariantViews(
    req.scope,
    visible,
    context,
    (req.query.locale as string | undefined) ?? null,
    parseExternalReductionStart(req.query.reduction_started_at),
  );
  res.json({ variants });
}
