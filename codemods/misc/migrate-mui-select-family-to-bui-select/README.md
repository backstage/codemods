# @backstage/migrate-mui-select-family-to-bui-select

Migrates MUI Select wrapper patterns to Backstage UI Select.

## Covers

- Basic FormControl + Select + MenuItem patterns
- Named / partial barrel imports
- Merging into an existing `@backstage/ui` import
- MUI density/size remapping (`small` → `small`, omitted/`medium`/`large` → `medium`; FormControl fallback)

## TODOs / won't-do

- Helper text edge cases (`helper-text-todo`)
- Multi-select (`multiple-select-todo`)
- Native select / custom renderValue

## Test

```bash
yarn test
```
