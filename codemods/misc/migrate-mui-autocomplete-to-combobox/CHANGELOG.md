# @backstage/migrate-mui-autocomplete-to-combobox

## 0.2.1

### Patch Changes

- 9a9e903: Update codemod runtime and development dependencies

## 0.2.0

### Minor Changes

- fcc87ed: Add Avatar, Skeleton, Link, Card, Autocomplete→Combobox, and Switch codemods; update the MUI 4 → BUI recipe order and local workflow for pre-publish dry-runs.

### Patch Changes

- 86e3063: Rewrite remaining MUI→BUI helper transforms to be AST-first (no regex source rewriting).
- 0da8de5: Preserve MUI medium density for Select and Autocomplete→Combobox/SearchAutocomplete, including FormControl and renderInput size fallbacks.
- 8f2d17c: Fall back to parent FormControl size for TextField density, and treat ternary/expression size props as dynamic across Select/Autocomplete/Chip/TextField.

## 0.1.0

### Minor Changes

- Initial release: heuristically migrate MUI `Autocomplete` to Backstage UI `Combobox` or `SearchAutocomplete` during the MUI 4 to BUI migration.
