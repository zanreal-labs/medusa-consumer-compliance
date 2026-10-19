import { model } from "@medusajs/framework/utils";

/**
 * Operator-editable texts. A singleton with a fixed id (see the service).
 * Every text is localised, `{ "pl": "...", "en": "..." }`.
 */
const ComplianceSettings = model.define("consumer_compliance_settings", {
  id: model.id({ prefix: "ccset" }).primaryKey(),
  /** Art. 6 ust. 4 pkt 7 UPNPR / art. 7(6) UCPD: whether and how the store ensures reviews come from actual buyers or users. */
  reviews_disclosure: model.json().nullable(),
  /** Whether the store publishes reviews at all. With false, `reviews_disclosure` is still served if set. */
  reviews_enabled: model.boolean().default(false),
  /** Art. 6(1)(ea) CRD / art. 12 ust. 1 pkt 5a UPK: price personalised on the basis of automated decision-making. */
  personalised_pricing_disclosure: model.json().nullable(),
  personalised_pricing_used: model.boolean().default(false),
  /** Text shown next to the withdrawal button, optional. */
  withdrawal_info: model.json().nullable(),
  /** Text shown with a reduced price, optional, for example a note about the reference price basis. */
  omnibus_note: model.json().nullable(),
  /** The default consents were created once; deleting them later is respected. */
  consents_seeded: model.boolean().default(false),
});

export default ComplianceSettings;
