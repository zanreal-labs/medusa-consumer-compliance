import { completeCartWorkflow } from "@medusajs/medusa/core-flows";
import { assertCartConsents } from "../lib/cart";

/**
 * Block cart completion while a required checkout consent that applies to the
 * cart is missing or accepted in an outdated version. Runs in the workflow's
 * `validate` hook, before anything is reserved or charged.
 */
completeCartWorkflow.hooks.validate(async ({ cart }, { container }) => {
  await assertCartConsents(container, cart.id);
});
