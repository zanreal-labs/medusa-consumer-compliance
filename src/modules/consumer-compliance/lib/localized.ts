import type { LocalizedText } from "../types";

/** Normalise a locale tag to its language: `pl-PL` -> `pl`. */
export function languageOf(locale: string | null | undefined): string | null {
  const value = locale?.trim().toLowerCase();
  if (!value) {
    return null;
  }
  return value.split(/[-_]/u)[0] || null;
}

/**
 * Pick the text for a locale: exact language, then the default locale, then
 * any non-empty entry. Returns null when nothing is filled in, so the caller
 * can tell "not configured" from "configured as empty".
 */
export function pickLocalized(
  text: LocalizedText | null | undefined,
  locale: string | null | undefined,
  defaultLocale: string,
): string | null {
  if (!text || typeof text !== "object") {
    return null;
  }
  const filled = (key: string | null): string | null => {
    if (!key) {
      return null;
    }
    const value = text[key];
    return typeof value === "string" && value.trim() !== "" ? value : null;
  };
  return (
    filled(languageOf(locale)) ??
    filled(languageOf(defaultLocale)) ??
    Object.values(text).find((value) => typeof value === "string" && value.trim() !== "") ??
    null
  );
}

/** Keep only string entries with a two to eight letter language key; drop blanks. */
export function sanitizeLocalized(input: unknown): LocalizedText | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const output: LocalizedText = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const language = languageOf(key);
    if (language && /^[a-z]{2,8}$/u.test(language) && typeof value === "string" && value.trim() !== "") {
      output[language] = value.trim();
    }
  }
  return Object.keys(output).length === 0 ? null : output;
}
