# @backstage/migrate-mui-button-to-bui-button

Migrates MUI 4 `Button` to Backstage UI `Button` / `ButtonLink`.

## Covers

- `variant="contained"` → `variant="primary"`
- `variant="outlined"` → `variant="secondary"` (intentional silent remap; metric `outlined-to-secondary`)
- `variant="text"` → `variant="tertiary"`
- Omitted `variant` → `variant="tertiary"` (MUI default is text; BUI default is primary)
- `startIcon` / `endIcon` → `iconStart` / `iconEnd`
- Simple `onClick` → `onPress`
- `href` present → `ButtonLink` (same variant mapping)
- Density: omitted / `medium` / `large` → `size="medium"` (BUI default is `small`; MUI default is medium); `small` preserved

## TODOs / won't-do

- Dynamic / unknown `variant` or `size` values left with `TODO(backstage-codemod)`
- Theme-level Button overrides, `classes`

## Test

```bash
yarn test
```
