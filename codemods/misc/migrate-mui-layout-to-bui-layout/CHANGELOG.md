# @backstage/migrate-mui-layout-to-bui-layout

## 0.2.3

### Patch Changes

- 9a9e903: Update codemod runtime and development dependencies

## 0.2.2

### Patch Changes

- f2b262f: Close remaining MUI→BUI review gaps: Link coexistence/aliasing + path skip, Paper default-elevation TODO, outlined→secondary metric, README/recipe operator docs.
- fcc87ed: Fix MUI 4 → BUI transforms: Typography maps only valid TextVariants, Paper never becomes Surface (Box bg=neutral / Card / TODO), and IconButton defaults to tertiary with color + onPress mapping.

## 0.2.1

### Patch Changes

- 0c67fc5: Update workspace engine deps: `codemod` 1.12.3 → 1.12.13, `@jssg/utils` ^0.0.8 → ^0.0.9.

## 0.2.0

### Minor Changes

- 500a0cd: Add foundation codemods for the MUI 4 to BUI migration: bootstrap app dependencies and root CSS, replace MUI icons with Remix icons, migrate makeStyles to CSS modules (including creating adjacent CSS module files), convert layout primitives to BUI equivalents with valid TODO fragment wrappers, remove unused @material-ui/\* dependencies from package.json after migration, and ship an ordered family migration recipe.

## 0.1.0

### Minor Changes

- Initial release: migrate MUI layout primitives (`Box`, `Paper`, `Grid`) to Backstage UI layout components during the MUI 4 to BUI migration.
