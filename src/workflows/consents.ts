import { WorkflowResponse, createWorkflow } from "@medusajs/framework/workflows-sdk";
import {
  deleteConsentDefinitionStep,
  recordConsentAcceptancesStep,
  snapshotOrderConsentsStep,
  upsertConsentDefinitionStep,
} from "./steps/consent-steps";
import type { RecordAcceptancesInput, UpsertConsentInput } from "./steps/consent-steps";

export const upsertConsentDefinitionWorkflow = createWorkflow(
  "upsert-consent-definition",
  (input: UpsertConsentInput) => new WorkflowResponse(upsertConsentDefinitionStep(input)),
);

export const deleteConsentDefinitionWorkflow = createWorkflow(
  "delete-consent-definition",
  (input: { id: string }) => new WorkflowResponse(deleteConsentDefinitionStep(input)),
);

export const recordConsentAcceptancesWorkflow = createWorkflow(
  "record-consent-acceptances",
  (input: RecordAcceptancesInput) => new WorkflowResponse(recordConsentAcceptancesStep(input)),
);

export const snapshotOrderConsentsWorkflow = createWorkflow(
  "snapshot-order-consents",
  (input: { order_id: string; cart_id: string }) => new WorkflowResponse(snapshotOrderConsentsStep(input)),
);
