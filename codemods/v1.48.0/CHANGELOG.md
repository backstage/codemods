# @backstage/v1-48-0-migration-recipe

## 0.3.0

### Minor Changes

- 6e77d34: Include app-config.yml and app-config.*.yml files in app-config migrations, matching existing YAML coverage.
- 138ae39: Consolidate all seven Backstage 1.48.0 codemods into the flattened migration recipe with local scripts, preserved fixture suites, and optional post-transform AI fixups.
- cdbb212: Metric identifiers were renamed to match logical migration stems, shared across language variants. Sub-action metrics now use stem-derived names. Consumers must update dashboards tracking the old identifiers.
- d3ba1e5: Align recipe target languages with the inputs actually scanned by their workflows, including shell scripts in the 1.54.0 recipe. Workflow selectors and transform scope are unchanged.

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

- ee8ba26: Fix recipe validation issues found during v1.45–v1.49 testing against the Backstage monorepo:

  - **v1.46.0 `add-jest-peer-dependency`**: Skip workspace member packages that inherit jest from the workspace root. Previously the codemod added redundant `jest`, `@types/jest`, `@jest/environment-jsdom-abstract`, and `jsdom` devDependencies to every sub-package even when the workspace root already provides them.
  - **v1.48.0 migration recipe**: Add `params.aiFixup` declaration and forward `args: ['aiFixup']` to `migrate-surface-to-bg-system` and `migrate-column-config-to-react-element`. Without this, running the recipe fails with `Variable identifier is not bound to anything by context: "params.aiFixup"`.
  - **v1.49.0 migration recipe**: Same `params.aiFixup` fix — add declaration and forward to `remove-create-public-sign-in-app`.

## 0.2.0

### Minor Changes

- 5f05828: Add Backstage 1.48.0 migration recipe chaining all v1.48 codemods
