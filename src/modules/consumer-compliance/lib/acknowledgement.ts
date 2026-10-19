/**
 * The acknowledgement of receipt sent after a withdrawal is confirmed.
 *
 * Art. 11a(3) of Directive 2011/83/EU, added by Directive (EU) 2023/2673,
 * requires the trader to acknowledge receipt of the withdrawal statement on a
 * durable medium without undue delay, including its content and the date and
 * time of its submission. An e-mail is a durable medium. The text is rendered
 * here, in Polish or English, and handed to the notification provider as
 * ready content, so a provider that sends `content` as is (Medusa's SES and
 * SendGrid style providers do) needs no template of its own.
 */
import { languageOf } from "./localized";

export interface AcknowledgementInput {
  locale: string | null;
  reference: string;
  order_display_id: string;
  customer_name: string;
  email: string;
  submitted_at: Date;
  items: { title: string; quantity: number }[];
  /** True when the whole order is withdrawn. */
  whole_order: boolean;
  statement: string | null;
  seller: { name: string; address: string; email: string };
  /** Consents frozen onto the order at checkout, quoted verbatim as proof. */
  consents?: { text: string; version: number; accepted_at: Date; locale: string | null }[];
}

export interface RenderedAcknowledgement {
  subject: string;
  text: string;
  html: string;
}

function formatTimestamp(date: Date, language: "pl" | "en"): string {
  return new Intl.DateTimeFormat(language === "pl" ? "pl-PL" : "en-GB", {
    dateStyle: "long",
    timeStyle: "long",
    timeZone: "Europe/Warsaw",
  }).format(date);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const COPY = {
  en: {
    greeting: (name: string) => `Hello ${name},`,
    intro: "we confirm that we have received your statement of withdrawal from the contract.",
    items: "Withdrawn items:",
    next:
      "We will refund the payments received from you without undue delay and in any event within 14 days of receiving this statement. If the goods have been delivered, please return them within 14 days. The refund may be withheld until we receive the goods back or proof of their return, whichever comes first.",
    order: "Order",
    reference: "Withdrawal reference",
    seller: "Seller",
    statement: "Content of your statement",
    subject: (order: string) => `Withdrawal from order ${order} received`,
    submitted: "Submitted at",
    whole: "The whole order",
    durable: "Keep this e-mail: it is the confirmation of your withdrawal on a durable medium.",
    consents: "Consents you gave with this order",
    consentLine: (version: number, at: string) => `version ${version}, accepted ${at}`,
    defaultStatement: (order: string) => `I hereby give notice that I withdraw from my contract of sale of the goods in order ${order}.`,
  },
  pl: {
    greeting: (name: string) => `Dzień dobry ${name},`,
    intro: "potwierdzamy otrzymanie Twojego oświadczenia o odstąpieniu od umowy.",
    items: "Produkty objęte odstąpieniem:",
    next:
      "Zwrócimy otrzymane od Ciebie płatności niezwłocznie, nie później niż w terminie 14 dni od otrzymania tego oświadczenia. Jeżeli towar został już dostarczony, odeślij go w ciągu 14 dni. Możemy wstrzymać się ze zwrotem płatności do chwili otrzymania towaru lub dostarczenia dowodu jego odesłania, w zależności od tego, które zdarzenie nastąpi wcześniej.",
    order: "Zamówienie",
    reference: "Numer odstąpienia",
    seller: "Sprzedawca",
    statement: "Treść Twojego oświadczenia",
    subject: (order: string) => `Otrzymaliśmy odstąpienie od zamówienia ${order}`,
    submitted: "Data i godzina złożenia",
    whole: "Całe zamówienie",
    durable: "Zachowaj tę wiadomość: to potwierdzenie odstąpienia na trwałym nośniku.",
    consents: "Zgody udzielone przy tym zamówieniu",
    consentLine: (version: number, at: string) => `wersja ${version}, zaakceptowano ${at}`,
    defaultStatement: (order: string) => `Niniejszym informuję o moim odstąpieniu od umowy sprzedaży towarów z zamówienia ${order}.`,
  },
} as const;

export function defaultStatement(locale: string | null, orderDisplayId: string): string {
  const language = languageOf(locale) === "en" ? "en" : "pl";
  return COPY[language].defaultStatement(orderDisplayId);
}

export function renderAcknowledgement(input: AcknowledgementInput): RenderedAcknowledgement {
  const language = languageOf(input.locale) === "en" ? "en" : "pl";
  const copy = COPY[language];
  const statement = input.statement?.trim() || copy.defaultStatement(input.order_display_id);
  const submitted = formatTimestamp(input.submitted_at, language);
  const itemLines = input.whole_order
    ? [copy.whole]
    : input.items.map((item) => `${item.title} x ${item.quantity}`);
  const sellerLines = [input.seller.name, input.seller.address, input.seller.email].filter((line) => line.trim() !== "");

  const textLines = [
    copy.greeting(input.customer_name),
    "",
    copy.intro,
    "",
    `${copy.reference}: ${input.reference}`,
    `${copy.order}: ${input.order_display_id}`,
    `${copy.submitted}: ${submitted}`,
    "",
    `${copy.statement}:`,
    statement,
    "",
    copy.items,
    ...itemLines.map((line) => `- ${line}`),
    "",
    copy.next,
    "",
    copy.durable,
  ];
  const consents = input.consents ?? [];
  if (consents.length > 0) {
    textLines.push("", `${copy.consents}:`);
    for (const consent of consents) {
      textLines.push(`- "${consent.text}" (${copy.consentLine(consent.version, formatTimestamp(consent.accepted_at, language))})`);
    }
  }
  if (sellerLines.length > 0) {
    textLines.push("", `${copy.seller}:`, ...sellerLines);
  }

  const html = [
    `<p>${escapeHtml(copy.greeting(input.customer_name))}</p>`,
    `<p>${escapeHtml(copy.intro)}</p>`,
    "<table>",
    `<tr><th align="left">${escapeHtml(copy.reference)}</th><td>${escapeHtml(input.reference)}</td></tr>`,
    `<tr><th align="left">${escapeHtml(copy.order)}</th><td>${escapeHtml(input.order_display_id)}</td></tr>`,
    `<tr><th align="left">${escapeHtml(copy.submitted)}</th><td>${escapeHtml(submitted)}</td></tr>`,
    "</table>",
    `<p><strong>${escapeHtml(copy.statement)}:</strong><br>${escapeHtml(statement)}</p>`,
    `<p><strong>${escapeHtml(copy.items)}</strong></p>`,
    `<ul>${itemLines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`,
    `<p>${escapeHtml(copy.next)}</p>`,
    `<p>${escapeHtml(copy.durable)}</p>`,
    consents.length > 0
      ? `<p><strong>${escapeHtml(copy.consents)}:</strong></p><ul>${consents
          .map(
            (consent) =>
              `<li>&bdquo;${escapeHtml(consent.text)}&rdquo; (${escapeHtml(copy.consentLine(consent.version, formatTimestamp(consent.accepted_at, language)))})</li>`,
          )
          .join("")}</ul>`
      : "",
    sellerLines.length > 0
      ? `<p><strong>${escapeHtml(copy.seller)}:</strong><br>${sellerLines.map(escapeHtml).join("<br>")}</p>`
      : "",
  ].join("\n");

  return { html, subject: copy.subject(input.order_display_id), text: textLines.join("\n") };
}
