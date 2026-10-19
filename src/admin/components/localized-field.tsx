import { Label, Textarea } from "@medusajs/ui";
import { useTranslation } from "react-i18next";
import type { Localized } from "../lib/api";

export const EDITABLE_LOCALES = ["pl", "en"] as const;

interface LocalizedFieldProps {
  id: string;
  label: string;
  hint?: string;
  value: Localized;
  onChange: (value: Localized) => void;
  rows?: number;
}

/** One textarea per store locale for a `{ pl, en }` text. Polish first: it is the language the law requires. */
export const LocalizedField = ({ hint, id, label, onChange, rows = 3, value }: LocalizedFieldProps) => {
  const { t } = useTranslation();
  const update = (locale: string, text: string) => {
    const next = { ...(value ?? {}) };
    if (text.trim() === "") {
      delete next[locale];
    } else {
      next[locale] = text;
    }
    onChange(Object.keys(next).length === 0 ? null : next);
  };
  return (
    <div className="flex flex-col gap-y-2">
      <Label size="small" weight="plus">
        {label}
      </Label>
      {hint ? <span className="txt-small text-ui-fg-subtle">{hint}</span> : null}
      {EDITABLE_LOCALES.map((locale) => (
        <div className="flex flex-col gap-y-1" key={locale}>
          <Label htmlFor={`${id}-${locale}`} size="xsmall" className="text-ui-fg-subtle">
            {t(`consumerCompliance.locales.${locale}`)}
          </Label>
          <Textarea id={`${id}-${locale}`} rows={rows} value={value?.[locale] ?? ""} onChange={(event) => update(locale, event.target.value)} />
        </div>
      ))}
    </div>
  );
};
