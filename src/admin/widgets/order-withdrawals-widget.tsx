import { defineWidgetConfig } from "@medusajs/admin-sdk";
import type { AdminOrder, DetailWidgetProps } from "@medusajs/framework/types";
import { Container, Heading, Text } from "@medusajs/ui";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { WithdrawalStatusBadge } from "../components/withdrawal-status-badge";
import { api, errorMessage } from "../lib/api";
import type { Withdrawal } from "../lib/api";
import { formatDateTime } from "../lib/format";

/** Order page widget: withdrawals submitted for this order. Renders nothing when there are none. */
const OrderWithdrawalsWidget = ({ data }: DetailWidgetProps<AdminOrder>) => {
  const { i18n, t } = useTranslation();
  const [rows, setRows] = useState<Withdrawal[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .withdrawals({ order_id: data.id })
      .then((response) => setRows(response.withdrawals))
      .catch((caught: unknown) => setError(errorMessage(caught)));
  }, [data.id]);

  if (!error && (!rows || rows.length === 0)) {
    return null;
  }
  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">{t("consumerCompliance.withdrawals.orderHeading")}</Heading>
      </div>
      {error ? (
        <div className="px-6 py-4">
          <Text size="small" className="text-ui-fg-error">
            {t("consumerCompliance.common.loadError")}: {error}
          </Text>
        </div>
      ) : null}
      {(rows ?? []).map((row) => (
        <div className="flex flex-col gap-y-1 px-6 py-4" key={row.id}>
          <div className="flex items-center justify-between">
            <Text size="small" weight="plus">
              {formatDateTime(row.submitted_at, i18n.language)}
            </Text>
            <WithdrawalStatusBadge status={row.status} />
          </div>
          <Text size="small" className="text-ui-fg-subtle">
            {row.whole_order ? t("consumerCompliance.withdrawals.wholeOrder") : row.items.map((item) => `${item.title} x ${item.quantity}`).join(", ")}
          </Text>
          {!row.within_period ? (
            <Text size="small" className="text-ui-fg-error">
              {t("consumerCompliance.withdrawals.outsidePeriod")}
            </Text>
          ) : null}
          <Link className="txt-small text-ui-fg-interactive" to={`/withdrawals?id=${row.id}`}>
            {t("consumerCompliance.withdrawals.open")}
          </Link>
        </div>
      ))}
    </Container>
  );
};

export const config = defineWidgetConfig({
  zone: "order.details.after",
});

export default OrderWithdrawalsWidget;
