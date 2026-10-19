/**
 * Reading an order into the facts the withdrawal rules need.
 */
import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { CONSUMER_COMPLIANCE_MODULE } from "../../modules/consumer-compliance";
import type ConsumerComplianceModuleService from "../../modules/consumer-compliance/service";
import type { WithdrawalException } from "../../modules/consumer-compliance/types";
import type { WithdrawalOrderFacts, WithdrawalOrderItem } from "../../modules/consumer-compliance/lib/withdrawal";
import type { QueryGraph } from "./catalog";

export interface LoadedOrder {
  id: string;
  display_id: string;
  email: string | null;
  customer_id: string | null;
  customer_name: string | null;
  facts: WithdrawalOrderFacts;
  items: WithdrawalOrderItem[];
}

const ORDER_FIELDS = [
  "id",
  "display_id",
  "email",
  "customer_id",
  "created_at",
  "canceled_at",
  "status",
  "metadata",
  "items.id",
  "items.title",
  "items.product_title",
  "items.variant_title",
  "items.quantity",
  "items.requires_shipping",
  "items.product_id",
  "fulfillments.id",
  "fulfillments.delivered_at",
  "fulfillments.canceled_at",
  "fulfillments.requires_shipping",
  "shipping_address.first_name",
  "shipping_address.last_name",
];

/** `#1042`, ` 1042 ` -> 1042; anything else -> null. */
export function parseDisplayId(value: unknown): number | null {
  const text = String(value ?? "").trim().replace(/^#/u, "");
  return /^\d{1,12}$/u.test(text) ? Number(text) : null;
}

function itemTitle(row: Record<string, unknown>): string {
  const product = (row.product_title as string | null) ?? (row.title as string | null) ?? "";
  const variant = row.variant_title as string | null;
  return variant && variant !== product && variant !== "Default variant" ? `${product} (${variant})` : product;
}

function parseConsent(metadata: unknown, key: string): Date | null {
  const raw = (metadata as Record<string, unknown> | null | undefined)?.[key];
  if (typeof raw !== "string" && typeof raw !== "number") {
    return null;
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function loadOrder(
  container: MedusaContainer,
  where: { order_id?: string; display_id?: number },
): Promise<LoadedOrder | null> {
  const query = container.resolve<QueryGraph>(ContainerRegistrationKeys.QUERY);
  const filters = where.order_id ? { id: where.order_id } : where.display_id !== undefined ? { display_id: where.display_id } : null;
  if (!filters) {
    return null;
  }
  const { data } = await query.graph({ entity: "order", fields: ORDER_FIELDS, filters });
  const order = data[0];
  if (!order) {
    return null;
  }

  const service = container.resolve<ConsumerComplianceModuleService>(CONSUMER_COMPLIANCE_MODULE);
  const options = service.resolvedOptions;
  const rawItems = (order.items as Record<string, unknown>[] | null) ?? [];
  const productIds = [...new Set(rawItems.map((item) => item.product_id as string | null).filter((id): id is string => !!id))];
  const compliance =
    productIds.length > 0
      ? ((await service.listProductCompliances({ product_id: productIds }, { take: null })) as unknown as {
          product_id: string;
          withdrawal_exception: WithdrawalException;
        }[])
      : [];
  const exceptions = new Map(compliance.map((row) => [row.product_id, row.withdrawal_exception]));

  const fulfillments = ((order.fulfillments as Record<string, unknown>[] | null) ?? []).filter(
    (row) => !row.canceled_at && row.requires_shipping !== false,
  );
  const address = order.shipping_address as { first_name?: string | null; last_name?: string | null } | null;
  const name = [address?.first_name, address?.last_name].filter(Boolean).join(" ").trim();

  return {
    customer_id: (order.customer_id as string | null) ?? null,
    customer_name: name || null,
    display_id: String(order.display_id),
    email: (order.email as string | null) ?? null,
    facts: {
      canceled: !!order.canceled_at || order.status === "canceled",
      deliveries: fulfillments.map((row) => (row.delivered_at ? new Date(row.delivered_at as string) : null)),
      digital_consent_at: parseConsent(order.metadata, options.withdrawal.digitalConsentMetadataKey),
      placed_at: new Date(order.created_at as string),
    },
    id: order.id as string,
    items: rawItems.map((item) => ({
      exception: exceptions.get(item.product_id as string) ?? "none",
      line_item_id: item.id as string,
      product_id: (item.product_id as string | null) ?? null,
      quantity: Number(item.quantity ?? 0),
      requires_shipping: item.requires_shipping !== false,
      title: itemTitle(item),
    })),
  };
}
