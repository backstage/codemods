# @backstage/migrate-mui-button-to-bui-button

## 0.3.1

### Patch Changes

- 9a9e903: Update codemod runtime and development dependencies

## 0.3.0

### Minor Changes

- fcc87ed: Harden MUI 4 → BUI migrations: Button icons/href/onPress, TextField specialized variants, Popover vs Menu heuristic, and standalone Checkbox.

### Patch Changes

- 5556ca0: Preserve MUI medium density on BUI migrations by emitting size="medium" when size is omitted (BUI defaults to small).
- f2b262f: Close remaining MUI→BUI review gaps: Link coexistence/aliasing + path skip, Paper default-elevation TODO, outlined→secondary metric, README/recipe operator docs.

## 0.2.1

### Patch Changes

- 0c67fc5: Update workspace engine deps: `codemod` 1.12.3 → 1.12.13, `@jssg/utils` ^0.0.8 → ^0.0.9.

## 0.2.0

### Minor Changes

- 264eb4c: Add core component codemods for the MUI 4 to BUI migration: Typography to Text, Alert, Button, IconButton to ButtonIcon, and Tooltip to TooltipTrigger.

## 0.1.0

### Minor Changes

- Initial release: migrate MUI `Button` to Backstage UI `Button` with variant mapping (contained→primary, outlined→secondary, text→tertiary) during the MUI 4 to BUI migration.
