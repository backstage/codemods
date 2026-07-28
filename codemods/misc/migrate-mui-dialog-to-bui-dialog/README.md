# @backstage/migrate-mui-dialog-to-bui-dialog

Migrates MUI 4 Dialog shell patterns to Backstage UI `Dialog`.

## Covers

- Named / partial barrel Dialog imports
- Controlled dialog open/close happy paths
- Merging into an existing `@backstage/ui` import

## TODOs / won't-do

- Complex `onClose` handlers (`complex-on-close-todo`)
- `fullWidth` / maxWidth sizing (`full-width-todo`)
- Custom Dialog wrappers and transition props

## Test

```bash
yarn test
```
