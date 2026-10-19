import type { MedusaContainer } from "@medusajs/framework/types";
import { consentBlock, consentText } from "../../modules/consumer-compliance/lib/consents";
import { pickLocalized } from "../../modules/consumer-compliance/lib/localized";
import { cartConsents } from "../../workflows/lib/cart";
import { complianceService } from "./views";

/**
 * The cart's consents as the Store API returns them. The shape is part of the
 * documented contract (docs/frontend-api.*.mdx, openapi/consumer-compliance.openapi.json).
 */
export async function buildCartConsentsView(container: MedusaContainer, cartId: string, locale: string | null) {
  const defaultLocale = complianceService(container).resolvedOptions.defaultLocale;
  const { applicable, cart, states } = await cartConsents(container, cartId);
  const stateByKey = new Map(states.map((state) => [state.key, state]));
  const block = consentBlock(states);
  return {
    blocking: block,
    can_complete: block === null,
    cart_id: cart.id,
    consents: applicable.map(({ definition, line_item_ids }) => {
      const state = stateByKey.get(definition.key);
      return {
        accepted_at: state?.accepted_at ?? null,
        accepted_version: state?.accepted_version ?? null,
        key: definition.key,
        line_item_ids,
        link: definition.link_url
          ? { label: pickLocalized(definition.link_label, locale, defaultLocale), url: definition.link_url }
          : null,
        purpose: definition.purpose,
        required: definition.required,
        status: state?.status ?? "missing",
        text: consentText(definition, locale, defaultLocale),
        version: definition.version,
      };
    }),
    locale: locale ?? defaultLocale,
  };
}
