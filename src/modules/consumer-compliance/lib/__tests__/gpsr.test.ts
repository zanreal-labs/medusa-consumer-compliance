import { describe, expect, it } from "vitest";
import { isInEu, validateProductSafety } from "../gpsr";
import type { ProductSafetyInput } from "../gpsr";

const complete: ProductSafetyInput = {
  has_image: true,
  has_variant_identifier: true,
  manufacturer: { country_code: "pl", email: "kontakt@producent.example", name: "Producent sp. z o.o.", postal_address: "ul. Prosta 1, 00-001 Warszawa" },
  no_warnings_required: false,
  not_applicable: false,
  product_identifier: "Model X-1",
  responsible_person: null,
  safety_information: null,
  warnings: { pl: "Nie zanurzać w wodzie." },
};

describe("validateProductSafety", () => {
  it("accepts a complete EU product", () => {
    expect(validateProductSafety(complete)).toEqual([]);
  });

  it("skips products outside GPSR", () => {
    expect(validateProductSafety({ ...complete, manufacturer: null, not_applicable: true })).toEqual([]);
  });

  it("requires a manufacturer with name, address, contact and country", () => {
    expect(validateProductSafety({ ...complete, manufacturer: null })).toContain("manufacturer_missing");
    expect(
      validateProductSafety({ ...complete, manufacturer: { country_code: null, email: null, name: "", postal_address: null, url: null } }),
    ).toEqual(["manufacturer_name_missing", "manufacturer_address_missing", "manufacturer_contact_missing", "manufacturer_country_missing"]);
  });

  it("accepts a trade name or a URL in place of a name or e-mail", () => {
    expect(
      validateProductSafety({ ...complete, manufacturer: { ...complete.manufacturer!, email: null, name: "", trade_name: "Brand", url: "https://brand.example" } }),
    ).toEqual([]);
  });

  it("requires an EU responsible person for a manufacturer outside the EU", () => {
    const outside = { ...complete, manufacturer: { ...complete.manufacturer!, country_code: "CN" } };
    expect(validateProductSafety(outside)).toEqual(["responsible_person_missing"]);
    expect(
      validateProductSafety({
        ...outside,
        responsible_person: { country_code: "de", email: "eu@rep.example", name: "EU Rep GmbH", postal_address: "Hauptstr. 1, Berlin" },
      }),
    ).toEqual([]);
    expect(
      validateProductSafety({ ...outside, responsible_person: { country_code: "us", email: "x@y.z", name: "US Rep", postal_address: "NY" } }),
    ).toEqual(["responsible_person_outside_eu"]);
  });

  it("requires an identifier and an image", () => {
    expect(validateProductSafety({ ...complete, has_variant_identifier: false, product_identifier: null })).toEqual(["identifier_missing"]);
    expect(validateProductSafety({ ...complete, has_image: false })).toEqual(["image_missing"]);
  });

  it("requires warnings in Polish unless the product needs none", () => {
    expect(validateProductSafety({ ...complete, warnings: null })).toEqual(["warnings_missing"]);
    expect(validateProductSafety({ ...complete, warnings: { en: "Keep dry." } })).toEqual(["warnings_not_in_required_language"]);
    expect(validateProductSafety({ ...complete, safety_information: { pl: "Instrukcja w zestawie." }, warnings: null })).toEqual([]);
    expect(validateProductSafety({ ...complete, no_warnings_required: true, warnings: null })).toEqual([]);
  });

  it("knows the EU member states", () => {
    expect(isInEu("PL")).toBe(true);
    expect(isInEu("ch")).toBe(false);
    expect(isInEu(null)).toBe(false);
  });
});
