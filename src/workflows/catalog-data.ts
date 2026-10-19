import { WorkflowResponse, createWorkflow } from "@medusajs/framework/workflows-sdk";
import {
  deleteEconomicOperatorStep,
  updateComplianceSettingsStep,
  upsertEconomicOperatorStep,
  upsertProductComplianceStep,
  upsertUnitPricingStep,
} from "./steps/catalog-data-steps";
import type { UpsertOperatorInput, UpsertProductComplianceInput, UpsertUnitPricingInput } from "./steps/catalog-data-steps";

export const upsertProductComplianceWorkflow = createWorkflow(
  "upsert-product-compliance",
  (input: UpsertProductComplianceInput) => new WorkflowResponse(upsertProductComplianceStep(input)),
);

export const upsertUnitPricingWorkflow = createWorkflow(
  "upsert-unit-pricing",
  (input: UpsertUnitPricingInput) => new WorkflowResponse(upsertUnitPricingStep(input)),
);

export const upsertEconomicOperatorWorkflow = createWorkflow(
  "upsert-economic-operator",
  (input: UpsertOperatorInput) => new WorkflowResponse(upsertEconomicOperatorStep(input)),
);

export const deleteEconomicOperatorWorkflow = createWorkflow(
  "delete-economic-operator",
  (input: { id: string }) => new WorkflowResponse(deleteEconomicOperatorStep(input)),
);

export const updateComplianceSettingsWorkflow = createWorkflow(
  "update-compliance-settings",
  (input: Record<string, unknown>) => new WorkflowResponse(updateComplianceSettingsStep(input)),
);
