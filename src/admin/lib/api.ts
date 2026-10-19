import { sdk } from "./sdk";

export type Localized = Record<string, string> | null;

export interface Operator {
  id: string;
  role: "manufacturer" | "responsible_person" | "importer";
  name: string;
  trade_name: string | null;
  postal_address: string | null;
  country_code: string | null;
  email: string | null;
  url: string | null;
  phone: string | null;
}

export interface ProductCompliance {
  id: string;
  product_id: string;
  gpsr_not_applicable: boolean;
  manufacturer_id: string | null;
  responsible_person_id: string | null;
  product_identifier: string | null;
  warnings: Localized;
  safety_information: Localized;
  no_warnings_required: boolean;
  safety_document_urls: string[] | null;
  accessibility_notes: Localized;
  omnibus_mode: "standard" | "perishable" | "exempt";
  withdrawal_exception: string;
}

export interface UnitPricing {
  variant_id: string;
  net_quantity: number | null;
  net_unit: string | null;
  drained_quantity: number | null;
  reference_unit: string;
  exempt_reason: string;
  deposit_amount: number | null;
  deposit_currency_code: string;
}

export interface ProductComplianceResponse {
  product_id: string;
  compliance: ProductCompliance | null;
  gpsr_issues: string[];
  operators: Record<string, Operator>;
  variants: {
    variant_id: string;
    title: string;
    sku: string | null;
    unit_pricing: UnitPricing | null;
    unit_pricing_issues: string[];
    unit_price_per_10: { amount: number; reference_label: string } | null;
  }[];
}

export interface HistoryRow {
  id: string;
  amount: number;
  original_amount: number | null;
  price_list_id: string | null;
  price_list_type: string | null;
  valid_from: string;
  valid_to: string | null;
  source: string;
  kind: "observed" | "external";
  note: string | null;
  currency_code: string;
}

export interface OmnibusEvaluation {
  status: "ok" | "no_price" | "exempt";
  current_amount: number | null;
  original_amount: number | null;
  is_reduced: boolean;
  reduction_started_at: string | null;
  reference_price: number | null;
  reference_label: "lowest_30_days" | "lowest_since_introduction" | "price_before_reduction" | null;
  window_start: string | null;
  window_end: string | null;
  offered_less_than_window: boolean;
  history_incomplete: boolean;
  reduction_percent: number | null;
  reference_not_higher: boolean;
  lowest_price_in_window: number | null;
  reason: string | null;
}

export interface PriceHistoryResponse {
  variant_id: string;
  context_key: string | null;
  contexts: string[];
  history: HistoryRow[];
  evaluation: OmnibusEvaluation;
  retention_days: number;
}

export interface Settings {
  reviews_disclosure: Localized;
  reviews_enabled: boolean;
  personalised_pricing_disclosure: Localized;
  personalised_pricing_used: boolean;
  withdrawal_info: Localized;
  omnibus_note: Localized;
}

export interface Withdrawal {
  id: string;
  order_id: string;
  order_display_id: string;
  customer_name: string;
  email: string;
  status: "pending_confirmation" | "confirmed" | "processed" | "rejected" | "expired";
  whole_order: boolean;
  items: { line_item_id: string; title: string; quantity: number }[];
  statement: string;
  reason: string | null;
  submitted_at: string | null;
  deadline_at: string | null;
  within_period: boolean;
  acknowledgement_sent_at: string | null;
  acknowledgement_error: string | null;
  handled_at: string | null;
  internal_note: string | null;
  /** Assessment snapshot taken at step one. */
  assessment: { digital_consent_missing?: boolean } | null;
}

const BASE = "/admin/consumer-compliance";

export const api = {
  backfill: () => sdk.client.fetch<{ started: boolean }>(`${BASE}/price-history/backfill`, { method: "POST" }),
  deleteOperator: (id: string) => sdk.client.fetch(`${BASE}/operators/${id}`, { method: "DELETE" }),
  gpsrReport: (offset: number) =>
    sdk.client.fetch<{ products: { id: string; title: string; issues: string[]; not_applicable: boolean }[]; has_more: boolean; next_offset: number }>(
      `${BASE}/gpsr-report`,
      { query: { offset } },
    ),
  operators: () => sdk.client.fetch<{ operators: Operator[] }>(`${BASE}/operators`),
  priceHistory: (variantId: string, contextKey?: string | null) =>
    sdk.client.fetch<PriceHistoryResponse>(`${BASE}/variants/${variantId}/price-history`, {
      query: contextKey ? { context_key: contextKey } : {},
    }),
  addExternalPrice: (variantId: string, body: { context_key: string; amount: number; valid_from: string; valid_to: string; note?: string | null }) =>
    sdk.client.fetch(`${BASE}/variants/${variantId}/price-history/external`, { body, method: "POST" }),
  product: (productId: string) => sdk.client.fetch<ProductComplianceResponse>(`${BASE}/products/${productId}`),
  resendAcknowledgement: (id: string) => sdk.client.fetch<{ withdrawal: Withdrawal }>(`${BASE}/withdrawals/${id}/resend`, { method: "POST" }),
  saveOperator: (body: Partial<Operator>, id?: string) =>
    sdk.client.fetch<{ operator: Operator }>(id ? `${BASE}/operators/${id}` : `${BASE}/operators`, { body, method: "POST" }),
  saveProduct: (productId: string, body: Partial<ProductCompliance>) =>
    sdk.client.fetch(`${BASE}/products/${productId}`, { body, method: "POST" }),
  saveSettings: (body: Partial<Settings>) => sdk.client.fetch<{ settings: Settings }>(`${BASE}/settings`, { body, method: "POST" }),
  saveUnitPricing: (productId: string, variants: Partial<UnitPricing>[]) =>
    sdk.client.fetch(`${BASE}/products/${productId}/unit-pricing`, { body: { variants }, method: "POST" }),
  settings: () => sdk.client.fetch<{ settings: Settings; options: Record<string, unknown> }>(`${BASE}/settings`),
  updateWithdrawal: (id: string, body: { status: "processed" | "rejected" | "confirmed"; note?: string | null }) =>
    sdk.client.fetch<{ withdrawal: Withdrawal }>(`${BASE}/withdrawals/${id}`, { body, method: "POST" }),
  withdrawals: (query: Record<string, string | number>) =>
    sdk.client.fetch<{ withdrawals: Withdrawal[]; count: number; offset: number; limit: number }>(`${BASE}/withdrawals`, { query }),
};

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
