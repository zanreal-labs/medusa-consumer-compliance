import type { INotificationModuleService, Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils";
import { StepResponse, createStep } from "@medusajs/framework/workflows-sdk";
import { CONSUMER_COMPLIANCE_MODULE } from "../../modules/consumer-compliance";
import type ConsumerComplianceModuleService from "../../modules/consumer-compliance/service";
import { defaultStatement, renderAcknowledgement } from "../../modules/consumer-compliance/lib/acknowledgement";
import {
  assessWithdrawal,
  createConfirmationToken,
  sameEmail,
  tokenMatches,
  withdrawalCreationBlock,
} from "../../modules/consumer-compliance/lib/withdrawal";
import type { OrderAssessment } from "../../modules/consumer-compliance/lib/withdrawal";
import { loadOrder, parseDisplayId } from "../lib/orders";
import type { LoadedOrder } from "../lib/orders";

export interface OrderReference {
  /** Authenticated customer: any of their orders by id or display id. */
  customer_id?: string | null;
  order_id?: string | null;
  /** Guest: display id plus the order e-mail. */
  display_id?: string | number | null;
  email?: string | null;
}

export interface WithdrawalRow {
  id: string;
  order_id: string;
  order_display_id: string;
  customer_id: string | null;
  email: string;
  customer_name: string;
  locale: string | null;
  status: string;
  whole_order: boolean;
  items: { line_item_id: string; title: string; quantity: number }[];
  statement: string;
  reason: string | null;
  confirmation_token_hash: string | null;
  confirmation_expires_at: Date | null;
  submitted_at: Date | null;
  deadline_at: Date | null;
  within_period: boolean;
  acknowledgement_sent_at: Date | null;
  acknowledgement_error: string | null;
}

/** Same answer for "no such order" and "wrong e-mail", so the lookup cannot be used to probe order numbers. */
const NOT_FOUND = "No order matches these details.";

/**
 * Resolve an order the caller is entitled to. A logged-in customer may use any
 * of their orders; a guest needs the order number and the e-mail on the order.
 */
export async function resolveOwnedOrder(
  container: Parameters<typeof loadOrder>[0],
  reference: OrderReference,
): Promise<LoadedOrder> {
  const displayId = reference.display_id !== undefined && reference.display_id !== null ? parseDisplayId(reference.display_id) : null;
  const order = reference.order_id
    ? await loadOrder(container, { order_id: reference.order_id })
    : displayId !== null
      ? await loadOrder(container, { display_id: displayId })
      : null;
  if (!order) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, NOT_FOUND);
  }
  const ownedByCustomer = !!reference.customer_id && order.customer_id === reference.customer_id;
  const ownedByEmail = !!reference.email && sameEmail(reference.email, order.email);
  if (!ownedByCustomer && !ownedByEmail) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, NOT_FOUND);
  }
  return order;
}

export interface AssessOrderOutput {
  order: LoadedOrder;
  /** Null for a marketplace order, which follows the marketplace's own process. */
  assessment: OrderAssessment | null;
}

export const assessWithdrawalOrderStep = createStep(
  "assess-withdrawal-order",
  async (input: OrderReference, { container }) => {
    const service = container.resolve<ConsumerComplianceModuleService>(CONSUMER_COMPLIANCE_MODULE);
    const options = service.resolvedOptions.withdrawal;
    const order = await resolveOwnedOrder(container, input);
    if (order.external) {
      return new StepResponse<AssessOrderOutput>({ assessment: null, order });
    }
    const assessment = assessWithdrawal({
      digitalOnly: options.digitalOnly,
      extendOverNonWorkingDays: options.extendOverNonWorkingDays,
      facts: order.facts,
      items: order.items,
      now: new Date(),
      periodDays: options.periodDays,
    });
    return new StepResponse<AssessOrderOutput>({ assessment, order });
  },
);

