import { model } from "@medusajs/framework/utils";

/**
 * A statement of withdrawal made through the online withdrawal function
 * (art. 11a of Directive 2011/83/EU, added by Directive (EU) 2023/2673).
 *
 * Created in `pending_confirmation` by step one, moved to `confirmed` by the
 * consumer's explicit confirmation in step two - that moment is the legal
 * submission time and is what `submitted_at` holds. `processed` and
 * `rejected` are the trader's own follow-up and never change `submitted_at`.
 */
const WithdrawalRequest = model
  .define("consumer_compliance_withdrawal", {
    id: model.id({ prefix: "ccwd" }).primaryKey(),
    order_id: model.text(),
    order_display_id: model.text(),
    customer_id: model.text().nullable(),
    email: model.text(),
    customer_name: model.text(),
    locale: model.text().nullable(),
    status: model
      .enum(["pending_confirmation", "confirmed", "processed", "rejected", "expired"])
      .default("pending_confirmation"),
    whole_order: model.boolean().default(true),
    /** `[{ line_item_id, title, quantity }]`. */
    items: model.json(),
    /** The statement text as submitted (the default wording when the consumer typed none). */
    statement: model.text(),
    /** Optional, never required by law. */
    reason: model.text().nullable(),
    confirmation_token_hash: model.text().nullable(),
    confirmation_expires_at: model.dateTime().nullable(),
    submitted_at: model.dateTime().nullable(),
    deadline_at: model.dateTime().nullable(),
    within_period: model.boolean().default(true),
    /** Assessment snapshot at submission: per item basis, exception, deadline. */
    assessment: model.json().nullable(),
    acknowledgement_sent_at: model.dateTime().nullable(),
    acknowledgement_error: model.text().nullable(),
    handled_by: model.text().nullable(),
    handled_at: model.dateTime().nullable(),
    internal_note: model.text().nullable(),
  })
  .indexes([{ on: ["order_id"] }, { on: ["status"] }, { on: ["customer_id"] }]);

export default WithdrawalRequest;
