import type { IOrderModuleService } from "@medusajs/framework/types";
import { MedusaError, Modules } from "@medusajs/framework/utils";
import { StepResponse, createStep } from "@medusajs/framework/workflows-sdk";
import { CONSUMER_COMPLIANCE_MODULE } from "../../modules/consumer-compliance";
import type ConsumerComplianceModuleService from "../../modules/consumer-compliance/service";
import { toConsentDefinition } from "../../modules/consumer-compliance/service";
import { consentText, latestAcceptances, needsNewVersion, sanitizeRules } from "../../modules/consumer-compliance/lib/consents";
import { sanitizeLocalized } from "../../modules/consumer-compliance/lib/localized";
import { cartConsents } from "../lib/cart";
import { isExternalMarketplaceOrder } from "../../modules/consumer-compliance/lib/external";
import { hashLinkedDocument } from "../lib/link-hash";

type Row = Record<string, unknown> & { id: string };

function service(container: { resolve<T>(key: string): T }): ConsumerComplianceModuleService {
  return container.resolve<ConsumerComplianceModuleService>(CONSUMER_COMPLIANCE_MODULE);
}

const EDITABLE = ["key", "label", "link_url", "link_label", "required", "active", "purpose", "rules", "position"] as const;

export interface UpsertConsentInput {
  id?: string | null;
  data: Record<string, unknown>;
}

/**
 * Create or update a consent definition. A change to what the customer reads
 * (label, link, link label) bumps the version and writes the new wording to
 * the version history; the linked document is hashed for that version.
 */
export const upsertConsentDefinitionStep = createStep(
  "upsert-consent-definition",
  async (input: UpsertConsentInput, { container }) => {
    const svc = service(container);
    const data: Record<string, unknown> = {};
    for (const key of EDITABLE) {
      if (key in input.data) {
        data[key] = input.data[key];
      }
    }
    if ("label" in data) {
      data.label = sanitizeLocalized(data.label) ?? {};
    }
    if ("link_label" in data) {
      data.link_label = sanitizeLocalized(data.link_label);
    }
    if ("rules" in data) {
      data.rules = sanitizeRules(data.rules);
    }
    if (typeof data.link_url === "string") {
      data.link_url = data.link_url.trim() || null;
    }

    if (!input.id) {
      if (typeof data.key !== "string" || !/^[a-z0-9_]{2,64}$/u.test(data.key)) {
        throw new MedusaError(MedusaError.Types.INVALID_DATA, "key must be 2 to 64 lower-case letters, digits or underscores.");
      }
      if (Object.keys((data.label as Record<string, string>) ?? {}).length === 0) {
        throw new MedusaError(MedusaError.Types.INVALID_DATA, "label needs at least one locale.");
      }
      const link_sha256 = await hashLinkedDocument(data.link_url as string | null);
      const created = (await svc.createConsentDefinitions({ ...data, link_sha256, rules: (data.rules ?? []) as never, version: 1 } as never)) as unknown as Row;
      await svc.createConsentVersions({
        consent_id: created.id,
        key: created.key as string,
        label: created.label as Record<string, unknown>,
        link_label: (created.link_label as Record<string, unknown> | null) ?? null,
        link_sha256,
        link_url: (created.link_url as string | null) ?? null,
        version: 1,
      });
      return new StepResponse(created, { created: true, id: created.id, previous: null as Record<string, unknown> | null, versionId: null as string | null });
    }

    const [currentRow] = (await svc.listConsentDefinitions({ id: input.id })) as unknown as Row[];
    if (!currentRow) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Consent ${input.id} not found`);
    }
    // The key is the stable reference stored on carts and orders; it never changes.
    delete data.key;
    const current = toConsentDefinition(currentRow);
    const bump = needsNewVersion(current, data);
    const previous: Record<string, unknown> = {};
    for (const key of [...EDITABLE, "version", "link_sha256"]) {
      previous[key] = currentRow[key];
    }
    let versionId: string | null = null;
    if (bump) {
      const nextVersion = current.version + 1;
      const linkUrl = "link_url" in data ? (data.link_url as string | null) : current.link_url;
      data.link_sha256 = await hashLinkedDocument(linkUrl);
      data.version = nextVersion;
      const version = (await svc.createConsentVersions({
        consent_id: current.id,
        key: current.key,
        label: ((data.label ?? current.label) as Record<string, unknown>) ?? {},
        link_label: (("link_label" in data ? data.link_label : current.link_label) as Record<string, unknown> | null) ?? null,
        link_sha256: data.link_sha256 as string | null,
        link_url: linkUrl,
        version: nextVersion,
      })) as unknown as Row;
      versionId = version.id;
    }
    const updated = (await svc.updateConsentDefinitions({ id: current.id, ...data } as never)) as unknown as Row;
    return new StepResponse(updated, { created: false, id: current.id, previous, versionId });
  },
  async (undo, { container }) => {
    if (!undo) {
      return;
    }
    const svc = service(container);
    if (undo.created) {
      await svc.deleteConsentDefinitions(undo.id);
      const versions = await svc.listConsentVersions({ consent_id: undo.id }, { select: ["id"], take: null });
      if (versions.length > 0) {
        await svc.deleteConsentVersions(versions.map((row) => row.id));
      }
      return;
    }
    if (undo.versionId) {
      await svc.deleteConsentVersions(undo.versionId);
    }
    if (undo.previous) {
      await svc.updateConsentDefinitions({ id: undo.id, ...undo.previous } as never);
    }
  },
);

export const deleteConsentDefinitionStep = createStep(
  "delete-consent-definition",
  async (input: { id: string }, { container }) => {
    const svc = service(container);
    const [row] = await svc.listConsentDefinitions({ id: input.id });
    if (!row) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Consent ${input.id} not found`);
    }
    await svc.softDeleteConsentDefinitions(input.id);
    return new StepResponse({ deleted: true, id: input.id }, input.id);
  },
  async (id, { container }) => {
    if (id) {
      await service(container).restoreConsentDefinitions(id);
    }
  },
);

