# @backstage/migrate-mui-switch-to-bui-switch

Migrates MUI 4 `Switch` usage to Backstage UI `Switch`.

## Covers

- Named barrel and deep `@material-ui/core/Switch` imports
- `FormControlLabel` wrapping `Switch` → BUI `Switch` with `label`
- `disabled` → `isDisabled`, `checked` → `isSelected`, `defaultChecked` → `defaultSelected`
- Merging into an existing `@backstage/ui` import

## TODOs left for humans

- Non-string `FormControlLabel` labels
- Unsupported MUI Switch props (`color`, `size`, `edge`, `classes`, …)

## Won't do

- Non-Switch `FormControlLabel` controls (handled by radio/checkbox codemod)
