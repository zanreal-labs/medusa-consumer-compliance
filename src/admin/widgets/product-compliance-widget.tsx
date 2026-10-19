import { defineWidgetConfig } from "@medusajs/admin-sdk";
import type { AdminProduct, DetailWidgetProps } from "@medusajs/framework/types";
import { Badge, Button, Container, Heading, Input, Label, Switch, Table, Text, toast } from "@medusajs/ui";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LocalizedField } from "../components/localized-field";
import { NativeSelect } from "../components/native-select";
import { api, errorMessage } from "../lib/api";
import type { Operator, ProductCompliance, ProductComplianceResponse, UnitPricing } from "../lib/api";
import { parseDecimal } from "../lib/format";

const OMNIBUS_MODES = ["standard", "perishable", "exempt"] as const;
const WITHDRAWAL_EXCEPTIONS = [
  "none",
  "custom_made",
  "perishable",
  "sealed_hygiene",
  "inseparably_mixed",
  "alcohol_market_price",
  "sealed_media",
  "periodicals",
  "digital_content",
] as const;
const UNITS = ["g", "kg", "ml", "l", "cm", "m", "m2", "m3", "piece"] as const;
const REFERENCE_UNITS = ["auto", "kg", "per_100g", "l", "per_100ml", "m", "m2", "m3", "piece", "per_10_pieces", "per_100_pieces"] as const;
const EXEMPTIONS = ["none", "same_as_price", "sold_as_set", "sold_in_pairs", "medicinal_product"] as const;

type Draft = Omit<ProductCompliance, "id" | "product_id">;

const EMPTY_DRAFT: Draft = {
  accessibility_notes: null,
  gpsr_not_applicable: false,
  manufacturer_id: null,
  no_warnings_required: false,
  omnibus_mode: "standard",
  product_identifier: null,
  responsible_person_id: null,
  safety_document_urls: null,
  safety_information: null,
  warnings: null,
  withdrawal_exception: "none",
};

interface UnitDraft {
  variant_id: string;
  title: string;
  net_quantity: string;
  net_unit: string;
  drained_quantity: string;
  reference_unit: string;
  exempt_reason: string;
  deposit_amount: string;
}

function toUnitDraft(variant: ProductComplianceResponse["variants"][number]): UnitDraft {
  const row: Partial<UnitPricing> = variant.unit_pricing ?? {};
  const text = (value: number | null | undefined) => (value === null || value === undefined ? "" : String(value));
  return {
    deposit_amount: text(row.deposit_amount),
    drained_quantity: text(row.drained_quantity),
    exempt_reason: row.exempt_reason ?? "none",
    net_quantity: text(row.net_quantity),
    net_unit: row.net_unit ?? "",
    reference_unit: row.reference_unit ?? "auto",
    title: variant.sku ? `${variant.title} (${variant.sku})` : variant.title,
    variant_id: variant.variant_id,
  };
}

/**
 * Product page widget: GPSR safety data, the Omnibus and withdrawal
 * classification, and the unit pricing of every variant.
 */
