# @backstage/experimental-form-decorators-to-stable

## 0.2.3

### Patch Changes

- 0c67fc5: Update workspace engine deps: `codemod` 1.12.3 → 1.12.13, `@jssg/utils` ^0.0.8 → ^0.0.9.

## 0.2.2

### Patch Changes

- 5d7af9a: Update devDependencies: @codemod.com/jssg-types 1.5.2 → 1.6.2, codemod 1.7.15 → 1.12.3. Fix test fixtures for updated codemod engine formatting.

## 0.2.1

### Patch Changes

- a3e3d35: Fixed false positive where property accesses like `template.spec.EXPERIMENTAL_formDecorators` inside a nullish coalescing fallback were incorrectly renamed, turning `formDecorators ?? EXPERIMENTAL_formDecorators` into the redundant `formDecorators ?? formDecorators`.

## 0.2.0

### Minor Changes

- 603d5de: Add codemod to rename EXPERIMENTAL_formDecorators to formDecorators for Backstage 1.51.0
