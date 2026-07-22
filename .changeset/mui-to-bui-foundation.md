---
'@backstage/migrate-mui-bootstrap-to-bui': minor
'@backstage/migrate-mui-icons-to-remix-icons': minor
'@backstage/migrate-mui-styles-to-bui-css-modules': minor
'@backstage/migrate-mui-layout-to-bui-layout': minor
'@backstage/remove-mui-dependencies': minor
'@backstage/mui4-to-bui-migration-recipe': minor
---

Add foundation codemods for the MUI 4 to BUI migration: bootstrap app dependencies and root CSS, replace MUI icons with Remix icons, migrate makeStyles to CSS modules (including creating adjacent CSS module files), convert layout primitives to BUI equivalents with valid TODO fragment wrappers, remove unused @material-ui/\* dependencies from package.json after migration, and ship an ordered family migration recipe.
