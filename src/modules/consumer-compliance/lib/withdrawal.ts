/**
 * Right of withdrawal: who may withdraw from what, and until when.
 *
 * ustawa z dnia 30 maja 2014 r. o prawach konsumenta:
 * - art. 27: 14 days to withdraw from a distance contract without giving a reason;
 * - art. 28: the period runs, for a sale of goods, from taking possession of the
 *   goods (for several goods delivered separately, from taking possession of
 *   the last one), and for other contracts, digital content not supplied on a
 *   tangible medium included, from the conclusion of the contract;
 * - art. 30: sending the statement before the period ends is enough;
 * - art. 38 ust. 1: the statutory exceptions (custom goods, perishable goods,
 *   sealed hygiene goods unsealed after delivery, digital content supplied with
 *   the consumer's prior express consent and acknowledgement, ...).
 *
 * The functions here only classify. They never refuse on their own: the
 * Withdrawal API accepts statements outside the period unless the store
 * explicitly configures otherwise, because the trader must assess each one.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { WithdrawalException } from "../types";
import { periodEnd } from "./calendar";

export interface WithdrawalOrderItem {
  line_item_id: string;
  product_id: string | null;
  title: string;
  quantity: number;
  /** False for digital content and services, which have no delivery date. */
  requires_shipping: boolean;
  exception: WithdrawalException;
}

export interface WithdrawalOrderFacts {
  /** When the contract was concluded (order placed). */
  placed_at: Date;
  /**
   * Delivery dates of the order's fulfillments, one per fulfillment that holds
   * goods. `null` for a fulfillment not (yet) marked delivered.
   */
  deliveries: (Date | null)[];
  /** Consent to immediate supply of digital content, with acknowledgement of losing the right (art. 38 ust. 1 pkt 13). */
  digital_consent_at: Date | null;
  canceled: boolean;
}

export type PeriodBasis = "delivery" | "contract_conclusion" | "awaiting_delivery";

export interface ItemAssessment {
  line_item_id: string;
  title: string;
  quantity: number;
  eligible: boolean;
  exception: WithdrawalException;
  /** Why the item is excluded, when it is. */
  excluded_reason: WithdrawalException | null;
  basis: PeriodBasis;
  /** Last moment to send the statement, ISO, or null while the period has not started. */
  deadline_at: string | null;
  within_period: boolean;
}

export interface OrderAssessment {
  items: ItemAssessment[];
  /** Latest deadline across eligible items, ISO, or null if any eligible item awaits delivery. */
  deadline_at: string | null;
  any_eligible: boolean;
  any_within_period: boolean;
}

/**
 * Whether an exception actually removes the right for this order. Most apply
 * by the nature of the goods; the digital content one applies only when the
 * consumer's consent was recorded before supply started. Exceptions for
 * sealed goods apply only once the seal is broken, which the shop cannot see:
 * they are reported, and the trader decides.
 */
export function exceptionApplies(exception: WithdrawalException, facts: WithdrawalOrderFacts): boolean {
  switch (exception) {
    case "none":
      return false;
    case "digital_content":
      return facts.digital_consent_at !== null;
    case "sealed_hygiene":
    case "sealed_media":
      // Depends on whether the consumer unsealed the item after delivery.
      return false;
    default:
      return true;
  }
}

export function assessWithdrawal(input: {
  facts: WithdrawalOrderFacts;
  items: readonly WithdrawalOrderItem[];
  now: Date;
  periodDays: number;
  extendOverNonWorkingDays: boolean;
}): OrderAssessment {
  const { facts, now, periodDays, extendOverNonWorkingDays } = input;
  const goodsDeliveries = facts.deliveries;
  const allDelivered = goodsDeliveries.length > 0 && goodsDeliveries.every((date) => date !== null);
  const lastDelivery = allDelivered
    ? new Date(Math.max(...goodsDeliveries.map((date) => (date as Date).getTime())))
    : null;

  const items = input.items.map((item): ItemAssessment => {
    let basis: PeriodBasis;
    let start: Date | null;
    if (!item.requires_shipping) {
      basis = "contract_conclusion";
      start = facts.placed_at;
    } else if (lastDelivery) {
      basis = "delivery";
      start = lastDelivery;
    } else {
      basis = "awaiting_delivery";
      start = null;
    }
    const deadline = start ? periodEnd(start, periodDays, extendOverNonWorkingDays) : null;
    const excluded = exceptionApplies(item.exception, facts);
    return {
      basis,
      deadline_at: deadline?.toISOString() ?? null,
      eligible: !excluded && !facts.canceled,
      exception: item.exception,
      excluded_reason: excluded ? item.exception : null,
      line_item_id: item.line_item_id,
      quantity: item.quantity,
      title: item.title,
      within_period: deadline === null ? true : now.getTime() <= deadline.getTime(),
    };
  });

  const eligible = items.filter((item) => item.eligible);
  const awaiting = eligible.some((item) => item.deadline_at === null);
  const deadlines = eligible.map((item) => item.deadline_at).filter((value): value is string => value !== null);
  return {
    any_eligible: eligible.length > 0,
    any_within_period: eligible.some((item) => item.within_period),
    deadline_at: awaiting || deadlines.length === 0 ? null : deadlines.sort().at(-1) ?? null,
    items,
  };
}

/** A confirmation token for step two, and the hash that is stored instead of it. */
export function createConfirmationToken(): { token: string; hash: string } {
  const token = randomBytes(24).toString("base64url");
  return { hash: hashToken(token), token };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function tokenMatches(token: string | null | undefined, hash: string | null | undefined): boolean {
  if (!token || !hash) {
    return false;
  }
  const candidate = Buffer.from(hashToken(token), "hex");
  const stored = Buffer.from(hash, "hex");
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}

/** Case- and whitespace-insensitive e-mail comparison for the guest order lookup. */
export function sameEmail(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) {
    return false;
  }
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
