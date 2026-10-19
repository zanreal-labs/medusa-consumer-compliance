import { model } from "@medusajs/framework/utils";

/**
 * A manufacturer, EU responsible person or importer, kept once and referenced
 * by every product it applies to (art. 19 GPSR). Most catalogues have a
 * handful of brands and hundreds of products, so the address is typed once.
 */
const EconomicOperator = model.define("consumer_compliance_operator", {
  id: model.id({ prefix: "ccop" }).primaryKey(),
  role: model.enum(["manufacturer", "responsible_person", "importer"]),
  name: model.text(),
  trade_name: model.text().nullable(),
  postal_address: model.text().nullable(),
  /** ISO 3166-1 alpha-2, lower case. Decides whether a responsible person in the EU is required. */
  country_code: model.text().nullable(),
  email: model.text().nullable(),
  url: model.text().nullable(),
  phone: model.text().nullable(),
});

export default EconomicOperator;
