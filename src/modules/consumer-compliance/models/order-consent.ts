import { model } from "@medusajs/framework/utils";

/**
 * What the customer accepted for an order, frozen at cart completion: the full
 * text as rendered, its locale and version, the linked document with a hash of
 * the version fetched when the consent version was saved, the timestamp and
 * the client's IP and user agent.
 *
 * Immutable. The service refuses to update, delete or restore these rows, so
 * editing or deleting a consent definition later never changes what an order
 * shows as proof.
 */
const OrderConsent = model
  .define("consumer_compliance_order_consent", {
    id: model.id({ prefix: "ccocon" }).primaryKey(),
    order_id: model.text(),
    cart_id: model.text().nullable(),
    acceptance_id: model.text().nullable(),
    consent_id: model.text().nullable(),
    key: model.text(),
    purpose: model.text(),
    version: model.number(),
    required: model.boolean(),
    text: model.text(),
    locale: model.text().nullable(),
    link_url: model.text().nullable(),
    link_sha256: model.text().nullable(),
    covered_product_ids: model.array().nullable(),
    accepted_at: model.dateTime(),
    ip: model.text().nullable(),
    user_agent: model.text().nullable(),
  })
  .indexes([{ on: ["order_id", "key"], unique: true }, { on: ["accepted_at"] }]);

export default OrderConsent;
