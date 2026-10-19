/**
 * Read models shared by the store and admin routes.
 */
import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { CONSUMER_COMPLIANCE_MODULE } from "../../modules/consumer-compliance";
import type ConsumerComplianceModuleService from "../../modules/consumer-compliance/service";
import { toHistoryRow, toInterval } from "../../modules/consumer-compliance/service";
import { evaluateOmnibus, withLiveObservation } from "../../modules/consumer-compliance/lib/omnibus";
import type { OmnibusResult } from "../../modules/consumer-compliance/lib/omnibus";
import { computeUnitPrice } from "../../modules/consumer-compliance/lib/unit-price";
import type { UnitPriceResult, UnitPricingData } from "../../modules/consumer-compliance/lib/unit-price";
import { validateProductSafety } from "../../modules/consumer-compliance/lib/gpsr";
import type { GpsrIssue, OperatorData } from "../../modules/consumer-compliance/lib/gpsr";
import { languageOf, pickLocalized } from "../../modules/consumer-compliance/lib/localized";
import { omnibusLabel } from "../../modules/consumer-compliance/lib/labels";
import type { LocalizedText, OmnibusMode } from "../../modules/consumer-compliance/types";
import { contextKey } from "../../modules/consumer-compliance/types";
import { listVariants, observePrices, resolveContexts } from "../../workflows/lib/catalog";
import type { QueryGraph, ResolvedContext } from "../../workflows/lib/catalog";

export function complianceService(container: MedusaContainer): ConsumerComplianceModuleService {
  return container.resolve<ConsumerComplianceModuleService>(CONSUMER_COMPLIANCE_MODULE);
}

/**
 * The pricing context for a request: a region (its currency) or a bare
 * currency. Matched against the tracked contexts so the history read is the
 * one that was recorded for exactly this view of the price.
 */
