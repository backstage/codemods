# @backstage/migrate-mui-bootstrap-to-bui

Bootstraps `@backstage/ui` / `@remixicon/react` dependencies and root BUI CSS for MUI 4 → BUI migrations.

## Covers

- Adds BUI + Remix deps when `@material-ui/*` is present
- Ensures a root CSS import where MUI is used
- Merges with existing BUI setup when already partially present

## TODOs / won't-do

- No-ops when there is no MUI usage (`noop-no-import`, icons-only / multi-import guards)
- Full theme / design-token migration

## Test

```bash
yarn test
```
