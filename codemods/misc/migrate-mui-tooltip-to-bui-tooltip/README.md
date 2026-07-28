# @backstage/migrate-mui-tooltip-to-bui-tooltip

Migrates MUI `Tooltip` toward Backstage UI `TooltipTrigger`.

## Covers

- Simple wrapper + title patterns (static and dynamic title)
- Named barrel imports; merge into existing `@backstage/ui`
- Drops unsupported placement props where needed

## TODOs / won't-do

- Controlled open state (`controlled-todo`)
- Perfect placement / delay parity

## Test

```bash
yarn test
```
