import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import {
  createApiKeysWorkflow,
  createOrderWorkflow,
  createPriceListsWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
} from "@medusajs/medusa/core-flows";
import { recordPriceHistoryWorkflow } from "../../src/workflows/record-price-history";

/**
 * End to end through a real Medusa app: catalog and order created with the
 * core workflows, then every plugin surface exercised over HTTP.
 */
async function seed(container: MedusaContainer) {
  const { result: channels } = await createSalesChannelsWorkflow(container).run({ input: { salesChannelsData: [{ name: "Web" }] } });
  const channel = channels[0];
  const { result: keys } = await createApiKeysWorkflow(container).run({
    input: { api_keys: [{ created_by: "test", title: "Storefront", type: "publishable" }] },
  });
  const key = keys[0];
  await linkSalesChannelsToApiKeyWorkflow(container).run({ input: { add: [channel.id], id: key.id } });
  const { result: regions } = await createRegionsWorkflow(container).run({
    input: { regions: [{ countries: ["pl"], currency_code: "pln", name: "Polska" }] },
  });
  const region = regions[0];
  const { result: products } = await createProductsWorkflow(container).run({
    input: {
      products: [
        {
          options: [{ title: "Size", values: ["One"] }],
          sales_channels: [{ id: channel.id }],
          status: "published",
          thumbnail: "https://example.com/kettle.png",
          title: "Kettle",
          variants: [
            { manage_inventory: false, options: { Size: "One" }, prices: [{ amount: 100, currency_code: "pln" }], sku: "KETTLE-1", title: "One" },
          ],
        },
      ],
    },
  });
  const product = products[0];
  return { channel, key, product, region, variant: product.variants[0] };
}

