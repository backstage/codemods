# @backstage/v1-50-0-migration-recipe

## 0.3.5

### Patch Changes

- 5d7af9a: Update devDependencies: @codemod.com/jssg-types 1.5.2 → 1.6.2, codemod 1.7.15 → 1.12.3. Fix test fixtures for updated codemod engine formatting.

## 0.3.4

### Patch Changes

- 1a4471c: Restore recipe-level `aiFixup` param (`default: false`) and forward it to child codemods that support an AI fixup step via `args: ['aiFixup']`. Fixes recipe runs failing with `params.aiFixup` is not bound when nested codemods evaluate their optional AI step.

## 0.3.3

### Patch Changes

- 594bc4b: Remove non-functional `aiFixup` param and `args` forwarding from recipe workflow. The Codemod workflow engine does not support param forwarding via `args` on `codemod:` steps. To use AI fixup, run individual codemods with `--param aiFixup=true`.

## 0.3.2

### Patch Changes

- c7c6734: docs: link each step in the migration recipe README to its Codemod registry page instead of the sibling repo directory

## 0.3.1

### Patch Changes

- 97e410c: Rename package from `@backstage/v1.50.0-migration-recipe` to `@backstage/v1-50-0-migration-recipe`. The Codemod registry only allows lowercase letters, numbers, hyphens, and underscores in package names, so the dotted form failed to publish. The directory layout, version-per-Backstage-release intent, and workflow contents are unchanged — only the registry slug.

## 0.3.0

### Minor Changes

- 575aa3c: fixed aiFixup param in all codemods

## 0.2.0

### Minor Changes

- 60737cc: Add `@backstage/v1-50-0-migration-recipe`, an orchestration codemod that runs every published `@backstage/*` v1.50.0 codemod through one workflow. Uses `codemod:` steps so each underlying package is resolved from the registry, and forwards the `aiFixup` param to every step that supports it.
