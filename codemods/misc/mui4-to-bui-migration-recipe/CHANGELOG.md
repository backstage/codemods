# @backstage/mui4-to-bui-migration-recipe

## 0.3.0

### Minor Changes

- fcc87ed: Add Avatar, Skeleton, Link, Card, Autocomplete→Combobox, and Switch codemods; update the MUI 4 → BUI recipe order and local workflow for pre-publish dry-runs.

### Patch Changes

- 5556ca0: Preserve MUI medium density on BUI migrations by emitting size="medium" when size is omitted (BUI defaults to small).
- 0da8de5: Preserve MUI medium density for Select and Autocomplete→Combobox/SearchAutocomplete, including FormControl and renderInput size fallbacks.
- 8f2d17c: Fall back to parent FormControl size for TextField density, and treat ternary/expression size props as dynamic across Select/Autocomplete/Chip/TextField.
- f2b262f: Close remaining MUI→BUI review gaps: Link coexistence/aliasing + path skip, Paper default-elevation TODO, outlined→secondary metric, README/recipe operator docs.
- dc35e56: Keep MUI heading weight for h5/h6 (title scale) and emit matching as elements so Text stays block-level in stacks and cards.

## 0.2.2

### Patch Changes

- 6f0bb6c: Fix the MUI 4 to BUI migration recipe: point the radio/checkbox step at the published `@backstage/migrate-mui-radio-checkbox-to-bui` package, align step order with the family plan, and document manual follow-up plus out-of-scope items.

## 0.2.1

### Patch Changes

- 0c67fc5: Update workspace engine deps: `codemod` 1.12.3 → 1.12.13, `@jssg/utils` ^0.0.8 → ^0.0.9.

## 0.2.0

### Minor Changes

- 500a0cd: Add foundation codemods for the MUI 4 to BUI migration: bootstrap app dependencies and root CSS, replace MUI icons with Remix icons, migrate makeStyles to CSS modules (including creating adjacent CSS module files), convert layout primitives to BUI equivalents with valid TODO fragment wrappers, remove unused @material-ui/\* dependencies from package.json after migration, and ship an ordered family migration recipe.

## 0.1.0

### Minor Changes

- Initial release: ordered migration recipe for the full MUI 4 to BUI family (bootstrap → component/icon/style/layout transforms → dependency cleanup).
