# @backstage/migrate-policy-query-user

## 0.2.2

### Patch Changes

- 5d7af9a: Update devDependencies: @codemod.com/jssg-types 1.5.2 → 1.6.2, codemod 1.7.15 → 1.12.3. Fix test fixtures for updated codemod engine formatting.

## 0.2.1

### Patch Changes

- a3e3d35: Fixed false positives where unrelated `token` fields were incorrectly removed from destructuring patterns. The codemod now only processes object patterns that are directly typed as `PolicyQueryUser` or destructure a tracked `PolicyQueryUser` binding, instead of modifying every `{ token }` destructuring in files that import from `@backstage/plugin-permission-node`.

  Also fixed empty destructuring cleanup (`const {} = await expr` now simplifies to `await expr`), and variable declarations that define bindings used elsewhere are no longer deleted (a TODO comment is added above instead).

## 0.2.0

### Minor Changes

- 35cc05b: Add codemod to migrate PolicyQueryUser off removed token/identity fields for Backstage 1.51.0

## 0.1.0

### Minor Changes

- Initial release: migrate PolicyQueryUser off removed token, expiresInSeconds, and identity fields for Backstage 1.51.0
