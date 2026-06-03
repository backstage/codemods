---
'@backstage/experimental-form-decorators-to-stable': patch
---

Fixed false positive where property accesses like `template.spec.EXPERIMENTAL_formDecorators` inside a nullish coalescing fallback were incorrectly renamed, turning `formDecorators ?? EXPERIMENTAL_formDecorators` into the redundant `formDecorators ?? formDecorators`.
