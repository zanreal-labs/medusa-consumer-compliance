import { model } from "@medusajs/framework/utils";

/**
 * A checkout consent the customer must (or may) give, shown when its rules
 * match the cart. `label` is the exact text per locale. Changing the text or
 * the link bumps `version` and keeps the old wording in
 * `consumer_compliance_consent_version`, so an acceptance always points at the
 * words the customer actually saw.
 */
const ConsentDefinition = model
  .define("consumer_compliance_consent", {
    id: model.id({ prefix: "cccons" }).primaryKey(),
    key: model.text(),
    label: model.json(),
    link_url: model.text().nullable(),
    link_label: model.json().nullable(),
    /** SHA-256 of the linked document as fetched for the current version. */
    link_sha256: model.text().nullable(),
    version: model.number().default(1),
    required: model.boolean().default(true),
    active: model.boolean().default(true),
    /**
     * `digital_content_withdrawal_waiver`: the consent and acknowledgement of
     * art. 38 ust. 1 pkt 13. Accepting it is what lifts the right of withdrawal
     * for the digital lines it covered.
     */
    purpose: model.enum(["generic", "digital_content_withdrawal_waiver"]).default("generic"),
    /** `[{ type, values?, key? }]`; the consent applies when ANY rule matches the cart. */
    rules: model.json(),
    position: model.number().default(0),
  })
  .indexes([{ on: ["key"], unique: true }]);

export default ConsentDefinition;
