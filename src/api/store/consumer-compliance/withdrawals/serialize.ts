import type { WithdrawalRow } from "../../../../workflows/steps/withdrawal-steps";

/** What a consumer may see of a withdrawal: never the token hash, the assessment internals or the trader's notes. */
export function toPublicWithdrawal(row: WithdrawalRow) {
  return {
    acknowledgement_sent_at: row.acknowledgement_sent_at,
    confirmation_expires_at: row.status === "pending_confirmation" ? row.confirmation_expires_at : null,
    customer_name: row.customer_name,
    deadline_at: row.deadline_at,
    email: row.email,
    id: row.id,
    items: row.items,
    order_display_id: row.order_display_id,
    statement: row.statement,
    status: row.status,
    submitted_at: row.submitted_at,
    whole_order: row.whole_order,
    within_period: row.within_period,
  };
}
