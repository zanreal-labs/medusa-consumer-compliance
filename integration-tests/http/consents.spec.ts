import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import type { IEventBusModuleService, IOrderModuleService, MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import {
  createApiKeysWorkflow,
  createCartWorkflow,
  createOrderWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createStoresWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
} from "@medusajs/medusa/core-flows";
import { upsertConsentDefinitionWorkflow } from "../../src/workflows/consents";

/**
 * Checkout consents end to end: matching on a mixed cart, server-side
 * enforcement in the complete-cart hook, the immutable snapshot on the order,
 * the withdrawal lookup on that order, and the Allegro path, which must be
 * left completely alone.
 */
type Service = {
  listConsentDefinitionData: () => Promise<{ id: string; key: string; version: number }[]>;
  listOrderConsents: (filters: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
  updateOrderConsents: (data: Record<string, unknown>) => Promise<unknown>;
  listConsentAcceptances: (filters: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
};

async function seed(container: MedusaContainer) {
  // Cart creation reads the store; the test database has none until one is created.
  await createStoresWorkflow(container).run({
    input: { stores: [{ name: "Test store", supported_currencies: [{ currency_code: "pln", is_default: true }] }] },
  });
  const { result: channels } = await createSalesChannelsWorkflow(container).run({ input: { salesChannelsData: [{ name: "Web" }] } });
  const { result: keys } = await createApiKeysWorkflow(container).run({
    input: { api_keys: [{ created_by: "test", title: "Frontend", type: "publishable" }] },
  });
  await linkSalesChannelsToApiKeyWorkflow(container).run({ input: { add: [channels[0].id], id: keys[0].id } });
  const { result: regions } = await createRegionsWorkflow(container).run({
    input: { regions: [{ countries: ["pl"], currency_code: "pln", name: "Polska" }] },
  });
  const { result: products } = await createProductsWorkflow(container).run({
    input: {
      products: [
        {
          metadata: { is_digital_content: true },
          options: [{ title: "Term", values: ["1 year"] }],
          sales_channels: [{ id: channels[0].id }],
          status: "published",
          title: "Antivirus licence",
          variants: [{ manage_inventory: false, options: { Term: "1 year" }, prices: [{ amount: 0, currency_code: "pln" }], title: "1 year" }],
        },
        {
          options: [{ title: "Size", values: ["One"] }],
          sales_channels: [{ id: channels[0].id }],
          status: "published",
          title: "Sticker",
          variants: [{ manage_inventory: false, options: { Size: "One" }, prices: [{ amount: 0, currency_code: "pln" }], title: "One" }],
        },
      ],
    },
  });
  const licence = products.find((product) => product.title === "Antivirus licence")!;
  const sticker = products.find((product) => product.title === "Sticker")!;
  return { channel: channels[0], key: keys[0], licence, region: regions[0], sticker };
}

async function waitFor<T>(probe: () => Promise<T | null | undefined>, ms = 15000): Promise<T> {
  const until = Date.now() + ms;
  for (;;) {
    const value = await probe();
    if (value) {
      return value;
    }
    if (Date.now() > until) {
      throw new Error("timed out");
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

const failed = (error: { response: { status: number; data: Record<string, unknown> } }) => error.response;

medusaIntegrationTestRunner({
  cwd: join(__dirname, "../app"),
  dbName: process.env.DB_HTTP_CONSENTS_TEMP_NAME ?? "cc_http_consents_integration",
  inApp: true,
  testSuite: ({ api, getContainer }) => {
    describe("checkout consents", () => {
      it("matches, enforces, snapshots immutably, and drives the withdrawal lookup", async () => {
        const container = getContainer();
        const service = container.resolve("consumerCompliance") as Service;
        const { channel, key, licence, region, sticker } = await seed(container);
        const store = { headers: { "user-agent": "consent-test/1.0", "x-publishable-api-key": key.token } };

        const { result: cart } = await createCartWorkflow(container).run({
          input: {
            currency_code: "pln",
            email: "jan@example.com",
            items: [
              { quantity: 1, variant_id: licence.variants[0].id },
              { quantity: 1, variant_id: sticker.variants[0].id },
            ],
            region_id: region.id,
            sales_channel_id: channel.id,
          },
        });
        const query = container.resolve(ContainerRegistrationKeys.QUERY);
        const { data: carts } = await query.graph({ entity: "cart", fields: ["id", "items.id", "items.product_id"], filters: { id: cart.id } });
        const licenceLine = (carts[0].items as { id: string; product_id: string }[]).find((item) => item.product_id === licence.id)!;

        // 1. Mixed cart: the seeded digital consent covers only the licence line.
        const listed = await api.get(`/store/consumer-compliance/carts/${cart.id}/consents?locale=pl`, store);
        expect(listed.data.can_complete).toBe(false);
        expect(listed.data.blocking).toEqual({ code: "consent_required", keys: ["digital_immediate_delivery"] });
        expect(listed.data.consents).toHaveLength(1);
        const consent = listed.data.consents[0];
        expect(consent).toMatchObject({
          key: "digital_immediate_delivery",
          line_item_ids: [licenceLine.id],
          purpose: "digital_content_withdrawal_waiver",
          required: true,
          status: "missing",
          version: 1,
        });
        expect(consent.text).toContain("utracę prawo odstąpienia od umowy");

        // 2. Completion is blocked server-side without the consent.
        const blocked = await api.post(`/store/carts/${cart.id}/complete`, {}, store).catch(failed);
        expect(blocked.status).toBe(400);
        expect(blocked.data.code).toBe("consent_required");
        expect(String(blocked.data.message)).toContain("digital_immediate_delivery");

        // 3. Accept v1, then the text changes: v1 is now outdated and blocks.
        await api.post(`/store/consumer-compliance/carts/${cart.id}/consents`, { acceptances: [{ key: "digital_immediate_delivery", version: 1 }], locale: "pl" }, store);
        const [definition] = await service.listConsentDefinitionData();
        const textV2 = "Wyrażam zgodę na natychmiastowe dostarczenie kodu przed upływem terminu do odstąpienia od umowy. Przyjmuję do wiadomości, że po dostarczeniu kodu utracę prawo odstąpienia od umowy. (v2)";
        await upsertConsentDefinitionWorkflow(container).run({ input: { data: { label: { en: "v2 en", pl: textV2 } }, id: definition.id } });
        const outdated = await api.post(`/store/carts/${cart.id}/complete`, {}, store).catch(failed);
        expect(outdated.status).toBe(400);
        expect(outdated.data.code).toBe("consent_version_outdated");
        const staleAccept = await api
          .post(`/store/consumer-compliance/carts/${cart.id}/consents`, { acceptances: [{ key: "digital_immediate_delivery", version: 1 }] }, store)
          .catch(failed);
        expect(staleAccept.status).toBe(400);
        expect(staleAccept.data.code).toBe("consent_version_outdated");

        // 4. Accept v2 and complete.
        const accepted = await api.post(
          `/store/consumer-compliance/carts/${cart.id}/consents`,
          { acceptances: [{ key: "digital_immediate_delivery", version: 2 }], locale: "pl" },
          store,
        );
        expect(accepted.data.can_complete).toBe(true);
        const completed = await api.post(`/store/carts/${cart.id}/complete`, {}, store);
        expect(completed.data.type).toBe("order");
        const orderId = completed.data.order.id as string;

        // 5. The snapshot lands on the order, verbatim, with locale, version, time, IP and user agent.
        const [snapshot] = await waitFor(async () => {
          const rows = await service.listOrderConsents({ order_id: orderId });
          return rows.length > 0 ? rows : null;
        });
        expect(snapshot).toMatchObject({ key: "digital_immediate_delivery", locale: "pl", text: textV2, user_agent: "consent-test/1.0", version: 2 });
        expect(snapshot.ip).toBeTruthy();
        expect(snapshot.covered_product_ids).toEqual([licence.id]);
        const orders = container.resolve<IOrderModuleService>(Modules.ORDER);
        const order = await orders.retrieveOrder(orderId, { select: ["id", "metadata"] });
        expect(order.metadata?.digital_content_consent_at).toBeTruthy();

        // 6. Editing the definition afterwards never changes what the order shows; the record is immutable.
        await upsertConsentDefinitionWorkflow(container).run({ input: { data: { label: { en: "v3", pl: "Zupełnie inny tekst (v3)" } }, id: definition.id } });
        const [after] = await service.listOrderConsents({ order_id: orderId });
        expect(after).toMatchObject({ text: textV2, version: 2 });
        await expect(service.updateOrderConsents({ id: after.id as string, text: "forged" })).rejects.toThrow(/immutable/u);

        // 7. Withdrawal lookup: the licence line has no right of withdrawal, the sticker keeps it.
        const lookup = await api.post(
          "/store/consumer-compliance/withdrawals/lookup",
          { display_id: completed.data.order.display_id, email: "jan@example.com" },
          store,
        );
        const items = lookup.data.assessment.items as { title: string; eligible: boolean; excluded_reason: string | null; legal_basis: { pl: string } | null }[];
        const licenceItem = items.find((item) => item.title.startsWith("Antivirus"))!;
        const stickerItem = items.find((item) => item.title.startsWith("Sticker"))!;
        expect(licenceItem).toMatchObject({ eligible: false, excluded_reason: "digital_content" });
        expect(licenceItem.legal_basis?.pl).toContain("Art. 38 ust. 1 pkt 13");
        expect(stickerItem.eligible).toBe(true);
        expect(lookup.data.assessment).toMatchObject({ digital_consent_missing: false, right_of_withdrawal: "applies" });
      });

      it("leaves Allegro orders completely alone", async () => {
        const container = getContainer();
        const service = container.resolve("consumerCompliance") as Service;
        const { channel, key, licence, region } = await seed(container);
        const store = { headers: { "x-publishable-api-key": key.token } };

        // Exactly how medusa-allegro creates an order: createOrderWorkflow, no cart, Allegro metadata.
        const { result: created } = await createOrderWorkflow(container).run({
          input: {
            email: "buyer@example.com",
            items: [{ quantity: 1, requires_shipping: false, title: "Antivirus licence", unit_price: 0, variant_id: licence.variants[0].id }],
            metadata: { allegro_checkout_form_id: "29c3d7d0-0000-11ef-8a8e-000000000000" },
            region_id: region.id,
            sales_channel_id: channel.id,
          },
        });
        const orders = container.resolve<IOrderModuleService>(Modules.ORDER);
        const before = await orders.retrieveOrder(created.id, { select: ["id", "metadata", "updated_at"] });

        // ...and the `order.placed` it emits by hand, with core's payload.
        const eventBus = container.resolve<IEventBusModuleService>(Modules.EVENT_BUS);
        await eventBus.emit({ data: { id: created.id }, name: "order.placed" });
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const after = await orders.retrieveOrder(created.id, { select: ["id", "metadata", "updated_at"] });
        expect(after.metadata).toEqual(before.metadata);
        expect(new Date(after.updated_at as Date).getTime()).toBe(new Date(before.updated_at as Date).getTime());
        expect(await service.listOrderConsents({ order_id: created.id })).toEqual([]);

        // The withdrawal function points to Allegro instead of running.
        const lookup = await api.post(
          "/store/consumer-compliance/withdrawals/lookup",
          { display_id: created.display_id, email: "buyer@example.com" },
          store,
        );
        expect(lookup.data.assessment).toBeNull();
        expect(lookup.data.external_marketplace_order).toMatchObject({ code: "external_marketplace_order", marketplace: "allegro" });
        const refused = await api
          .post(
            "/store/consumer-compliance/withdrawals",
            { contact_email: "buyer@example.com", customer_name: "Kupujący", display_id: created.display_id, email: "buyer@example.com" },
            store,
          )
          .catch(failed);
        expect(refused.status).toBe(400);
        expect(refused.data.code).toBe("external_marketplace_order");
      });
    });
  },
});
