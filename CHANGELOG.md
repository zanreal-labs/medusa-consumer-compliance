# Changelog

All notable changes to `@zanreal/medusa-consumer-compliance` are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html). A version
reaches npm only through a GitHub Release.

## [Unreleased]

### Added

- Price history per variant and pricing context, recorded from events, an hourly
  sweep and a backfill, with retention that keeps what a running reduction needs.
- Omnibus reference price by the Polish rules (art. 4 ust. 2 to 4 of the price
  information act, UOKiK guidance): calendar-day window in Polish time, gradual
  reductions per step, products on offer under 30 days, perishable goods,
  relaunch after a break, statutory labels, external price windows for discount
  code campaigns.
- Unit price per variant with the par. 4 to 7 rules of the 2022 price display
  regulation, and the deposit (kaucja) as a separate amount.
- GPSR product safety data with reusable economic operators and a gap report.
- Online withdrawal function: lookup, two-step request and confirmation,
  per-item eligibility and deadlines, acknowledgement on a durable medium, admin
  register.
- Reviews and personalised pricing disclosures.
- Admin UI in Polish and English.
- `withdrawal.digitalOnly` for stores that sell only digital content (ESD keys):
  every line is digital content; with `digital_content_consent_at` on the order
  the lookup answers "no right of withdrawal" with the art. 38 ust. 1 pkt 13
  legal basis, without it the 14-day right applies and the admin register flags
  the missing consent.
- Lookup assessment gains `right_of_withdrawal`, `legal_basis`,
  `digital_consent_at` and `digital_consent_missing`.

- Checkout consents: definitions with versioned PL/EN text and rules by product
  flag, type, tag, collection, category, product or always; Store API to list and
  accept them on a cart; server-side enforcement in the `completeCartWorkflow`
  validate hook (`consent_required`, `consent_version_outdated`); an immutable
  per-order snapshot (text, locale, version, linked document hash, time, IP, user
  agent), the "Zgody klienta" admin widget, JSON/CSV export, and the snapshot
  quoted in the withdrawal acknowledgement.
- Seeded `digital_immediate_delivery` consent (art. 38 ust. 1 pkt 13); lines it
  covered have no right of withdrawal, with the legal basis per item.
- Marketplace orders (`allegro_checkout_form_id`, `externalSalesChannelIds`) are
  recognised and left alone; the withdrawal lookup answers
  `external_marketplace_order`.
- Every subscriber is fail-safe.
- OpenAPI contract `openapi/consumer-compliance.openapi.json` with a drift test.

### Changed

- The storefront guide was replaced by a framework-agnostic frontend API contract.

### Documentation

- Recorded the decisions: draft UC169 labels as defaults (re-check on
  publication), order number plus e-mail as guest identification.
