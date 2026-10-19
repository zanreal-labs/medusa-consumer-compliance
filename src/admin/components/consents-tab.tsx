import { Badge, Button, Input, Label, Switch, Table, Text, toast } from "@medusajs/ui";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, errorMessage } from "../lib/api";
import type { ConsentDefinition, ConsentRule } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { LocalizedField } from "./localized-field";
import { NativeSelect } from "./native-select";

const RULE_TYPES: ConsentRule["type"][] = ["always", "product_flag", "product", "product_type", "product_tag", "collection", "category"];
const PURPOSES: ConsentDefinition["purpose"][] = ["generic", "digital_content_withdrawal_waiver"];

const EMPTY: Partial<ConsentDefinition> = {
  active: true,
  key: "",
  label: {},
  link_label: null,
  link_url: null,
  position: 0,
  purpose: "generic",
  required: true,
  rules: [{ type: "always" }],
};

/** Settings tab: checkout consent definitions, their rules and version history. */
export const ConsentsTab = () => {
  const { i18n, t } = useTranslation();
  const [rows, setRows] = useState<ConsentDefinition[]>([]);
  const [editing, setEditing] = useState<Partial<ConsentDefinition> | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows((await api.consents()).consents);
    } catch (caught) {
      toast.error(t("consumerCompliance.common.loadError"), { description: errorMessage(caught) });
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!editing) {
      return;
    }
    setSaving(true);
    try {
      const rules = (editing.rules ?? []).map((rule) =>
        rule.type === "always" ? { type: rule.type } : rule.type === "product_flag" ? { key: rule.key, type: rule.type } : { type: rule.type, values: rule.values ?? [] },
      );
      const body: Partial<ConsentDefinition> = {
        active: editing.active,
        label: editing.label ?? {},
        link_label: editing.link_label ?? null,
        link_url: editing.link_url || null,
        position: editing.position ?? 0,
        purpose: editing.purpose,
        required: editing.required,
        rules: rules as ConsentRule[],
      };
      if (!editing.id) {
        body.key = editing.key;
      }
      await api.saveConsent(body, editing.id);
      toast.success(t("consumerCompliance.consents.saved"));
      setEditing(null);
      await load();
    } catch (caught) {
      toast.error(t("consumerCompliance.consents.saveError"), { description: errorMessage(caught) });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: ConsentDefinition) => {
    try {
      await api.deleteConsent(row.id);
      toast.success(t("consumerCompliance.consents.deleted"));
      await load();
    } catch (caught) {
      toast.error(t("consumerCompliance.consents.deleteError"), { description: errorMessage(caught) });
    }
  };

  const setRule = (index: number, rule: ConsentRule) =>
    setEditing((current) => ({ ...current, rules: (current?.rules ?? []).map((existing, i) => (i === index ? rule : existing)) }));

  return (
    <div className="flex flex-col gap-y-4">
      <Text size="small" className="text-ui-fg-subtle">
        {t("consumerCompliance.consents.description")}
      </Text>
      <div className="overflow-x-auto">
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>{t("consumerCompliance.consents.key")}</Table.HeaderCell>
              <Table.HeaderCell>{t("consumerCompliance.consents.version")}</Table.HeaderCell>
              <Table.HeaderCell>{t("consumerCompliance.consents.status")}</Table.HeaderCell>
              <Table.HeaderCell>{t("consumerCompliance.consents.rules")}</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((row) => (
              <Table.Row key={row.id}>
                <Table.Cell>
                  <div className="flex flex-col">
                    <span>{row.key}</span>
                    <span className="txt-compact-xsmall text-ui-fg-subtle">{t(`consumerCompliance.consentPurposes.${row.purpose}`)}</span>
                  </div>
                </Table.Cell>
                <Table.Cell>{row.version}</Table.Cell>
                <Table.Cell>
                  <div className="flex gap-1">
                    {row.active ? <Badge color="green" size="2xsmall">{t("consumerCompliance.consents.active")}</Badge> : <Badge size="2xsmall">{t("consumerCompliance.consents.inactive")}</Badge>}
                    {row.required ? <Badge color="orange" size="2xsmall">{t("consumerCompliance.consents.required")}</Badge> : null}
                  </div>
                </Table.Cell>
                <Table.Cell>
                  {row.rules.length === 0
                    ? t("consumerCompliance.consents.noRules")
                    : row.rules.map((rule) => t(`consumerCompliance.consentRuleTypes.${rule.type}`)).join(", ")}
                </Table.Cell>
                <Table.Cell>
                  <div className="flex justify-end gap-x-2">
                    <Button size="small" variant="transparent" onClick={() => setEditing(row)}>
                      {t("consumerCompliance.common.edit")}
                    </Button>
                    <Button size="small" variant="transparent" onClick={() => void remove(row)}>
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
        <div className="bg-ui-bg-subtle flex flex-col gap-y-4 rounded-md p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="flex flex-col gap-y-1">
              <Label htmlFor="cc-consent-key" size="xsmall">
                {t("consumerCompliance.consents.key")}
              </Label>
              <Input
                disabled={!!editing.id}
                id="cc-consent-key"
                size="small"
                value={editing.key ?? ""}
                onChange={(event) => setEditing({ ...editing, key: event.target.value })}
              />
            </div>
            <div className="flex flex-col gap-y-1">
              <Label htmlFor="cc-consent-purpose" size="xsmall">
                {t("consumerCompliance.consents.purpose")}
              </Label>
              <NativeSelect
                id="cc-consent-purpose"
                value={editing.purpose ?? "generic"}
                onChange={(event) => setEditing({ ...editing, purpose: event.target.value as ConsentDefinition["purpose"] })}
              >
                {PURPOSES.map((purpose) => (
                  <option key={purpose} value={purpose}>
                    {t(`consumerCompliance.consentPurposes.${purpose}`)}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex items-end gap-x-4">
              <div className="flex items-center gap-x-2">
                <Switch checked={editing.required ?? true} id="cc-consent-required" onCheckedChange={(checked) => setEditing({ ...editing, required: checked })} />
                <Label htmlFor="cc-consent-required" size="small">
                  {t("consumerCompliance.consents.required")}
                </Label>
              </div>
              <div className="flex items-center gap-x-2">
                <Switch checked={editing.active ?? true} id="cc-consent-active" onCheckedChange={(checked) => setEditing({ ...editing, active: checked })} />
                <Label htmlFor="cc-consent-active" size="small">
                  {t("consumerCompliance.consents.active")}
                </Label>
              </div>
            </div>
          </div>
          <LocalizedField
            hint={t("consumerCompliance.consents.labelHint")}
            id="cc-consent-label"
            label={t("consumerCompliance.consents.label")}
            onChange={(value) => setEditing({ ...editing, label: value ?? {} })}
            rows={3}
            value={editing.label ?? null}
          />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-y-1">
              <Label htmlFor="cc-consent-link" size="xsmall">
                {t("consumerCompliance.consents.linkUrl")}
              </Label>
              <Input id="cc-consent-link" size="small" type="url" value={editing.link_url ?? ""} onChange={(event) => setEditing({ ...editing, link_url: event.target.value })} />
            </div>
            <LocalizedField
              id="cc-consent-link-label"
              label={t("consumerCompliance.consents.linkLabel")}
              onChange={(value) => setEditing({ ...editing, link_label: value })}
              rows={1}
              value={editing.link_label ?? null}
            />
          </div>
          <div className="flex flex-col gap-y-2">
            <Label size="small" weight="plus">
              {t("consumerCompliance.consents.rules")}
            </Label>
            <Text size="xsmall" className="text-ui-fg-subtle">
              {t("consumerCompliance.consents.rulesHint")}
            </Text>
            {(editing.rules ?? []).map((rule, index) => (
              <div className="flex flex-wrap items-center gap-2" key={index}>
                <NativeSelect
                  aria-label={t("consumerCompliance.consents.ruleType")}
                  value={rule.type}
                  onChange={(event) => setRule(index, { type: event.target.value as ConsentRule["type"] })}
                >
                  {RULE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(`consumerCompliance.consentRuleTypes.${type}`)}
                    </option>
                  ))}
                </NativeSelect>
                {rule.type === "product_flag" ? (
                  <Input
                    aria-label={t("consumerCompliance.consents.flagKey")}
                    placeholder="is_digital_content"
                    size="small"
                    value={rule.key ?? ""}
                    onChange={(event) => setRule(index, { ...rule, key: event.target.value })}
                  />
                ) : rule.type !== "always" ? (
                  <Input
                    aria-label={t("consumerCompliance.consents.ruleValues")}
                    className="min-w-64"
                    placeholder={t("consumerCompliance.consents.ruleValuesHint")}
                    size="small"
                    value={(rule.values ?? []).join(", ")}
                    onChange={(event) =>
                      setRule(index, { ...rule, values: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) })
                    }
                  />
                ) : null}
                <Button
                  size="small"
                  variant="transparent"
                  onClick={() => setEditing({ ...editing, rules: (editing.rules ?? []).filter((_, i) => i !== index) })}
                >
                  {t("consumerCompliance.common.delete")}
                </Button>
              </div>
            ))}
            <div>
              <Button size="small" variant="secondary" onClick={() => setEditing({ ...editing, rules: [...(editing.rules ?? []), { type: "product_flag", key: "" }] })}>
                {t("consumerCompliance.consents.addRule")}
              </Button>
            </div>
          </div>
          {editing.id ? (
            <Text size="xsmall" className="text-ui-fg-subtle">
              {t("consumerCompliance.consents.versionNote", { version: editing.version ?? 1 })}
            </Text>
          ) : null}
          {(editing.versions ?? []).length > 0 ? (
            <div className="flex flex-col gap-y-1">
              <Label size="small" weight="plus">
                {t("consumerCompliance.consents.history")}
              </Label>
              {(editing.versions ?? []).map((version) => (
                <div className="txt-small border-ui-border-base border-l-2 pl-3" key={version.id}>
                  <span className="text-ui-fg-subtle">
                    {t("consumerCompliance.consents.versionLabel", { version: version.version })}, {formatDateTime(version.created_at, i18n.language)}
                  </span>
                  <p className="whitespace-pre-wrap">{version.label.pl ?? Object.values(version.label)[0] ?? ""}</p>
                </div>
              ))}
            </div>
          ) : null}
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
          <Button size="small" variant="secondary" onClick={() => setEditing({ ...EMPTY })}>
            {t("consumerCompliance.consents.add")}
          </Button>
        </div>
      )}
    </div>
  );
};
