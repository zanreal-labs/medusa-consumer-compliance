import type { MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import { withdrawalLabels } from "../../../../modules/consumer-compliance/lib/labels";
import { pickLocalized } from "../../../../modules/consumer-compliance/lib/localized";
import { complianceService } from "../../../lib/views";

/**
 * GET /store/consumer-compliance/disclosures?locale=pl
 *
 * The configurable texts: how reviews are verified, whether prices are
 * personalised, and the optional notes shown with the withdrawal button and
 * with a reduced price. A text not filled in comes back as null, and the
 * storefront should then render nothing rather than an empty heading.
 */
export async function GET(req: MedusaStoreRequest, res: MedusaResponse): Promise<void> {
  const service = complianceService(req.scope);
  const settings = await service.getSettings();
  const locale = (req.query.locale as string | undefined) ?? null;
  const fallback = service.resolvedOptions.defaultLocale;
  res.json({
    omnibus_note: pickLocalized(settings.omnibus_note, locale, fallback),
    personalised_pricing: {
      text: pickLocalized(settings.personalised_pricing_disclosure, locale, fallback),
      used: settings.personalised_pricing_used,
    },
    reviews: {
      enabled: settings.reviews_enabled,
      text: pickLocalized(settings.reviews_disclosure, locale, fallback),
    },
    withdrawal: {
      labels: withdrawalLabels(locale),
      period_days: service.resolvedOptions.withdrawal.periodDays,
      text: pickLocalized(settings.withdrawal_info, locale, fallback),
    },
  });
}
