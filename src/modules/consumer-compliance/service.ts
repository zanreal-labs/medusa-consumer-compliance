import type { Context } from "@medusajs/framework/types";
import { InjectManager, InjectTransactionManager, MedusaContext, MedusaError, MedusaService } from "@medusajs/framework/utils";
import { evaluateOmnibus } from "./lib/omnibus";
import type { OmnibusResult, PriceInterval } from "./lib/omnibus";
import type { OpenInterval, PriceObservation, RecordingDecision } from "./lib/price-recording";
import { isDeletable, retentionCutoff } from "./lib/retention";
import ComplianceSettings from "./models/compliance-settings";
import ConsentAcceptance from "./models/consent-acceptance";
import ConsentDefinition from "./models/consent-definition";
import ConsentVersion from "./models/consent-version";
import OrderConsent from "./models/order-consent";
import { DEFAULT_DIGITAL_CONSENT_LABEL, sanitizeRules } from "./lib/consents";
import type { ConsentDefinitionData } from "./lib/consents";
import EconomicOperator from "./models/economic-operator";
import PriceHistory from "./models/price-history";
import ProductCompliance from "./models/product-compliance";
import VariantUnitPricing from "./models/variant-unit-pricing";
import WithdrawalRequest from "./models/withdrawal-request";
import type { ConsumerComplianceModuleOptions, OmnibusMode, ResolvedConsumerComplianceOptions } from "./types";
import { DIGITAL_CONSENT_KEY, DIGITAL_PRODUCT_FLAG, resolveOptions } from "./types";

export const COMPLIANCE_SETTINGS_ID = "ccset_singleton";

const ORDER_CONSENT_IMMUTABLE =
  "Order consents are an immutable record of what the customer accepted; they cannot be changed or removed.";

type InjectedDependencies = Record<string, unknown>;

export interface PriceHistoryRow {
  id: string;
  variant_id: string;
  product_id: string | null;
  context_key: string;
  currency_code: string;
  region_id: string | null;
  amount: number;
  original_amount: number | null;
  price_list_id: string | null;
  price_list_type: string | null;
  tax_inclusive: boolean;
  valid_from: Date;
  valid_to: Date | null;
  source: "event" | "sweep" | "backfill" | "manual";
  kind: "observed" | "external";
  note: string | null;
}

export interface SeriesDecision {
  variant_id: string;
  product_id: string | null;
  context_key: string;
  currency_code: string;
  region_id: string | null;
  decision: RecordingDecision;
}

export interface ComplianceSettingsRow {
  id: string;
  reviews_disclosure: Record<string, string> | null;
  reviews_enabled: boolean;
  personalised_pricing_disclosure: Record<string, string> | null;
  personalised_pricing_used: boolean;
  withdrawal_info: Record<string, string> | null;
  omnibus_note: Record<string, string> | null;
  consents_seeded: boolean;
}

export function toConsentDefinition(row: Record<string, unknown>): ConsentDefinitionData {
  return {
    active: row.active !== false,
    id: row.id as string,
    key: row.key as string,
    label: (row.label as Record<string, string> | null) ?? {},
    link_label: (row.link_label as Record<string, string> | null) ?? null,
    link_sha256: (row.link_sha256 as string | null) ?? null,
    link_url: (row.link_url as string | null) ?? null,
    position: Number(row.position ?? 0),
    purpose: row.purpose === "digital_content_withdrawal_waiver" ? "digital_content_withdrawal_waiver" : "generic",
    required: row.required !== false,
    rules: sanitizeRules(row.rules),
    version: Number(row.version ?? 1),
  };
}

function num(value: unknown): number {
  return typeof value === "number" ? value : Number(value);
}

function numOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : num(value);
}

function toDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(value as string);
}

export function toHistoryRow(row: Record<string, unknown>): PriceHistoryRow {
  return {
    amount: num(row.amount),
    context_key: row.context_key as string,
    currency_code: row.currency_code as string,
    id: row.id as string,
    kind: row.kind === "external" ? "external" : "observed",
    note: (row.note as string | null) ?? null,
    original_amount: numOrNull(row.original_amount),
    price_list_id: (row.price_list_id as string | null) ?? null,
    price_list_type: (row.price_list_type as string | null) ?? null,
    product_id: (row.product_id as string | null) ?? null,
    region_id: (row.region_id as string | null) ?? null,
    source: row.source as PriceHistoryRow["source"],
    tax_inclusive: !!row.tax_inclusive,
    valid_from: toDate(row.valid_from),
    valid_to: row.valid_to ? toDate(row.valid_to) : null,
    variant_id: row.variant_id as string,
  };
}

