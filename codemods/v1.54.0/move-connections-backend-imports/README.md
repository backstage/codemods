# Move Connections backend imports (Backstage 1.54.0)

Moves named imports and re-exports of `connectionsServiceRef`, `connectionsServiceFactory`, `DefaultConnectionsService`, and `declareConnection` from `@backstage/connections` to `@backstage/connections-backend`. Other symbols, aliases, and type-only specifiers remain in the common package. Existing compatible destination imports are merged. TS and TSX only; no AI fixup.

**Manual review:** Ensure each consuming package declares `@backstage/connections-backend` directly, selecting an appropriate version yourself. Namespace imports/re-exports (including dynamic property access) are left intact with a `TODO(backstage-codemod)` marker for manual analysis. `RootConnection` and `AnyRootConnection` have no automatic replacement; their declarations remain intact with a review marker. Declarations with comments anywhere inside the statement are left intact with a review marker to avoid losing comments; commented destination imports are not merged. Star exports (`export * from '@backstage/connections'`) are left unchanged because their backend members cannot be determined from the declaration. The codemod does not rewrite consumer package manifests or custom backend service implementations.

Tests: `yarn workspace @backstage/move-connections-backend-imports test`.
