/**
 * Options and shared types for the consumer-compliance module.
 *
 * Every option has a default that matches Polish law as it stood when this
 * plugin was written (see docs/legal.en.mdx). The few options that could make
 * the plugin non-compliant if set carelessly are clamped rather than trusted:
 * the Omnibus window can be widened but never shortened below 30 days, and the
 * withdrawal period can be extended (a store may be more generous than the
 * law) but never set below 14 days.
 */

/** The statutory minimum for the Omnibus look-back window (art. 4 ust. 2 ustawy o informowaniu o cenach). */
export const OMNIBUS_MIN_WINDOW_DAYS = 30;

/** The statutory minimum withdrawal period (art. 27 ustawy o prawach konsumenta). */
export const WITHDRAWAL_MIN_DAYS = 14;

/**
 * How a sequence of price reductions is read.
 *
 * - `per_change` (default, Polish law): every change of the reduced price is a
 *   new reduction measured against the lowest price of the 30 days before it,
 *   which includes the previous promotional price. Poland did not adopt the
 *   option of art. 6a(5) of Directive 98/6/EC, and UOKiK says so explicitly.
 * - `keep_first`: a deeper reduction that follows another one without a break
 *   keeps the reference price of the FIRST step. Only for member states that
 *   adopted art. 6a(5).
 */
export type GradualReductionMode = "keep_first" | "per_change";

/**
 * What counts as an announced reduction.
 *
 * - `sale_price_list` (default): the calculated price comes from a Medusa price
 *   list of type `sale` and is lower than the regular (original) price. This is
 *   what the stock storefront renders as a struck-through price.
 * - `lower_than_original`: any calculated price lower than the original price,
 *   including an `override` price list that undercuts the base price.
 */
export type ReductionDetection = "sale_price_list" | "lower_than_original";

/** One pricing context the price history is recorded for. */
export interface PriceContextOption {
  currency_code: string;
  /** Optional: record the price a customer in this region sees (region price rules applied). */
  region_id?: string | null;
}

export interface ConsumerComplianceModuleOptions {
  omnibus?: {
    /** Look-back window in days. Clamped to at least 30. */
    windowDays?: number;
    gradualReductions?: GradualReductionMode;
    reductionDetection?: ReductionDetection;
    /**
     * Pricing contexts to record. Default: one context per region (its
     * currency and its id), which is what a storefront asks prices in.
     */
    priceContexts?: PriceContextOption[];
    /** Price list ids whose prices are never treated as an announced reduction (for example a B2B list). */
    ignoredPriceListIds?: string[];
    /** Days of closed history to keep. Clamped to at least windowDays + 1. Default 400. */
    retentionDays?: number;
  };
  withdrawal?: {
    /** Withdrawal period in days. Clamped to at least 14. */
    periodDays?: number;
    /**
     * Submissions outside the period are still accepted by default, because the
     * law requires the withdrawal function to be available and the trader to
     * assess the statement. Set to true to refuse them at the API.
     */
    rejectOutsidePeriod?: boolean;
    /**
     * Move a period that ends on a Saturday, Sunday or Polish public holiday to
     * the next working day (art. 115 of the Civil Code). Default true, which is
     * the reading more favourable to the consumer.
     */
    extendOverNonWorkingDays?: boolean;
    /** Order metadata key holding the timestamp of the consumer's consent to immediate digital delivery (art. 38 ust. 1 pkt 13). */
    digitalConsentMetadataKey?: string;
    /** Minutes a step-one request stays confirmable. Default 60. */
    confirmationTtlMinutes?: number;
    /** Notification channel used for the acknowledgement. Default "email". */
    notificationChannel?: string;
    /** Notification template name passed to the provider alongside the rendered content. */
    notificationTemplate?: string;
    /** Optional internal address that receives a copy of every confirmed withdrawal. */
    merchantNotificationEmail?: string | null;
    /** Seller identity printed on the acknowledgement. */
    seller?: {
      name?: string;
      address?: string;
      email?: string;
    };
  };
  /** Locale used when a localised text has no entry for the requested locale. Default "pl". */
  defaultLocale?: string;
}

export interface ResolvedConsumerComplianceOptions {
  omnibus: {
    windowDays: number;
    gradualReductions: GradualReductionMode;
    reductionDetection: ReductionDetection;
    priceContexts: PriceContextOption[] | null;
    ignoredPriceListIds: string[];
    retentionDays: number;
  };
  withdrawal: {
    periodDays: number;
    rejectOutsidePeriod: boolean;
    extendOverNonWorkingDays: boolean;
    digitalConsentMetadataKey: string;
    confirmationTtlMinutes: number;
    notificationChannel: string;
    notificationTemplate: string;
    merchantNotificationEmail: string | null;
    seller: { name: string; address: string; email: string };
  };
  defaultLocale: string;
}

