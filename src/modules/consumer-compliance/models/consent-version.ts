import { model } from "@medusajs/framework/utils";

/** Every wording a consent ever had. Written on create and on each version bump; never edited. */
const ConsentVersion = model
  .define("consumer_compliance_consent_version", {
    id: model.id({ prefix: "ccconv" }).primaryKey(),
    consent_id: model.text(),
    key: model.text(),
    version: model.number(),
    label: model.json(),
    link_url: model.text().nullable(),
    link_label: model.json().nullable(),
    /** SHA-256 of the linked document fetched when this version was saved; null when it could not be fetched. */
    link_sha256: model.text().nullable(),
  })
  .indexes([{ on: ["consent_id", "version"], unique: true }]);

export default ConsentVersion;