export interface CreateWithdrawalInput {
  order: LoadedOrder;
  assessment: OrderAssessment | null;
  customer_name: string;
  email: string;
  locale?: string | null;
  items?: { line_item_id: string; quantity: number }[] | null;
  statement?: string | null;
  reason?: string | null;
}

export const createWithdrawalStep = createStep(
  "create-withdrawal",
  async (input: CreateWithdrawalInput, { container }) => {
    const service = container.resolve<ConsumerComplianceModuleService>(CONSUMER_COMPLIANCE_MODULE);
    const options = service.resolvedOptions.withdrawal;
    const { order } = input;
    if (order.external || !input.assessment) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "This order was placed on an external marketplace. Withdrawal follows the marketplace's own process.",
        "external_marketplace_order",
      );
    }
    const assessment = input.assessment;
    const byId = new Map(assessment.items.map((item) => [item.line_item_id, item]));

    if (order.facts.canceled) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "This order is canceled, there is no contract to withdraw from.");
    }
    if (!input.customer_name?.trim()) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Your name is required.");
    }

    let selected: { line_item_id: string; title: string; quantity: number }[];
    let wholeOrder: boolean;
    if (input.items && input.items.length > 0) {
      selected = input.items.map((requested) => {
        const item = byId.get(requested.line_item_id);
        if (!item) {
          throw new MedusaError(MedusaError.Types.INVALID_DATA, `Item ${requested.line_item_id} is not part of this order.`);
        }
        if (!item.eligible) {
          throw new MedusaError(
            MedusaError.Types.NOT_ALLOWED,
            `"${item.title}" is excluded from the right of withdrawal (${item.excluded_reason}).`,
          );
        }
        if (!(requested.quantity > 0) || requested.quantity > item.quantity) {
          throw new MedusaError(MedusaError.Types.INVALID_DATA, `Invalid quantity for "${item.title}".`);
        }
        return { line_item_id: item.line_item_id, quantity: requested.quantity, title: item.title };
      });
      wholeOrder = assessment.items.filter((item) => item.eligible).every((item) => {
        const chosen = selected.find((entry) => entry.line_item_id === item.line_item_id);
        return chosen && chosen.quantity === item.quantity;
      });
    } else {
      selected = assessment.items
        .filter((item) => item.eligible)
        .map((item) => ({ line_item_id: item.line_item_id, quantity: item.quantity, title: item.title }));
      wholeOrder = true;
    }
    if (selected.length === 0) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        assessment.right_of_withdrawal === "excluded_digital_consent"
          ? `No right of withdrawal: ${assessment.legal_basis?.en ?? ""}`
          : "No item of this order can be withdrawn from.",
      );
    }

    const relevant = selected.map((entry) => byId.get(entry.line_item_id)).filter((item) => !!item);
    const withinPeriod = relevant.every((item) => item.within_period);
    if (!withinPeriod && options.rejectOutsidePeriod) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "The withdrawal period for this order has ended.");
    }
    const deadlines = relevant.map((item) => item.deadline_at);
    const deadline = deadlines.includes(null) ? null : (deadlines as string[]).sort().at(-1) ?? null;

    // Bound the requests per order before writing anything: the guest flow needs
    // only the order number and its e-mail, and every request ends in an e-mail.
    const existing = (await service.listWithdrawalRequests(
      { order_id: order.id },
      { select: ["status", "whole_order", "confirmation_expires_at"], take: null },
    )) as unknown as { status: string; whole_order: boolean; confirmation_expires_at: Date | null }[];
    const block = withdrawalCreationBlock(existing, new Date());
    if (block === "already_withdrawn") {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "A withdrawal from this whole order was already submitted.", block);
    }
    if (block === "too_many_pending") {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "There are already unconfirmed withdrawal requests for this order. Confirm one of them or try again later.",
        block,
      );
    }

    // The acknowledgement goes to the e-mail on the order, never to an address
    // typed into the form: a guest has already proven that address to get here,
    // and accepting any other one turned the form into an open mail relay.
    const recipient = (order.email ?? input.email).trim();

    const { token, hash } = createConfirmationToken();
    const created = (await service.createWithdrawalRequests({
      assessment: assessment as unknown as Record<string, unknown>,
      confirmation_expires_at: new Date(Date.now() + options.confirmationTtlMinutes * 60_000),
      confirmation_token_hash: hash,
      customer_id: order.customer_id,
      customer_name: input.customer_name.trim(),
      deadline_at: deadline ? new Date(deadline) : null,
      email: recipient,
      items: selected as unknown as Record<string, unknown>,
      locale: input.locale ?? null,
      order_display_id: order.display_id,
      order_id: order.id,
      reason: input.reason?.trim() || null,
      statement: input.statement?.trim() || defaultStatement(input.locale ?? null, order.display_id),
      status: "pending_confirmation",
      whole_order: wholeOrder,
      within_period: withinPeriod,
    })) as unknown as WithdrawalRow;

    return new StepResponse({ confirmation_token: token, withdrawal: created }, created.id);
  },
  async (id, { container }) => {
    if (id) {
      await container.resolve<ConsumerComplianceModuleService>(CONSUMER_COMPLIANCE_MODULE).deleteWithdrawalRequests(id);
    }
  },
);

