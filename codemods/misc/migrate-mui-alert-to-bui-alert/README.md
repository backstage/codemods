# @backstage/migrate-mui-alert-to-bui-alert

Migrates MUI 4 `Alert` to Backstage UI `Alert`.

## Covers

- Deep `@material-ui/core/Alert` and barrel imports
- Common severity / children patterns
- Merging into an existing `@backstage/ui` import

## TODOs / won't-do

- Unsupported MUI Alert props and action layouts beyond the happy path
- Custom Alert wrappers

## Test

```bash
yarn test
```
