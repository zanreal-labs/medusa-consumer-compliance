/**
 * Unit price (cena jednostkowa).
 *
 * Art. 4 ust. 1 ustawy o informowaniu o cenach towarów i usług requires the
 * unit price next to the price. The regulation on displaying prices
 * (rozporządzenie Ministra Rozwoju i Technologii z dnia 19 grudnia 2022 r.,
 * Dz.U. 2022 poz. 2776) sets the units:
 *
 * - § 4 ust. 1: litre or cubic metre (volume), kilogram (mass), metre
 *   (length), square metre (area), piece (goods sold by the piece);
 * - § 4 ust. 2: decimal multiples or submultiples (such as 100 g or 100 ml)
 *   "in special cases justified by the kind, purpose or customary quantity" -
 *   there is no fixed threshold, so that choice is the store's;
 * - § 4 ust. 3: packs labelled with a number of pieces may use a price per
 *   piece or per a decimal multiple of pieces (10, 100);
 * - § 6: food in a liquid medium uses the drained net weight (and glazed food
 *   the net weight without the glaze, which is what to enter as quantity);
 * - § 7: no unit price for goods whose unit price equals the selling price,
 *   goods sold as sets, non-food goods sold only in pairs, medicinal products.
 *
 * The plugin computes; the store decides which products need it.
 */
import type { QuantityUnit, ReferenceUnit, UnitPriceExemption } from "../types";

type Dimension = "mass" | "volume" | "length" | "area" | "cubic" | "count";

const UNIT_INFO: Record<QuantityUnit, { dimension: Dimension; toBase: number }> = {
  cm: { dimension: "length", toBase: 0.01 },
  g: { dimension: "mass", toBase: 0.001 },
  kg: { dimension: "mass", toBase: 1 },
  l: { dimension: "volume", toBase: 1 },
  m: { dimension: "length", toBase: 1 },
  m2: { dimension: "area", toBase: 1 },
  m3: { dimension: "cubic", toBase: 1 },
  ml: { dimension: "volume", toBase: 0.001 },
  piece: { dimension: "count", toBase: 1 },
};

const REFERENCE_INFO: Record<Exclude<ReferenceUnit, "auto">, { dimension: Dimension; base: number; label: { pl: string; en: string } }> = {
  "per_10_pieces": { base: 10, dimension: "count", label: { en: "10 pieces", pl: "10 szt." } },
  "per_100_pieces": { base: 100, dimension: "count", label: { en: "100 pieces", pl: "100 szt." } },
  "per_100g": { base: 0.1, dimension: "mass", label: { en: "100 g", pl: "100 g" } },
  "per_100ml": { base: 0.1, dimension: "volume", label: { en: "100 ml", pl: "100 ml" } },
  kg: { base: 1, dimension: "mass", label: { en: "kg", pl: "kg" } },
  l: { base: 1, dimension: "volume", label: { en: "l", pl: "l" } },
  m: { base: 1, dimension: "length", label: { en: "m", pl: "m" } },
  m2: { base: 1, dimension: "area", label: { en: "m²", pl: "m²" } },
  m3: { base: 1, dimension: "cubic", label: { en: "m³", pl: "m³" } },
  piece: { base: 1, dimension: "count", label: { en: "piece", pl: "szt." } },
};

const DEFAULT_REFERENCE: Record<Dimension, Exclude<ReferenceUnit, "auto">> = {
  area: "m2",
  count: "piece",
  cubic: "m3",
  length: "m",
  mass: "kg",
  volume: "l",
};

export interface UnitPricingData {
  /** § 7 exemption; anything but `none` means no unit price is shown. */
  exempt_reason?: UnitPriceExemption | null;
  net_quantity: number | null;
  net_unit: QuantityUnit | null;
  /** Drained net weight for food in a liquid medium, in `net_unit` (mass units only). */
  drained_quantity?: number | null;
  reference_unit?: ReferenceUnit | null;
}

export const UNIT_PRICE_ISSUES = ["quantity_missing", "unit_missing", "reference_unit_mismatch", "drained_not_mass"] as const;
export type UnitPriceIssue = (typeof UNIT_PRICE_ISSUES)[number];

export interface UnitPriceResult {
  amount: number;
  reference_unit: Exclude<ReferenceUnit, "auto">;
  reference_label: string;
  /** "zł / kg"-style label, built by the caller from the currency; this is the unit half. */
  based_on: "net_quantity" | "drained_quantity";
  /**
   * The unit price equals the selling price (one piece sold as one piece):
   * § 7 pkt 1 exempts it, so a storefront may skip printing it.
   */
  same_as_price: boolean;
}

export function unitPricingIssues(data: UnitPricingData): UnitPriceIssue[] {
  const issues: UnitPriceIssue[] = [];
  if (!data.net_unit) {
    issues.push("unit_missing");
  }
  if (!(typeof data.net_quantity === "number" && data.net_quantity > 0)) {
    issues.push("quantity_missing");
  }
  if (data.net_unit && data.reference_unit && data.reference_unit !== "auto") {
    if (REFERENCE_INFO[data.reference_unit].dimension !== UNIT_INFO[data.net_unit].dimension) {
      issues.push("reference_unit_mismatch");
    }
  }
  if (data.drained_quantity != null && data.net_unit && UNIT_INFO[data.net_unit].dimension !== "mass") {
    issues.push("drained_not_mass");
  }
  return issues;
}

/** Half away from zero to `decimals` places, without the 1.005 floating point trap. */
export function roundMoney(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return (Math.sign(value) * Math.round(Math.abs(value) * factor + Number.EPSILON * factor)) / factor;
}

export function computeUnitPrice(price: number | null, data: UnitPricingData, locale: "pl" | "en" = "pl"): UnitPriceResult | null {
  if (price === null || !Number.isFinite(price) || unitPricingIssues(data).length > 0) {
    return null;
  }
  if (data.exempt_reason && data.exempt_reason !== "none") {
    return null;
  }
  const unit = UNIT_INFO[data.net_unit as QuantityUnit];
  const reference =
    data.reference_unit && data.reference_unit !== "auto" ? data.reference_unit : DEFAULT_REFERENCE[unit.dimension];
  const useDrained = typeof data.drained_quantity === "number" && data.drained_quantity > 0;
  const quantity = (useDrained ? (data.drained_quantity as number) : (data.net_quantity as number)) * unit.toBase;
  const info = REFERENCE_INFO[reference];
  const amount = roundMoney((price / quantity) * info.base);
  return {
    amount,
    same_as_price: Math.abs(amount - roundMoney(price)) < 0.005,
    based_on: useDrained ? "drained_quantity" : "net_quantity",
    reference_label: info.label[locale],
    reference_unit: reference,
  };
}
