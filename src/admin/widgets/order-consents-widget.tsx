import { defineWidgetConfig } from "@medusajs/admin-sdk";
import type { AdminOrder, DetailWidgetProps } from "@medusajs/framework/types";
import { Badge, Container, Heading, Text } from "@medusajs/ui";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, errorMessage } from "../lib/api";
import type { OrderConsent } from "../lib/api";
import { formatDateTime } from "../lib/format";

/**
 * "Zgody klienta": what the customer accepted at checkout, frozen on the order
 * and quoted verbatim. For a marketplace order (Allegro) it says that the
 * marketplace collected the consents.
 */
const OrderConsentsWidget = ({ data }: DetailWidgetProps<AdminOrder>) => {
  const { i18n, t } = useTranslation();
  const [consents, setConsents] = useState<OrderConsent[] | null>(null);
  const [external, setExternal] = useState<{ marketplace: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .orderConsents(data.id)
      .then((response) => {
        setConsents(response.consents);
        setExternal(response.external_marketplace_order);
      })
      .catch((caught: unknown) => setError(errorMessage(caught)));
  }, [data.id]);

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">{t("consumerCompliance.orderConsents.heading")}</Heading>
      </div>
      {error ? (
        <div className="px-6 py-4">
          <Text size="small" className="text-ui-fg-error">
            {t("consumerCompliance.common.loadError")}: {error}
          </Text>
        </div>
      ) : null}
      {external ? (
        <div className="px-6 py-4">
          <Text size="small" className="text-ui-fg-subtle">
            {external.marketplace === "allegro" ? t("consumerCompliance.orderConsents.allegro") : t("consumerCompliance.orderConsents.external")}
          </Text>
        </div>
      ) : null}
      {!external && consents && consents.length === 0 ? (
        <div className="px-6 py-4">
          <Text size="small" className="text-ui-fg-subtle">
            {t("consumerCompliance.orderConsents.none")}
          </Text>
        </div>
      ) : null}
      {(consents ?? []).map((consent) => (
        <div className="flex flex-col gap-y-2 px-6 py-4" key={consent.id}>
          <div className="flex flex-wrap items-center gap-2">
            <Text size="small" weight="plus">
              {consent.key}
            </Text>
            <Badge size="2xsmall">{t("consumerCompliance.orderConsents.version", { version: consent.version })}</Badge>
            {consent.locale ? <Badge size="2xsmall">{consent.locale.toUpperCase()}</Badge> : null}
            {consent.required ? <Badge color="orange" size="2xsmall">{t("consumerCompliance.orderConsents.required")}</Badge> : null}
          </div>
          <blockquote className="txt-small border-ui-border-strong text-ui-fg-base whitespace-pre-wrap border-l-2 pl-3">{consent.text}</blockquote>
          <dl className="txt-compact-xsmall text-ui-fg-subtle grid grid-cols-1 gap-x-4 gap-y-1 md:grid-cols-2">
            <div>
              <dt className="inline">{t("consumerCompliance.orderConsents.acceptedAt")}: </dt>
              <dd className="inline">{formatDateTime(consent.accepted_at, i18n.language)}</dd>
            </div>
            <div>
              <dt className="inline">IP: </dt>
              <dd className="inline">{consent.ip ?? "-"}</dd>
            </div>
            {consent.link_url ? (
              <div className="md:col-span-2">
                <dt className="inline">{t("consumerCompliance.orderConsents.document")}: </dt>
                <dd className="inline break-all">
                  {consent.link_url}
                  {consent.link_sha256 ? ` (SHA-256 ${consent.link_sha256.slice(0, 16)}...)` : ""}
                </dd>
              </div>
            ) : null}
            <div className="md:col-span-2">
              <dt className="inline">{t("consumerCompliance.orderConsents.userAgent")}: </dt>
              <dd className="inline break-all">{consent.user_agent ?? "-"}</dd>
            </div>
          </dl>
        </div>
      ))}
    </Container>
  );
};

export const config = defineWidgetConfig({
  zone: "order.details.side.after",
});

export default OrderConsentsWidget;
