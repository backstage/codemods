# @backstage/migrate-mui-bootstrap-to-bui

## 0.2.0

### Minor Changes

- 500a0cd: Add foundation codemods for the MUI 4 to BUI migration: bootstrap app dependencies and root CSS, replace MUI icons with Remix icons, migrate makeStyles to CSS modules (including creating adjacent CSS module files), convert layout primitives to BUI equivalents with valid TODO fragment wrappers, remove unused @material-ui/\* dependencies from package.json after migration, and ship an ordered family migration recipe.

## 0.1.0

### Minor Changes

- Initial release: add `@backstage/ui` and `@remixicon/react` dependencies to `package.json` and insert the global BUI stylesheet in app/plugin entry files during the MUI 4 to BUI migration.
