# @backstage/migrate-mui-typography-to-text

## 0.2.2

### Patch Changes

- f2b262f: Close remaining MUI→BUI review gaps: Link coexistence/aliasing + path skip, Paper default-elevation TODO, outlined→secondary metric, README/recipe operator docs.
- fcc87ed: Fix MUI 4 → BUI transforms: Typography maps only valid TextVariants, Paper never becomes Surface (Box bg=neutral / Card / TODO), and IconButton defaults to tertiary with color + onPress mapping.
- dc35e56: Keep MUI heading weight for h5/h6 (title scale) and emit matching as elements so Text stays block-level in stacks and cards.

## 0.2.1

### Patch Changes

- 0c67fc5: Update workspace engine deps: `codemod` 1.12.3 → 1.12.13, `@jssg/utils` ^0.0.8 → ^0.0.9.

## 0.2.0

### Minor Changes

- 264eb4c: Add core component codemods for the MUI 4 to BUI migration: Typography to Text, Alert, Button, IconButton to ButtonIcon, and Tooltip to TooltipTrigger.

## 0.1.0

### Minor Changes

- Initial release: migrate MUI `Typography` / `DialogContentText` to Backstage UI `Text` during the MUI 4 to BUI migration.
