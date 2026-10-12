# @backstage/migrate-mui-select-family-to-bui-select

## 0.2.3

### Patch Changes

- 9a9e903: Update codemod runtime and development dependencies

## 0.2.2

### Patch Changes

- 86e3063: Rewrite remaining MUI→BUI helper transforms to be AST-first (no regex source rewriting).
- 0da8de5: Preserve MUI medium density for Select and Autocomplete→Combobox/SearchAutocomplete, including FormControl and renderInput size fallbacks.
- 8f2d17c: Fall back to parent FormControl size for TextField density, and treat ternary/expression size props as dynamic across Select/Autocomplete/Chip/TextField.
- bd3ac57: Add thin operator README stubs (covers / TODOs / won't-do) for existing MUI 4 → BUI packages.

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

- Initial release: migrate MUI Select wrapper patterns (`FormControl` / `InputLabel` / `Select` / `MenuItem`) to Backstage UI `Select` during the MUI 4 to BUI migration.
