/**
 * Writes of operator-entered catalog data: per-product compliance, per-variant
 * unit pricing, economic operators and the settings singleton. Each step
 * compensates by restoring the row it replaced, or deleting the row it created.
 */
import { MedusaError } from "@medusajs/framework/utils";
import { StepResponse, createStep } from "@medusajs/framework/workflows-sdk";
import { CONSUMER_COMPLIANCE_MODULE } from "../../modules/consumer-compliance";
import type ConsumerComplianceModuleService from "../../modules/consumer-compliance/service";
import type { ComplianceSettingsRow } from "../../modules/consumer-compliance/service";

type Row = Record<string, unknown> & { id: string };

interface Undo {
  id: string;
  created: boolean;
  previous: Record<string, unknown> | null;
}

function service(container: { resolve<T>(key: string): T }): ConsumerComplianceModuleService {
  return container.resolve<ConsumerComplianceModuleService>(CONSUMER_COMPLIANCE_MODULE);
}

const WRITABLE_PRODUCT_FIELDS = [
  "gpsr_not_applicable",
  "manufacturer_id",
  "responsible_person_id",
  "product_identifier",
  "warnings",
  "safety_information",
  "no_warnings_required",
  "safety_document_urls",
  "accessibility_notes",
  "omnibus_mode",
  "withdrawal_exception",
] as const;

function pick<T extends Record<string, unknown>>(source: T, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in source) {
      out[key] = source[key];
    }
  }
  return out;
}

export interface UpsertProductComplianceInput {
  product_id: string;
  data: Record<string, unknown>;
}

export const upsertProductComplianceStep = createStep(
  "upsert-product-compliance",
  async (input: UpsertProductComplianceInput, { container }) => {
    const svc = service(container);
    const data = pick(input.data, WRITABLE_PRODUCT_FIELDS);
    for (const key of ["manufacturer_id", "responsible_person_id"] as const) {
      const id = data[key];
      if (typeof id === "string" && id !== "") {
        const [operator] = await svc.listEconomicOperators({ id });
        if (!operator) {
          throw new MedusaError(MedusaError.Types.INVALID_DATA, `Economic operator ${id} does not exist`);
        }
      }
    }
    const [existing] = (await svc.listProductCompliances({ product_id: input.product_id })) as unknown as Row[];
    if (existing) {
      const updated = await svc.updateProductCompliances({ id: existing.id, ...data });
      return new StepResponse<Row, Undo>(updated as unknown as Row, {
        created: false,
        id: existing.id,
        previous: pick(existing, WRITABLE_PRODUCT_FIELDS),
      });
    }
    const created = (await svc.createProductCompliances({ product_id: input.product_id, ...data })) as unknown as Row;
    return new StepResponse<Row, Undo>(created, { created: true, id: created.id, previous: null });
  },
  async (undo, { container }) => {
    if (!undo) {
      return;
    }
    const svc = service(container);
    if (undo.created) {
      await svc.deleteProductCompliances(undo.id);
    } else if (undo.previous) {
      await svc.updateProductCompliances({ id: undo.id, ...undo.previous });
    }
  },
);

const WRITABLE_UNIT_FIELDS = [
  "net_quantity",
  "net_unit",
  "drained_quantity",
  "reference_unit",
  "exempt_reason",
  "deposit_amount",
  "deposit_currency_code",
] as const;

export interface UpsertUnitPricingInput {
  items: { variant_id: string; product_id: string | null; data: Record<string, unknown> }[];
}

export const upsertUnitPricingStep = createStep(
  "upsert-unit-pricing",
  async (input: UpsertUnitPricingInput, { container }) => {
    const svc = service(container);
    const undo: Undo[] = [];
    const rows: Row[] = [];
    const existing = (await svc.listVariantUnitPricings(
      { variant_id: input.items.map((item) => item.variant_id) },
      { take: null },
    )) as unknown as Row[];
    const byVariant = new Map(existing.map((row) => [row.variant_id as string, row]));
    for (const item of input.items) {
      const data = pick(item.data, WRITABLE_UNIT_FIELDS);
      const current = byVariant.get(item.variant_id);
      if (current) {
        rows.push((await svc.updateVariantUnitPricings({ id: current.id, ...data })) as unknown as Row);
        undo.push({ created: false, id: current.id, previous: pick(current, WRITABLE_UNIT_FIELDS) });
      } else {
        const created = (await svc.createVariantUnitPricings({
          product_id: item.product_id,
          variant_id: item.variant_id,
          ...data,
        })) as unknown as Row;
        rows.push(created);
        undo.push({ created: true, id: created.id, previous: null });
      }
    }
    return new StepResponse(rows, undo);
  },
  async (undo, { container }) => {
    if (!undo) {
      return;
    }
    const svc = service(container);
    for (const entry of undo) {
      if (entry.created) {
        await svc.deleteVariantUnitPricings(entry.id);
      } else if (entry.previous) {
        await svc.updateVariantUnitPricings({ id: entry.id, ...entry.previous });
      }
    }
  },
);

