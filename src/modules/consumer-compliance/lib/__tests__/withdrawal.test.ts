import { describe, expect, it } from "vitest";
import { assessWithdrawal, createConfirmationToken, exceptionApplies, sameEmail, tokenMatches } from "../withdrawal";
import type { WithdrawalOrderFacts, WithdrawalOrderItem } from "../withdrawal";

const facts = (overrides: Partial<WithdrawalOrderFacts> = {}): WithdrawalOrderFacts => ({
  canceled: false,
  deliveries: [new Date("2026-10-05T10:00:00Z")],
  digital_consent_at: null,
  placed_at: new Date("2026-10-01T10:00:00Z"),
  ...overrides,
});

const item = (overrides: Partial<WithdrawalOrderItem> = {}): WithdrawalOrderItem => ({
  exception: "none",
  line_item_id: "item_1",
  product_id: "prod_1",
  quantity: 2,
  requires_shipping: true,
  title: "Kettle",
  ...overrides,
});

const base = { extendOverNonWorkingDays: true, periodDays: 14 };

describe("assessWithdrawal", () => {
  it("runs 14 days from delivery for goods", () => {
    const result = assessWithdrawal({ ...base, facts: facts(), items: [item()], now: new Date("2026-10-10T10:00:00Z") });
    expect(result.items[0]).toMatchObject({ basis: "delivery", eligible: true, within_period: true });
    expect(result.items[0].deadline_at).toBe("2026-10-19T21:59:59.999Z");
    expect(result.deadline_at).toBe("2026-10-19T21:59:59.999Z");
    expect(result.any_within_period).toBe(true);
  });

  it("runs from the last delivery when goods arrive separately", () => {
    const result = assessWithdrawal({
      ...base,
      facts: facts({ deliveries: [new Date("2026-10-05T10:00:00Z"), new Date("2026-10-08T10:00:00Z")] }),
      items: [item()],
      now: new Date("2026-10-10T10:00:00Z"),
    });
    expect(result.items[0].deadline_at).toBe("2026-10-22T21:59:59.999Z");
  });

  it("has not started while a shipment is not delivered", () => {
    const result = assessWithdrawal({
      ...base,
      facts: facts({ deliveries: [new Date("2026-10-05T10:00:00Z"), null] }),
      items: [item()],
      now: new Date("2027-01-10T10:00:00Z"),
    });
    expect(result.items[0]).toMatchObject({ basis: "awaiting_delivery", deadline_at: null, within_period: true });
    expect(result.deadline_at).toBeNull();
  });

  it("has not started when nothing was shipped yet", () => {
    const result = assessWithdrawal({ ...base, facts: facts({ deliveries: [] }), items: [item()], now: new Date("2026-10-10T10:00:00Z") });
    expect(result.items[0].basis).toBe("awaiting_delivery");
  });

  it("runs from the contract for items without shipping (digital content)", () => {
    const result = assessWithdrawal({ ...base, facts: facts(), items: [item({ requires_shipping: false })], now: new Date("2026-10-20T10:00:00Z") });
    expect(result.items[0]).toMatchObject({ basis: "contract_conclusion", deadline_at: "2026-10-15T21:59:59.999Z", within_period: false });
    expect(result.any_within_period).toBe(false);
  });

  it("excludes digital content only with recorded consent", () => {
    const digital = item({ exception: "digital_content", requires_shipping: false });
    const without = assessWithdrawal({ ...base, facts: facts(), items: [digital], now: new Date("2026-10-02T10:00:00Z") });
    expect(without.items[0].eligible).toBe(true);
    const withConsent = assessWithdrawal({
      ...base,
      facts: facts({ digital_consent_at: new Date("2026-10-01T09:59:00Z") }),
      items: [digital],
      now: new Date("2026-10-02T10:00:00Z"),
    });
    expect(withConsent.items[0]).toMatchObject({ eligible: false, excluded_reason: "digital_content" });
    expect(withConsent.any_eligible).toBe(false);
  });

  it("excludes custom-made goods but leaves sealed goods to the trader", () => {
    expect(exceptionApplies("custom_made", facts())).toBe(true);
    expect(exceptionApplies("sealed_hygiene", facts())).toBe(false);
    expect(exceptionApplies("sealed_media", facts())).toBe(false);
    expect(exceptionApplies("none", facts())).toBe(false);
  });

  it("makes nothing eligible on a canceled order", () => {
    const result = assessWithdrawal({ ...base, facts: facts({ canceled: true }), items: [item()], now: new Date("2026-10-06T10:00:00Z") });
    expect(result.any_eligible).toBe(false);
  });

  it("takes the latest deadline of the eligible items", () => {
    const result = assessWithdrawal({
      ...base,
      facts: facts(),
      items: [item(), item({ line_item_id: "item_2", requires_shipping: false })],
      now: new Date("2026-10-10T10:00:00Z"),
    });
    expect(result.deadline_at).toBe("2026-10-19T21:59:59.999Z");
  });
});

describe("tokens and e-mails", () => {
  it("matches only the issued token", () => {
    const { token, hash } = createConfirmationToken();
    expect(token.length).toBeGreaterThan(20);
    expect(hash).not.toContain(token);
    expect(tokenMatches(token, hash)).toBe(true);
    expect(tokenMatches(`${token}x`, hash)).toBe(false);
    expect(tokenMatches(null, hash)).toBe(false);
    expect(tokenMatches(token, null)).toBe(false);
  });

  it("compares e-mails case-insensitively", () => {
    expect(sameEmail(" Jan@Example.com ", "jan@example.com")).toBe(true);
    expect(sameEmail("jan@example.com", "anna@example.com")).toBe(false);
    expect(sameEmail(null, "jan@example.com")).toBe(false);
  });
});

