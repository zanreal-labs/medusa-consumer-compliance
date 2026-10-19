/**
 * Orders placed on an external marketplace (Allegro) are not ours to handle:
 * the marketplace collects the consents and runs the withdrawal process. The
 * plugin must recognise them everywhere and step aside.
 */

export const EXTERNAL_MARKETPLACE_ORDER = "external_marketplace_order";

export interface ExternalOrderRules {
  externalSalesChannelIds: readonly string[];
  externalOrderMetadataKeys: readonly string[];
}

export interface ExternalMarketplace {
  code: typeof EXTERNAL_MARKETPLACE_ORDER;
  /** `allegro` when the Allegro checkout form id is present, otherwise `external`. */
  marketplace: "allegro" | "external";
  /** What identified the order: the metadata key or `sales_channel`. */
  matched_by: string;
}

function present(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

export function isExternalMarketplaceOrder(
  order: { metadata?: Record<string, unknown> | null; sales_channel_id?: string | null },
  rules: ExternalOrderRules,
): ExternalMarketplace | null {
  for (const key of rules.externalOrderMetadataKeys) {
    if (present(order.metadata?.[key])) {
      return { code: EXTERNAL_MARKETPLACE_ORDER, marketplace: key.startsWith("allegro") ? "allegro" : "external", matched_by: key };
    }
  }
  if (order.sales_channel_id && rules.externalSalesChannelIds.includes(order.sales_channel_id)) {
    return { code: EXTERNAL_MARKETPLACE_ORDER, marketplace: "external", matched_by: "sales_channel" };
  }
  return null;
}