export function toInterval(row: PriceHistoryRow): PriceInterval {
  return {
    amount: row.amount,
    kind: row.kind,
    original_amount: row.original_amount,
    price_list_id: row.price_list_id,
    price_list_type: row.price_list_type,
    valid_from: row.valid_from,
    valid_to: row.valid_to,
  };
}

/** Omnibus evaluation of one recorded series with the configured rules. */
export function evaluateSeries(
  options: ResolvedConsumerComplianceOptions,
  input: { rows: PriceHistoryRow[]; mode: OmnibusMode; offeredSince: Date | null; now?: Date },
): OmnibusResult {
  const omnibus = options.omnibus;
  return evaluateOmnibus({
    intervals: input.rows.map(toInterval),
    mode: input.mode,
    now: input.now ?? new Date(),
    offeredSince: input.offeredSince,
    rules: {
      gradualReductions: omnibus.gradualReductions,
      ignoredPriceListIds: omnibus.ignoredPriceListIds,
      reductionDetection: omnibus.reductionDetection,
      windowDays: omnibus.windowDays,
    },
  });
}

/**
 * The module service. Like the sibling plugins it knows nothing about other
 * Medusa modules: resolving variants, prices and orders is the workflows' job.
 */
class ConsumerComplianceModuleService extends MedusaService({
  ComplianceSettings,
  ConsentAcceptance,
  ConsentDefinition,
  ConsentVersion,
  EconomicOperator,
  OrderConsent,
  PriceHistory,
  ProductCompliance,
  VariantUnitPricing,
  WithdrawalRequest,
}) {
  protected readonly options_: ResolvedConsumerComplianceOptions;

  constructor(container: InjectedDependencies, options?: ConsumerComplianceModuleOptions) {
    super(...arguments);
    this.options_ = resolveOptions(options);
  }

  /** The plugin options from `medusa-config.ts`, with defaults applied and legal minimums enforced. */
  get resolvedOptions(): ResolvedConsumerComplianceOptions {
    return this.options_;
  }

  // ─── Settings singleton ───

  @InjectManager()
  async getSettings(@MedusaContext() sharedContext: Context = {}): Promise<ComplianceSettingsRow> {
    const [existing] = await this.listComplianceSettings({ id: COMPLIANCE_SETTINGS_ID }, {}, sharedContext);
    if (existing) {
      return existing as unknown as ComplianceSettingsRow;
    }
    try {
      const created = await this.createComplianceSettings({ id: COMPLIANCE_SETTINGS_ID }, sharedContext);
      return created as unknown as ComplianceSettingsRow;
    } catch {
      // A concurrent first read won the insert; read the winner's row.
      const [winner] = await this.listComplianceSettings({ id: COMPLIANCE_SETTINGS_ID }, {}, sharedContext);
      return winner as unknown as ComplianceSettingsRow;
    }
  }

  // ─── Checkout consents ───

  /**
   * Create the default consents once: the digital content consent of art. 38
   * ust. 1 pkt 13, required, matching products flagged `is_digital_content`.
   * A flag in the settings row makes this a one-off, so an operator who
   * deletes or edits it is never overridden.
   */
  @InjectManager()
  async ensureDefaultConsents(@MedusaContext() sharedContext: Context = {}): Promise<void> {
    const settings = await this.getSettings(sharedContext);
    if (settings.consents_seeded) {
      return;
    }
    const [existing] = await this.listConsentDefinitions({ key: DIGITAL_CONSENT_KEY }, { withDeleted: true }, sharedContext);
    if (!existing) {
      try {
        const created = await this.createConsentDefinitions(
          {
            active: true,
            key: DIGITAL_CONSENT_KEY,
            label: DEFAULT_DIGITAL_CONSENT_LABEL,
            position: 0,
            purpose: "digital_content_withdrawal_waiver",
            required: true,
            rules: [{ key: DIGITAL_PRODUCT_FLAG, type: "product_flag" }] as unknown as Record<string, unknown>,
            version: 1,
          },
          sharedContext,
        );
        await this.createConsentVersions(
          { consent_id: created.id, key: DIGITAL_CONSENT_KEY, label: DEFAULT_DIGITAL_CONSENT_LABEL, version: 1 },
          sharedContext,
        );
      } catch {
        // A concurrent first call created it.
      }
    }
    await this.updateComplianceSettings({ consents_seeded: true, id: settings.id }, sharedContext);
  }

  @InjectManager()
  async listConsentDefinitionData(
    filters: Record<string, unknown> = {},
    @MedusaContext() sharedContext: Context = {},
  ): Promise<ConsentDefinitionData[]> {
    await this.ensureDefaultConsents(sharedContext);
    const rows = await this.listConsentDefinitions(filters, { order: { position: "ASC" }, take: null }, sharedContext);
    return rows.map((row) => toConsentDefinition(row as unknown as Record<string, unknown>));
  }

  // ─── Price history ───

  /** The open (current) rows for these variants, keyed `variant_id|context_key`. */
  @InjectManager()
  async getOpenIntervals(
    variantIds: string[],
    @MedusaContext() sharedContext: Context = {},
  ): Promise<Map<string, OpenInterval & { context_key: string; variant_id: string }>> {
    const result = new Map<string, OpenInterval & { context_key: string; variant_id: string }>();
    if (variantIds.length === 0) {
      return result;
    }
    const rows = await this.listPriceHistories({ kind: "observed", valid_to: null, variant_id: variantIds }, { take: null }, sharedContext);
    for (const raw of rows) {
      const row = toHistoryRow(raw as unknown as Record<string, unknown>);
      result.set(`${row.variant_id}|${row.context_key}`, {
        amount: row.amount,
        context_key: row.context_key,
        id: row.id,
        original_amount: row.original_amount,
        price_list_id: row.price_list_id,
        valid_from: row.valid_from,
        variant_id: row.variant_id,
      });
    }
    return result;
  }

  @InjectManager()
  async applyRecordingDecisions(
    decisions: SeriesDecision[],
    source: PriceHistoryRow["source"],
    @MedusaContext() sharedContext: Context = {},
  ): Promise<{ changed: number; created_ids: string[]; closed_ids: string[] }> {
    return await this.applyRecordingDecisions_(decisions, source, sharedContext);
  }

  /**
   * Apply recording decisions in one transaction: close the old row, open the
   * new one. Returns what was written, so a workflow can compensate it.
   */
  @InjectTransactionManager()
  protected async applyRecordingDecisions_(
    decisions: SeriesDecision[],
    source: PriceHistoryRow["source"],
    @MedusaContext() sharedContext: Context = {},
  ): Promise<{ changed: number; created_ids: string[]; closed_ids: string[] }> {
    const transitions = decisions.filter(
      (item): item is SeriesDecision & { decision: Extract<RecordingDecision, { action: "transition" }> } =>
        item.decision.action === "transition",
    );
    const closes = transitions
      .filter((item) => item.decision.closeId)
      .map((item) => ({ id: item.decision.closeId as string, valid_to: item.decision.at }));
    if (closes.length > 0) {
      await this.updatePriceHistories(closes, sharedContext);
      // The ORM's unit of work flushes inserts before updates. Without an
      // explicit flush here the new open row would reach the database while
      // the old one is still open, and the partial unique index (one open row
      // per series) would reject the whole transaction.
      await (sharedContext.transactionManager as { flush?: () => Promise<void> } | undefined)?.flush?.();
    }
    const opens = transitions
      .filter((item) => item.decision.open)
      .map((item) => {
        const open = item.decision.open as PriceObservation;
        return {
          amount: open.amount,
          context_key: item.context_key,
          currency_code: item.currency_code,
          original_amount: open.original_amount,
          price_list_id: open.price_list_id,
          price_list_type: open.price_list_type,
          product_id: item.product_id,
          region_id: item.region_id,
          source,
          tax_inclusive: open.tax_inclusive,
          valid_from: item.decision.at,
          variant_id: item.variant_id,
        };
      });
    const created = opens.length > 0 ? await this.createPriceHistories(opens, sharedContext) : [];
    const created_ids = (created as unknown as { id: string }[]).map((row) => row.id);
    const closed_ids = closes.map((close) => close.id);
    return { changed: decisions.filter((item) => item.decision.action === "transition").length, closed_ids, created_ids };
  }

  @InjectManager()
  async addExternalInterval(
    input: {
      variant_id: string;
      product_id: string | null;
      context_key: string;
      currency_code: string;
      region_id: string | null;
      amount: number;
      valid_from: Date;
      valid_to: Date;
      note: string | null;
    },
    @MedusaContext() sharedContext: Context = {},
  ): Promise<PriceHistoryRow> {
    return await this.addExternalInterval_(input, sharedContext);
  }

  /**
   * Record a closed external price window (for example a discount code
   * campaign) so it counts towards later reference prices.
   */
  @InjectTransactionManager()
  protected async addExternalInterval_(
    input: {
      variant_id: string;
      product_id: string | null;
      context_key: string;
      currency_code: string;
      region_id: string | null;
      amount: number;
      valid_from: Date;
      valid_to: Date;
      note: string | null;
    },
    @MedusaContext() sharedContext: Context = {},
  ): Promise<PriceHistoryRow> {
    const created = await this.createPriceHistories(
      {
        ...input,
        kind: "external",
        original_amount: null,
        price_list_id: null,
        price_list_type: null,
        source: "manual",
        tax_inclusive: false,
      },
      sharedContext,
    );
    return toHistoryRow(created as unknown as Record<string, unknown>);
  }

  @InjectManager()
  async revertRecording(
    applied: { created_ids: string[]; closed_ids: string[] },
    @MedusaContext() sharedContext: Context = {},
  ): Promise<void> {
    return await this.revertRecording_(applied, sharedContext);
  }

  /** Compensation for `applyRecordingDecisions`: drop the opened rows and reopen the closed ones. */
  @InjectTransactionManager()
  protected async revertRecording_(
    applied: { created_ids: string[]; closed_ids: string[] },
    @MedusaContext() sharedContext: Context = {},
  ): Promise<void> {
    if (applied.created_ids.length > 0) {
      await this.deletePriceHistories(applied.created_ids, sharedContext);
    }
    for (const id of applied.closed_ids) {
      await this.updatePriceHistories({ id, valid_to: null }, sharedContext);
    }
  }

  @InjectManager()
  async listSeries(
    variantId: string,
    contextKey: string | null,
    @MedusaContext() sharedContext: Context = {},
  ): Promise<PriceHistoryRow[]> {
    const filters: Record<string, unknown> = { variant_id: variantId };
    if (contextKey) {
      filters.context_key = contextKey;
    }
    const rows = await this.listPriceHistories(filters, { order: { valid_from: "ASC" }, take: null }, sharedContext);
    return rows.map((row) => toHistoryRow(row as unknown as Record<string, unknown>));
  }

  @InjectManager()
  async purgeVariantHistory(
    variantId: string,
    now: Date,
    @MedusaContext() sharedContext: Context = {},
  ): Promise<number> {
    return await this.purgeVariantHistory_(variantId, now, sharedContext);
  }

  /**
   * Delete closed rows past retention, keeping whatever a running reduction
   * still needs. Works one variant at a time so a large catalog never loads
   * its whole history at once. Returns the number of rows deleted.
   */
  @InjectTransactionManager()
  protected async purgeVariantHistory_(
    variantId: string,
    now: Date,
    @MedusaContext() sharedContext: Context = {},
  ): Promise<number> {
    const rows = (
      await this.listPriceHistories({ variant_id: variantId }, { order: { valid_from: "ASC" }, take: null }, sharedContext)
    ).map((row) => toHistoryRow(row as unknown as Record<string, unknown>));
    const byContext = new Map<string, PriceHistoryRow[]>();
    for (const row of rows) {
      byContext.set(row.context_key, [...(byContext.get(row.context_key) ?? []), row]);
    }
    const toDelete: string[] = [];
    for (const series of byContext.values()) {
      const evaluation = evaluateSeries(this.options_, { mode: "standard", now, offeredSince: null, rows: series });
      const cutoff = retentionCutoff({
        now,
        reductionStartedAt: evaluation.reduction_started_at ? new Date(evaluation.reduction_started_at) : null,
        retentionDays: this.options_.omnibus.retentionDays,
        windowDays: this.options_.omnibus.windowDays,
      });
      toDelete.push(...series.filter((row) => isDeletable(row, cutoff)).map((row) => row.id));
    }
    if (toDelete.length > 0) {
      await this.deletePriceHistories(toDelete, sharedContext);
    }
    return toDelete.length;
  }

  // ─── Immutability guard for order consents ───
  // Arrow properties, not methods: MedusaService declares the generated
  // mutators as properties (see medusa-product-costs for the TS2425 detail).
  updateOrderConsents = async (..._args: unknown[]): Promise<never> => {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, ORDER_CONSENT_IMMUTABLE);
  };

  deleteOrderConsents = async (..._args: unknown[]): Promise<never> => {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, ORDER_CONSENT_IMMUTABLE);
  };

  softDeleteOrderConsents = async (..._args: unknown[]): Promise<never> => {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, ORDER_CONSENT_IMMUTABLE);
  };

  restoreOrderConsents = async (..._args: unknown[]): Promise<never> => {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, ORDER_CONSENT_IMMUTABLE);
  };
}

export default ConsumerComplianceModuleService;
