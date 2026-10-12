# @backstage/migrate-mui-chip-to-tag

## 0.2.3

### Patch Changes

- 9a9e903: Update codemod runtime and development dependencies

## 0.2.2

### Patch Changes

- 5556ca0: Preserve MUI medium density on BUI migrations by emitting size="medium" when size is omitted (BUI defaults to small).
- 8f2d17c: Fall back to parent FormControl size for TextField density, and treat ternary/expression size props as dynamic across Select/Autocomplete/Chip/TextField.
- bd3ac57: Add thin operator README stubs (covers / TODOs / won't-do) for existing MUI 4 → BUI packages.

## 0.2.1

### Patch Changes

- 0c67fc5: Update workspace engine deps: `codemod` 1.12.3 → 1.12.13, `@jssg/utils` ^0.0.8 → ^0.0.9.

## 0.2.0

### Minor Changes

- 7d0a74c: Add complex component codemods for the MUI 4 to BUI migration: Dialog, Tabs, Menu/Popover, List family, and Chip to Tag.

### Patch Changes

- fcc48c8: Prune migrated symbols from partial `@material-ui/*` barrel imports and align TODO / BUI import helpers with the core MUI→BUI dialect.

## 0.1.0

### Minor Changes

- Initial release: migrate MUI Chip to Backstage UI Tag (package omits -bui- because the BUI export is Tag).
