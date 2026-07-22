# @backstage/migrate-mui-link-to-bui-link

Migrates Material-UI `Link` to Backstage UI `Link`.

## Covers

- Direct `@material-ui/core/Link` and barrel `@material-ui/core` `Link` imports
- Coexistence with `@backstage/core-components` `Link` (including deep `/Link` imports) via `Link as BuiLink`
- `standalone` only when MUI used `underline="none"`
- Merging into an existing `@backstage/ui` import

## Skips

- Files under `packages/core-components` (path segment match only)

## TODOs left for humans

- `component` / `to` (router polymorphic links) — left as MUI with a TODO

## Won't do

- Rewriting `@backstage/core-components` `Link` / `LinkButton`
