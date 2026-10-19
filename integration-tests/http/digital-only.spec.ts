import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import type { MedusaContainer } from "@medusajs/framework/types";
import {
  createApiKeysWorkflow,
  createOrderWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
} from "@medusajs/medusa/core-flows";

// Read by integration-tests/app/medusa-config.ts when the app boots below.
process.env.CC_TEST_DIGITAL_ONLY = "true";

/**
 * A store that sells only ESD licence keys (`withdrawal.digitalOnly`): the
 * withdrawal right depends on whether the order recorded the consumer's
 * consent to immediate supply (art. 38 ust. 1 pkt 13).
 */
async function seed(container: MedusaContainer) {
  const { result: channels } = await createSalesChannelsWorkflow(container).run({ input: { salesChannelsData: [{ name: "Web" }] } });
  const { result: keys } = await createApiKeysWorkflow(container).run({
    input: { api_keys: [{ created_by: "test", title: "Storefront", type: "publishable" }] },
  });
  await linkSalesChannelsToApiKeyWorkflow(container).run({ input: { add: [channels[0].id], id: keys[0].id } });
  const { result: regions } = await createRegionsWorkflow(container).run({
    input: { regions: [{ countries: ["pl"], currency_code: "pln", name: "Polska" }] },
  });
  const { result: products } = await createProductsWorkflow(container).run({
    input: {
      products: [
        {
          options: [{ title: "Term", values: ["1 year"] }],
          sales_channels: [{ id: channels[0].id }],
          status: "published",
          title: "Antivirus licence",
          variants: [
            { manage_inventory: false, options: { Term: "1 year" }, prices: [{ amount: 99, currency_code: "pln" }], sku: "AV-1Y", title: "1 year" },
          ],
        },
      ],
    },
  });
  const order = async (email: string, metadata: Record<string, unknown> | undefined) =>
    (
      await createOrderWorkflow(container).run({
        input: {
          email,
          items: [{ quantity: 1, requires_shipping: false, title: "Antivirus licence", unit_price: 99, variant_id: products[0].variants[0].id }],
          metadata,
          region_id: regions[0].id,
          sales_channel_id: channels[0].id,
        },
      })
    ).result;
  return { key: keys[0], order };
}

medusaIntegrationTestRunner({
  cwd: join(__dirname, "../app"),
  dbName: process.env.DB_HTTP_DIGITAL_TEMP_NAME ?? "cc_http_digital_integration",
  inApp: true,
  testSuite: ({ api, getContainer }) => {
    describe("digital-only store", () => {
      it("answers 'no right of withdrawal' with consent, and keeps the 14-day right without it", async () => {
        const container = getContainer();
        const { key, order } = await seed(container);
        const store = { headers: { "x-publishable-api-key": key.token } };

        const consented = await order("anna@example.com", { digital_content_consent_at: "2026-10-01T09:59:00.000Z" });
        const excluded = await api.post(
          "/store/consumer-compliance/withdrawals/lookup",
          { display_id: consented.display_id, email: "anna@example.com" },
          store,
        );
        expect(excluded.data.assessment).toMatchObject({
          any_eligible: false,
          digital_consent_missing: false,
          right_of_withdrawal: "excluded_digital_consent",
        });
        expect(excluded.data.assessment.legal_basis.pl).toContain("Art. 38 ust. 1 pkt 13");
        const refused = await api
          .post(
            "/store/consumer-compliance/withdrawals",
            { contact_email: "anna@example.com", customer_name: "Anna Nowak", display_id: consented.display_id, email: "anna@example.com" },
            store,
          )
          .catch((error: { response: { status: number; data: { message: string } } }) => error.response);
        expect(refused.status).toBe(400);
        expect(refused.data.message).toContain("No right of withdrawal");

        const noConsent = await order("jan@example.com", undefined);
        const applies = await api.post(
          "/store/consumer-compliance/withdrawals/lookup",
          { display_id: noConsent.display_id, email: "jan@example.com" },
          store,
        );
        expect(applies.data.assessment).toMatchObject({ digital_consent_missing: true, right_of_withdrawal: "applies" });
        expect(applies.data.assessment.items[0]).toMatchObject({ basis: "contract_conclusion", eligible: true, within_period: true });

        const requested = await api.post(
          "/store/consumer-compliance/withdrawals",
          { contact_email: "jan@example.com", customer_name: "Jan Kowalski", display_id: noConsent.display_id, email: "jan@example.com" },
          store,
        );
        await api.post(
          `/store/consumer-compliance/withdrawals/${requested.data.withdrawal.id}/confirm`,
          { token: requested.data.confirmation_token },
          store,
        );
        // The admin register reads the flag from the stored assessment.
        const service = container.resolve("consumerCompliance") as {
          listWithdrawalRequests: (filters: Record<string, unknown>) => Promise<{ status: string; assessment: { digital_consent_missing: boolean } }[]>;
        };
        const [stored] = await service.listWithdrawalRequests({ order_id: noConsent.id });
        expect(stored.status).toBe("confirmed");
        expect(stored.assessment.digital_consent_missing).toBe(true);
      });
    });
  },
});
