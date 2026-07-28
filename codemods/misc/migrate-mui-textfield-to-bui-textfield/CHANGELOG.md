# @backstage/migrate-mui-textfield-to-bui-textfield

## 0.3.0

### Minor Changes

- fcc87ed: Harden MUI 4 → BUI migrations: Button icons/href/onPress, TextField specialized variants, Popover vs Menu heuristic, and standalone Checkbox.

### Patch Changes

- 86e3063: Rewrite remaining MUI→BUI helper transforms to be AST-first (no regex source rewriting).
- 5556ca0: Preserve MUI medium density on BUI migrations by emitting size="medium" when size is omitted (BUI defaults to small).
- 8f2d17c: Fall back to parent FormControl size for TextField density, and treat ternary/expression size props as dynamic across Select/Autocomplete/Chip/TextField.

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

- Initial release: migrate MUI `TextField` to Backstage UI `TextField` during the MUI 4 to BUI migration.
