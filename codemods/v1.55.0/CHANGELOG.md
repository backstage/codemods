# @backstage/v1-55-0-migration-recipe

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

- 930b994: Consolidate all six Backstage 1.55.0 codemods into the flattened migration recipe, bundling local scripts and regression suites instead of invoking separate registry packages.
- d3ba1e5: Align recipe target languages with the inputs actually scanned by their workflows, including shell scripts in the 1.54.0 recipe. Workflow selectors and transform scope are unchanged.

## 0.2.0

### Minor Changes

- 91deab5: Add the Backstage v1.55.0 migration recipe workflow that chains all six v1.55 codemod registry packages in release-note order and documents manual-only upgrade work.

## 0.1.0

### Minor Changes

- Initial release: orchestration workflow chaining all six Backstage 1.55.0 codemods in migration order.
