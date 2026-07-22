# @backstage/migrate-mui-link-to-bui-link

Migrates Material-UI `Link` to Backstage UI `Link`.

## Covers

- Direct `@material-ui/core/Link` and barrel `@material-ui/core` `Link` imports
- Adds `standalone` for bare-looking links (no surrounding inline text siblings)
- Merging into an existing `@backstage/ui` import

## Skips

- Files under `packages/core-components`
- Files that import `Link` from `@backstage/core-components`

## TODOs left for humans

- `component` / `to` (router polymorphic links) — left as MUI with a TODO

## Won't do

- Rewriting `@backstage/core-components` `Link` / `LinkButton`
