import { authenticate, defineMiddlewares, validateAndTransformBody } from "@medusajs/framework/http";
import {
  ConsentAcceptanceBody,
  ConsentDefinitionBody,
  ExternalPriceBody,
  OperatorBody,
  ProductComplianceBody,
  SettingsBody,
  UnitPricingBody,
  WithdrawalConfirmBody,
  WithdrawalLookupBody,
  WithdrawalRequestBody,
  WithdrawalStatusBody,
} from "./lib/schemas";

/**
 * Validation for every write, and optional customer auth on the withdrawal
 * routes: a logged-in customer is recognised (and may use any of their orders
 * without the e-mail), a guest still gets through with order number + e-mail.
 * The withdrawal function has to work for guest checkouts too.
 */
const optionalCustomer = authenticate("customer", ["session", "bearer"], { allowUnauthenticated: true });

export default defineMiddlewares({
  routes: [
    { matcher: "/admin/consumer-compliance/products/:id", method: ["POST"], middlewares: [validateAndTransformBody(ProductComplianceBody)] },
    { matcher: "/admin/consumer-compliance/products/:id/unit-pricing", method: ["POST"], middlewares: [validateAndTransformBody(UnitPricingBody)] },
    { matcher: "/admin/consumer-compliance/variants/:id/price-history/external", method: ["POST"], middlewares: [validateAndTransformBody(ExternalPriceBody)] },
    { matcher: "/admin/consumer-compliance/operators", method: ["POST"], middlewares: [validateAndTransformBody(OperatorBody)] },
    { matcher: "/admin/consumer-compliance/operators/:id", method: ["POST"], middlewares: [validateAndTransformBody(OperatorBody)] },
    { matcher: "/admin/consumer-compliance/settings", method: ["POST"], middlewares: [validateAndTransformBody(SettingsBody)] },
    { matcher: "/admin/consumer-compliance/withdrawals/:id", method: ["POST"], middlewares: [validateAndTransformBody(WithdrawalStatusBody)] },
    { matcher: "/admin/consumer-compliance/consents", method: ["POST"], middlewares: [validateAndTransformBody(ConsentDefinitionBody)] },
    { matcher: "/admin/consumer-compliance/consents/:id", method: ["POST"], middlewares: [validateAndTransformBody(ConsentDefinitionBody)] },
    { matcher: "/store/consumer-compliance/carts/:id/consents", method: ["POST"], middlewares: [validateAndTransformBody(ConsentAcceptanceBody)] },
    { matcher: "/store/consumer-compliance/withdrawals", method: ["GET"], middlewares: [authenticate("customer", ["session", "bearer"])] },
    { matcher: "/store/consumer-compliance/withdrawals", method: ["POST"], middlewares: [optionalCustomer, validateAndTransformBody(WithdrawalRequestBody)] },
    { matcher: "/store/consumer-compliance/withdrawals/lookup", method: ["POST"], middlewares: [optionalCustomer, validateAndTransformBody(WithdrawalLookupBody)] },
    { matcher: "/store/consumer-compliance/withdrawals/:id/confirm", method: ["POST"], middlewares: [validateAndTransformBody(WithdrawalConfirmBody)] },
  ],
});
