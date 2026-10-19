import { defineRouteConfig } from "@medusajs/admin-sdk";
import { Badge, Button, Container, Heading, Input, Label, Switch, Table, Tabs, Text, toast } from "@medusajs/ui";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { LocalizedField } from "../../../components/localized-field";
import { NativeSelect } from "../../../components/native-select";
import { api, errorMessage } from "../../../lib/api";
import type { Operator, Settings } from "../../../lib/api";

const ROLES = ["manufacturer", "responsible_person", "importer"] as const;

const EMPTY_OPERATOR: Partial<Operator> = {
  country_code: "",
  email: "",
  name: "",
  phone: "",
  postal_address: "",
  role: "manufacturer",
  trade_name: "",
  url: "",
};

const DisclosuresTab = () => {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .settings()
      .then((response) => setSettings(response.settings))
      .catch((caught: unknown) => toast.error(t("consumerCompliance.common.loadError"), { description: errorMessage(caught) }));
  }, [t]);

  if (!settings) {
    return <Text size="small">{t("consumerCompliance.common.loading")}</Text>;
  }
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setSettings({ ...settings, [key]: value });
  const save = async () => {
    setSaving(true);
    try {
      const response = await api.saveSettings({
        omnibus_note: settings.omnibus_note,
        personalised_pricing_disclosure: settings.personalised_pricing_disclosure,
        personalised_pricing_used: settings.personalised_pricing_used,
        reviews_disclosure: settings.reviews_disclosure,
        reviews_enabled: settings.reviews_enabled,
        withdrawal_info: settings.withdrawal_info,
      });
      setSettings(response.settings);
      toast.success(t("consumerCompliance.settings.saved"));
    } catch (caught) {
      toast.error(t("consumerCompliance.settings.saveError"), { description: errorMessage(caught) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-y-6">
      <div className="flex flex-col gap-y-3">
        <div className="flex items-center gap-x-2">
          <Switch checked={settings.reviews_enabled} id="cc-reviews-enabled" onCheckedChange={(checked) => set("reviews_enabled", checked)} />
          <Label htmlFor="cc-reviews-enabled" size="small">
            {t("consumerCompliance.settings.reviewsEnabled")}
          </Label>
        </div>
        <LocalizedField
          hint={t("consumerCompliance.settings.reviewsHint")}
          id="cc-reviews"
          label={t("consumerCompliance.settings.reviews")}
          onChange={(value) => set("reviews_disclosure", value)}
          rows={4}
          value={settings.reviews_disclosure}
        />
      </div>
      <div className="flex flex-col gap-y-3">
        <div className="flex items-center gap-x-2">
          <Switch
            checked={settings.personalised_pricing_used}
            id="cc-personalised-used"
            onCheckedChange={(checked) => set("personalised_pricing_used", checked)}
          />
          <Label htmlFor="cc-personalised-used" size="small">
            {t("consumerCompliance.settings.personalisedUsed")}
          </Label>
        </div>
        <LocalizedField
          hint={t("consumerCompliance.settings.personalisedHint")}
          id="cc-personalised"
          label={t("consumerCompliance.settings.personalised")}
          onChange={(value) => set("personalised_pricing_disclosure", value)}
          value={settings.personalised_pricing_disclosure}
        />
      </div>
      <LocalizedField
        hint={t("consumerCompliance.settings.withdrawalInfoHint")}
        id="cc-withdrawal-info"
        label={t("consumerCompliance.settings.withdrawalInfo")}
        onChange={(value) => set("withdrawal_info", value)}
        value={settings.withdrawal_info}
      />
      <LocalizedField
        hint={t("consumerCompliance.settings.omnibusNoteHint")}
        id="cc-omnibus-note"
        label={t("consumerCompliance.settings.omnibusNote")}
        onChange={(value) => set("omnibus_note", value)}
        value={settings.omnibus_note}
      />
      <div className="flex justify-end">
        <Button isLoading={saving} size="small" onClick={() => void save()}>
          {t("consumerCompliance.common.save")}
        </Button>
      </div>
    </div>
  );
};

const OperatorsTab = () => {
  const { t } = useTranslation();
  const [operators, setOperators] = useState<Operator[]>([]);
  const [editing, setEditing] = useState<Partial<Operator> | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setOperators((await api.operators()).operators);
    } catch (caught) {
      toast.error(t("consumerCompliance.common.loadError"), { description: errorMessage(caught) });
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!editing?.name?.trim()) {
      toast.error(t("consumerCompliance.operators.nameRequired"));
      return;
    }
    setSaving(true);
    try {
      const blank = (value: string | null | undefined) => (value && value.trim() !== "" ? value.trim() : null);
      await api.saveOperator(
        {
          country_code: blank(editing.country_code)?.toLowerCase() ?? null,
          email: blank(editing.email),
          name: editing.name.trim(),
          phone: blank(editing.phone),
          postal_address: blank(editing.postal_address),
          role: editing.role ?? "manufacturer",
          trade_name: blank(editing.trade_name),
          url: blank(editing.url),
        },
        editing.id,
      );
      toast.success(t("consumerCompliance.operators.saved"));
      setEditing(null);
      await load();
    } catch (caught) {
      toast.error(t("consumerCompliance.operators.saveError"), { description: errorMessage(caught) });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (operator: Operator) => {
    try {
      await api.deleteOperator(operator.id);
      toast.success(t("consumerCompliance.operators.deleted"));
      await load();
    } catch (caught) {
      toast.error(t("consumerCompliance.operators.deleteError"), { description: errorMessage(caught) });
    }
  };

  const field = (key: keyof Operator, label: string, type = "text") => (
    <div className="flex flex-col gap-y-1">
      <Label htmlFor={`cc-op-${key}`} size="xsmall">
        {label}
      </Label>
      <Input
        id={`cc-op-${key}`}
        size="small"
        type={type}
        value={(editing?.[key] as string | null | undefined) ?? ""}
        onChange={(event) => setEditing({ ...editing, [key]: event.target.value })}
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-y-4">
      <Text size="small" className="text-ui-fg-subtle">
        {t("consumerCompliance.operators.description")}
      </Text>
      <div className="overflow-x-auto">
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>{t("consumerCompliance.operators.name")}</Table.HeaderCell>
              <Table.HeaderCell>{t("consumerCompliance.operators.role")}</Table.HeaderCell>
              <Table.HeaderCell>{t("consumerCompliance.operators.country")}</Table.HeaderCell>
              <Table.HeaderCell>{t("consumerCompliance.operators.contact")}</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {operators.map((operator) => (
              <Table.Row key={operator.id}>
                <Table.Cell>{operator.name}</Table.Cell>
                <Table.Cell>{t(`consumerCompliance.operatorRoles.${operator.role}`)}</Table.Cell>
                <Table.Cell>{operator.country_code?.toUpperCase() ?? "-"}</Table.Cell>
                <Table.Cell>{operator.email ?? operator.url ?? "-"}</Table.Cell>
                <Table.Cell>
                  <div className="flex justify-end gap-x-2">
                    <Button size="small" variant="transparent" onClick={() => setEditing(operator)}>
                      {t("consumerCompliance.common.edit")}
                    </Button>
                    <Button size="small" variant="transparent" onClick={() => void remove(operator)}>
                      {t("consumerCompliance.common.delete")}
                    </Button>
                  </div>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </div>
      {editing ? (
        <div className="bg-ui-bg-subtle flex flex-col gap-y-3 rounded-md p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-y-1">
              <Label htmlFor="cc-op-role" size="xsmall">
                {t("consumerCompliance.operators.role")}
              </Label>
              <NativeSelect
                id="cc-op-role"
                value={editing.role ?? "manufacturer"}
                onChange={(event) => setEditing({ ...editing, role: event.target.value as Operator["role"] })}
              >
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {t(`consumerCompliance.operatorRoles.${role}`)}
                  </option>
                ))}
              </NativeSelect>
            </div>
            {field("name", t("consumerCompliance.operators.name"))}
            {field("trade_name", t("consumerCompliance.operators.tradeName"))}
            {field("postal_address", t("consumerCompliance.operators.address"))}
            {field("country_code", t("consumerCompliance.operators.countryCode"))}
            {field("email", t("consumerCompliance.operators.email"), "email")}
            {field("url", t("consumerCompliance.operators.url"), "url")}
            {field("phone", t("consumerCompliance.operators.phone"))}
          </div>
          <div className="flex justify-end gap-x-2">
            <Button size="small" variant="secondary" onClick={() => setEditing(null)}>
              {t("consumerCompliance.common.cancel")}
            </Button>
            <Button isLoading={saving} size="small" onClick={() => void save()}>
              {t("consumerCompliance.common.save")}
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button size="small" variant="secondary" onClick={() => setEditing({ ...EMPTY_OPERATOR })}>
            {t("consumerCompliance.operators.add")}
          </Button>
        </div>
      )}
    </div>
  );
};

const GpsrReportTab = () => {
  const { t } = useTranslation();
  const [rows, setRows] = useState<{ id: string; title: string; issues: string[]; not_applicable: boolean }[]>([]);
  const [next, setNext] = useState<number | null>(0);
  const [loading, setLoading] = useState(false);

  const more = useCallback(async () => {
    if (next === null) {
      return;
    }
    setLoading(true);
    try {
      const response = await api.gpsrReport(next);
      setRows((current) => [...current, ...response.products]);
      setNext(response.has_more ? response.next_offset : null);
    } catch (caught) {
      toast.error(t("consumerCompliance.common.loadError"), { description: errorMessage(caught) });
    } finally {
      setLoading(false);
    }
  }, [next, t]);

  useEffect(() => {
    void more();
    // Load the first page once.
  }, []);

  const withIssues = rows.filter((row) => row.issues.length > 0);
  return (
    <div className="flex flex-col gap-y-3">
      <Text size="small" className="text-ui-fg-subtle">
        {t("consumerCompliance.gpsr.reportDescription", { checked: rows.length, missing: withIssues.length })}
      </Text>
      <div className="overflow-x-auto">
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>{t("consumerCompliance.gpsr.product")}</Table.HeaderCell>
              <Table.HeaderCell>{t("consumerCompliance.gpsr.missing")}</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {withIssues.map((row) => (
              <Table.Row key={row.id}>
                <Table.Cell>
                  <Link className="text-ui-fg-interactive" to={`/products/${row.id}`}>
                    {row.title}
                  </Link>
                </Table.Cell>
                <Table.Cell>
                  <div className="flex flex-wrap gap-1">
                    {row.issues.map((issue) => (
                      <Badge key={issue} size="2xsmall" color="orange">
                        {t(`consumerCompliance.gpsr.issues.${issue}`)}
                      </Badge>
                    ))}
                  </div>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </div>
      {next !== null ? (
        <div>
          <Button isLoading={loading} size="small" variant="secondary" onClick={() => void more()}>
            {t("consumerCompliance.common.loadMore")}
          </Button>
        </div>
      ) : null}
    </div>
  );
};

const PriceHistoryTab = () => {
  const { t } = useTranslation();
  const [options, setOptions] = useState<Record<string, unknown> | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    api
      .settings()
      .then((response) => setOptions(response.options))
      .catch(() => setOptions(null));
  }, []);

  const backfill = async () => {
    setRunning(true);
    try {
      await api.backfill();
      toast.success(t("consumerCompliance.priceHistory.backfillStarted"));
    } catch (caught) {
      toast.error(t("consumerCompliance.priceHistory.backfillError"), { description: errorMessage(caught) });
    } finally {
      setRunning(false);
    }
  };

  const omnibus = (options?.omnibus ?? {}) as Record<string, unknown>;
  const withdrawal = (options?.withdrawal ?? {}) as Record<string, unknown>;
  return (
    <div className="flex flex-col gap-y-4">
      <Text size="small" className="text-ui-fg-subtle">
        {t("consumerCompliance.priceHistory.description")}
      </Text>
      <dl className="txt-small grid grid-cols-2 gap-2 md:grid-cols-4">
        <dt className="text-ui-fg-subtle">{t("consumerCompliance.priceHistory.windowDays")}</dt>
        <dd>{String(omnibus.windowDays ?? "-")}</dd>
        <dt className="text-ui-fg-subtle">{t("consumerCompliance.priceHistory.gradual")}</dt>
        <dd>{omnibus.gradualReductions ? t(`consumerCompliance.gradualModes.${String(omnibus.gradualReductions)}`) : "-"}</dd>
        <dt className="text-ui-fg-subtle">{t("consumerCompliance.priceHistory.retentionDays")}</dt>
        <dd>{String(omnibus.retentionDays ?? "-")}</dd>
        <dt className="text-ui-fg-subtle">{t("consumerCompliance.priceHistory.withdrawalDays")}</dt>
        <dd>{String(withdrawal.periodDays ?? "-")}</dd>
      </dl>
      <div>
        <Button isLoading={running} size="small" variant="secondary" onClick={() => void backfill()}>
          {t("consumerCompliance.priceHistory.backfill")}
        </Button>
      </div>
    </div>
  );
};

/** Settings > Consumer compliance: disclosures, economic operators, GPSR gaps and the price history. */
const ConsumerComplianceSettingsPage = () => {
  const { t } = useTranslation();
  return (
    <Container className="flex flex-col gap-y-4 p-6">
      <div>
        <Heading level="h1">{t("consumerCompliance.settings.heading")}</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {t("consumerCompliance.settings.description")}
        </Text>
      </div>
      <Tabs defaultValue="disclosures">
        <Tabs.List>
          <Tabs.Trigger value="disclosures">{t("consumerCompliance.settings.tabs.disclosures")}</Tabs.Trigger>
          <Tabs.Trigger value="operators">{t("consumerCompliance.settings.tabs.operators")}</Tabs.Trigger>
          <Tabs.Trigger value="gpsr">{t("consumerCompliance.settings.tabs.gpsr")}</Tabs.Trigger>
          <Tabs.Trigger value="history">{t("consumerCompliance.settings.tabs.history")}</Tabs.Trigger>
        </Tabs.List>
        <div className="pt-4">
          <Tabs.Content value="disclosures">
            <DisclosuresTab />
          </Tabs.Content>
          <Tabs.Content value="operators">
            <OperatorsTab />
          </Tabs.Content>
          <Tabs.Content value="gpsr">
            <GpsrReportTab />
          </Tabs.Content>
          <Tabs.Content value="history">
            <PriceHistoryTab />
          </Tabs.Content>
        </div>
      </Tabs>
      <Text size="xsmall" className="text-ui-fg-subtle">
        {t("consumerCompliance.common.disclaimer")}
      </Text>
    </Container>
  );
};

export const config = defineRouteConfig({
  // A translation key, resolved by the dashboard in the default namespace (see medusa-product-costs).
  label: "consumerCompliance.settings.heading",
  translationNs: "consumerCompliance",
});

export default ConsumerComplianceSettingsPage;