export const confirmWithdrawalStep = createStep(
  "confirm-withdrawal",
  async (input: { id: string; token: string }, { container }) => {
    const service = container.resolve<ConsumerComplianceModuleService>(CONSUMER_COMPLIANCE_MODULE);
    const [row] = (await service.listWithdrawalRequests({ id: input.id })) as unknown as WithdrawalRow[];
    // Token checked before anything else, so an unknown id and a wrong token look the same.
    if (!row || !tokenMatches(input.token, row.confirmation_token_hash)) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Withdrawal request not found.");
    }
    if (row.status !== "pending_confirmation") {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "This withdrawal request was already confirmed.");
    }
    if (row.confirmation_expires_at && new Date(row.confirmation_expires_at).getTime() < Date.now()) {
      await service.updateWithdrawalRequests({ confirmation_token_hash: null, id: row.id, status: "expired" });
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "This withdrawal request has expired. Please start again.");
    }
    const confirmed = (await service.updateWithdrawalRequests({
      confirmation_token_hash: null,
      id: row.id,
      status: "confirmed",
      submitted_at: new Date(),
    })) as unknown as WithdrawalRow;
    return new StepResponse(confirmed, {
      confirmation_expires_at: row.confirmation_expires_at,
      confirmation_token_hash: row.confirmation_token_hash,
      id: row.id,
    });
  },
  async (undo, { container }) => {
    if (undo) {
      await container.resolve<ConsumerComplianceModuleService>(CONSUMER_COMPLIANCE_MODULE).updateWithdrawalRequests({
        ...undo,
        status: "pending_confirmation",
        submitted_at: null,
      });
    }
  },
);

/**
 * Send the acknowledgement on a durable medium. Never fails the workflow: the
 * withdrawal is legally effective once submitted, whatever happens to the
 * e-mail, so a provider outage is recorded on the row (and shown in the admin
 * for a manual resend) instead of undoing the consumer's statement.
 */
