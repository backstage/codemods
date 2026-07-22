# @backstage/migrate-permissioned-route

## 0.3.2

### Patch Changes

- 0c67fc5: Update workspace engine deps: `codemod` 1.12.3 → 1.12.13, `@jssg/utils` ^0.0.8 → ^0.0.9.

## 0.3.1

### Patch Changes

- 5d7af9a: Update devDependencies: @codemod.com/jssg-types 1.5.2 → 1.6.2, codemod 1.7.15 → 1.12.3. Fix test fixtures for updated codemod engine formatting.

## 0.3.0

### Minor Changes

- 594bc4b: Add optional AI fixup step for edge cases the AST codemod cannot handle mechanically (re-exports, type annotations, dynamic element props). Enable with `--param aiFixup=true`.

## 0.2.0

### Minor Changes

- 575aa3c: fixed aiFixup param in all codemods
