import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { recordConsentAcceptancesWorkflow } from "../../../../../../workflows/consents";
import { buildCartConsentsView } from "../../../../../lib/consents-view";
import type { ConsentAcceptanceBodyType } from "../../../../../lib/schemas";

/**
 * GET /store/consumer-compliance/carts/:id/consents?locale=pl
 *
 * The consents that apply to the cart right now, with the verbatim text to
 * render, the version to send back, whether each is required, and whether
 * the cart can be completed.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  res.json(await buildCartConsentsView(req.scope, req.params.id, (req.query.locale as string | undefined) ?? null));
}

/**
 * POST /store/consumer-compliance/carts/:id/consents
 * { "locale": "pl", "acceptances": [{ "key": "digital_immediate_delivery", "version": 1 }] }
 *
 * Records the acceptances with the exact text in that locale, the time, the
 * client IP and user agent. Answers with the same body as GET.
 */
export async function POST(req: MedusaRequest<ConsentAcceptanceBodyType>, res: MedusaResponse): Promise<void> {
  const locale = req.validatedBody.locale ?? null;
  await recordConsentAcceptancesWorkflow(req.scope).run({
    input: {
      acceptances: req.validatedBody.acceptances,
      cart_id: req.params.id,
      ip: req.ip ?? null,
      locale,
      user_agent: (req.get?.("user-agent") ?? null)?.slice(0, 500) ?? null,
    },
  });
  res.json(await buildCartConsentsView(req.scope, req.params.id, locale));
}
