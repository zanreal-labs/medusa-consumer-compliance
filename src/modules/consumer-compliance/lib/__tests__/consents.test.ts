import { describe, expect, it } from "vitest";
import {
  DEFAULT_DIGITAL_CONSENT_LABEL,
  consentBlock,
  evaluateConsents,
  isFlagSet,
  latestAcceptances,
  matchConsents,
  needsNewVersion,
  ruleMatchesLine,
  sanitizeRules,
} from "../consents";
import type { CartLine, ConsentDefinitionData } from "../consents";

const line = (overrides: Partial<CartLine> = {}): CartLine => ({
  category_ids: [],
  collection_id: null,
  line_item_id: "cali_1",
  metadata: null,
  product_id: "prod_1",
  tag_ids: [],
  type_id: null,
  ...overrides,
});

const definition = (overrides: Partial<ConsentDefinitionData> = {}): ConsentDefinitionData => ({
  active: true,
  id: "cccons_1",
  key: "digital_immediate_delivery",
  label: DEFAULT_DIGITAL_CONSENT_LABEL,
  link_label: null,
  link_url: null,
  position: 0,
  purpose: "digital_content_withdrawal_waiver",
  required: true,
  rules: [{ key: "is_digital_content", type: "product_flag" }],
  version: 1,
  ...overrides,
});

describe("rule matching", () => {
  it("matches every rule type", () => {
    const l = line({
      category_ids: ["pcat_1"],
      collection_id: "pcol_1",
      metadata: { is_digital_content: true },
      product_id: "prod_9",
      tag_ids: ["ptag_esd"],
      type_id: "ptyp_licence",
    });
    expect(ruleMatchesLine({ type: "always" }, l)).toBe(true);
    expect(ruleMatchesLine({ type: "product", values: ["prod_9"] }, l)).toBe(true);
    expect(ruleMatchesLine({ type: "product_type", values: ["ptyp_licence"] }, l)).toBe(true);
    expect(ruleMatchesLine({ type: "product_tag", values: ["ptag_esd"] }, l)).toBe(true);
    expect(ruleMatchesLine({ type: "collection", values: ["pcol_1"] }, l)).toBe(true);
    expect(ruleMatchesLine({ type: "category", values: ["pcat_1"] }, l)).toBe(true);
    expect(ruleMatchesLine({ key: "is_digital_content", type: "product_flag" }, l)).toBe(true);
    expect(ruleMatchesLine({ type: "product", values: ["prod_other"] }, l)).toBe(false);
    expect(ruleMatchesLine({ key: "other_flag", type: "product_flag" }, l)).toBe(false);
  });

  it("reads product flags loosely but safely", () => {
    for (const value of [true, 1, "true", "1", "yes", "TAK"]) {
      expect(isFlagSet(value)).toBe(true);
    }
    for (const value of [false, 0, "false", "", null, undefined, "no"]) {
      expect(isFlagSet(value)).toBe(false);
    }
  });
});

describe("matchConsents", () => {
  const digital = line({ line_item_id: "cali_key", metadata: { is_digital_content: "true" }, product_id: "prod_key" });
  const physical = line({ line_item_id: "cali_mug", product_id: "prod_mug" });

  it("applies the digital consent to the digital lines of a mixed cart only", () => {
    const [applied] = matchConsents([definition()], [physical, digital]);
    expect(applied.line_item_ids).toEqual(["cali_key"]);
    expect(applied.product_ids).toEqual(["prod_key"]);
  });

  it("does not apply when no line matches, or when inactive", () => {
    expect(matchConsents([definition()], [physical])).toEqual([]);
    expect(matchConsents([definition({ active: false })], [digital])).toEqual([]);
  });

  it("applies an always rule to every cart and line, in display order", () => {
    const terms = definition({ id: "cccons_t", key: "terms", position: -1, purpose: "generic", rules: [{ type: "always" }] });
    const result = matchConsents([definition(), terms], [physical, digital]);
    expect(result.map((entry) => entry.definition.key)).toEqual(["terms", "digital_immediate_delivery"]);
    expect(result[0].line_item_ids).toEqual(["cali_mug", "cali_key"]);
  });

  it("applies when any of several rules matches", () => {
    const consent = definition({ rules: [{ type: "product", values: ["prod_mug"] }, { key: "x", type: "product_flag" }] });
    expect(matchConsents([consent], [physical, digital])[0].line_item_ids).toEqual(["cali_mug"]);
  });
});

