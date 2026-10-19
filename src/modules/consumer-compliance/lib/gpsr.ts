/**
 * Validation of the product safety information required for distance sales by
 * art. 19 of Regulation (EU) 2023/988 (GPSR), applicable from 13 December 2024.
 *
 * An offer made online must show, clearly and visibly:
 *   (a) the manufacturer's name, registered trade name or trade mark, and the
 *       postal and electronic address at which it can be contacted;
 *   (b) where the manufacturer is not established in the Union, the same for
 *       the responsible person (art. 16(1) GPSR, art. 4 of Regulation 2019/1020);
 *   (c) information identifying the product, including a picture of it, its
 *       type and any other product identifier;
 *   (d) any warning or safety information to be affixed on the product or its
 *       packaging or included in an accompanying document, in a language which
 *       can be easily understood by consumers, as determined by the Member State
 *       where the product is made available (Polish, in Poland).
 *
 * The validator reports what is missing; it never blocks a save, because a
 * half-filled record is still better than none and the admin shows the gaps.
 */
import type { LocalizedText } from "../types";
import { pickLocalized } from "./localized";

/** EU-27 country codes. A manufacturer outside the Union needs a responsible person established in it. */
export const EU_COUNTRY_CODES = new Set([
  "at", "be", "bg", "cy", "cz", "de", "dk", "ee", "es", "fi", "fr", "gr", "hr", "hu", "ie", "it",
  "lt", "lu", "lv", "mt", "nl", "pl", "pt", "ro", "se", "si", "sk",
]);

export interface OperatorData {
  id?: string;
  name: string | null;
  trade_name?: string | null;
  postal_address: string | null;
  country_code: string | null;
  email: string | null;
  url?: string | null;
}

export interface ProductSafetyInput {
  not_applicable: boolean;
  manufacturer: OperatorData | null;
  responsible_person: OperatorData | null;
  /** Type, model, batch or serial, free text. */
  product_identifier: string | null;
  /** True when at least one variant carries a barcode (EAN/GTIN) or SKU. */
  has_variant_identifier: boolean;
  has_image: boolean;
  warnings: LocalizedText | null;
  safety_information: LocalizedText | null;
  /** Explicit statement that the product needs no warnings. */
  no_warnings_required: boolean;
}

export const GPSR_ISSUES = [
  "manufacturer_missing",
  "manufacturer_name_missing",
  "manufacturer_address_missing",
  "manufacturer_contact_missing",
  "manufacturer_country_missing",
  "responsible_person_missing",
  "responsible_person_address_missing",
  "responsible_person_contact_missing",
  "responsible_person_outside_eu",
  "identifier_missing",
  "image_missing",
  "warnings_missing",
  "warnings_not_in_required_language",
] as const;
export type GpsrIssue = (typeof GPSR_ISSUES)[number];

export function isInEu(countryCode: string | null | undefined): boolean {
  return !!countryCode && EU_COUNTRY_CODES.has(countryCode.trim().toLowerCase());
}

function hasContact(operator: OperatorData): boolean {
  return !!(operator.email?.trim() || operator.url?.trim());
}

export function validateProductSafety(input: ProductSafetyInput, requiredLanguage = "pl"): GpsrIssue[] {
  if (input.not_applicable) {
    return [];
  }
  const issues: GpsrIssue[] = [];
  const manufacturer = input.manufacturer;

  if (!manufacturer) {
    issues.push("manufacturer_missing");
  } else {
    if (!manufacturer.name?.trim() && !manufacturer.trade_name?.trim()) {
      issues.push("manufacturer_name_missing");
    }
    if (!manufacturer.postal_address?.trim()) {
      issues.push("manufacturer_address_missing");
    }
    if (!hasContact(manufacturer)) {
      issues.push("manufacturer_contact_missing");
    }
    if (!manufacturer.country_code?.trim()) {
      issues.push("manufacturer_country_missing");
    }
  }

  const needsResponsible = !!manufacturer?.country_code && !isInEu(manufacturer.country_code);
  const responsible = input.responsible_person;
  if (needsResponsible && !responsible) {
    issues.push("responsible_person_missing");
  }
  if (responsible) {
    if (!responsible.postal_address?.trim()) {
      issues.push("responsible_person_address_missing");
    }
    if (!hasContact(responsible)) {
      issues.push("responsible_person_contact_missing");
    }
    if (responsible.country_code && !isInEu(responsible.country_code)) {
      issues.push("responsible_person_outside_eu");
    }
  }

  if (!input.product_identifier?.trim() && !input.has_variant_identifier) {
    issues.push("identifier_missing");
  }
  if (!input.has_image) {
    issues.push("image_missing");
  }

  if (!input.no_warnings_required) {
    const anyWarning = pickLocalized(input.warnings, requiredLanguage, requiredLanguage);
    const anySafety = pickLocalized(input.safety_information, requiredLanguage, requiredLanguage);
    if (!anyWarning && !anySafety) {
      issues.push("warnings_missing");
    } else if (!input.warnings?.[requiredLanguage]?.trim() && !input.safety_information?.[requiredLanguage]?.trim()) {
      issues.push("warnings_not_in_required_language");
    }
  }
  return issues;
}
