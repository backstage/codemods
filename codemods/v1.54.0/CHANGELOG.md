# @backstage/v1-54-0-migration-recipe

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

- d3ba1e5: Align recipe target languages with the inputs actually scanned by their workflows, including shell scripts in the 1.54.0 recipe. Workflow selectors and transform scope are unchanged.

### Patch Changes

- fdf77d1: Move the release recipe to the version directory root without changing its scripts.

## 0.2.0

### Minor Changes

- fe3126c: Bundle the five Backstage 1.54.0 codemod scripts as local steps in the recipe and remove the standalone packages, so the recipe is the only published 1.54.0 artifact and no nested registry codemod step is used.
