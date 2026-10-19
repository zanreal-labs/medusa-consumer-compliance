# @zanreal/medusa-consumer-compliance

A [Medusa v2](https://medusajs.com) plugin for the EU and Polish consumer-protection
duties of an online shop: the **Omnibus** 30-day lowest price, **unit prices**,
**GPSR** product safety information, the online **withdrawal function** of
Directive (EU) 2023/2673, and the **reviews** and **personalised pricing**
disclosures.

Full documentation, in English and Polish, is authored in [`docs/`](./docs) and
will be published at <https://zanreal.com/docs/oss/medusa-consumer-compliance>.
The legal basis of every rule, with sources and dates, is in
[`docs/legal.en.mdx`](./docs/legal.en.mdx).

> **Not legal advice.** The plugin supports compliance; it does not guarantee it.
> Have your labels, terms and processes reviewed by a lawyer.

## What it does

- **Price history.** Records every price a customer could see, per variant and
  pricing context (region and currency, price lists and their schedules applied),
  from product and price events, an hourly sweep and an on-demand backfill. Never
  edits a recorded price; keeps at least the window, 400 days by default.
- **Omnibus reference price.** The lowest price of the 30 calendar days (Polish
  time) before a reduction, with the Polish rules: each step of a gradual
  reduction measured on its own (Poland did not adopt art. 6a(5)), products on
  offer for less than 30 days, perishable goods, relaunch after a break, and the
  label UOKiK expects. Warns when the history is incomplete or when the "reduced"
  price is not below the reference.
- **Unit price.** Net quantity, unit, drained weight, the par. 7 exemptions and the
  deposit (kaucja) per variant; the unit price computed from the live price.
- **GPSR.** Manufacturers and EU responsible persons as reusable records, product
  identifiers, warnings and safety information in Polish, and a report of products
  with gaps.
- **Withdrawal.** Order lookup for guests and customers, the two-step statement
  and confirmation, per-item eligibility and deadlines (delivery or contract date,
  art. 111 and 115 of the Civil Code, Polish holidays, statutory exceptions), the
  acknowledgement on a durable medium through the notification module, and an
  admin register.
- **Disclosures.** Localised texts for review verification and personalised
  pricing, served by the Store API.
- **Admin** in Polish and English: product widgets (compliance, price history with
  chart), an order widget, a Withdrawals register and Settings > Consumer
  compliance.

## Install

```bash
pnpm add @zanreal/medusa-consumer-compliance
```

```ts
// medusa-config.ts
plugins: [
  {
    resolve: "@zanreal/medusa-consumer-compliance",
    options: {
      withdrawal: { seller: { name: "Shop sp. z o.o.", address: "ul. Prosta 1, Warszawa", email: "shop@example.com" } },
    },
  },
],
```

```bash
npx medusa db:migrate
```

Every option has a default matching Polish law; values that would fall below a
legal minimum (the 30-day window, the 14-day withdrawal period) are raised to it.
See [`docs/options.en.mdx`](./docs/options.en.mdx).

## Store API

| Route | Purpose |
| --- | --- |
| `GET /store/products/:id/compliance` | Omnibus, unit price and deposit per variant, GPSR block. |
| `GET /store/consumer-compliance/variants?ids=` | The same for up to 100 variants (listings). |
| `GET /store/consumer-compliance/variants/:id/omnibus` | One variant's Omnibus block. |
| `GET /store/consumer-compliance/disclosures` | Review and personalised pricing texts, withdrawal labels. |
| `POST /store/consumer-compliance/withdrawals/lookup` | Eligible items and deadlines for an order. |
| `POST /store/consumer-compliance/withdrawals` | Step one: the statement. |
| `POST /store/consumer-compliance/withdrawals/:id/confirm` | Step two: submission and acknowledgement. |
| `GET /store/consumer-compliance/withdrawals` | A logged-in customer's withdrawals. |

Reference: [`docs/store-api.en.mdx`](./docs/store-api.en.mdx). Storefront snippets:
[`docs/storefront.en.mdx`](./docs/storefront.en.mdx).

## Development

```bash
pnpm install
pnpm test                # typecheck (backend and admin) + unit tests
pnpm run test:integration  # builds, then module and HTTP suites against Postgres
pnpm build
```

The integration suites need a Postgres the tests may create databases in:

```bash
DB_HOST=localhost DB_PORT=5432 DB_USERNAME=postgres DB_PASSWORD=postgres \
DB_TEMP_NAME=medusa_consumer_compliance_it pnpm run test:integration
```

`DB_HOST` must be literally `localhost`: `@medusajs/test-utils` enables SSL for
any other host. CI runs lint, both typechecks, unit tests, the build, both
integration suites and the migration drift checks.

## Releasing

Same as the sibling plugins: a GitHub Release runs `.github/workflows/release.yml`,
which publishes to npm with provenance from the `npm` environment. A published
version cannot be replaced, so nothing is published from a laptop.

## License

MIT