const WRITABLE_OPERATOR_FIELDS = ["role", "name", "trade_name", "postal_address", "country_code", "email", "url", "phone"] as const;

export interface UpsertOperatorInput {
  id?: string | null;
  data: Record<string, unknown>;
}

export const upsertEconomicOperatorStep = createStep(
  "upsert-economic-operator",
  async (input: UpsertOperatorInput, { container }) => {
    const svc = service(container);
    const data = pick(input.data, WRITABLE_OPERATOR_FIELDS);
    if (typeof data.country_code === "string") {
      data.country_code = data.country_code.trim().toLowerCase() || null;
    }
    if (input.id) {
      const [current] = (await svc.listEconomicOperators({ id: input.id })) as unknown as Row[];
      if (!current) {
        throw new MedusaError(MedusaError.Types.NOT_FOUND, `Economic operator ${input.id} not found`);
      }
      const updated = (await svc.updateEconomicOperators({ id: input.id, ...data })) as unknown as Row;
      return new StepResponse<Row, Undo>(updated, {
        created: false,
        id: input.id,
        previous: pick(current, WRITABLE_OPERATOR_FIELDS),
      });
    }
    const created = (await svc.createEconomicOperators(data as never)) as unknown as Row;
    return new StepResponse<Row, Undo>(created, { created: true, id: created.id, previous: null });
  },
  async (undo, { container }) => {
    if (!undo) {
      return;
    }
    const svc = service(container);
    if (undo.created) {
      await svc.deleteEconomicOperators(undo.id);
    } else if (undo.previous) {
      await svc.updateEconomicOperators({ id: undo.id, ...undo.previous });
    }
  },
);

/** Refuses to delete an operator that products still reference, rather than leaving them pointing at nothing. */
export const deleteEconomicOperatorStep = createStep(
  "delete-economic-operator",
  async (input: { id: string }, { container }) => {
    const svc = service(container);
    const [current] = (await svc.listEconomicOperators({ id: input.id })) as unknown as Row[];
    if (!current) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Economic operator ${input.id} not found`);
    }
    const [asManufacturer] = await svc.listProductCompliances({ manufacturer_id: input.id }, { take: 1 });
    const [asResponsible] = await svc.listProductCompliances({ responsible_person_id: input.id }, { take: 1 });
    if (asManufacturer || asResponsible) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "This economic operator is still assigned to products. Reassign them first.",
      );
    }
    await svc.softDeleteEconomicOperators(input.id);
    return new StepResponse({ id: input.id, deleted: true }, input.id);
  },
  async (id, { container }) => {
    if (id) {
      await service(container).restoreEconomicOperators(id);
    }
  },
);

const WRITABLE_SETTINGS_FIELDS = [
  "reviews_disclosure",
  "reviews_enabled",
  "personalised_pricing_disclosure",
  "personalised_pricing_used",
  "withdrawal_info",
  "omnibus_note",
] as const;

export const updateComplianceSettingsStep = createStep(
  "update-compliance-settings",
  async (input: Record<string, unknown>, { container }) => {
    const svc = service(container);
    const current = await svc.getSettings();
    const updated = await svc.updateComplianceSettings({ id: current.id, ...pick(input, WRITABLE_SETTINGS_FIELDS) });
    return new StepResponse(updated as unknown as ComplianceSettingsRow, {
      id: current.id,
      previous: pick(current as unknown as Record<string, unknown>, WRITABLE_SETTINGS_FIELDS),
    });
  },
  async (undo, { container }) => {
    if (undo) {
      await service(container).updateComplianceSettings({ id: undo.id, ...undo.previous });
    }
  },
);
