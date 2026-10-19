import { z } from "@medusajs/framework/zod";
import {
  CONSENT_PURPOSES,
  CONSENT_RULE_TYPES,
  OMNIBUS_MODES,
  OPERATOR_ROLES,
  QUANTITY_UNITS,
  REFERENCE_UNITS,
  UNIT_PRICE_EXEMPTIONS,
  WITHDRAWAL_EXCEPTIONS,
} from "../../modules/consumer-compliance/types";

const localized = z.record(z.string().min(2).max(8), z.string().max(20000)).nullable().optional();
const nullableText = (max: number) => z.string().max(max).nullable().optional();

export const ProductComplianceBody = z.object({
  accessibility_notes: localized,
  gpsr_not_applicable: z.boolean().optional(),
  manufacturer_id: z.string().nullable().optional(),
  no_warnings_required: z.boolean().optional(),
  omnibus_mode: z.enum(OMNIBUS_MODES).optional(),
  product_identifier: nullableText(500),
  responsible_person_id: z.string().nullable().optional(),
  safety_document_urls: z.array(z.string().url().max(2000)).max(50).nullable().optional(),
  safety_information: localized,
  warnings: localized,
  withdrawal_exception: z.enum(WITHDRAWAL_EXCEPTIONS).optional(),
});
export type ProductComplianceBodyType = z.infer<typeof ProductComplianceBody>;

export const UnitPricingBody = z.object({
  variants: z
    .array(
      z.object({
        deposit_amount: z.number().nonnegative().max(1000).nullable().optional(),
        deposit_currency_code: z.string().length(3).optional(),
        drained_quantity: z.number().positive().nullable().optional(),
        exempt_reason: z.enum(UNIT_PRICE_EXEMPTIONS).optional(),
        net_quantity: z.number().positive().nullable().optional(),
        net_unit: z.enum(QUANTITY_UNITS).nullable().optional(),
        reference_unit: z.enum(REFERENCE_UNITS).optional(),
        variant_id: z.string().min(1),
      }),
    )
    .min(1)
    .max(500),
});
export type UnitPricingBodyType = z.infer<typeof UnitPricingBody>;

export const OperatorBody = z.object({
  country_code: z.string().length(2).nullable().optional(),
  email: z.string().email().max(320).nullable().optional(),
  name: z.string().min(1).max(500),
  phone: nullableText(100),
  postal_address: nullableText(2000),
  role: z.enum(OPERATOR_ROLES),
  trade_name: nullableText(500),
  url: z.string().url().max(2000).nullable().optional(),
});
export type OperatorBodyType = z.infer<typeof OperatorBody>;

export const SettingsBody = z.object({
  omnibus_note: localized,
  personalised_pricing_disclosure: localized,
  personalised_pricing_used: z.boolean().optional(),
  reviews_disclosure: localized,
  reviews_enabled: z.boolean().optional(),
  withdrawal_info: localized,
});
export type SettingsBodyType = z.infer<typeof SettingsBody>;

export const WithdrawalStatusBody = z.object({
  note: z.string().max(5000).nullable().optional(),
  status: z.enum(["processed", "rejected", "confirmed"]),
});
export type WithdrawalStatusBodyType = z.infer<typeof WithdrawalStatusBody>;

const orderReference = {
  display_id: z.union([z.string().max(20), z.number().int().positive()]).optional(),
  email: z.string().email().max(320).optional(),
  order_id: z.string().max(100).optional(),
};

export const WithdrawalLookupBody = z.object(orderReference);
export type WithdrawalLookupBodyType = z.infer<typeof WithdrawalLookupBody>;

export const WithdrawalRequestBody = z.object({
  ...orderReference,
  contact_email: z.string().email().max(320),
  customer_name: z.string().min(1).max(300),
  items: z
    .array(z.object({ line_item_id: z.string().min(1), quantity: z.number().int().positive() }))
    .max(200)
    .optional(),
  locale: z.string().max(20).optional(),
  reason: z.string().max(5000).optional(),
  statement: z.string().max(5000).optional(),
});
export type WithdrawalRequestBodyType = z.infer<typeof WithdrawalRequestBody>;

export const WithdrawalConfirmBody = z.object({ token: z.string().min(10).max(200) });
export type WithdrawalConfirmBodyType = z.infer<typeof WithdrawalConfirmBody>;

export const ExternalPriceBody = z.object({
  amount: z.number().nonnegative(),
  context_key: z.string().min(3).max(200),
  note: z.string().max(1000).nullable().optional(),
  valid_from: z.coerce.date(),
  valid_to: z.coerce.date(),
});
export type ExternalPriceBodyType = z.infer<typeof ExternalPriceBody>;

export const ConsentAcceptanceBody = z.object({
  acceptances: z.array(z.object({ key: z.string().min(1).max(64), version: z.number().int().positive() })).min(1).max(50),
  locale: z.string().max(20).optional(),
});
export type ConsentAcceptanceBodyType = z.infer<typeof ConsentAcceptanceBody>;

const consentRule = z.object({
  key: z.string().max(100).optional(),
  type: z.enum(CONSENT_RULE_TYPES),
  values: z.array(z.string().max(100)).max(500).optional(),
});

export const ConsentDefinitionBody = z.object({
  active: z.boolean().optional(),
  key: z.string().regex(/^[a-z0-9_]{2,64}$/u).optional(),
  label: z.record(z.string().min(2).max(8), z.string().max(5000)).optional(),
  link_label: localized,
  link_url: z.string().url().max(2000).nullable().optional(),
  position: z.number().int().min(0).max(1000).optional(),
  purpose: z.enum(CONSENT_PURPOSES).optional(),
  required: z.boolean().optional(),
  rules: z.array(consentRule).max(50).optional(),
});
export type ConsentDefinitionBodyType = z.infer<typeof ConsentDefinitionBody>;
