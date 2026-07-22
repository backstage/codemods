# migrate-mui-button-to-bui-button

Migrates MUI 4 `Button` to Backstage UI `Button` / `ButtonLink`.

## Silent mappings

- `variant="outlined"` → `variant="secondary"` (BUI secondary is the outlined visual)
- `variant="contained"` → `variant="primary"`
- `variant="text"` → `variant="tertiary"`
- omitted `variant` → `variant="tertiary"` (MUI default is text; BUI default is primary)
- `startIcon` / `endIcon` → `iconStart` / `iconEnd`
- Simple `onClick` handlers → `onPress`
- `href` present → `ButtonLink` (same variant mapping)
