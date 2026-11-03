---
'@backstage/mui4-to-bui-migration-recipe': patch
'@backstage/v1-45-0-migration-recipe': patch
'@backstage/v1-47-0-migration-recipe': patch
'@backstage/v1-48-0-migration-recipe': patch
'@backstage/v1-49-0-migration-recipe': patch
'@backstage/v1-50-0-migration-recipe': patch
'@backstage/v1-51-0-migration-recipe': patch
'@backstage/v1-52-0-migration-recipe': patch
'@backstage/v1-54-0-migration-recipe': patch
'@backstage/v1-55-0-migration-recipe': patch
---

Refactor: use @jssg/utils for common codemod transformations

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
