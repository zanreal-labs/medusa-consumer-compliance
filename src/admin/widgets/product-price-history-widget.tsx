import { defineWidgetConfig } from "@medusajs/admin-sdk";
import type { AdminProduct, DetailWidgetProps } from "@medusajs/framework/types";
import { Badge, Button, Container, Heading, Input, Label, Table, Text, toast } from "@medusajs/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { NativeSelect } from "../components/native-select";
import { PriceHistoryChart } from "../components/price-history-chart";
import { api, errorMessage } from "../lib/api";
import type { PriceHistoryResponse } from "../lib/api";
import { formatContextKey, formatDateTime, formatMoney, parseDecimal } from "../lib/format";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Product page widget: the recorded price history of one variant in one
 * pricing context, the Omnibus reference price as of now, and a form to
 * record an external price window (for example a public discount code).
 */
const ProductPriceHistoryWidget = ({ data }: DetailWidgetProps<AdminProduct>) => {
  const { i18n, t } = useTranslation();
  const variants = useMemo(() => (data.variants ?? []).map((variant) => ({ id: variant.id, title: variant.title ?? variant.id })), [data.variants]);
  const [variantId, setVariantId] = useState<string | null>(variants[0]?.id ?? null);
  const [contextKey, setContextKey] = useState<string | null>(null);
  const [history, setHistory] = useState<PriceHistoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [external, setExternal] = useState({ amount: "", from: "", note: "", to: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!variantId) {
      return;
    }
    try {
      const response = await api.priceHistory(variantId, contextKey);
      setHistory(response);
      setError(null);
      if (!contextKey && response.context_key) {
        setContextKey(response.context_key);
      }
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, [variantId, contextKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const evaluation = history?.evaluation;
  const currency = history?.history[0]?.currency_code ?? history?.context_key?.split("|")[0] ?? "pln";
  const to = Date.now();
  const from = to - 90 * DAY_MS;
  const money = (amount: number | null | undefined) => formatMoney(amount, currency, i18n.language);

  const addExternal = async () => {
    const amount = parseDecimal(external.amount);
    if (!variantId || !history?.context_key || amount === null || Number.isNaN(amount) || !external.from || !external.to) {
      toast.error(t("consumerCompliance.history.externalInvalid"));
      return;
    }
    setSaving(true);
    try {
      await api.addExternalPrice(variantId, {
        amount,
        context_key: history.context_key,
        note: external.note || null,
        valid_from: new Date(external.from).toISOString(),
        valid_to: new Date(external.to).toISOString(),
      });
      toast.success(t("consumerCompliance.history.externalSaved"));
      setExternal({ amount: "", from: "", note: "", to: "" });
      await load();
    } catch (caught) {
      toast.error(t("consumerCompliance.history.externalError"), { description: errorMessage(caught) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Container className="divide-y p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-4">
        <div>
          <Heading level="h2">{t("consumerCompliance.history.heading")}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {t("consumerCompliance.history.description")}
          </Text>
        </div>
        <div className="flex gap-x-2">
          <NativeSelect
            aria-label={t("consumerCompliance.history.variant")}
            value={variantId ?? ""}
            onChange={(event) => {
              setVariantId(event.target.value);
              setContextKey(null);
            }}
          >
            {variants.map((variant) => (
              <option key={variant.id} value={variant.id}>
                {variant.title}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label={t("consumerCompliance.history.context")}
            value={contextKey ?? ""}
            onChange={(event) => setContextKey(event.target.value)}
          >
            {(history?.contexts ?? []).map((key) => (
              <option key={key} value={key}>
                {formatContextKey(key)}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      {error ? (
        <div className="px-6 py-4">
          <Text size="small" className="text-ui-fg-error">
            {t("consumerCompliance.common.loadError")}: {error}
          </Text>
        </div>
      ) : null}

      {evaluation ? (
        <div className="grid grid-cols-2 gap-4 px-6 py-4 md:grid-cols-4">
          <div>
            <Text size="xsmall" className="text-ui-fg-subtle">
              {t("consumerCompliance.history.current")}
            </Text>
            <Text weight="plus">{money(evaluation.current_amount)}</Text>
          </div>
          <div>
            <Text size="xsmall" className="text-ui-fg-subtle">
              {t("consumerCompliance.history.status")}
            </Text>
            {evaluation.status === "exempt" ? (
              <Badge>{t("consumerCompliance.history.exempt")}</Badge>
            ) : evaluation.is_reduced ? (
              <Badge color="orange">{t("consumerCompliance.history.reduced")}</Badge>
            ) : (
              <Badge color="grey">{t("consumerCompliance.history.notReduced")}</Badge>
            )}
          </div>
          <div>
            <Text size="xsmall" className="text-ui-fg-subtle">
              {evaluation.reference_label ? t(`consumerCompliance.referenceLabels.${evaluation.reference_label}`) : t("consumerCompliance.history.reference")}
            </Text>
            <Text weight="plus">
              {money(evaluation.reference_price)}
              {evaluation.reduction_percent !== null ? ` (-${evaluation.reduction_percent}%)` : ""}
            </Text>
          </div>
          <div>
            <Text size="xsmall" className="text-ui-fg-subtle">
              {t("consumerCompliance.history.lowestInWindow")}
            </Text>
            <Text weight="plus">{money(evaluation.lowest_price_in_window)}</Text>
          </div>
          <div className="col-span-2 flex flex-col gap-y-1 md:col-span-4">
            {evaluation.history_incomplete ? <Text size="small" className="text-ui-fg-error">{t("consumerCompliance.history.incomplete")}</Text> : null}
            {evaluation.reference_not_higher ? <Text size="small" className="text-ui-fg-error">{t("consumerCompliance.history.notHigher")}</Text> : null}
            {evaluation.reason === "no_prior_price" ? <Text size="small" className="text-ui-fg-error">{t("consumerCompliance.history.noPriorPrice")}</Text> : null}
            {evaluation.reduction_started_at ? (
              <Text size="small" className="text-ui-fg-subtle">
                {t("consumerCompliance.history.reductionSince", { date: formatDateTime(evaluation.reduction_started_at, i18n.language) })}
              </Text>
            ) : null}
          </div>
        </div>
      ) : null}

      {history ? (
        <div className="px-6 py-4">
          <PriceHistoryChart
            currency={currency}
            from={from}
            intervals={history.history}
            reference={evaluation?.reference_price ?? null}
            to={to}
            windowEnd={evaluation?.window_end ?? null}
            windowStart={evaluation?.window_start ?? null}
          />
        </div>
      ) : null}

      {history && history.history.length > 0 ? (
        <div className="overflow-x-auto px-6 py-4">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>{t("consumerCompliance.history.columns.from")}</Table.HeaderCell>
                <Table.HeaderCell>{t("consumerCompliance.history.columns.to")}</Table.HeaderCell>
                <Table.HeaderCell>{t("consumerCompliance.history.columns.price")}</Table.HeaderCell>
                <Table.HeaderCell>{t("consumerCompliance.history.columns.regular")}</Table.HeaderCell>
                <Table.HeaderCell>{t("consumerCompliance.history.columns.kind")}</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {[...history.history].reverse().map((row) => (
                <Table.Row key={row.id}>
                  <Table.Cell>{formatDateTime(row.valid_from, i18n.language)}</Table.Cell>
                  <Table.Cell>{row.valid_to ? formatDateTime(row.valid_to, i18n.language) : t("consumerCompliance.history.now")}</Table.Cell>
                  <Table.Cell>{money(row.amount)}</Table.Cell>
                  <Table.Cell>{money(row.original_amount)}</Table.Cell>
                  <Table.Cell>
                    {row.kind === "external"
                      ? `${t("consumerCompliance.history.kinds.external")}${row.note ? `: ${row.note}` : ""}`
                      : row.price_list_type === "sale"
                        ? t("consumerCompliance.history.kinds.sale")
                        : t("consumerCompliance.history.kinds.regular")}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
          <Text size="xsmall" className="text-ui-fg-subtle mt-2">
            {t("consumerCompliance.history.retention", { days: history.retention_days })}
          </Text>
        </div>
      ) : null}

      <div className="flex flex-col gap-y-2 px-6 py-4">
        <Heading level="h3">{t("consumerCompliance.history.externalHeading")}</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {t("consumerCompliance.history.externalDescription")}
        </Text>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
          <div className="flex flex-col gap-y-1">
            <Label htmlFor="cc-ext-amount" size="xsmall">
              {t("consumerCompliance.history.columns.price")}
            </Label>
            <Input id="cc-ext-amount" size="small" value={external.amount} onChange={(event) => setExternal({ ...external, amount: event.target.value })} />
          </div>
          <div className="flex flex-col gap-y-1">
            <Label htmlFor="cc-ext-from" size="xsmall">
              {t("consumerCompliance.history.columns.from")}
            </Label>
            <Input id="cc-ext-from" size="small" type="datetime-local" value={external.from} onChange={(event) => setExternal({ ...external, from: event.target.value })} />
          </div>
          <div className="flex flex-col gap-y-1">
            <Label htmlFor="cc-ext-to" size="xsmall">
              {t("consumerCompliance.history.columns.to")}
            </Label>
            <Input id="cc-ext-to" size="small" type="datetime-local" value={external.to} onChange={(event) => setExternal({ ...external, to: event.target.value })} />
          </div>
          <div className="flex flex-col gap-y-1">
            <Label htmlFor="cc-ext-note" size="xsmall">
              {t("consumerCompliance.history.note")}
            </Label>
            <Input id="cc-ext-note" size="small" value={external.note} onChange={(event) => setExternal({ ...external, note: event.target.value })} />
          </div>
          <div className="flex items-end">
            <Button isLoading={saving} size="small" variant="secondary" onClick={() => void addExternal()}>
              {t("consumerCompliance.history.externalSave")}
            </Button>
          </div>
        </div>
      </div>
    </Container>
  );
};

export const config = defineWidgetConfig({
  zone: "product.details.after",
});

export default ProductPriceHistoryWidget;