export async function resolveRequestContext(
  container: MedusaContainer,
  input: { region_id?: string | null; currency_code?: string | null },
): Promise<ResolvedContext> {
  const service = complianceService(container);
  let currency = input.currency_code?.trim().toLowerCase() || null;
  const regionId = input.region_id?.trim() || null;
  if (regionId) {
    const query = container.resolve<QueryGraph>(ContainerRegistrationKeys.QUERY);
    const { data } = await query.graph({ entity: "region", fields: ["id", "currency_code"], filters: { id: regionId } });
    if (!data[0]) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Region ${regionId} not found`);
    }
    currency = (data[0].currency_code as string).toLowerCase();
  }
  if (!currency) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "region_id or currency_code is required.");
  }
  const tracked = await resolveContexts(container, service.resolvedOptions.omnibus.priceContexts);
  const exact = tracked.find((context) => context.currency_code === currency && (context.region_id ?? null) === regionId);
  const byCurrency = tracked.find((context) => context.currency_code === currency && !context.region_id);
  const anyRegion = tracked.find((context) => context.currency_code === currency);
  const fallback = { currency_code: currency, region_id: regionId };
  return exact ?? byCurrency ?? (regionId ? null : anyRegion) ?? { ...fallback, key: contextKey(fallback) };
}

export interface VariantComplianceView {
  variant_id: string;
  currency_code: string;
  tax_inclusive: boolean | null;
  omnibus: OmnibusResult & { reference_label_text: string | null };
  unit_price: UnitPriceResult | null;
  /** Deposit (kaucja), to show separately from the price; not included in it. */
  deposit: { amount: number; currency_code: string } | null;
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** A unit pricing row with its big-number columns as plain numbers and the raw_ shadows dropped. */
export function normalizeUnitRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (!key.startsWith("raw_")) {
      out[key] = value;
    }
  }
  out.net_quantity = numberOrNull(row.net_quantity);
  out.drained_quantity = numberOrNull(row.drained_quantity);
  out.deposit_amount = numberOrNull(row.deposit_amount);
  return out;
}

function unitData(row: Record<string, unknown> | undefined): UnitPricingData | null {
  if (!row) {
    return null;
  }
  return {
    drained_quantity: row.drained_quantity === null || row.drained_quantity === undefined ? null : Number(row.drained_quantity),
    exempt_reason: (row.exempt_reason as UnitPricingData["exempt_reason"]) ?? "none",
    net_quantity: row.net_quantity === null || row.net_quantity === undefined ? null : Number(row.net_quantity),
    net_unit: (row.net_unit as UnitPricingData["net_unit"]) ?? null,
    reference_unit: (row.reference_unit as UnitPricingData["reference_unit"]) ?? "auto",
  };
}

/** Omnibus and unit price for variants in one context, evaluated against the live price. */
export async function buildVariantViews(
  container: MedusaContainer,
  variantIds: string[],
  context: ResolvedContext,
  locale: string | null,
  externalReductionStartedAt: Date | null = null,
): Promise<VariantComplianceView[]> {
  const service = complianceService(container);
  const now = new Date();
  const variants = await listVariants(container, variantIds);
  const live = await observePrices(container, variants, context);
  const productIds = [...new Set(variants.map((variant) => variant.product_id).filter((id): id is string => !!id))];
  const compliance = productIds.length
    ? ((await service.listProductCompliances({ product_id: productIds }, { take: null })) as unknown as Record<string, unknown>[])
    : [];
  const modes = new Map(compliance.map((row) => [row.product_id as string, row.omnibus_mode as OmnibusMode]));
  const units = variantIds.length
    ? ((await service.listVariantUnitPricings({ variant_id: variantIds }, { take: null })) as unknown as Record<string, unknown>[])
    : [];
  const unitByVariant = new Map(units.map((row) => [row.variant_id as string, normalizeUnitRow(row)]));
  const history = variantIds.length
    ? await service.listPriceHistories(
        { context_key: context.key, variant_id: variantIds },
        { order: { valid_from: "ASC" }, take: null },
      )
    : [];
  const rowsByVariant = new Map<string, Record<string, unknown>[]>();
  for (const row of history as unknown as Record<string, unknown>[]) {
    const id = row.variant_id as string;
    rowsByVariant.set(id, [...(rowsByVariant.get(id) ?? []), row]);
  }
  const rules = service.resolvedOptions.omnibus;
  const language = languageOf(locale) === "en" ? "en" : "pl";

  return variants.map((variant) => {
    const observation = live.get(variant.id) ?? null;
    const recorded = (rowsByVariant.get(variant.id) ?? []).map((row) => toInterval(toHistoryRow(row)));
    const intervals = withLiveObservation(
      recorded,
      observation
        ? {
            amount: observation.amount,
            original_amount: observation.original_amount,
            price_list_id: observation.price_list_id,
            price_list_type: observation.price_list_type,
          }
        : null,
      now,
    );
    const omnibus = evaluateOmnibus({
      externalReductionStartedAt,
      intervals,
      mode: (variant.product_id && modes.get(variant.product_id)) || "standard",
      now,
      offeredSince: variant.created_at,
      rules: {
        gradualReductions: rules.gradualReductions,
        ignoredPriceListIds: rules.ignoredPriceListIds,
        reductionDetection: rules.reductionDetection,
        windowDays: rules.windowDays,
      },
    });
    const data = unitData(unitByVariant.get(variant.id));
    const unit = data ? computeUnitPrice(observation?.amount ?? null, data, language) : null;
    const unitRow = unitByVariant.get(variant.id);
    const depositAmount = unitRow?.deposit_amount === null || unitRow?.deposit_amount === undefined ? null : Number(unitRow.deposit_amount);
    return {
      currency_code: context.currency_code,
      omnibus: { ...omnibus, reference_label_text: omnibusLabel(omnibus.reference_label, locale) },
      tax_inclusive: observation ? observation.tax_inclusive : null,
      deposit:
        depositAmount !== null && depositAmount > 0
          ? { amount: depositAmount, currency_code: (unitRow?.deposit_currency_code as string | null) ?? "pln" }
          : null,
      unit_price: unit,
      variant_id: variant.id,
    };
  });
}

export interface SafetyView {
  applicable: boolean;
  manufacturer: Omit<OperatorData, "id"> | null;
  responsible_person: Omit<OperatorData, "id"> | null;
  product_identifier: string | null;
  variant_identifiers: { variant_id: string; sku: string | null; barcode: string | null; ean: string | null; upc: string | null }[];
  warnings: string | null;
  safety_information: string | null;
  safety_document_urls: string[];
  accessibility_notes: string | null;
}

export interface ProductComplianceBundle {
  product: Record<string, unknown>;
  compliance: Record<string, unknown> | null;
  operators: Record<string, Record<string, unknown>>;
  issues: GpsrIssue[];
}

const PRODUCT_FIELDS = [
  "id",
  "title",
  "status",
  "thumbnail",
  "images.id",
  "sales_channels.id",
  "variants.id",
  "variants.title",
  "variants.sku",
  "variants.barcode",
  "variants.ean",
  "variants.upc",
  "variants.created_at",
];

function operatorView(row: Record<string, unknown> | undefined): Omit<OperatorData, "id"> | null {
  if (!row) {
    return null;
  }
  return {
    country_code: (row.country_code as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    name: (row.name as string | null) ?? null,
    postal_address: (row.postal_address as string | null) ?? null,
    trade_name: (row.trade_name as string | null) ?? null,
    url: (row.url as string | null) ?? null,
  };
}

export async function loadProductBundle(container: MedusaContainer, productId: string): Promise<ProductComplianceBundle | null> {
  const query = container.resolve<QueryGraph>(ContainerRegistrationKeys.QUERY);
  const service = complianceService(container);
  const { data } = await query.graph({ entity: "product", fields: PRODUCT_FIELDS, filters: { id: productId } });
  const product = data[0];
  if (!product) {
    return null;
  }
  const [compliance] = (await service.listProductCompliances({ product_id: productId })) as unknown as Record<string, unknown>[];
  const operatorIds = [compliance?.manufacturer_id, compliance?.responsible_person_id].filter(
    (id): id is string => typeof id === "string" && id !== "",
  );
  const operators = operatorIds.length
    ? ((await service.listEconomicOperators({ id: operatorIds })) as unknown as Record<string, unknown>[])
    : [];
  const byId = Object.fromEntries(operators.map((row) => [row.id as string, row]));
  const variants = (product.variants as Record<string, unknown>[] | null) ?? [];
  const issues = validateProductSafety({
    has_image: !!product.thumbnail || ((product.images as unknown[] | null) ?? []).length > 0,
    has_variant_identifier: variants.some((variant) => !!(variant.barcode || variant.ean || variant.upc || variant.sku)),
    manufacturer: compliance?.manufacturer_id ? (operatorView(byId[compliance.manufacturer_id as string]) as OperatorData | null) : null,
    no_warnings_required: !!compliance?.no_warnings_required,
    not_applicable: !!compliance?.gpsr_not_applicable,
    product_identifier: (compliance?.product_identifier as string | null) ?? null,
    responsible_person: compliance?.responsible_person_id
      ? (operatorView(byId[compliance.responsible_person_id as string]) as OperatorData | null)
      : null,
    safety_information: (compliance?.safety_information as LocalizedText | null) ?? null,
    warnings: (compliance?.warnings as LocalizedText | null) ?? null,
  });
  return { compliance: compliance ?? null, issues, operators: byId, product };
}

export function buildSafetyView(bundle: ProductComplianceBundle, locale: string | null, defaultLocale: string): SafetyView {
  const { compliance, operators, product } = bundle;
  const variants = (product.variants as Record<string, unknown>[] | null) ?? [];
  return {
    accessibility_notes: pickLocalized(compliance?.accessibility_notes as LocalizedText | null, locale, defaultLocale),
    applicable: !compliance?.gpsr_not_applicable,
    manufacturer: compliance?.manufacturer_id ? operatorView(operators[compliance.manufacturer_id as string]) : null,
    product_identifier: (compliance?.product_identifier as string | null) ?? null,
    responsible_person: compliance?.responsible_person_id ? operatorView(operators[compliance.responsible_person_id as string]) : null,
    safety_document_urls: (compliance?.safety_document_urls as string[] | null) ?? [],
    safety_information: pickLocalized(compliance?.safety_information as LocalizedText | null, locale, defaultLocale),
    variant_identifiers: variants.map((variant) => ({
      barcode: (variant.barcode as string | null) ?? null,
      ean: (variant.ean as string | null) ?? null,
      sku: (variant.sku as string | null) ?? null,
      upc: (variant.upc as string | null) ?? null,
      variant_id: variant.id as string,
    })),
    warnings: pickLocalized(compliance?.warnings as LocalizedText | null, locale, defaultLocale),
  };
}

/** Same boundary /store/products enforces: published, and in one of the publishable key's sales channels. */
export function assertStoreVisible(product: Record<string, unknown>, salesChannelIds: string[] | undefined): void {
  const channels = ((product.sales_channels as { id: string }[] | null) ?? []).map((channel) => channel.id);
  const visible =
    product.status === "published" &&
    (!salesChannelIds || salesChannelIds.length === 0 || channels.some((id) => salesChannelIds.includes(id)));
  if (!visible) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Product with id: ${product.id as string} was not found`);
  }
}

/** `?reduction_started_at=ISO` for a reduction that is not a price list (a discount code campaign). */
export function parseExternalReductionStart(value: unknown): Date | null {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "reduction_started_at must be an ISO date.");
  }
  return date;
}
