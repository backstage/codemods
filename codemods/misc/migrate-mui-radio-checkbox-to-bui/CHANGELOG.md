# @backstage/migrate-mui-radio-checkbox-to-bui

## 0.2.1

### Patch Changes

- 0c67fc5: Update workspace engine deps: `codemod` 1.12.3 → 1.12.13, `@jssg/utils` ^0.0.8 → ^0.0.9.

## 0.2.0

### Minor Changes

- 9627d0b: Add form control codemods for the MUI 4 to BUI migration: Select, TextField, Accordion, radio/checkbox groups, and Slider.

### Patch Changes

- 9a32d15: Align form-control MUI→BUI transforms with the core dialect: partial barrel prune, `withTodoComment`, imported-name `addBuiImport` merges, and rename the radio/checkbox package directory to match its published name.

## 0.1.0

### Minor Changes

- Initial release: migrate MUI radio and checkbox group patterns to Backstage UI `RadioGroup` / `CheckboxGroup` during the MUI 4 to BUI migration.
