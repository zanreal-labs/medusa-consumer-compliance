/**
 * Which checkout consents a cart needs, and whether it has them. Pure.
 *
 * A consent definition carries rules; it applies to a cart when ANY rule
 * matches at least one line (`always` matches every cart). For the digital
 * content waiver, the matched lines are what the consent covers: those, and
 * only those, lose the right of withdrawal (art. 38 ust. 1 pkt 13).
 */
import type { ConsentPurpose, ConsentRuleType, LocalizedText } from "../types";
import { CONSENT_RULE_TYPES } from "../types";
import { pickLocalized, sanitizeLocalized } from "./localized";

export interface ConsentRule {
  type: ConsentRuleType;
  /** Ids for product_type, product_tag, collection, category, product. */
  values?: string[];
  /** Metadata key for product_flag. */
  key?: string;
}

export interface ConsentDefinitionData {
  id: string;
  key: string;
  label: LocalizedText;
  link_url: string | null;
  link_label: LocalizedText | null;
  link_sha256?: string | null;
  version: number;
  required: boolean;
  active: boolean;
  purpose: ConsentPurpose;
  rules: ConsentRule[];
  position: number;
}

export interface CartLine {
  line_item_id: string;
  product_id: string | null;
  type_id: string | null;
  tag_ids: string[];
  collection_id: string | null;
  category_ids: string[];
  metadata: Record<string, unknown> | null;
}

export interface ApplicableConsent {
  definition: ConsentDefinitionData;
  line_item_ids: string[];
  product_ids: string[];
}

export interface AcceptanceData {
  key: string;
  version: number;
  accepted_at: Date;
}

export type ConsentStatus = "accepted" | "missing" | "outdated";

export interface ConsentState {
  key: string;
  required: boolean;
  version: number;
  accepted_version: number | null;
  accepted_at: string | null;
  status: ConsentStatus;
}

const TRUTHY = new Set(["true", "1", "yes", "tak"]);

/** `true`, `"true"`, `1`, `"1"`, `"yes"`, `"tak"` count as a set flag. */
export function isFlagSet(value: unknown): boolean {
  if (value === true || value === 1) {
    return true;
  }
  return typeof value === "string" && TRUTHY.has(value.trim().toLowerCase());
}

export function ruleMatchesLine(rule: ConsentRule, line: CartLine): boolean {
  const values = rule.values ?? [];
  switch (rule.type) {
    case "always":
      return true;
    case "product":
      return !!line.product_id && values.includes(line.product_id);
    case "product_type":
      return !!line.type_id && values.includes(line.type_id);
    case "collection":
      return !!line.collection_id && values.includes(line.collection_id);
    case "product_tag":
      return line.tag_ids.some((id) => values.includes(id));
    case "category":
      return line.category_ids.some((id) => values.includes(id));
    case "product_flag":
      return !!rule.key && isFlagSet(line.metadata?.[rule.key]);
    default:
      return false;
  }
}

/** The active consents that apply to these cart lines, in display order. */
export function matchConsents(definitions: readonly ConsentDefinitionData[], lines: readonly CartLine[]): ApplicableConsent[] {
  const result: ApplicableConsent[] = [];
  for (const definition of [...definitions].sort((a, b) => a.position - b.position || a.key.localeCompare(b.key))) {
    if (!definition.active) {
      continue;
    }
    const rules = definition.rules ?? [];
    const always = rules.some((rule) => rule.type === "always");
    const matched = lines.filter((line) => always || rules.some((rule) => ruleMatchesLine(rule, line)));
    if (always || matched.length > 0) {
      result.push({
        definition,
        line_item_ids: matched.map((line) => line.line_item_id),
        product_ids: [...new Set(matched.map((line) => line.product_id).filter((id): id is string => !!id))],
      });
    }
  }
  return result;
}

/** The latest acceptance per key. */
export function latestAcceptances(acceptances: readonly AcceptanceData[]): Map<string, AcceptanceData> {
  const latest = new Map<string, AcceptanceData>();
  for (const acceptance of acceptances) {
    const current = latest.get(acceptance.key);
    if (!current || acceptance.accepted_at.getTime() >= current.accepted_at.getTime()) {
      latest.set(acceptance.key, acceptance);
    }
  }
  return latest;
}

