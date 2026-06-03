# @backstage/v1-48-0-migration-recipe

## 0.2.1

### Patch Changes

- ee8ba26: Fix recipe validation issues found during v1.45–v1.49 testing against the Backstage monorepo:

  - **v1.46.0 `add-jest-peer-dependency`**: Skip workspace member packages that inherit jest from the workspace root. Previously the codemod added redundant `jest`, `@types/jest`, `@jest/environment-jsdom-abstract`, and `jsdom` devDependencies to every sub-package even when the workspace root already provides them.
  - **v1.48.0 migration recipe**: Add `params.aiFixup` declaration and forward `args: ['aiFixup']` to `migrate-surface-to-bg-system` and `migrate-column-config-to-react-element`. Without this, running the recipe fails with `Variable identifier is not bound to anything by context: "params.aiFixup"`.
  - **v1.49.0 migration recipe**: Same `params.aiFixup` fix — add declaration and forward to `remove-create-public-sign-in-app`.

## 0.2.0

### Minor Changes

- 5f05828: Add Backstage 1.48.0 migration recipe chaining all v1.48 codemods
