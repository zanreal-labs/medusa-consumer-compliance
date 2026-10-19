import { model } from "@medusajs/framework/utils";

/**
 * One acceptance of one consent version on one cart: the proof. Append-only;
 * a later acceptance of a newer version supersedes, it does not overwrite.
 * `order_id` is filled in when the cart becomes an order.
 */
const ConsentAcceptance = model
  .define("consumer_compliance_consent_acceptance", {
    id: model.id({ prefix: "ccacc" }).primaryKey(),
    cart_id: model.text(),
    order_id: model.text().nullable(),
    consent_id: model.text(),
    key: model.text(),
    version: model.number(),
    purpose: model.text(),
    /** The exact text accepted, in the locale it was shown in. */
    text: model.text(),
    locale: model.text().nullable(),
    link_url: model.text().nullable(),
    link_sha256: model.text().nullable(),
    /** Whether the consent was required at acceptance. */
    required: model.boolean().default(true),
    /** Products the consent covered at acceptance (for the digital waiver: the lines that lose the right). */
    covered_product_ids: model.array().nullable(),
    accepted_at: model.dateTime(),
    ip: model.text().nullable(),
    user_agent: model.text().nullable(),
    customer_id: model.text().nullable(),
  })
  .indexes([{ on: ["cart_id"] }, { on: ["order_id"] }]);

export default ConsentAcceptance;