medusaIntegrationTestRunner({
  cwd: join(__dirname, "../app"),
  dbName: process.env.DB_HTTP_TEMP_NAME ?? "cc_http_integration",
  inApp: true,
  testSuite: ({ api, getContainer }) => {
    describe("consumer compliance over HTTP", () => {
      it("records prices, answers Omnibus and unit prices, and runs the withdrawal flow", async () => {
        const container = getContainer();
        const { channel, key, product, region, variant } = await seed(container);
        const store = { headers: { "x-publishable-api-key": key.token } };

        // Price history: first observation, then a sale price list.
        const first = await recordPriceHistoryWorkflow(container).run({ input: { source: "backfill", variant_ids: null } });
        expect(first.result.changed).toBeGreaterThanOrEqual(1);
        // A price list's type defaults to "sale" (what the storefront shows as a struck-through price).
        await createPriceListsWorkflow(container).run({
          input: {
            price_lists_data: [
              { description: "Autumn", prices: [{ amount: 80, currency_code: "pln", variant_id: variant.id }], status: "active", title: "Autumn sale" },
            ],
          },
        });
        const second = await recordPriceHistoryWorkflow(container).run({ input: { source: "event", variant_ids: [variant.id] } });
        expect(second.result.changed).toBe(1);

        // Unit pricing and GPSR data through the admin workflows' store surface.
        const service = container.resolve("consumerCompliance") as {
          createVariantUnitPricings: (data: Record<string, unknown>) => Promise<unknown>;
          createEconomicOperators: (data: Record<string, unknown>) => Promise<{ id: string }>;
          createProductCompliances: (data: Record<string, unknown>) => Promise<unknown>;
        };
        await service.createVariantUnitPricings({ net_quantity: 1.7, net_unit: "l", product_id: product.id, variant_id: variant.id });
        const maker = await service.createEconomicOperators({
          country_code: "pl",
          email: "kontakt@producent.example",
          name: "Producent sp. z o.o.",
          postal_address: "ul. Prosta 1, Warszawa",
          role: "manufacturer",
        });
        await service.createProductCompliances({
          manufacturer_id: maker.id,
          product_id: product.id,
          warnings: { pl: "Nie zanurzać w wodzie." },
        });

        const compliance = await api.get(`/store/products/${product.id}/compliance?region_id=${region.id}&locale=pl`, store);
        expect(compliance.status).toBe(200);
        const view = compliance.data.variants[0];
        expect(view.omnibus).toMatchObject({ current_amount: 80, is_reduced: true, reference_price: 100, reduction_percent: 20 });
        expect(view.omnibus.reference_label_text).toBe("Najniższa cena od wprowadzenia towaru");
        expect(view.unit_price).toMatchObject({ amount: 47.06, reference_unit: "l" });
        expect(compliance.data.safety.manufacturer.name).toBe("Producent sp. z o.o.");
        expect(compliance.data.safety.warnings).toBe("Nie zanurzać w wodzie.");
        expect(compliance.data.safety.variant_identifiers[0].sku).toBe("KETTLE-1");

        const batch = await api.get(`/store/consumer-compliance/variants?ids=${variant.id}&region_id=${region.id}`, store);
        expect(batch.data.variants).toHaveLength(1);
        const single = await api.get(`/store/consumer-compliance/variants/${variant.id}/omnibus?currency_code=pln`, store);
        expect(single.data.omnibus.is_reduced).toBe(true);

        const disclosures = await api.get("/store/consumer-compliance/disclosures?locale=pl", store);
        expect(disclosures.data.withdrawal.labels).toEqual({ confirm: "Potwierdź odstąpienie od umowy", entry: "Odstąp od umowy tutaj" });

        // Withdrawal: order created directly, then the two-step flow as a guest.
        const { result: order } = await createOrderWorkflow(container).run({
          input: {
            email: "jan@example.com",
            items: [{ quantity: 1, requires_shipping: true, title: "Kettle", unit_price: 80, variant_id: variant.id }],
            region_id: region.id,
            sales_channel_id: channel.id,
            shipping_address: { address_1: "ul. Krótka 2", city: "Warszawa", country_code: "pl", first_name: "Jan", last_name: "Kowalski", postal_code: "00-002" },
          },
        });

        const wrongEmail = await api
          .post("/store/consumer-compliance/withdrawals/lookup", { display_id: order.display_id, email: "other@example.com" }, store)
          .catch((error: { response: { status: number } }) => error.response);
        expect(wrongEmail.status).toBe(404);

        const lookup = await api.post("/store/consumer-compliance/withdrawals/lookup", { display_id: `#${order.display_id}`, email: "JAN@example.com" }, store);
        expect(lookup.data.assessment.items[0]).toMatchObject({ basis: "awaiting_delivery", eligible: true, within_period: true });

        const requested = await api.post(
          "/store/consumer-compliance/withdrawals",
          { contact_email: "jan@example.com", customer_name: "Jan Kowalski", display_id: order.display_id, email: "jan@example.com", locale: "pl" },
          store,
        );
        expect(requested.status).toBe(201);
        expect(requested.data.withdrawal.status).toBe("pending_confirmation");

        const badToken = await api
          .post(`/store/consumer-compliance/withdrawals/${requested.data.withdrawal.id}/confirm`, { token: "x".repeat(32) }, store)
          .catch((error: { response: { status: number } }) => error.response);
        expect(badToken.status).toBe(404);

        const confirmed = await api.post(
          `/store/consumer-compliance/withdrawals/${requested.data.withdrawal.id}/confirm`,
          { token: requested.data.confirmation_token },
          store,
        );
        expect(confirmed.data.withdrawal.status).toBe("confirmed");
        expect(confirmed.data.withdrawal.submitted_at).toBeTruthy();
        expect(confirmed.data.withdrawal.statement).toContain(String(order.display_id));
        // Acknowledgement on a durable medium (art. 11a(4)): sent, with no error recorded.
        expect(confirmed.data.withdrawal.acknowledgement_sent_at).toBeTruthy();

        const again = await api
          .post(`/store/consumer-compliance/withdrawals/${requested.data.withdrawal.id}/confirm`, { token: requested.data.confirmation_token }, store)
          .catch((error: { response: { status: number } }) => error.response);
        expect(again.status).toBe(404);

        const query = container.resolve(ContainerRegistrationKeys.QUERY);
        const { data: notifications } = await query.graph({ entity: "notification", fields: ["id", "to", "channel", "status"] });
        const sent = notifications.filter((row: { to: string }) => row.to === "jan@example.com");
        expect(sent).toHaveLength(1);
        expect(sent[0]).toMatchObject({ channel: "email", status: "success" });
        expect(container.hasRegistration(Modules.NOTIFICATION)).toBe(true);

        // The customer-facing list needs a login; the admin register lists the confirmed statement.
        const unauthenticated = await api
          .get("/store/consumer-compliance/withdrawals", store)
          .catch((error: { response: { status: number } }) => error.response);
        expect(unauthenticated.status).toBe(401);
        const service2 = container.resolve("consumerCompliance") as { listWithdrawalRequests: (filters: Record<string, unknown>) => Promise<{ status: string; within_period: boolean }[]> };
        const stored = await service2.listWithdrawalRequests({ order_id: order.id });
        expect(stored).toHaveLength(1);
        expect(stored[0]).toMatchObject({ status: "confirmed", within_period: true });
      });
    });
  },
});
