# @backstage/migrate-mui-icon-button-to-button-icon

## 0.2.2

### Patch Changes

- 5556ca0: Preserve MUI medium density on BUI migrations by emitting size="medium" when size is omitted (BUI defaults to small).
- fcc87ed: Fix MUI 4 → BUI transforms: Typography maps only valid TextVariants, Paper never becomes Surface (Box bg=neutral / Card / TODO), and IconButton defaults to tertiary with color + onPress mapping.

## 0.2.1

### Patch Changes

- 0c67fc5: Update workspace engine deps: `codemod` 1.12.3 → 1.12.13, `@jssg/utils` ^0.0.8 → ^0.0.9.

## 0.2.0

### Minor Changes

- 264eb4c: Add core component codemods for the MUI 4 to BUI migration: Typography to Text, Alert, Button, IconButton to ButtonIcon, and Tooltip to TooltipTrigger.

## 0.1.0

### Minor Changes

- Initial release: migrate MUI `IconButton` to Backstage UI `ButtonIcon` during the MUI 4 to BUI migration.