export function evaluateConsents(applicable: readonly ApplicableConsent[], acceptances: readonly AcceptanceData[]): ConsentState[] {
  const latest = latestAcceptances(acceptances);
  return applicable.map(({ definition }) => {
    const accepted = latest.get(definition.key) ?? null;
    const status: ConsentStatus = !accepted ? "missing" : accepted.version === definition.version ? "accepted" : "outdated";
    return {
      accepted_at: accepted?.accepted_at.toISOString() ?? null,
      accepted_version: accepted?.version ?? null,
      key: definition.key,
      required: definition.required,
      status,
      version: definition.version,
    };
  });
}

export type ConsentBlock = { code: "consent_required" | "consent_version_outdated"; keys: string[] } | null;

/**
 * Why a cart cannot be completed, or null. Missing required consents win over
 * outdated ones, because the storefront has to show the checkbox either way and
 * "missing" is the plainer message.
 */
export function consentBlock(states: readonly ConsentState[]): ConsentBlock {
  const required = states.filter((state) => state.required);
  const missing = required.filter((state) => state.status === "missing").map((state) => state.key);
  if (missing.length > 0) {
    return { code: "consent_required", keys: missing };
  }
  const outdated = required.filter((state) => state.status === "outdated").map((state) => state.key);
  return outdated.length > 0 ? { code: "consent_version_outdated", keys: outdated } : null;
}

export function consentText(definition: Pick<ConsentDefinitionData, "label">, locale: string | null, defaultLocale: string): string {
  return pickLocalized(definition.label, locale, defaultLocale) ?? "";
}

/** Keep only well-formed rules; anything else is dropped rather than guessed. */
export function sanitizeRules(input: unknown): ConsentRule[] {
  if (!Array.isArray(input)) {
    return [];
  }
  const rules: ConsentRule[] = [];
  for (const raw of input) {
    const rule = raw as Partial<ConsentRule> | null;
    if (!rule || !(CONSENT_RULE_TYPES as readonly string[]).includes(String(rule.type))) {
      continue;
    }
    if (rule.type === "always") {
      rules.push({ type: "always" });
    } else if (rule.type === "product_flag") {
      const key = typeof rule.key === "string" ? rule.key.trim() : "";
      if (key) {
        rules.push({ key, type: "product_flag" });
      }
    } else {
      const values = (Array.isArray(rule.values) ? rule.values : []).map((value) => String(value).trim()).filter(Boolean);
      if (values.length > 0) {
        rules.push({ type: rule.type as ConsentRuleType, values: [...new Set(values)] });
      }
    }
  }
  return rules;
}

/**
 * Whether an update changes what the customer reads, and so needs a new
 * version: the label in any locale, the link, or the link's label.
 */
export function needsNewVersion(
  current: Pick<ConsentDefinitionData, "label" | "link_url" | "link_label">,
  patch: { label?: unknown; link_url?: unknown; link_label?: unknown },
): boolean {
  const norm = (value: unknown) => JSON.stringify(sanitizeLocalized(value) ?? {}, Object.keys(sanitizeLocalized(value) ?? {}).sort());
  if (patch.label !== undefined && norm(patch.label) !== norm(current.label)) {
    return true;
  }
  if (patch.link_label !== undefined && norm(patch.link_label) !== norm(current.link_label)) {
    return true;
  }
  if (patch.link_url !== undefined && (patch.link_url || null) !== (current.link_url || null)) {
    return true;
  }
  return false;
}

/** The seeded digital content consent, worded after art. 38 ust. 1 pkt 13 (consent and acknowledgement). */
export const DEFAULT_DIGITAL_CONSENT_LABEL: LocalizedText = {
  en: "I consent to the supply of the digital content (code) starting before the withdrawal period ends. I acknowledge that once the digital content has been supplied, I lose my right to withdraw from the contract.",
  pl: "Wyrażam zgodę na rozpoczęcie dostarczania treści cyfrowej (kodu) przed upływem terminu do odstąpienia od umowy. Przyjmuję do wiadomości, że po dostarczeniu treści cyfrowej utracę prawo odstąpienia od umowy.",
};
