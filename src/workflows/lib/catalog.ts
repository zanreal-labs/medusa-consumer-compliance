/**
 * Reading variants, prices and price lists out of the host's other modules.
 * Everything that crosses a module boundary lives here, so the module itself
 * stays isolated and the workflows stay thin.
 */
import type { IPricingModuleService, MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import type { PriceContextOption } from "../../modules/consumer-compliance/types";
import { contextKey } from "../../modules/consumer-compliance/types";
import type { PriceListWindow, PriceObservation } from "../../modules/consumer-compliance/lib/price-recording";

export const PAGE_SIZE = 200;

export interface QueryGraph {
  graph: (input: {
    entity: string;
    fields: string[];
    filters?: Record<string, unknown>;
    pagination?: { skip: number; take: number };
  }) => Promise<{ data: Record<string, unknown>[] }>;
}

export interface CatalogVariant {
  id: string;
  product_id: string | null;
  created_at: Date | null;
  price_set_id: string | null;
}

export interface ResolvedContext extends PriceContextOption {
  key: string;
}

function toVariant(row: Record<string, unknown>): CatalogVariant {
  const priceSet = row.price_set as { id?: string } | null | undefined;
  return {
    created_at: row.created_at ? new Date(row.created_at as string) : null,
    id: row.id as string,
    price_set_id: priceSet?.id ?? null,
    product_id: (row.product_id as string | null) ?? null,
  };
}

const VARIANT_FIELDS = ["id", "product_id", "created_at", "price_set.id"];

/** Variants by id, or the whole catalog when `ids` is null. */
export async function listVariants(container: MedusaContainer, ids: readonly string[] | null): Promise<CatalogVariant[]> {
  const query = container.resolve<QueryGraph>(ContainerRegistrationKeys.QUERY);
  const variants: CatalogVariant[] = [];
  if (ids) {
    for (let offset = 0; offset < ids.length; offset += PAGE_SIZE) {
      const { data } = await query.graph({
        entity: "product_variant",
        fields: VARIANT_FIELDS,
        filters: { id: ids.slice(offset, offset + PAGE_SIZE) },
      });
      variants.push(...data.map(toVariant));
    }
    return variants;
  }
  for (let page = 0; ; page += 1) {
    const { data } = await query.graph({
      entity: "product_variant",
      fields: VARIANT_FIELDS,
      pagination: { skip: page * PAGE_SIZE, take: PAGE_SIZE },
    });
    variants.push(...data.map(toVariant));
    if (data.length < PAGE_SIZE) {
      break;
    }
  }
  return variants;
}

export async function listVariantIdsByProductIds(container: MedusaContainer, productIds: readonly string[]): Promise<string[]> {
  if (productIds.length === 0) {
    return [];
  }
  const query = container.resolve<QueryGraph>(ContainerRegistrationKeys.QUERY);
  const ids = new Set<string>();
  for (let offset = 0; offset < productIds.length; offset += PAGE_SIZE) {
    const { data } = await query.graph({
      entity: "product_variant",
      fields: ["id"],
      filters: { product_id: productIds.slice(offset, offset + PAGE_SIZE) },
    });
    data.forEach((row) => ids.add(row.id as string));
  }
  return [...ids];
}

export async function listVariantIdsByPriceIds(container: MedusaContainer, priceIds: readonly string[]): Promise<string[]> {
  if (priceIds.length === 0) {
    return [];
  }
  const query = container.resolve<QueryGraph>(ContainerRegistrationKeys.QUERY);
  const priceSetIds = new Set<string>();
  for (let offset = 0; offset < priceIds.length; offset += PAGE_SIZE) {
    const { data } = await query.graph({
      entity: "price",
      fields: ["id", "price_set_id"],
      filters: { id: priceIds.slice(offset, offset + PAGE_SIZE) },
    });
    data.forEach((row) => row.price_set_id && priceSetIds.add(row.price_set_id as string));
  }
  const setIds = [...priceSetIds];
  const variantIds = new Set<string>();
  for (let offset = 0; offset < setIds.length; offset += PAGE_SIZE) {
    const { data } = await query.graph({
      entity: "product_variant_price_set",
      fields: ["variant_id", "price_set_id"],
      filters: { price_set_id: setIds.slice(offset, offset + PAGE_SIZE) },
    });
    data.forEach((row) => row.variant_id && variantIds.add(row.variant_id as string));
  }
  return [...variantIds];
}

/** The configured contexts, or one per region (its currency and id) when none are configured. */
export async function resolveContexts(
  container: MedusaContainer,
  configured: PriceContextOption[] | null,
): Promise<ResolvedContext[]> {
  if (configured) {
    return configured.map((context) => ({ ...context, key: contextKey(context) }));
  }
  const query = container.resolve<QueryGraph>(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({ entity: "region", fields: ["id", "currency_code"] });
  return data
    .filter((row) => typeof row.currency_code === "string")
    .map((row) => {
      const context = { currency_code: (row.currency_code as string).toLowerCase(), region_id: row.id as string };
      return { ...context, key: contextKey(context) };
    });
}

function amountOf(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(typeof value === "object" && value !== null && "valueOf" in value ? (value as { valueOf(): unknown }).valueOf() : value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The price a customer sees for each variant in one context, as the pricing
 * module calculates it - price lists, region rules and all. No customer group
 * is passed on purpose: the Omnibus history is about the price announced to
 * the public, not a personalised one.
 */
export async function observePrices(
  container: MedusaContainer,
  variants: readonly CatalogVariant[],
  context: ResolvedContext,
): Promise<Map<string, PriceObservation | null>> {
  const pricing = container.resolve<IPricingModuleService>(Modules.PRICING);
  const result = new Map<string, PriceObservation | null>();
  const bySet = new Map<string, string[]>();
  for (const variant of variants) {
    result.set(variant.id, null);
    if (variant.price_set_id) {
      bySet.set(variant.price_set_id, [...(bySet.get(variant.price_set_id) ?? []), variant.id]);
    }
  }
  const setIds = [...bySet.keys()];
  for (let offset = 0; offset < setIds.length; offset += PAGE_SIZE) {
    const chunk = setIds.slice(offset, offset + PAGE_SIZE);
    const pricingContext: Record<string, string> = { currency_code: context.currency_code };
    if (context.region_id) {
      pricingContext.region_id = context.region_id;
    }
    const calculated = await pricing.calculatePrices({ id: chunk }, { context: pricingContext });
    for (const price of calculated) {
      const amount = amountOf(price.calculated_amount);
      if (amount === null) {
        continue;
      }
      const observation: PriceObservation = {
        amount,
        original_amount: amountOf(price.original_amount),
        price_list_id: price.calculated_price?.price_list_id ?? null,
        price_list_type: price.calculated_price?.price_list_type ?? null,
        tax_inclusive: !!price.is_calculated_price_tax_inclusive,
      };
      for (const variantId of bySet.get(price.id) ?? []) {
        result.set(variantId, observation);
      }
    }
  }
  return result;
}

export async function loadPriceListWindows(
  container: MedusaContainer,
  ids: readonly string[],
): Promise<Record<string, PriceListWindow>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) {
    return {};
  }
  const pricing = container.resolve<IPricingModuleService>(Modules.PRICING);
  const lists = await pricing.listPriceLists({ id: unique }, { select: ["id", "starts_at", "ends_at"], withDeleted: true });
  const windows: Record<string, PriceListWindow> = {};
  for (const list of lists) {
    windows[list.id] = {
      ends_at: list.ends_at ? new Date(list.ends_at) : null,
      starts_at: list.starts_at ? new Date(list.starts_at) : null,
    };
  }
  return windows;
}
