# @backstage/migrate-mui-avatar-to-bui-avatar

Migrates MUI 4 `Avatar` usage to Backstage UI `Avatar`.

## Covers

- Named barrel and deep `@material-ui/core/Avatar` imports
- `alt` → `name` when `name` is absent; requires `src` (empty string when missing)
- Reasonable pixel `style` width/height → BUI `size`
- Merging into an existing `@backstage/ui` import

## TODOs left for humans

- Missing both `name` and `alt`
- Unknown / unmapped sizes
- `variant`, `classes`, and other unsupported MUI props

## Won't do

- Rewriting custom children renderings beyond initials fallback via `name`
