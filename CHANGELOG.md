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
