/**
 * Which events can move a price a customer sees, and what each one names.
 *
 * - `product.*` / `product-variant.*`: product workflows write variant prices
 *   while emitting only these (see the medusa-fx-pricing notes on the same
 *   events). They name products or variants directly.
 * - `pricing.price.created|updated`: direct pricing module writes, including
 *   adding a product to a price list. They name price rows, resolved through
 *   their price set to variants.
 * - `pricing.price.deleted` and every `pricing.price-list.*` event: removing a
 *   product from a sale, editing a list's dates or status, deleting a list. The
 *   affected variants cannot be read from the event (the rows are gone, or the
 *   list is the subject), so these schedule a whole-catalog pass. It is
 *   debounced and idempotent, so a burst costs one pass.
 */
export const PRICE_HISTORY_EVENTS = [
  "product.created",
  "product.updated",
  "product-variant.created",
  "product-variant.updated",
  "pricing.price.created",
  "pricing.price.updated",
  "pricing.price.deleted",
  "pricing.price-list.created",
  "pricing.price-list.updated",
  "pricing.price-list.deleted",
  "pricing.price-list-rule.created",
  "pricing.price-list-rule.updated",
  "pricing.price-list-rule.deleted",
] as const;

export type ParsedPriceEvent =
  | { subject: "product" | "variant" | "price"; ids: string[] }
  | { subject: "catalog"; ids: [] };

export function readIds(data: unknown): string[] {
  const rows = Array.isArray(data) ? data : [data];
  const ids = new Set<string>();
  for (const row of rows) {
    const record = row as { id?: unknown; ids?: unknown } | null | undefined;
    for (const candidate of [record?.id, record?.ids]) {
      for (const value of Array.isArray(candidate) ? candidate : [candidate]) {
        if (typeof value === "string" && value.trim() !== "") {
          ids.add(value);
        }
      }
    }
  }
  return [...ids];
}

export function parsePriceEvent(name: string, data: unknown): ParsedPriceEvent | null {
  if (!(PRICE_HISTORY_EVENTS as readonly string[]).includes(name)) {
    return null;
  }
  if (name === "pricing.price.deleted" || name.startsWith("pricing.price-list")) {
    return { ids: [], subject: "catalog" };
  }
  const ids = readIds(data);
  if (ids.length === 0) {
    return null;
  }
  if (name.startsWith("pricing.price.")) {
    return { ids, subject: "price" };
  }
  return { ids, subject: name.startsWith("product-variant.") ? "variant" : "product" };
}
