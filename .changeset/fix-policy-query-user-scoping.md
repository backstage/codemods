---
'@backstage/migrate-policy-query-user': patch
---

Fixed false positives where unrelated `token` fields were incorrectly removed from destructuring patterns. The codemod now only processes object patterns that are directly typed as `PolicyQueryUser` or destructure a tracked `PolicyQueryUser` binding, instead of modifying every `{ token }` destructuring in files that import from `@backstage/plugin-permission-node`.

Also fixed empty destructuring cleanup (`const {} = await expr` now simplifies to `await expr`), and variable declarations that define bindings used elsewhere are no longer deleted (a TODO comment is added above instead).
