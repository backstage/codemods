# @backstage/migrate-mui-typography-to-text

Migrates MUI `Typography` to Backstage UI `Text` (valid TextVariants only).

## Covers

- Body / heading variants mapped to BUI Text variants
- Named barrel imports; merge into existing `@backstage/ui`
- Drops `gutterBottom` where unsupported

## TODOs / won't-do

- Unmapped variants (`unmapped-variant-todo`)
- Theme typography overrides / custom variant maps

## Test

```bash
yarn test
```
