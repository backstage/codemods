# @backstage/remove-mui-dependencies

## 0.1.0

### Minor Changes

- Initial release: remove unused `@material-ui/*` dependencies from `package.json` after source files in the same package no longer import them. Uses a TSX scan step plus a JSON transform (`package-json-codemod.ts`), matching the bootstrap codemod layout.