export interface RecordAcceptancesInput {
  cart_id: string;
  acceptances: { key: string; version: number }[];
  locale: string | null;
  ip: string | null;
  user_agent: string | null;
}

/**
 * Record acceptances on a cart. Only a consent that applies to the cart, in
 * its current version, can be accepted; anything else is refused, so the
 * stored text is always the text that was on the screen.
 */
export const recordConsentAcceptancesStep = createStep(
  "record-consent-acceptances",
  async (input: RecordAcceptancesInput, { container }) => {
    const svc = service(container);
    const { applicable, cart } = await cartConsents(container, input.cart_id);
    if (cart.completed_at) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "This cart is already completed.");
    }
    const byKey = new Map(applicable.map((entry) => [entry.definition.key, entry]));
    const defaultLocale = svc.resolvedOptions.defaultLocale;
    const rows = input.acceptances.map((acceptance) => {
      const entry = byKey.get(acceptance.key);
      if (!entry) {
        throw new MedusaError(MedusaError.Types.INVALID_DATA, `Consent ${acceptance.key} does not apply to this cart.`);
      }
      if (entry.definition.version !== acceptance.version) {
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          `Consent ${acceptance.key} is at version ${entry.definition.version}; version ${acceptance.version} can no longer be accepted.`,
          "consent_version_outdated",
        );
      }
      return {
        accepted_at: new Date(),
        cart_id: cart.id,
        consent_id: entry.definition.id,
        covered_product_ids: entry.product_ids,
        customer_id: cart.customer_id,
        ip: input.ip,
        key: entry.definition.key,
        link_sha256: entry.definition.link_sha256 ?? null,
        link_url: entry.definition.link_url,
        locale: input.locale,
        purpose: entry.definition.purpose,
        required: entry.definition.required,
        text: consentText(entry.definition, input.locale, defaultLocale),
        user_agent: input.user_agent,
        version: entry.definition.version,
      };
    });
    const created = rows.length > 0 ? ((await svc.createConsentAcceptances(rows as never)) as unknown as Row[]) : [];
    return new StepResponse(
      created.map((row) => row.id),
      created.map((row) => row.id),
    );
  },
  async (ids, { container }) => {
    if (ids && ids.length > 0) {
      await service(container).deleteConsentAcceptances(ids);
    }
  },
);

interface AcceptanceRow {
  id: string;
  consent_id: string;
  key: string;
  purpose: string;
  version: number;
  required: boolean;
  text: string;
  locale: string | null;
  link_url: string | null;
  link_sha256: string | null;
  covered_product_ids: string[] | null;
  accepted_at: string | Date;
  ip: string | null;
  user_agent: string | null;
}

/**
 * Freeze the cart's accepted consents onto the order. Idempotent: an order
 * that already has a snapshot is left alone. Also writes
 * `digital_content_consent_at` and `digital_content_consent_product_ids` to the
 * order metadata, which the withdrawal logic reads for orders created
 * elsewhere too.
 */
export const snapshotOrderConsentsStep = createStep(
  "snapshot-order-consents",
  async (input: { order_id: string; cart_id: string }, { container }) => {
    const svc = service(container);
    const orders = container.resolve<IOrderModuleService>(Modules.ORDER);
    const order = await orders.retrieveOrder(input.order_id, { select: ["id", "metadata", "sales_channel_id"] });
    if (isExternalMarketplaceOrder(order, svc.resolvedOptions)) {
      // Marketplace order: its consents live on the marketplace. Never written to.
      return new StepResponse({ created: 0 });
    }
    const [existing] = await svc.listOrderConsents({ order_id: input.order_id }, { take: 1 });
    if (existing) {
      return new StepResponse({ created: 0 });
    }
    const rows = (await svc.listConsentAcceptances({ cart_id: input.cart_id }, { take: null })) as unknown as AcceptanceRow[];
    const latest = latestAcceptances(
      rows.map((row) => ({ accepted_at: new Date(row.accepted_at), key: row.key, version: Number(row.version) })),
    );
    const chosen = rows.filter((row) => {
      const pick = latest.get(row.key);
      return pick && pick.version === Number(row.version) && pick.accepted_at.getTime() === new Date(row.accepted_at).getTime();
    });
    if (chosen.length === 0) {
      return new StepResponse({ created: 0 });
    }
    await svc.createOrderConsents(
      chosen.map((row) => ({
        accepted_at: new Date(row.accepted_at),
        acceptance_id: row.id,
        cart_id: input.cart_id,
        consent_id: row.consent_id,
        covered_product_ids: row.covered_product_ids,
        ip: row.ip,
        key: row.key,
        link_sha256: row.link_sha256,
        link_url: row.link_url,
        locale: row.locale,
        order_id: input.order_id,
        purpose: row.purpose,
        required: row.required,
        text: row.text,
        user_agent: row.user_agent,
        version: Number(row.version),
      })) as never,
    );

    const digital = chosen.find((row) => row.purpose === "digital_content_withdrawal_waiver");
    if (digital) {
      await orders.updateOrders([
        {
          id: input.order_id,
          metadata: {
            ...(order.metadata ?? {}),
            [svc.resolvedOptions.withdrawal.digitalConsentMetadataKey]: new Date(digital.accepted_at).toISOString(),
            digital_content_consent_product_ids: digital.covered_product_ids ?? [],
          },
        },
      ]);
    }
    return new StepResponse({ created: chosen.length });
  },
);
