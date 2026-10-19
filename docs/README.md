# docs/

The published documentation for `@zanreal/medusa-consumer-compliance`.

These pages are the source of what will render at
<https://zanreal.com/docs/oss/medusa-consumer-compliance> once the repository is
public and added to the marketing site's docs sync
(`apps/marketing/scripts/sync-oss-docs.mjs`). The sync clones this repository and
copies the `.mdx` pages and `meta*.json` files; nothing is maintained by hand on the
other side.

## Layout

| File | Purpose |
| --- | --- |
| `index.*.mdx` | Overview, scope, installation, disclaimer. |
| `omnibus.*.mdx` | Price history and the 30-day reference price. |
| `unit-prices.*.mdx` | Net quantity, unit price, deposit (kaucja). |
| `product-safety.*.mdx` | GPSR data, economic operators, accessibility notes. |
| `withdrawal.*.mdx` | The online withdrawal function, deadlines, the model form. |
| `disclosures.*.mdx` | Reviews and personalised pricing texts. |
| `store-api.*.mdx` | Store API reference. |
| `storefront.*.mdx` | How a storefront renders all of it, with snippets. |
| `options.*.mdx` | Plugin options and the admin API. |
| `legal.*.mdx` | Compliance matrix, sources with dates, open questions. |
| `meta.json`, `meta.pl.json` | Sidebar title, description and page order, per locale. |

This `README.md` is deliberately **not** copied by the sync.

## Conventions

- **Every page exists in both locales**, suffixed `.en.mdx` and `.pl.mdx`.
- **Cross-links are relative** and point at the file, for example
  `[Options](./options.en.mdx)`. The sync rewrites them to site routes.
- **No em or en dashes.** Use a spaced hyphen for a parenthetical.
- **No braces or angle brackets in prose**: MDX would read them as code.
