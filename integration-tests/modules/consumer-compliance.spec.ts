import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { moduleIntegrationTestRunner } from "@medusajs/test-utils";
import { CONSUMER_COMPLIANCE_MODULE } from "../../src/modules/consumer-compliance";
import type ConsumerComplianceModuleService from "../../src/modules/consumer-compliance/service";
import { COMPLIANCE_SETTINGS_ID, evaluateSeries } from "../../src/modules/consumer-compliance/service";
import type { SeriesDecision } from "../../src/modules/consumer-compliance/service";
import ComplianceSettings from "../../src/modules/consumer-compliance/models/compliance-settings";
import EconomicOperator from "../../src/modules/consumer-compliance/models/economic-operator";
import PriceHistory from "../../src/modules/consumer-compliance/models/price-history";
import ProductCompliance from "../../src/modules/consumer-compliance/models/product-compliance";
import VariantUnitPricing from "../../src/modules/consumer-compliance/models/variant-unit-pricing";
import WithdrawalRequest from "../../src/modules/consumer-compliance/models/withdrawal-request";

const MODULE_PATH = join(__dirname, "../../src/modules/consumer-compliance");

function transition(variantId: string, at: string, amount: number, closeId: string | null, sale = false): SeriesDecision {
  return {
    context_key: "pln|reg_1",
    currency_code: "pln",
    decision: {
      action: "transition",
      at: new Date(at),
      closeId,
      open: {
        amount,
        original_amount: 100,
        price_list_id: sale ? "plist_sale" : null,
        price_list_type: sale ? "sale" : null,
        tax_inclusive: true,
      },
    },
    product_id: "prod_1",
    region_id: "reg_1",
    variant_id: variantId,
  };
}

