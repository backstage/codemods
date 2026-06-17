# @backstage/v1-51-0-migration-recipe

## 0.2.2

### Patch Changes

- 5d7af9a: Update devDependencies: @codemod.com/jssg-types 1.5.2 → 1.6.2, codemod 1.7.15 → 1.12.3. Fix test fixtures for updated codemod engine formatting.

## 0.2.1

### Patch Changes

- 1a4471c: Restore recipe-level `aiFixup` param (`default: false`) and forward it to child codemods that support an AI fixup step via `args: ['aiFixup']`. Fixes recipe runs failing with `params.aiFixup` is not bound when nested codemods evaluate their optional AI step.

## 0.2.0

### Minor Changes

- 65741ec: Add orchestration recipe that runs every published Backstage 1.51.0 codemod through one workflow.

## 0.1.0

### Minor Changes

- Initial release: orchestration workflow chaining all eight Backstage 1.51.0 codemods in migration order.
