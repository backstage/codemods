# @backstage/migrate-policy-query-user

Backstage 1.51.0 migration codemod that updates usages of the now-removed `token`, `expiresInSeconds`, and `identity` fields on `PolicyQueryUser` from `@backstage/plugin-permission-node`.

## What it does

### Field removals

In Backstage 1.51.0, the `PolicyQueryUser` type from `@backstage/plugin-permission-node` removed the `token`, `expiresInSeconds`, and `identity` fields. This codemod detects and migrates these usages.

### Destructuring patterns

Removes `token` and `expiresInSeconds` from destructuring patterns and renames `identity` to `info`:

```ts
// Before
async handle(request: PolicyQuery, user?: PolicyQueryUser) {
  const { token, identity, credentials } = user;
}

// After
async handle(request: PolicyQuery, user?: PolicyQueryUser) {
  const { info, credentials } = user;
  // TODO(backstage-codemod): migrate to credentials via coreServices.auth
}
```

When `identity` is aliased (`{ identity: userIdentity }`), the alias is preserved under the new key (`{ info: userIdentity }`).

### Property access

Renames `identity` member access to `info`:

```ts
// Before
const refs = user?.identity.ownershipEntityRefs

// After
const refs = user?.info.ownershipEntityRefs
```

### Mock object literals

Detects mock object literals that match the `PolicyQueryUser` shape (containing `credentials` plus `token` or `identity`) and removes the deprecated fields while preserving nested object structure:

```ts
// Before
const user = {
  token: 'mock-token',
  credentials: { $$type: '@backstage/BackstageCredentials', principal: {} },
  identity: { userEntityRef: 'user:default/guest', ownershipEntityRefs: [] },
}

// After
const user = {
  credentials: { $$type: '@backstage/BackstageCredentials', principal: {} },
  info: { userEntityRef: 'user:default/guest', ownershipEntityRefs: [] },
}
```

### TODO comments

When `token` is used in statements (e.g., passed to downstream APIs), the codemod inserts a TODO comment indicating manual migration to `coreServices.auth` credentials is needed:

```ts
// TODO(backstage-codemod): migrate to credentials via coreServices.auth
```

### Import gating

The codemod only transforms files that import from `@backstage/plugin-permission-node`, avoiding false positives on unrelated `identity` or `token` usages.

### Known limitations

- **Untyped parameters**: Destructuring patterns are only transformed when the parameter has an explicit `PolicyQueryUser` type annotation. Untyped parameters require manual migration or the AI fixup step.
- **`expiresInSeconds` member access**: While `expiresInSeconds` is removed from destructuring patterns and object literals, member access like `user.expiresInSeconds` may need the AI fixup step.

### Optional: AI fixup step

Enable with `--param aiFixup=true` to address edge cases:

- Handles `token` usages that need migration to `coreServices.auth` credentials
- Catches untyped `PolicyQueryUser` parameters
- Verifies remaining `identity` references are migrated

## Installation

```bash
# From registry
yarn dlx codemod@latest run @backstage/migrate-policy-query-user -t /path/to/target
```

## Usage (from this repo)

```bash
# AST codemod only (deterministic)
yarn dlx codemod@latest workflow run \
  -w codemods/v1.51.0/migrate-policy-query-user/workflow.yaml \
  -t /path/to/your/backstage-repo

# AST codemod + AI fixup for edge cases
yarn dlx codemod@latest workflow run \
  -w codemods/v1.51.0/migrate-policy-query-user/workflow.yaml \
  -t /path/to/your/backstage-repo \
  --param aiFixup=true

# Dry run (preview changes)
yarn dlx codemod@latest workflow run \
  -w codemods/v1.51.0/migrate-policy-query-user/workflow.yaml \
  -t /path/to/your/backstage-repo \
  --dry-run
```

## Development

From the repo root:

```bash
yarn install
yarn workspace @backstage/migrate-policy-query-user test
```

Or from this package directory:

```bash
yarn test
```
