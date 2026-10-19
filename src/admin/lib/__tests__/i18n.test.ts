import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GPSR_ISSUES } from "../../../modules/consumer-compliance/lib/gpsr";
import { UNIT_PRICE_ISSUES } from "../../../modules/consumer-compliance/lib/unit-price";
import {
  OMNIBUS_MODES,
  OPERATOR_ROLES,
  QUANTITY_UNITS,
  REFERENCE_UNITS,
  UNIT_PRICE_EXEMPTIONS,
  WITHDRAWAL_EXCEPTIONS,
  WITHDRAWAL_STATUSES,
} from "../../../modules/consumer-compliance/types";
import en from "../../i18n/json/en.json";
import pl from "../../i18n/json/pl.json";

/**
 * Every translation key the admin uses must exist in both locales.
 *
 * Static keys are read straight out of the sources. Keys built from a value
 * (`t(\`consumerCompliance.gpsr.issues.${issue}\`)`) are checked against the
 * backend enum the value comes from, so adding an enum member without a
 * translation fails here instead of rendering a raw key in the dashboard.
 */
const ADMIN_DIR = join(__dirname, "../..");

const DYNAMIC: Record<string, readonly string[]> = {
  "consumerCompliance.gpsr.issues": GPSR_ISSUES,
  "consumerCompliance.gradualModes": ["per_change", "keep_first"],
  "consumerCompliance.locales": ["pl", "en"],
  "consumerCompliance.omnibusModes": OMNIBUS_MODES,
  "consumerCompliance.operatorRoles": OPERATOR_ROLES,
  "consumerCompliance.referenceLabels": ["lowest_30_days", "lowest_since_introduction", "price_before_reduction"],
  "consumerCompliance.referenceUnits": REFERENCE_UNITS,
  "consumerCompliance.unit.issues": UNIT_PRICE_ISSUES,
  "consumerCompliance.unitExemptions": UNIT_PRICE_EXEMPTIONS,
  "consumerCompliance.units": QUANTITY_UNITS,
  "consumerCompliance.withdrawalExceptions": WITHDRAWAL_EXCEPTIONS,
  "consumerCompliance.withdrawalStatuses": WITHDRAWAL_STATUSES,
};

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return name === "__tests__" || name === "i18n" ? [] : sources(path);
    }
    return /\.(tsx?|jsx?)$/u.test(name) ? [readFileSync(path, "utf8")] : [];
  });
}

function flatten(tree: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    value && typeof value === "object" ? flatten(value as Record<string, unknown>, `${prefix}${key}.`) : [`${prefix}${key}`],
  );
}

const PLURAL = /_(zero|one|two|few|many|other)$/u;

function hasKey(keys: Set<string>, key: string): boolean {
  return keys.has(key) || keys.has(`${key}_other`);
}

const code = sources(ADMIN_DIR).join("\n");
const staticKeys = [...new Set([...code.matchAll(/["'](consumerCompliance\.[A-Za-z0-9_.]+)["']/gu)].map((match) => match[1]))];
const dynamicPrefixes = [...new Set([...code.matchAll(/`(consumerCompliance\.[A-Za-z0-9_.]+)\.\$\{/gu)].map((match) => match[1]))];
const locales = { en: new Set(flatten(en)), pl: new Set(flatten(pl)) };

describe("admin translations", () => {
  it("finds the keys in the sources", () => {
    expect(staticKeys.length).toBeGreaterThan(100);
    expect(dynamicPrefixes.length).toBeGreaterThan(5);
  });

  for (const [locale, keys] of Object.entries(locales)) {
    it(`has every static key in ${locale}`, () => {
      expect(staticKeys.filter((key) => !hasKey(keys, key))).toEqual([]);
    });

    it(`has every value of every dynamic key in ${locale}`, () => {
      const missing: string[] = [];
      for (const prefix of dynamicPrefixes) {
        const values = DYNAMIC[prefix];
        if (!values) {
          missing.push(`${prefix}.* (no enum registered in this test)`);
          continue;
        }
        for (const value of values) {
          if (!hasKey(keys, `${prefix}.${value}`)) {
            missing.push(`${prefix}.${value}`);
          }
        }
      }
      expect(missing).toEqual([]);
    });
  }

  it("has the same keys in both locales, plural forms aside", () => {
    const strip = (keys: Set<string>) => new Set([...keys].map((key) => key.replace(PLURAL, "")));
    const enKeys = strip(locales.en);
    const plKeys = strip(locales.pl);
    expect([...enKeys].filter((key) => !plKeys.has(key))).toEqual([]);
    expect([...plKeys].filter((key) => !enKeys.has(key))).toEqual([]);
  });

  it("gives Polish plurals the one, few and many forms", () => {
    const plurals = [...locales.pl].filter((key) => key.endsWith("_one")).map((key) => key.slice(0, -4));
    for (const base of plurals) {
      for (const form of ["few", "many", "other"]) {
        expect(locales.pl.has(`${base}_${form}`)).toBe(true);
      }
    }
  });

  it("uses no long dashes in copy", () => {
    expect(JSON.stringify(en)).not.toMatch(/[\u2013\u2014]/u);
    expect(JSON.stringify(pl)).not.toMatch(/[\u2013\u2014]/u);
  });
});
