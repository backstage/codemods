# @backstage/v1-51-0-migration-recipe

## 0.3.1

### Patch Changes

- beeeef5: Refactor: use @jssg/utils for common codemod transformations

  Replace hand-rolled import manipulation (add/remove/rename/resolve, binding
  resolution, reference renaming, indent detection) across the codemod scripts
  with the shared helpers from `@jssg/utils/javascript/{imports,bindings,style}`,
  and standardize every recipe on `@jssg/utils ^0.0.11`. Behavior-preserving:
  all fixture suites, metrics, and workflow goldens pass unchanged apart from
  formatting-only fixture updates (removed import statements no longer leave a
  blank line; merged import specifiers keep source order instead of being
  re-sorted).

  Also fixes the `migrate-extension-config-schema` typed-extension fixture
  type-check by declaring the packages it imports (`@backstage/frontend-plugin-api`,
  `zod`) as dev dependencies of the v1.54 recipe.

## 0.3.0

### Minor Changes

- 6e77d34: Include app-config.yml and app-config.*.yml files in app-config migrations, matching existing YAML coverage.
- 57363b7: Consolidate the Backstage 1.51.0 codemods into a flattened migration recipe with local scripts, bundled fixture suites, and optional AI fixups.
- cdbb212: Metric identifiers were renamed to match logical migration stems, shared across language variants. Sub-action metrics now use stem-derived names. Consumers must update dashboards tracking the old identifiers.

## 0.2.4

### Patch Changes

- 9a9e903: Update codemod runtime and development dependencies

## 0.2.3

### Patch Changes

- 0c67fc5: Update workspace engine deps: `codemod` 1.12.3 → 1.12.13, `@jssg/utils` ^0.0.8 → ^0.0.9.

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
