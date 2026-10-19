/**
 * Reading a cart into consent-matching lines, and the guard that blocks
 * completion. Shared by the Store API and the complete-cart hook.
 */
import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { CONSUMER_COMPLIANCE_MODULE } from "../../modules/consumer-compliance";
import type ConsumerComplianceModuleService from "../../modules/consumer-compliance/service";
import { consentBlock, evaluateConsents, matchConsents } from "../../modules/consumer-compliance/lib/consents";
import type { AcceptanceData, ApplicableConsent, CartLine, ConsentState } from "../../modules/consumer-compliance/lib/consents";
import type { QueryGraph } from "./catalog";

export interface LoadedCart {
  id: string;
  completed_at: Date | null;
  customer_id: string | null;
  lines: CartLine[];
}

const CART_FIELDS = [
  "id",
  "completed_at",
  "customer_id",
  "items.id",
  "items.product_id",
  "items.product.id",
  "items.product.type_id",
  "items.product.collection_id",
  "items.product.metadata",
  "items.product.tags.id",
  "items.product.categories.id",
];

export async function loadCart(container: MedusaContainer, cartId: string): Promise<LoadedCart | null> {
  const query = container.resolve<QueryGraph>(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({ entity: "cart", fields: CART_FIELDS, filters: { id: cartId } });
  const cart = data[0];
  if (!cart) {
    return null;
  }
  const items = (cart.items as Record<string, unknown>[] | null) ?? [];
  return {
    completed_at: cart.completed_at ? new Date(cart.completed_at as string) : null,
    customer_id: (cart.customer_id as string | null) ?? null,
    id: cart.id as string,
    lines: items.map((item) => {
      const product = (item.product as Record<string, unknown> | null) ?? {};
      return {
        category_ids: ((product.categories as { id: string }[] | null) ?? []).map((category) => category.id),
        collection_id: (product.collection_id as string | null) ?? null,
        line_item_id: item.id as string,
        metadata: (product.metadata as Record<string, unknown> | null) ?? null,
        product_id: (item.product_id as string | null) ?? (product.id as string | null) ?? null,
        tag_ids: ((product.tags as { id: string }[] | null) ?? []).map((tag) => tag.id),
        type_id: (product.type_id as string | null) ?? null,
      };
    }),
  };
}

export interface CartConsents {
  cart: LoadedCart;
  applicable: ApplicableConsent[];
  states: ConsentState[];
}

export async function cartConsents(container: MedusaContainer, cartId: string): Promise<CartConsents> {
  const service = container.resolve<ConsumerComplianceModuleService>(CONSUMER_COMPLIANCE_MODULE);
  const cart = await loadCart(container, cartId);
  if (!cart) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Cart ${cartId} was not found`);
  }
  const definitions = await service.listConsentDefinitionData({ active: true });
  const applicable = matchConsents(definitions, cart.lines);
  const rows = (await service.listConsentAcceptances({ cart_id: cartId }, { take: null })) as unknown as {
    key: string;
    version: number;
    accepted_at: string | Date;
  }[];
  const acceptances: AcceptanceData[] = rows.map((row) => ({
    accepted_at: new Date(row.accepted_at),
    key: row.key,
    version: Number(row.version),
  }));
  return { applicable, cart, states: evaluateConsents(applicable, acceptances) };
}

/**
 * Throw when a required consent that applies to the cart is missing, or was
 * accepted in a version older than the current one. Error codes
 * `consent_required` and `consent_version_outdated` let a frontend show the right
 * message; the message names the consent keys.
 */
export async function assertCartConsents(container: MedusaContainer, cartId: string): Promise<void> {
  const { states } = await cartConsents(container, cartId);
  const block = consentBlock(states);
  if (!block) {
    return;
  }
  const what = block.code === "consent_required" ? "Required consents are missing" : "Consents were accepted in an outdated version";
  throw new MedusaError(MedusaError.Types.NOT_ALLOWED, `${what}: ${block.keys.join(", ")}`, block.code);
}
