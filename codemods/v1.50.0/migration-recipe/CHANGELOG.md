# @backstage/v1.50.0-migration-recipe

## 0.2.0

### Minor Changes

- 60737cc: Add `@backstage/v1.50.0-migration-recipe`, an orchestration codemod that runs every published `@backstage/*` v1.50.0 codemod through one workflow. Uses `codemod:` steps so each underlying package is resolved from the registry, and forwards the `aiFixup` param to every step that supports it.
