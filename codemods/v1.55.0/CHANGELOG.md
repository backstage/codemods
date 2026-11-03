# @backstage/v1-55-0-migration-recipe

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
