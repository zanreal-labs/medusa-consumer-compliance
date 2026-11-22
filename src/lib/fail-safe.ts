import type { Logger, MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

/**
 * Run a subscriber body so that nothing it does can reach the event emitter:
 * an error is logged and swallowed. The events this plugin listens to
 * (`order.placed` in particular, which medusa-allegro also emits for its
 * orders) feed other subscribers - invoicing, notifications - and a failure
 * here must never fail, retry or delay them.
 */
export async function failSafe(container: MedusaContainer, name: string, body: () => Promise<void>): Promise<void> {
  try {
    await body();
  } catch (error) {
    try {
      container
        .resolve<Logger>(ContainerRegistrationKeys.LOGGER)
        .error(`[consumer-compliance] ${name} failed and was skipped: ${error instanceof Error ? error.message : String(error)}`);
    } catch {
      // No logger: still never rethrow.
    }
  }
}
