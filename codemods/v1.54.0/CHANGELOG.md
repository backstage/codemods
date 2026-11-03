# @backstage/v1-54-0-migration-recipe

## 0.3.0

### Minor Changes

- d3ba1e5: Align recipe target languages with the inputs actually scanned by their workflows, including shell scripts in the 1.54.0 recipe. Workflow selectors and transform scope are unchanged.

### Patch Changes

- fdf77d1: Move the release recipe to the version directory root without changing its scripts.

## 0.2.0

### Minor Changes

- fe3126c: Bundle the five Backstage 1.54.0 codemod scripts as local steps in the recipe and remove the standalone packages, so the recipe is the only published 1.54.0 artifact and no nested registry codemod step is used.