function positiveInt(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export function resolveOptions(options?: ConsumerComplianceModuleOptions | null): ResolvedConsumerComplianceOptions {
  const omnibus = options?.omnibus ?? {};
  const withdrawal = options?.withdrawal ?? {};
  const windowDays = Math.max(OMNIBUS_MIN_WINDOW_DAYS, positiveInt(omnibus.windowDays, OMNIBUS_MIN_WINDOW_DAYS));
  const retentionDays = Math.max(windowDays + 1, positiveInt(omnibus.retentionDays, 400));

  return {
    defaultLocale: (options?.defaultLocale ?? "pl").trim().toLowerCase() || "pl",
    omnibus: {
      gradualReductions: omnibus.gradualReductions === "keep_first" ? "keep_first" : "per_change",
      ignoredPriceListIds: [...new Set(omnibus.ignoredPriceListIds ?? [])],
      priceContexts:
        Array.isArray(omnibus.priceContexts) && omnibus.priceContexts.length > 0
          ? omnibus.priceContexts.map((context) => ({
              currency_code: context.currency_code.trim().toLowerCase(),
              region_id: context.region_id ?? null,
            }))
          : null,
      reductionDetection:
        omnibus.reductionDetection === "lower_than_original" ? "lower_than_original" : "sale_price_list",
      retentionDays,
      windowDays,
    },
    withdrawal: {
      confirmationTtlMinutes: positiveInt(withdrawal.confirmationTtlMinutes, 60),
      digitalConsentMetadataKey: withdrawal.digitalConsentMetadataKey?.trim() || "digital_content_consent_at",
      extendOverNonWorkingDays: withdrawal.extendOverNonWorkingDays !== false,
      merchantNotificationEmail: withdrawal.merchantNotificationEmail?.trim() || null,
      notificationChannel: withdrawal.notificationChannel?.trim() || "email",
      notificationTemplate: withdrawal.notificationTemplate?.trim() || "consumer-compliance-withdrawal-acknowledgement",
      periodDays: Math.max(WITHDRAWAL_MIN_DAYS, positiveInt(withdrawal.periodDays, WITHDRAWAL_MIN_DAYS)),
      rejectOutsidePeriod: withdrawal.rejectOutsidePeriod === true,
      seller: {
        address: withdrawal.seller?.address?.trim() ?? "",
        email: withdrawal.seller?.email?.trim() ?? "",
        name: withdrawal.seller?.name?.trim() ?? "",
      },
    },
  };
}

/** A text kept per locale, for example `{ pl: "...", en: "..." }`. */
export type LocalizedText = Record<string, string>;

/** Stable key for a pricing context: `pln|reg_123` or `pln|*`. */
export function contextKey(context: PriceContextOption): string {
  return `${context.currency_code.trim().toLowerCase()}|${context.region_id ?? "*"}`;
}

export function parseContextKey(key: string): PriceContextOption | null {
  const [currency, region] = key.split("|");
  if (!currency || region === undefined) {
    return null;
  }
  return { currency_code: currency, region_id: region === "*" ? null : region };
}

export const OMNIBUS_MODES = ["standard", "perishable", "exempt"] as const;
export type OmnibusMode = (typeof OMNIBUS_MODES)[number];

/**
 * Statutory exceptions to the right of withdrawal, art. 38 ust. 1 ustawy o
 * prawach konsumenta. Only the ones that can apply to goods or digital content
 * sold by an online shop are listed; services exceptions are out of scope.
 */
export const WITHDRAWAL_EXCEPTIONS = [
  "none",
  "custom_made", // pkt 3
  "perishable", // pkt 4
  "sealed_hygiene", // pkt 5
  "inseparably_mixed", // pkt 6
  "alcohol_market_price", // pkt 7
  "sealed_media", // pkt 9
  "periodicals", // pkt 10
  "digital_content", // pkt 13, only with recorded consent
] as const;
export type WithdrawalException = (typeof WITHDRAWAL_EXCEPTIONS)[number];

export const QUANTITY_UNITS = ["g", "kg", "ml", "l", "cm", "m", "m2", "m3", "piece"] as const;
export type QuantityUnit = (typeof QUANTITY_UNITS)[number];

export const REFERENCE_UNITS = ["auto", "kg", "per_100g", "l", "per_100ml", "m", "m2", "m3", "piece", "per_10_pieces", "per_100_pieces"] as const;
export type ReferenceUnit = (typeof REFERENCE_UNITS)[number];

/** Exemptions from the unit price duty, § 7 of the 2022 price display regulation (Dz.U. 2022 poz. 2776). */
export const UNIT_PRICE_EXEMPTIONS = ["none", "same_as_price", "sold_as_set", "sold_in_pairs", "medicinal_product"] as const;
export type UnitPriceExemption = (typeof UNIT_PRICE_EXEMPTIONS)[number];

export const OPERATOR_ROLES = ["manufacturer", "responsible_person", "importer"] as const;
export type OperatorRole = (typeof OPERATOR_ROLES)[number];

export const WITHDRAWAL_STATUSES = ["pending_confirmation", "confirmed", "processed", "rejected", "expired"] as const;
export type WithdrawalStatus = (typeof WITHDRAWAL_STATUSES)[number];
