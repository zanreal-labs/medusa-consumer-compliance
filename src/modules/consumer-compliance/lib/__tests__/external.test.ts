import { describe, expect, it } from "vitest";
import { resolveOptions } from "../../types";
import { isExternalMarketplaceOrder } from "../external";

const rules = resolveOptions({ externalSalesChannelIds: ["sc_marketplace"] });

describe("isExternalMarketplaceOrder", () => {
  it("recognises Allegro orders by their checkout form id", () => {
    expect(isExternalMarketplaceOrder({ metadata: { allegro_checkout_form_id: "29c3d7d0" } }, rules)).toEqual({
      code: "external_marketplace_order",
      marketplace: "allegro",
      matched_by: "allegro_checkout_form_id",
    });
  });

  it("recognises orders from an excluded sales channel", () => {
    expect(isExternalMarketplaceOrder({ metadata: null, sales_channel_id: "sc_marketplace" }, rules)?.matched_by).toBe("sales_channel");
  });

  it("leaves own storefront orders alone", () => {
    expect(isExternalMarketplaceOrder({ metadata: { allegro_checkout_form_id: "" }, sales_channel_id: "sc_web" }, rules)).toBeNull();
    expect(isExternalMarketplaceOrder({}, rules)).toBeNull();
  });

  it("always includes the Allegro key, also with custom keys", () => {
    const custom = resolveOptions({ externalOrderMetadataKeys: ["ebay_order_id"] });
    expect(custom.externalOrderMetadataKeys).toEqual(["ebay_order_id", "allegro_checkout_form_id"]);
    expect(isExternalMarketplaceOrder({ metadata: { ebay_order_id: "1" } }, custom)?.marketplace).toBe("external");
  });
});
