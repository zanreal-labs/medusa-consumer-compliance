import { Module } from "@medusajs/framework/utils";
import ConsumerComplianceModuleService from "./service";

export const CONSUMER_COMPLIANCE_MODULE = "consumerCompliance";

export default Module(CONSUMER_COMPLIANCE_MODULE, {
  service: ConsumerComplianceModuleService,
});

export { default as ConsumerComplianceModuleService } from "./service";
export * from "./types";
export * from "./lib/omnibus";
export * from "./lib/unit-price";
export * from "./lib/gpsr";
export * from "./lib/withdrawal";
export * from "./lib/localized";
