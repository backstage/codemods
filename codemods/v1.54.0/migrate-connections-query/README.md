# Migrate Connections URL lookups (Backstage 1.54.0)

Rewrites `ConnectionsService.find({ type: 'github', url, ... })` to `find({ type: 'github', query: { url }, ... })` for built-in URL-based connection types. Recognizes receivers explicitly annotated with `ConnectionsService` imported from `@backstage/connections` (including `this` access to typed class fields) and destructured backend service dependencies wired to `connectionsServiceRef` from `@backstage/connections-node` (or the pre-1.54 `@backstage/connections` export), including arrow-function factories. Skips unrelated `find` calls and already migrated calls. Leaves unsupported old-shape calls unchanged with a `TODO(backstage-codemod)` marker for manual review; custom connection types may use a different query contract. AWS uses a non-URL query and is not rewritten.

Run `yarn dlx codemod@latest @backstage/migrate-connections-query` and review any TODO markers.