const ProductComplianceWidget = ({ data }: DetailWidgetProps<AdminProduct>) => {
  const { t } = useTranslation();
  const [loaded, setLoaded] = useState<ProductComplianceResponse | null>(null);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [units, setUnits] = useState<UnitDraft[]>([]);
  const [documents, setDocuments] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [product, list] = await Promise.all([api.product(data.id), api.operators()]);
      setLoaded(product);
      setOperators(list.operators);
      const { id: _id, product_id: _product, ...rest } = product.compliance ?? { ...EMPTY_DRAFT, id: "", product_id: "" };
      setDraft({ ...EMPTY_DRAFT, ...rest });
      setDocuments((product.compliance?.safety_document_urls ?? []).join("\n"));
      setUnits(product.variants.map(toUnitDraft));
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, [data.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  const saveProduct = async () => {
    setSaving(true);
    try {
      const urls = documents
        .split(/\s+/u)
        .map((line) => line.trim())
        .filter(Boolean);
      await api.saveProduct(data.id, { ...draft, safety_document_urls: urls.length ? urls : null });
      toast.success(t("consumerCompliance.product.saved"));
      await load();
    } catch (caught) {
      toast.error(t("consumerCompliance.product.saveError"), { description: errorMessage(caught) });
    } finally {
      setSaving(false);
    }
  };

  const saveUnits = async () => {
    const payload = [];
    for (const unit of units) {
      const quantity = parseDecimal(unit.net_quantity);
      const drained = parseDecimal(unit.drained_quantity);
      const deposit = parseDecimal(unit.deposit_amount);
      if ([quantity, drained, deposit].some((value) => value !== null && (Number.isNaN(value) || value < 0))) {
        toast.error(t("consumerCompliance.unit.invalidNumber", { variant: unit.title }));
        return;
      }
      payload.push({
        deposit_amount: deposit,
        drained_quantity: drained,
        exempt_reason: unit.exempt_reason,
        net_quantity: quantity,
        net_unit: unit.net_unit || null,
        reference_unit: unit.reference_unit,
        variant_id: unit.variant_id,
      });
    }
    setSaving(true);
    try {
      await api.saveUnitPricing(data.id, payload);
      toast.success(t("consumerCompliance.unit.saved"));
      await load();
    } catch (caught) {
      toast.error(t("consumerCompliance.unit.saveError"), { description: errorMessage(caught) });
    } finally {
      setSaving(false);
    }
  };

  const manufacturers = operators.filter((operator) => operator.role === "manufacturer");
  const responsible = operators.filter((operator) => operator.role !== "manufacturer");

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading level="h2">{t("consumerCompliance.product.heading")}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {t("consumerCompliance.product.description")}
          </Text>
        </div>
        {loaded ? (
          loaded.gpsr_issues.length === 0 ? (
            <Badge color="green">{t("consumerCompliance.gpsr.complete")}</Badge>
          ) : (
            <Badge color="orange">{t("consumerCompliance.gpsr.issueCount", { count: loaded.gpsr_issues.length })}</Badge>
          )
        ) : null}
      </div>

      {error ? (
        <div className="px-6 py-4">
          <Text size="small" className="text-ui-fg-error">
            {t("consumerCompliance.common.loadError")}: {error}
          </Text>
        </div>
      ) : null}

      {!loaded && !error ? (
        <div className="px-6 py-4">
          <Text size="small">{t("consumerCompliance.common.loading")}</Text>
        </div>
      ) : null}

      {loaded ? (
        <>
          <section className="flex flex-col gap-y-4 px-6 py-4">
            <Heading level="h3">{t("consumerCompliance.gpsr.heading")}</Heading>
            {loaded.gpsr_issues.length > 0 ? (
              <ul className="txt-small text-ui-fg-subtle list-disc pl-5">
                {loaded.gpsr_issues.map((issue) => (
                  <li key={issue}>{t(`consumerCompliance.gpsr.issues.${issue}`)}</li>
                ))}
              </ul>
            ) : null}
            <div className="flex items-center gap-x-2">
              <Switch
                checked={draft.gpsr_not_applicable}
                id="cc-gpsr-na"
                onCheckedChange={(checked) => set("gpsr_not_applicable", checked)}
              />
              <Label htmlFor="cc-gpsr-na" size="small">
                {t("consumerCompliance.gpsr.notApplicable")}
              </Label>
            </div>
            {!draft.gpsr_not_applicable ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-y-1">
                  <Label htmlFor="cc-manufacturer" size="small" weight="plus">
                    {t("consumerCompliance.gpsr.manufacturer")}
                  </Label>
                  <NativeSelect
                    id="cc-manufacturer"
                    value={draft.manufacturer_id ?? ""}
                    onChange={(event) => set("manufacturer_id", event.target.value || null)}
                  >
                    <option value="">{t("consumerCompliance.common.none")}</option>
                    {manufacturers.map((operator) => (
                      <option key={operator.id} value={operator.id}>
                        {operator.name}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="flex flex-col gap-y-1">
                  <Label htmlFor="cc-responsible" size="small" weight="plus">
                    {t("consumerCompliance.gpsr.responsiblePerson")}
                  </Label>
                  <NativeSelect
                    id="cc-responsible"
                    value={draft.responsible_person_id ?? ""}
                    onChange={(event) => set("responsible_person_id", event.target.value || null)}
                  >
                    <option value="">{t("consumerCompliance.common.none")}</option>
                    {responsible.map((operator) => (
                      <option key={operator.id} value={operator.id}>
                        {operator.name}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="flex flex-col gap-y-1 md:col-span-2">
                  <Label htmlFor="cc-identifier" size="small" weight="plus">
                    {t("consumerCompliance.gpsr.identifier")}
                  </Label>
                  <Input
                    id="cc-identifier"
                    value={draft.product_identifier ?? ""}
                    onChange={(event) => set("product_identifier", event.target.value || null)}
                  />
                  <span className="txt-small text-ui-fg-subtle">{t("consumerCompliance.gpsr.identifierHint")}</span>
                </div>
                <div className="flex items-center gap-x-2 md:col-span-2">
                  <Switch
                    checked={draft.no_warnings_required}
                    id="cc-no-warnings"
                    onCheckedChange={(checked) => set("no_warnings_required", checked)}
                  />
                  <Label htmlFor="cc-no-warnings" size="small">
                    {t("consumerCompliance.gpsr.noWarningsRequired")}
                  </Label>
                </div>
                <LocalizedField
                  id="cc-warnings"
                  label={t("consumerCompliance.gpsr.warnings")}
                  onChange={(value) => set("warnings", value)}
                  value={draft.warnings}
                />
                <LocalizedField
                  id="cc-safety"
                  label={t("consumerCompliance.gpsr.safetyInformation")}
                  onChange={(value) => set("safety_information", value)}
                  value={draft.safety_information}
                />
                <div className="flex flex-col gap-y-1">
                  <Label htmlFor="cc-documents" size="small" weight="plus">
                    {t("consumerCompliance.gpsr.documents")}
                  </Label>
                  <textarea
                    className="bg-ui-bg-field shadow-borders-base txt-small rounded-md px-2 py-1.5"
                    id="cc-documents"
                    rows={3}
                    value={documents}
                    onChange={(event) => setDocuments(event.target.value)}
                  />
                  <span className="txt-small text-ui-fg-subtle">{t("consumerCompliance.gpsr.documentsHint")}</span>
                </div>
                <LocalizedField
                  hint={t("consumerCompliance.gpsr.accessibilityHint")}
                  id="cc-accessibility"
                  label={t("consumerCompliance.gpsr.accessibility")}
                  onChange={(value) => set("accessibility_notes", value)}
                  value={draft.accessibility_notes}
                />
              </div>
            ) : null}
          </section>

          <section className="grid grid-cols-1 gap-4 px-6 py-4 md:grid-cols-2">
            <div className="flex flex-col gap-y-1">
              <Label htmlFor="cc-omnibus-mode" size="small" weight="plus">
                {t("consumerCompliance.product.omnibusMode")}
              </Label>
              <NativeSelect
                id="cc-omnibus-mode"
                value={draft.omnibus_mode}
                onChange={(event) => set("omnibus_mode", event.target.value as Draft["omnibus_mode"])}
              >
                {OMNIBUS_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {t(`consumerCompliance.omnibusModes.${mode}`)}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-y-1">
              <Label htmlFor="cc-withdrawal-exception" size="small" weight="plus">
                {t("consumerCompliance.product.withdrawalException")}
              </Label>
              <NativeSelect
                id="cc-withdrawal-exception"
                value={draft.withdrawal_exception}
                onChange={(event) => set("withdrawal_exception", event.target.value)}
              >
                {WITHDRAWAL_EXCEPTIONS.map((exception) => (
                  <option key={exception} value={exception}>
                    {t(`consumerCompliance.withdrawalExceptions.${exception}`)}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex justify-end md:col-span-2">
              <Button isLoading={saving} size="small" onClick={() => void saveProduct()}>
                {t("consumerCompliance.common.save")}
              </Button>
            </div>
          </section>

          <section className="flex flex-col gap-y-3 px-6 py-4">
            <div>
              <Heading level="h3">{t("consumerCompliance.unit.heading")}</Heading>
              <Text size="small" className="text-ui-fg-subtle">
                {t("consumerCompliance.unit.description")}
              </Text>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>{t("consumerCompliance.unit.columns.variant")}</Table.HeaderCell>
                    <Table.HeaderCell>{t("consumerCompliance.unit.columns.quantity")}</Table.HeaderCell>
                    <Table.HeaderCell>{t("consumerCompliance.unit.columns.unit")}</Table.HeaderCell>
                    <Table.HeaderCell>{t("consumerCompliance.unit.columns.reference")}</Table.HeaderCell>
                    <Table.HeaderCell>{t("consumerCompliance.unit.columns.drained")}</Table.HeaderCell>
                    <Table.HeaderCell>{t("consumerCompliance.unit.columns.exemption")}</Table.HeaderCell>
                    <Table.HeaderCell>{t("consumerCompliance.unit.columns.deposit")}</Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {units.map((unit, index) => {
                    const update = (key: keyof UnitDraft, value: string) =>
                      setUnits((current) => current.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
                    const issues = loaded.variants[index]?.unit_pricing_issues ?? [];
                    return (
                      <Table.Row key={unit.variant_id}>
                        <Table.Cell>
                          <div className="flex flex-col">
                            <span>{unit.title}</span>
                            {issues.map((issue) => (
                              <span className="txt-compact-xsmall text-ui-fg-error" key={issue}>
                                {t(`consumerCompliance.unit.issues.${issue}`)}
                              </span>
                            ))}
                          </div>
                        </Table.Cell>
                        <Table.Cell>
                          <Input
                            aria-label={t("consumerCompliance.unit.columns.quantity")}
                            className="w-24"
                            size="small"
                            value={unit.net_quantity}
                            onChange={(event) => update("net_quantity", event.target.value)}
                          />
                        </Table.Cell>
                        <Table.Cell>
                          <NativeSelect
                            aria-label={t("consumerCompliance.unit.columns.unit")}
                            value={unit.net_unit}
                            onChange={(event) => update("net_unit", event.target.value)}
                          >
                            <option value="">-</option>
                            {UNITS.map((value) => (
                              <option key={value} value={value}>
                                {t(`consumerCompliance.units.${value}`)}
                              </option>
                            ))}
                          </NativeSelect>
                        </Table.Cell>
                        <Table.Cell>
                          <NativeSelect
                            aria-label={t("consumerCompliance.unit.columns.reference")}
                            value={unit.reference_unit}
                            onChange={(event) => update("reference_unit", event.target.value)}
                          >
                            {REFERENCE_UNITS.map((value) => (
                              <option key={value} value={value}>
                                {t(`consumerCompliance.referenceUnits.${value}`)}
                              </option>
                            ))}
                          </NativeSelect>
                        </Table.Cell>
                        <Table.Cell>
                          <Input
                            aria-label={t("consumerCompliance.unit.columns.drained")}
                            className="w-24"
                            size="small"
                            value={unit.drained_quantity}
                            onChange={(event) => update("drained_quantity", event.target.value)}
                          />
                        </Table.Cell>
                        <Table.Cell>
                          <NativeSelect
                            aria-label={t("consumerCompliance.unit.columns.exemption")}
                            value={unit.exempt_reason}
                            onChange={(event) => update("exempt_reason", event.target.value)}
                          >
                            {EXEMPTIONS.map((value) => (
                              <option key={value} value={value}>
                                {t(`consumerCompliance.unitExemptions.${value}`)}
                              </option>
                            ))}
                          </NativeSelect>
                        </Table.Cell>
                        <Table.Cell>
                          <Input
                            aria-label={t("consumerCompliance.unit.columns.deposit")}
                            className="w-20"
                            size="small"
                            value={unit.deposit_amount}
                            onChange={(event) => update("deposit_amount", event.target.value)}
                          />
                        </Table.Cell>
                      </Table.Row>
                    );
                  })}
                </Table.Body>
              </Table>
            </div>
            <div className="flex justify-end">
              <Button isLoading={saving} size="small" variant="secondary" onClick={() => void saveUnits()}>
                {t("consumerCompliance.unit.save")}
              </Button>
            </div>
          </section>
        </>
      ) : null}
    </Container>
  );
};

export const config = defineWidgetConfig({
  zone: "product.details.after",
});

export default ProductComplianceWidget;
