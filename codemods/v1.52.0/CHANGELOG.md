# @backstage/v1-52-0-migration-recipe

## 0.3.0

### Minor Changes

- 6e77d34: Include app-config.yml and app-config.*.yml files in app-config migrations, matching existing YAML coverage.
- e53eaab: Consolidate all four Backstage v1.52.0 codemods into the flattened migration recipe, bundling local scripts and preserving TypeScript, YAML, and CSS fixture coverage instead of resolving nested registry packages.
- d3ba1e5: Align recipe target languages with the inputs actually scanned by their workflows, including shell scripts in the 1.54.0 recipe. Workflow selectors and transform scope are unchanged.

## 0.2.4

### Patch Changes

- 9a9e903: Update codemod runtime and development dependencies

## 0.2.3

### Patch Changes

- 0c67fc5: Update workspace engine deps: `codemod` 1.12.3 → 1.12.13, `@jssg/utils` ^0.0.8 → ^0.0.9.

## 0.2.2

### Patch Changes

- f510a43: Rename package from @backstage/migrate-select-combobox-deprecated-props to @backstage/migrate-select-combobox-props (50-char registry name limit)

## 0.2.1

### Patch Changes

- 5d7af9a: Update devDependencies: @codemod.com/jssg-types 1.5.2 → 1.6.2, codemod 1.7.15 → 1.12.3. Fix test fixtures for updated codemod engine formatting.

## 0.2.0

### Minor Changes

- eeaf3d8: Add v1.52.0 migration recipe that runs every @backstage v1.52.0 codemod in a safe order
