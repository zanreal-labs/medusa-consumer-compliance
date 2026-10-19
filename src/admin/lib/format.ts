/** Money in the admin's language; the currency code comes from the history row. */
export function formatMoney(amount: number | null | undefined, currency: string | null | undefined, locale: string): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) {
    return "-";
  }
  try {
    return new Intl.NumberFormat(locale, { currency: (currency || "pln").toUpperCase(), style: "currency" }).format(amount);
  } catch {
    return amount.toFixed(2);
  }
}

export function formatDateTime(value: string | null | undefined, locale: string): string {
  if (!value) {
    return "-";
  }
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Warsaw" }).format(new Date(value));
}

/** `pln|reg_123` -> `PLN, reg_123`; `pln|*` -> `PLN`. */
export function formatContextKey(key: string | null | undefined): string {
  if (!key) {
    return "-";
  }
  const [currency, region] = key.split("|");
  return region && region !== "*" ? `${currency.toUpperCase()}, ${region}` : currency.toUpperCase();
}

/** Parse a decimal typed with a comma or a dot; empty -> null; garbage -> NaN. */
export function parseDecimal(value: string): number | null {
  const trimmed = value.trim().replace(/\s/gu, "").replace(",", ".");
  if (trimmed === "") {
    return null;
  }
  return /^-?\d+(\.\d+)?$/u.test(trimmed) ? Number(trimmed) : Number.NaN;
}
