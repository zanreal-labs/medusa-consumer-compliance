/**
 * Statutory and guidance wording the storefront should print verbatim.
 *
 * Omnibus labels follow the UOKiK guidance ("Informacja o obniżce ceny",
 * 2023), which also lists labels that must NOT be used: "cena referencyjna",
 * "cena odniesienia", "cena omnibus", "najniższa cena z ostatnich 30 dni",
 * "było", or a bare symbol.
 *
 * Withdrawal labels are the Polish language version of art. 11a of Directive
 * 2011/83/EU (added by Directive (EU) 2023/2673) and the identical wording of
 * the Polish draft act UC169 (new art. 30a ust. 3 and 6 of the consumer
 * rights act).
 */
import type { ReferenceLabel } from "./omnibus";
import { languageOf } from "./localized";

const OMNIBUS: Record<"pl" | "en", Record<ReferenceLabel, string>> = {
  en: {
    lowest_30_days: "Lowest price in the 30 days before the reduction",
    lowest_since_introduction: "Lowest price since the product was introduced",
    price_before_reduction: "Price before the reduction",
  },
  pl: {
    lowest_30_days: "Najniższa cena z 30 dni przed obniżką",
    lowest_since_introduction: "Najniższa cena od wprowadzenia towaru",
    price_before_reduction: "Cena przed obniżką",
  },
};

const WITHDRAWAL = {
  en: { confirm: "Confirm withdrawal", entry: "Withdraw from contract here" },
  pl: { confirm: "Potwierdź odstąpienie od umowy", entry: "Odstąp od umowy tutaj" },
} as const;

function pick(locale: string | null | undefined): "pl" | "en" {
  return languageOf(locale) === "en" ? "en" : "pl";
}

export function omnibusLabel(label: ReferenceLabel | null, locale: string | null | undefined): string | null {
  return label ? OMNIBUS[pick(locale)][label] : null;
}

export function withdrawalLabels(locale: string | null | undefined): { entry: string; confirm: string } {
  return { ...WITHDRAWAL[pick(locale)] };
}
