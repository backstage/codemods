# @backstage/experimental-form-decorators-to-stable

## 0.2.1

### Patch Changes

- a3e3d35: Fixed false positive where property accesses like `template.spec.EXPERIMENTAL_formDecorators` inside a nullish coalescing fallback were incorrectly renamed, turning `formDecorators ?? EXPERIMENTAL_formDecorators` into the redundant `formDecorators ?? formDecorators`.

## 0.2.0

### Minor Changes

- 603d5de: Add codemod to rename EXPERIMENTAL_formDecorators to formDecorators for Backstage 1.51.0
