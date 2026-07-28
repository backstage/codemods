# @backstage/migrate-mui-icon-button-to-button-icon

Migrates MUI 4 `IconButton` to Backstage UI `ButtonIcon`.

## Covers

- Named barrel imports; default `variant="tertiary"`
- Color mapping (`color-primary`, `color-secondary`); `onClick` → `onPress`
- Dropped unsupported props; merge into existing `@backstage/ui` import

## TODOs / won't-do

- Complex children (`complex-children-todo`)
- Missing `aria-label` (`missing-aria-label-todo`)
- Spread-prop-only call sites beyond best-effort handling

## Test

```bash
yarn test
```