describe("assessWithdrawal: digital-only store (ESD codes)", () => {
  const goods = item({ exception: "none", requires_shipping: true });

  it("has no right of withdrawal when consent to immediate supply is recorded, with the legal basis", () => {
    const result = assessWithdrawal({
      ...base,
      digitalOnly: true,
      facts: facts({ deliveries: [], digital_consent_at: new Date("2026-10-01T09:59:00Z") }),
      items: [goods, item({ line_item_id: "item_2" })],
      now: new Date("2026-10-02T10:00:00Z"),
    });
    expect(result.right_of_withdrawal).toBe("excluded_digital_consent");
    expect(result.any_eligible).toBe(false);
    expect(result.digital_consent_missing).toBe(false);
    expect(result.digital_consent_at).toBe("2026-10-01T09:59:00.000Z");
    expect(result.legal_basis?.pl).toContain("Art. 38 ust. 1 pkt 13 ustawy o prawach konsumenta");
    expect(result.legal_basis?.en).toContain("Art. 38 ust. 1 pkt 13");
    for (const assessed of result.items) {
      expect(assessed).toMatchObject({ eligible: false, exception: "digital_content", excluded_reason: "digital_content" });
    }
  });

  it("keeps the ordinary 14-day right from the contract and flags missing consent", () => {
    const result = assessWithdrawal({
      ...base,
      digitalOnly: true,
      facts: facts({ deliveries: [], digital_consent_at: null }),
      items: [goods],
      now: new Date("2026-10-02T10:00:00Z"),
    });
    expect(result.right_of_withdrawal).toBe("applies");
    expect(result.digital_consent_missing).toBe(true);
    expect(result.legal_basis).toBeNull();
    // Contract concluded 1 Oct: day 14 is Thursday 15 Oct.
    expect(result.items[0]).toMatchObject({
      basis: "contract_conclusion",
      deadline_at: "2026-10-15T21:59:59.999Z",
      eligible: true,
      within_period: true,
    });
  });

  it("overrides per-product classification and ignores deliveries", () => {
    const result = assessWithdrawal({
      ...base,
      digitalOnly: true,
      facts: facts({ deliveries: [null] }),
      items: [item({ exception: "custom_made" })],
      now: new Date("2026-10-02T10:00:00Z"),
    });
    expect(result.items[0]).toMatchObject({ basis: "contract_conclusion", eligible: true, exception: "digital_content" });
  });

  it("does not flag missing consent outside digital-only mode", () => {
    const result = assessWithdrawal({ ...base, facts: facts(), items: [goods], now: new Date("2026-10-06T10:00:00Z") });
    expect(result.digital_consent_missing).toBe(false);
    expect(result.right_of_withdrawal).toBe("applies");
  });

  it("reports a canceled order as none eligible, not as the digital exception", () => {
    const result = assessWithdrawal({
      ...base,
      digitalOnly: true,
      facts: facts({ canceled: true, digital_consent_at: new Date("2026-10-01T09:59:00Z") }),
      items: [goods],
      now: new Date("2026-10-02T10:00:00Z"),
    });
    expect(result.right_of_withdrawal).toBe("none_eligible");
    expect(result.legal_basis).toBeNull();
  });
});

describe("assessWithdrawal: lines covered by the checkout consent", () => {
  it("excludes only the covered products of a mixed order, with the legal basis per item", () => {
    const result = assessWithdrawal({
      ...base,
      facts: facts({ digital_consent_at: new Date("2026-10-01T09:59:00Z"), digital_consent_product_ids: ["prod_key"] }),
      items: [item({ line_item_id: "item_key", product_id: "prod_key" }), item({ line_item_id: "item_mug", product_id: "prod_mug" })],
      now: new Date("2026-10-06T10:00:00Z"),
    });
    expect(result.right_of_withdrawal).toBe("applies");
    const [key, mug] = result.items;
    expect(key).toMatchObject({ basis: "contract_conclusion", eligible: false, excluded_reason: "digital_content" });
    expect(key.legal_basis?.pl).toContain("Art. 38 ust. 1 pkt 13");
    expect(mug).toMatchObject({ eligible: true, legal_basis: null });
  });

  it("answers no right of withdrawal when every line was covered", () => {
    const result = assessWithdrawal({
      ...base,
      facts: facts({ deliveries: [], digital_consent_at: new Date("2026-10-01T09:59:00Z"), digital_consent_product_ids: ["prod_1"] }),
      items: [item()],
      now: new Date("2026-10-02T10:00:00Z"),
    });
    expect(result.right_of_withdrawal).toBe("excluded_digital_consent");
    expect(result.digital_consent_missing).toBe(false);
  });

  it("flags missing consent for products classified as digital content", () => {
    const result = assessWithdrawal({
      ...base,
      facts: facts({ digital_consent_at: null }),
      items: [item({ exception: "digital_content", requires_shipping: false })],
      now: new Date("2026-10-02T10:00:00Z"),
    });
    expect(result.digital_consent_missing).toBe(true);
    expect(result.right_of_withdrawal).toBe("applies");
  });
});
