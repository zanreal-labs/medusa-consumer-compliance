import { model } from "@medusajs/framework/utils";

/**
 * One price a customer saw for a variant in one pricing context, and for how
 * long. `valid_to` null marks the current price; a partial unique index keeps
 * at most one such row per (variant, context), so two writers racing on the
 * same change cannot both open a row.
 *
 * Rows are only ever closed (by setting `valid_to`) and, past retention,
 * deleted. A recorded amount is never rewritten: the Omnibus reference price
 * is a statement about the past, and a history that can be edited is not
 * evidence of anything.
 */
const PriceHistory = model
  .define("consumer_compliance_price_history", {
    amount: model.bigNumber(),
    context_key: model.text(),
    currency_code: model.text(),
    id: model.id({ prefix: "ccph" }).primaryKey(),
    /**
     * `observed`: recorded from the pricing module. `external`: entered by the
     * operator for a price obtainable another way, typically a publicly
     * announced discount code (UOKiK treats those prices as reference prices
     * for later promotions). External rows are always closed.
     */
    kind: model.enum(["observed", "external"]).default("observed"),
    note: model.text().nullable(),
    original_amount: model.bigNumber().nullable(),
    price_list_id: model.text().nullable(),
    price_list_type: model.text().nullable(),
    product_id: model.text().nullable(),
    region_id: model.text().nullable(),
    source: model.enum(["event", "sweep", "backfill", "manual"]).default("event"),
    tax_inclusive: model.boolean().default(false),
    valid_from: model.dateTime(),
    valid_to: model.dateTime().nullable(),
    variant_id: model.text(),
  })
  .indexes([
    { on: ["variant_id", "context_key", "valid_from"] },
    { on: ["product_id"] },
    {
      on: ["variant_id", "context_key"],
      unique: true,
      where: "valid_to IS NULL AND kind = 'observed' AND deleted_at IS NULL",
    },
  ]);

export default PriceHistory;
