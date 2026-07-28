# @backstage/migrate-mui-textfield-to-bui-textfield

Migrates MUI `TextField` to BUI `TextField` / `TextAreaField` / `PasswordField` / `NumberField`.

## Covers

- Basic controlled TextField; `helperText` → `description`
- `multiline` → TextAreaField; password / number branching
- Named / partial barrel imports; merge into existing `@backstage/ui`
- MUI density/size remapping (`small` → `small`, omitted/`medium`/`large` → `medium`; parent FormControl `size` fallback)

## TODOs / won't-do

- Complex `onChange` handlers (`complex-on-change-todo`)
- Select-mode TextField and adornment-heavy layouts

## Test

```bash
yarn test
```
