# @backstage/migrate-mui-menu-popover-to-bui-menu

Migrates MUI Menu **or** Popover to BUI `Menu` / `Popover`.

## Covers

- Simple Menu → BUI Menu with trigger
- Popover containing MenuList/MenuItem → BUI Menu
- Other Popover content → BUI Popover (with or without adjacent trigger)

## TODOs / won't-do

- Complex `anchorEl` wiring (`anchor-el-todo`)
- Multi-button / ambiguous trigger selection beyond fixtures
- Perfect positioning / transition parity

## Test

```bash
yarn test
```
