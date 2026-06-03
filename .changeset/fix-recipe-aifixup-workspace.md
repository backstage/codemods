---
'@backstage/add-jest-peer-dependency': patch
'@backstage/v1-48-0-migration-recipe': patch
'@backstage/v1-49-0-migration-recipe': patch
---

Fix recipe validation issues found during v1.45–v1.49 testing against the Backstage monorepo:

- **v1.46.0 `add-jest-peer-dependency`**: Skip workspace member packages that inherit jest from the workspace root. Previously the codemod added redundant `jest`, `@types/jest`, `@jest/environment-jsdom-abstract`, and `jsdom` devDependencies to every sub-package even when the workspace root already provides them.
- **v1.48.0 migration recipe**: Add `params.aiFixup` declaration and forward `args: ['aiFixup']` to `migrate-surface-to-bg-system` and `migrate-column-config-to-react-element`. Without this, running the recipe fails with `Variable identifier is not bound to anything by context: "params.aiFixup"`.
- **v1.49.0 migration recipe**: Same `params.aiFixup` fix — add declaration and forward to `remove-create-public-sign-in-app`.