describe("consent state and blocking", () => {
  const applicable = matchConsents(
    [definition({ version: 2 }), definition({ id: "cccons_n", key: "newsletter", purpose: "generic", required: false, rules: [{ type: "always" }] })],
    [line({ metadata: { is_digital_content: true } })],
  );

  it("blocks a missing required consent", () => {
    const states = evaluateConsents(applicable, []);
    expect(states.map((state) => state.status)).toEqual(["missing", "missing"]);
    expect(consentBlock(states)).toEqual({ code: "consent_required", keys: ["digital_immediate_delivery"] });
  });

  it("blocks a required consent accepted in an older version", () => {
    const states = evaluateConsents(applicable, [{ accepted_at: new Date("2026-10-01T10:00:00Z"), key: "digital_immediate_delivery", version: 1 }]);
    expect(states[0]).toMatchObject({ accepted_version: 1, status: "outdated", version: 2 });
    expect(consentBlock(states)).toEqual({ code: "consent_version_outdated", keys: ["digital_immediate_delivery"] });
  });

  it("lets the cart through once the current version is accepted, optional ones aside", () => {
    const states = evaluateConsents(applicable, [
      { accepted_at: new Date("2026-10-01T10:00:00Z"), key: "digital_immediate_delivery", version: 1 },
      { accepted_at: new Date("2026-10-01T10:05:00Z"), key: "digital_immediate_delivery", version: 2 },
    ]);
    expect(states[0].status).toBe("accepted");
    expect(consentBlock(states)).toBeNull();
  });

  it("uses the latest acceptance per key", () => {
    const latest = latestAcceptances([
      { accepted_at: new Date("2026-10-01T10:05:00Z"), key: "a", version: 2 },
      { accepted_at: new Date("2026-10-01T10:00:00Z"), key: "a", version: 1 },
    ]);
    expect(latest.get("a")?.version).toBe(2);
  });
});

describe("versioning and input", () => {
  const current = { label: { en: "A", pl: "B" }, link_label: null, link_url: "https://example.com/terms" };

  it("bumps the version only when the customer-facing text changes", () => {
    expect(needsNewVersion(current, { label: { pl: "B", en: "A" } })).toBe(false);
    expect(needsNewVersion(current, { label: { en: "A", pl: "B2" } })).toBe(true);
    expect(needsNewVersion(current, { link_url: "https://example.com/terms-v2" })).toBe(true);
    expect(needsNewVersion(current, { link_label: { pl: "Regulamin" } })).toBe(true);
    expect(needsNewVersion(current, {})).toBe(false);
  });

  it("drops malformed rules", () => {
    expect(
      sanitizeRules([
        { type: "always", values: ["x"] },
        { type: "product_flag" },
        { key: " is_digital_content ", type: "product_flag" },
        { type: "product", values: [" prod_1 ", "prod_1", ""] },
        { type: "category", values: [] },
        { type: "bogus" },
        null,
      ]),
    ).toEqual([{ type: "always" }, { key: "is_digital_content", type: "product_flag" }, { type: "product", values: ["prod_1"] }]);
    expect(sanitizeRules("nope")).toEqual([]);
  });

  it("words the default digital consent as consent plus acknowledgement (art. 38 ust. 1 pkt 13)", () => {
    expect(DEFAULT_DIGITAL_CONSENT_LABEL.pl).toMatch(/Wyrażam zgodę .* przed upływem terminu do odstąpienia od umowy/u);
    expect(DEFAULT_DIGITAL_CONSENT_LABEL.pl).toMatch(/Przyjmuję do wiadomości, że .* utracę prawo odstąpienia od umowy/u);
    expect(DEFAULT_DIGITAL_CONSENT_LABEL.en).toMatch(/I acknowledge .* lose my right to withdraw/u);
  });
});