export const sendWithdrawalAcknowledgementStep = createStep(
  "send-withdrawal-acknowledgement",
  async (input: { withdrawal: WithdrawalRow }, { container }) => {
    const service = container.resolve<ConsumerComplianceModuleService>(CONSUMER_COMPLIANCE_MODULE);
    const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER);
    const options = service.resolvedOptions.withdrawal;
    const row = input.withdrawal;
    const orderConsents = (await service.listOrderConsents({ order_id: row.order_id }, { order: { accepted_at: "ASC" }, take: null })) as unknown as {
      text: string;
      version: number;
      accepted_at: string | Date;
      locale: string | null;
    }[];
    const content = renderAcknowledgement({
      consents: orderConsents.map((consent) => ({
        accepted_at: new Date(consent.accepted_at),
        locale: consent.locale,
        text: consent.text,
        version: Number(consent.version),
      })),
      customer_name: row.customer_name,
      email: row.email,
      items: row.items,
      locale: row.locale,
      order_display_id: row.order_display_id,
      reference: row.id,
      seller: options.seller,
      statement: row.statement,
      submitted_at: new Date(row.submitted_at ?? Date.now()),
      whole_order: row.whole_order,
    });

    let notifications: INotificationModuleService | null = null;
    try {
      notifications = container.resolve<INotificationModuleService>(Modules.NOTIFICATION);
    } catch {
      notifications = null;
    }

    let error: string | null = null;
    if (!notifications) {
      error = "No notification module is registered.";
    } else {
      const data = {
        customer_name: row.customer_name,
        items: row.items,
        order_display_id: row.order_display_id,
        statement: row.statement,
        submitted_at: row.submitted_at,
        withdrawal_id: row.id,
        within_period: row.within_period,
      };
      try {
        await notifications.createNotifications({
          channel: options.notificationChannel,
          content,
          data,
          idempotency_key: `consumer-compliance-withdrawal-ack-${row.id}`,
          resource_id: row.id,
          resource_type: "consumer_compliance_withdrawal",
          template: options.notificationTemplate,
          to: row.email,
          trigger_type: "consumer_compliance.withdrawal.confirmed",
        });
        if (options.merchantNotificationEmail) {
          await notifications.createNotifications({
            channel: options.notificationChannel,
            content: { ...content, subject: `[copy] ${content.subject}` },
            data,
            idempotency_key: `consumer-compliance-withdrawal-merchant-${row.id}`,
            resource_id: row.id,
            resource_type: "consumer_compliance_withdrawal",
            template: options.notificationTemplate,
            to: options.merchantNotificationEmail,
            trigger_type: "consumer_compliance.withdrawal.confirmed",
          });
        }
      } catch (caught) {
        error = caught instanceof Error ? caught.message : String(caught);
      }
    }

    if (error) {
      logger.error(`[consumer-compliance] acknowledgement for withdrawal ${row.id} was not sent: ${error}`);
    }
    const updated = (await service.updateWithdrawalRequests({
      acknowledgement_error: error,
      acknowledgement_sent_at: error ? null : new Date(),
      id: row.id,
    })) as unknown as WithdrawalRow;
    return new StepResponse(updated);
  },
);

export const updateWithdrawalStatusStep = createStep(
  "update-withdrawal-status",
  async (input: { id: string; status: "processed" | "rejected" | "confirmed"; note?: string | null; actor_id?: string | null }, { container }) => {
    const service = container.resolve<ConsumerComplianceModuleService>(CONSUMER_COMPLIANCE_MODULE);
    const [row] = (await service.listWithdrawalRequests({ id: input.id })) as unknown as (WithdrawalRow & {
      handled_at: Date | null;
      handled_by: string | null;
      internal_note: string | null;
    })[];
    if (!row) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Withdrawal request not found.");
    }
    if (row.status === "pending_confirmation" || row.status === "expired") {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Only a confirmed withdrawal can be handled.");
    }
    const updated = await service.updateWithdrawalRequests({
      handled_at: input.status === "confirmed" ? null : new Date(),
      handled_by: input.status === "confirmed" ? null : input.actor_id ?? null,
      id: row.id,
      internal_note: input.note ?? row.internal_note,
      status: input.status,
    });
    return new StepResponse(updated, {
      handled_at: row.handled_at,
      handled_by: row.handled_by,
      id: row.id,
      internal_note: row.internal_note,
      status: row.status,
    });
  },
  async (undo, { container }) => {
    if (undo) {
      await container.resolve<ConsumerComplianceModuleService>(CONSUMER_COMPLIANCE_MODULE).updateWithdrawalRequests(undo as never);
    }
  },
);
