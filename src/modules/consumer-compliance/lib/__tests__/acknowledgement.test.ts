import { describe, expect, it } from "vitest";
import { defaultStatement, renderAcknowledgement } from "../acknowledgement";

const input = {
  customer_name: "Jan Kowalski",
  email: "jan@example.com",
  items: [{ quantity: 1, title: "Czajnik <Pro>" }],
  locale: "pl",
  order_display_id: "1042",
  reference: "ccwd_123",
  seller: { address: "ul. Prosta 1, Warszawa", email: "sklep@example.com", name: "Sklep sp. z o.o." },
  statement: null,
  submitted_at: new Date("2026-10-19T12:34:56Z"),
  whole_order: false,
};

describe("renderAcknowledgement", () => {
  it("includes the statement content and the date and time of submission (art. 11a(4))", () => {
    const result = renderAcknowledgement(input);
    expect(result.subject).toBe("Otrzymaliśmy odstąpienie od zamówienia 1042");
    expect(result.text).toContain(defaultStatement("pl", "1042"));
    expect(result.text).toContain("ccwd_123");
    expect(result.text).toMatch(/19 października 2026.*14:34:56/u);
    expect(result.text).toContain("Czajnik <Pro> x 1");
    expect(result.text).toContain("Sklep sp. z o.o.");
  });

  it("escapes HTML", () => {
    expect(renderAcknowledgement(input).html).toContain("Czajnik &lt;Pro&gt;");
  });

  it("renders English and the whole-order wording", () => {
    const result = renderAcknowledgement({ ...input, locale: "en-GB", statement: "I withdraw.", whole_order: true });
    expect(result.subject).toBe("Withdrawal from order 1042 received");
    expect(result.text).toContain("I withdraw.");
    expect(result.text).toContain("The whole order");
  });

  it("uses no long dashes in customer-facing copy", () => {
    for (const locale of ["pl", "en"]) {
      const { html, text } = renderAcknowledgement({ ...input, locale });
      expect(`${html}${text}`).not.toMatch(/[\u2013\u2014]/u);
    }
  });
});

describe("renderAcknowledgement: order consents", () => {
  it("quotes the consents frozen onto the order, verbatim, with version and time", () => {
    const text = "Wyrażam zgodę na rozpoczęcie dostarczania treści cyfrowej (kodu) przed upływem terminu do odstąpienia od umowy.";
    const result = renderAcknowledgement({
      ...input,
      consents: [{ accepted_at: new Date("2026-10-19T10:00:00Z"), locale: "pl", text, version: 3 }],
    });
    expect(result.text).toContain("Zgody udzielone przy tym zamówieniu");
    expect(result.text).toContain(`"${text}"`);
    expect(result.text).toContain("wersja 3");
    expect(result.html).toContain("&bdquo;");
  });

  it("omits the section when the order has no consents", () => {
    expect(renderAcknowledgement(input).text).not.toContain("Zgody udzielone");
  });
});
