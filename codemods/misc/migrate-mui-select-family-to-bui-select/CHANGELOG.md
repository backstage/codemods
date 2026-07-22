# @backstage/migrate-mui-select-family-to-bui-select

## 0.2.0

### Minor Changes

- 9627d0b: Add form control codemods for the MUI 4 to BUI migration: Select, TextField, Accordion, radio/checkbox groups, and Slider.

### Patch Changes

- 9a32d15: Align form-control MUI→BUI transforms with the core dialect: partial barrel prune, `withTodoComment`, imported-name `addBuiImport` merges, and rename the radio/checkbox package directory to match its published name.

## 0.1.0

### Minor Changes

- Initial release: migrate MUI Select wrapper patterns (`FormControl` / `InputLabel` / `Select` / `MenuItem`) to Backstage UI `Select` during the MUI 4 to BUI migration.
