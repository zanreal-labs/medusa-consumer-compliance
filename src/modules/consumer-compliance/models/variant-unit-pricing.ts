import { model } from "@medusajs/framework/utils";

/** Net quantity of a variant, for the unit price. One row per variant. */
const VariantUnitPricing = model
  .define("consumer_compliance_unit_pricing", {
    id: model.id({ prefix: "ccunit" }).primaryKey(),
    variant_id: model.text(),
    product_id: model.text().nullable(),
    net_quantity: model.bigNumber().nullable(),
    net_unit: model.enum(["g", "kg", "ml", "l", "cm", "m", "m2", "m3", "piece"]).nullable(),
    drained_quantity: model.bigNumber().nullable(),
    reference_unit: model
      .enum(["auto", "kg", "per_100g", "l", "per_100ml", "m", "m2", "m3", "piece", "per_10_pieces", "per_100_pieces"])
      .default("auto"),
    /** § 7 of the price display regulation; anything but `none` switches the unit price off. */
    exempt_reason: model
      .enum(["none", "same_as_price", "sold_as_set", "sold_in_pairs", "medicinal_product"])
      .default("none"),
    /**
     * Deposit (kaucja) of the deposit-return system for beverage packaging,
     * in major units of `deposit_currency_code`. Displayed separately from the
     * price and never part of it, the unit price or the Omnibus history.
     */
    deposit_amount: model.bigNumber().nullable(),
    deposit_currency_code: model.text().default("pln"),
  })
  .indexes([{ on: ["variant_id"], unique: true }, { on: ["product_id"] }]);

export default VariantUnitPricing;
