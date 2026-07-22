# @backstage/remove-mui-dependencies

## 0.2.0

### Minor Changes

- 500a0cd: Add foundation codemods for the MUI 4 to BUI migration: bootstrap app dependencies and root CSS, replace MUI icons with Remix icons, migrate makeStyles to CSS modules (including creating adjacent CSS module files), convert layout primitives to BUI equivalents with valid TODO fragment wrappers, remove unused @material-ui/\* dependencies from package.json after migration, and ship an ordered family migration recipe.

## 0.1.0

### Minor Changes

- Initial release: remove unused `@material-ui/*` dependencies from `package.json` after source files in the same package no longer import them. Uses a TSX scan step plus a JSON transform (`package-json-codemod.ts`), matching the bootstrap codemod layout.