moduleIntegrationTestRunner<ConsumerComplianceModuleService>({
  dbName: process.env.DB_TEMP_NAME ?? "medusa-consumer-compliance-integration",
  moduleModels: [ComplianceSettings, EconomicOperator, PriceHistory, ProductCompliance, VariantUnitPricing, WithdrawalRequest],
  moduleName: CONSUMER_COMPLIANCE_MODULE,
  moduleOptions: { omnibus: { retentionDays: 60 } },
  pathToMigrations: join(MODULE_PATH, "migrations"),
  resolve: MODULE_PATH,
  testSuite: ({ service }) => {
    describe("settings singleton", () => {
      it("is created once with a fixed id", async () => {
        const first = await service.getSettings();
        const second = await service.getSettings();
        expect(first.id).toBe(COMPLIANCE_SETTINGS_ID);
        expect(second.id).toBe(first.id);
        expect(await service.listComplianceSettings({})).toHaveLength(1);
      });
    });

    describe("price history", () => {
      it("records, closes and evaluates a series", async () => {
        const opened = await service.applyRecordingDecisions([transition("variant_1", "2026-01-01T00:00:00Z", 100, null)], "backfill");
        expect(opened.created_ids).toHaveLength(1);
        const open = await service.getOpenIntervals(["variant_1"]);
        const current = open.get("variant_1|pln|reg_1");
        expect(current?.amount).toBe(100);

        const changed = await service.applyRecordingDecisions(
          [transition("variant_1", "2026-03-01T10:00:00Z", 80, current!.id, true)],
          "event",
        );
        expect(changed).toMatchObject({ changed: 1, closed_ids: [current!.id] });

        const rows = await service.listSeries("variant_1", "pln|reg_1");
        expect(rows.map((row) => [row.amount, row.valid_to?.toISOString() ?? null])).toEqual([
          [100, "2026-03-01T10:00:00.000Z"],
          [80, null],
        ]);
        const evaluation = evaluateSeries(service.resolvedOptions, {
          mode: "standard",
          now: new Date("2026-03-05T00:00:00Z"),
          offeredSince: new Date("2025-12-31T23:00:00Z"),
          rows,
        });
        expect(evaluation).toMatchObject({ is_reduced: true, reduction_percent: 20, reference_price: 100 });
      });

      it("refuses a second open row for the same series", async () => {
        await service.applyRecordingDecisions([transition("variant_2", "2026-01-01T00:00:00Z", 100, null)], "sweep");
        await expect(
          service.applyRecordingDecisions([transition("variant_2", "2026-01-02T00:00:00Z", 90, null)], "sweep"),
        ).rejects.toThrow();
        // The failed transaction left nothing behind.
        expect(await service.listSeries("variant_2", null)).toHaveLength(1);
      });

      it("reverts a recording", async () => {
        const first = await service.applyRecordingDecisions([transition("variant_3", "2026-01-01T00:00:00Z", 100, null)], "sweep");
        const second = await service.applyRecordingDecisions(
          [transition("variant_3", "2026-02-01T00:00:00Z", 90, first.created_ids[0])],
          "sweep",
        );
        await service.revertRecording(second);
        const rows = await service.listSeries("variant_3", null);
        expect(rows).toHaveLength(1);
        expect(rows[0].valid_to).toBeNull();
      });

      it("keeps external windows out of the open rows but in the series", async () => {
        await service.applyRecordingDecisions([transition("variant_4", "2026-01-01T00:00:00Z", 100, null)], "sweep");
        await service.addExternalInterval({
          amount: 85,
          context_key: "pln|reg_1",
          currency_code: "pln",
          note: "Code WEEKEND20",
          product_id: "prod_1",
          region_id: "reg_1",
          valid_from: new Date("2026-02-10T00:00:00Z"),
          valid_to: new Date("2026-02-12T00:00:00Z"),
          variant_id: "variant_4",
        });
        const open = await service.getOpenIntervals(["variant_4"]);
        expect(open.get("variant_4|pln|reg_1")?.amount).toBe(100);
        const rows = await service.listSeries("variant_4", "pln|reg_1");
        expect(rows.map((row) => row.kind)).toEqual(["observed", "external"]);
      });

      it("purges past retention but keeps the open row", async () => {
        const first = await service.applyRecordingDecisions([transition("variant_5", "2025-01-01T00:00:00Z", 100, null)], "sweep");
        await service.applyRecordingDecisions([transition("variant_5", "2025-02-01T00:00:00Z", 120, first.created_ids[0])], "sweep");
        const deleted = await service.purgeVariantHistory("variant_5", new Date("2026-01-01T00:00:00Z"));
        expect(deleted).toBe(1);
        const rows = await service.listSeries("variant_5", null);
        expect(rows).toHaveLength(1);
        expect(rows[0].amount).toBe(120);
      });
    });

    describe("catalog data", () => {
      it("enforces one compliance row per product", async () => {
        await service.createProductCompliances({ product_id: "prod_x" });
        await expect(service.createProductCompliances({ product_id: "prod_x" })).rejects.toThrow();
      });

      it("stores operators, localized texts and unit pricing", async () => {
        const operator = await service.createEconomicOperators({ country_code: "cn", name: "Factory Ltd", role: "manufacturer" });
        const compliance = await service.createProductCompliances({
          manufacturer_id: operator.id,
          product_id: "prod_y",
          warnings: { en: "Keep dry", pl: "Chronić przed wilgocią" },
          withdrawal_exception: "sealed_hygiene",
        });
        expect(compliance.warnings).toEqual({ en: "Keep dry", pl: "Chronić przed wilgocią" });
        const unit = await service.createVariantUnitPricings({ deposit_amount: 0.5, net_quantity: 0.5, net_unit: "l", variant_id: "variant_y" });
        expect(unit).toMatchObject({ deposit_currency_code: "pln", exempt_reason: "none", reference_unit: "auto" });
      });
    });

    describe("withdrawals", () => {
      it("stores a request and its confirmation", async () => {
        const created = await service.createWithdrawalRequests({
          customer_name: "Jan Kowalski",
          email: "jan@example.com",
          items: [{ line_item_id: "item_1", quantity: 1, title: "Kettle" }] as unknown as Record<string, unknown>,
          order_display_id: "1042",
          order_id: "order_1",
          statement: "Odstępuję od umowy.",
        });
        expect(created.status).toBe("pending_confirmation");
        const confirmed = await service.updateWithdrawalRequests({ id: created.id, status: "confirmed", submitted_at: new Date() });
        expect(confirmed.status).toBe("confirmed");
        expect(await service.listWithdrawalRequests({ order_id: "order_1" })).toHaveLength(1);
      });
    });
  },
});
