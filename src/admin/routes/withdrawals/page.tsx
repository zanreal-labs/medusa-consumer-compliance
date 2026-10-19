import { defineRouteConfig } from "@medusajs/admin-sdk";
import { ArrowUturnLeft } from "@medusajs/icons";
import { Button, Container, Drawer, Heading, Table, Text, Textarea, toast } from "@medusajs/ui";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import { NativeSelect } from "../../components/native-select";
import { WithdrawalStatusBadge } from "../../components/withdrawal-status-badge";
import { api, errorMessage } from "../../lib/api";
import type { Withdrawal } from "../../lib/api";
import { formatDateTime } from "../../lib/format";

const STATUSES = ["", "confirmed", "processed", "rejected"] as const;
const PAGE = 50;

/** The withdrawal register: every statement submitted through the withdrawal function. */
const WithdrawalsPage = () => {
  const { i18n, t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState<string>("");
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<Withdrawal[]>([]);
  const [count, setCount] = useState(0);
  const [selected, setSelected] = useState<Withdrawal | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const query: Record<string, string | number> = { limit: PAGE, offset };
      if (status) {
        query.status = status;
      }
      const response = await api.withdrawals(query);
      setRows(response.withdrawals);
      setCount(response.count);
    } catch (caught) {
      toast.error(t("consumerCompliance.common.loadError"), { description: errorMessage(caught) });
    }
  }, [offset, status, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = params.get("id");
    if (id && rows.length > 0) {
      const match = rows.find((row) => row.id === id);
      if (match) {
        setSelected(match);
        setNote(match.internal_note ?? "");
      }
    }
  }, [params, rows]);

  const open = (row: Withdrawal) => {
    setSelected(row);
    setNote(row.internal_note ?? "");
    setParams({ id: row.id });
  };

  const close = () => {
    setSelected(null);
    setParams({});
  };

  const update = async (next: "processed" | "rejected" | "confirmed") => {
    if (!selected) {
      return;
    }
    setBusy(true);
    try {
      const response = await api.updateWithdrawal(selected.id, { note: note || null, status: next });
      setSelected(response.withdrawal);
      toast.success(t("consumerCompliance.withdrawals.updated"));
      await load();
    } catch (caught) {
      toast.error(t("consumerCompliance.withdrawals.updateError"), { description: errorMessage(caught) });
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (!selected) {
      return;
    }
    setBusy(true);
    try {
      const response = await api.resendAcknowledgement(selected.id);
      setSelected(response.withdrawal);
      if (response.withdrawal.acknowledgement_error) {
        toast.error(t("consumerCompliance.withdrawals.resendError"), { description: response.withdrawal.acknowledgement_error });
      } else {
        toast.success(t("consumerCompliance.withdrawals.resent"));
      }
      await load();
    } catch (caught) {
      toast.error(t("consumerCompliance.withdrawals.resendError"), { description: errorMessage(caught) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Container className="divide-y p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-4">
        <div>
          <Heading level="h1">{t("consumerCompliance.withdrawals.heading")}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {t("consumerCompliance.withdrawals.description")}
          </Text>
        </div>
        <NativeSelect
          aria-label={t("consumerCompliance.withdrawals.filter")}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setOffset(0);
          }}
        >
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {value ? t(`consumerCompliance.withdrawalStatuses.${value}`) : t("consumerCompliance.withdrawals.all")}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>{t("consumerCompliance.withdrawals.columns.submitted")}</Table.HeaderCell>
              <Table.HeaderCell>{t("consumerCompliance.withdrawals.columns.order")}</Table.HeaderCell>
              <Table.HeaderCell>{t("consumerCompliance.withdrawals.columns.customer")}</Table.HeaderCell>
              <Table.HeaderCell>{t("consumerCompliance.withdrawals.columns.period")}</Table.HeaderCell>
              <Table.HeaderCell>{t("consumerCompliance.withdrawals.columns.acknowledgement")}</Table.HeaderCell>
              <Table.HeaderCell>{t("consumerCompliance.withdrawals.columns.status")}</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((row) => (
              <Table.Row className="cursor-pointer" key={row.id} onClick={() => open(row)}>
                <Table.Cell>{formatDateTime(row.submitted_at, i18n.language)}</Table.Cell>
                <Table.Cell>#{row.order_display_id}</Table.Cell>
                <Table.Cell>{row.customer_name}</Table.Cell>
                <Table.Cell>{row.within_period ? t("consumerCompliance.withdrawals.inPeriod") : t("consumerCompliance.withdrawals.outsidePeriod")}</Table.Cell>
                <Table.Cell>
                  {row.acknowledgement_sent_at
                    ? formatDateTime(row.acknowledgement_sent_at, i18n.language)
                    : t("consumerCompliance.withdrawals.notSent")}
                </Table.Cell>
                <Table.Cell>
                  <WithdrawalStatusBadge status={row.status} />
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </div>
      {rows.length === 0 ? (
        <div className="px-6 py-4">
          <Text size="small" className="text-ui-fg-subtle">
            {t("consumerCompliance.withdrawals.empty")}
          </Text>
        </div>
      ) : null}
      <div className="flex items-center justify-between px-6 py-4">
        <Text size="small" className="text-ui-fg-subtle">
          {t("consumerCompliance.withdrawals.count", { count })}
        </Text>
        <div className="flex gap-x-2">
          <Button disabled={offset === 0} size="small" variant="secondary" onClick={() => setOffset(Math.max(0, offset - PAGE))}>
            {t("consumerCompliance.common.previous")}
          </Button>
          <Button disabled={offset + PAGE >= count} size="small" variant="secondary" onClick={() => setOffset(offset + PAGE)}>
            {t("consumerCompliance.common.next")}
          </Button>
        </div>
      </div>

      <Drawer open={!!selected} onOpenChange={(value) => (!value ? close() : undefined)}>
        <Drawer.Content>
          <Drawer.Header>
            <Drawer.Title>{t("consumerCompliance.withdrawals.detailTitle", { order: selected?.order_display_id ?? "" })}</Drawer.Title>
          </Drawer.Header>
          {selected ? (
            <Drawer.Body className="flex flex-col gap-y-4 overflow-y-auto">
              <WithdrawalStatusBadge status={selected.status} />
              <dl className="txt-small grid grid-cols-2 gap-2">
                <dt className="text-ui-fg-subtle">{t("consumerCompliance.withdrawals.columns.submitted")}</dt>
                <dd>{formatDateTime(selected.submitted_at, i18n.language)}</dd>
                <dt className="text-ui-fg-subtle">{t("consumerCompliance.withdrawals.deadline")}</dt>
                <dd>{selected.deadline_at ? formatDateTime(selected.deadline_at, i18n.language) : t("consumerCompliance.withdrawals.notStarted")}</dd>
                <dt className="text-ui-fg-subtle">{t("consumerCompliance.withdrawals.columns.customer")}</dt>
                <dd>
                  {selected.customer_name}
                  <br />
                  {selected.email}
                </dd>
                <dt className="text-ui-fg-subtle">{t("consumerCompliance.withdrawals.columns.order")}</dt>
                <dd>
                  <Link className="text-ui-fg-interactive" to={`/orders/${selected.order_id}`}>
                    #{selected.order_display_id}
                  </Link>
                </dd>
              </dl>
              <div>
                <Text size="small" weight="plus">
                  {t("consumerCompliance.withdrawals.items")}
                </Text>
                <ul className="txt-small list-disc pl-5">
                  {selected.items.map((item) => (
                    <li key={item.line_item_id}>
                      {item.title} x {item.quantity}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <Text size="small" weight="plus">
                  {t("consumerCompliance.withdrawals.statement")}
                </Text>
                <Text size="small">{selected.statement}</Text>
                {selected.reason ? (
                  <Text size="small" className="text-ui-fg-subtle">
                    {t("consumerCompliance.withdrawals.reason")}: {selected.reason}
                  </Text>
                ) : null}
              </div>
              {selected.acknowledgement_error ? (
                <Text size="small" className="text-ui-fg-error">
                  {t("consumerCompliance.withdrawals.ackFailed")}: {selected.acknowledgement_error}
                </Text>
              ) : null}
              <div className="flex flex-col gap-y-1">
                <Text size="small" weight="plus">
                  {t("consumerCompliance.withdrawals.note")}
                </Text>
                <Textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
              </div>
            </Drawer.Body>
          ) : null}
          <Drawer.Footer>
            <Button disabled={busy} size="small" variant="secondary" onClick={() => void resend()}>
              {t("consumerCompliance.withdrawals.resend")}
            </Button>
            {selected?.status !== "confirmed" ? (
              <Button disabled={busy} size="small" variant="secondary" onClick={() => void update("confirmed")}>
                {t("consumerCompliance.withdrawals.reopen")}
              </Button>
            ) : null}
            <Button disabled={busy} size="small" variant="danger" onClick={() => void update("rejected")}>
              {t("consumerCompliance.withdrawals.reject")}
            </Button>
            <Button isLoading={busy} size="small" onClick={() => void update("processed")}>
              {t("consumerCompliance.withdrawals.markProcessed")}
            </Button>
          </Drawer.Footer>
        </Drawer.Content>
      </Drawer>
    </Container>
  );
};

export const config = defineRouteConfig({
  icon: ArrowUturnLeft,
  label: "consumerCompliance.withdrawals.heading",
  translationNs: "consumerCompliance",
});

export default WithdrawalsPage;
