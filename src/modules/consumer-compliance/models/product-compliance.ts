import { model } from "@medusajs/framework/utils";

/**
 * Per-product compliance data: the GPSR safety block, the Omnibus treatment and
 * the statutory withdrawal exception. Keyed by `product_id` (one row per
 * product) rather than a module link, so the plugin adds no link table to the
 * host and the row survives a product re-import that recreates links.
 */
const ProductCompliance = model
  .define("consumer_compliance_product", {
    id: model.id({ prefix: "ccprod" }).primaryKey(),
    product_id: model.text(),
    /** GPSR does not apply (for example a licence key or a service). */
    gpsr_not_applicable: model.boolean().default(false),
    manufacturer_id: model.text().nullable(),
    responsible_person_id: model.text().nullable(),
    /** Type, model, batch or serial number, as printed on the product. */
    product_identifier: model.text().nullable(),
    /** Localised warnings, `{ "pl": "...", "en": "..." }`. */
    warnings: model.json().nullable(),
    /** Localised safety information and instructions. */
    safety_information: model.json().nullable(),
    /** The product carries no warning or safety information to reproduce. */
    no_warnings_required: model.boolean().default(false),
    /** URLs of label, pictogram or instruction images. */
    safety_document_urls: model.array().nullable(),
    /** Localised accessibility notes (EAA): text alternative for key visuals, format of instructions. */
    accessibility_notes: model.json().nullable(),
    omnibus_mode: model.enum(["standard", "perishable", "exempt"]).default("standard"),
    withdrawal_exception: model
      .enum([
        "none",
        "custom_made",
        "perishable",
        "sealed_hygiene",
        "inseparably_mixed",
        "alcohol_market_price",
        "sealed_media",
        "periodicals",
        "digital_content",
      ])
      .default("none"),
  })
  .indexes([{ on: ["product_id"], unique: true }]);

export default ProductCompliance;
