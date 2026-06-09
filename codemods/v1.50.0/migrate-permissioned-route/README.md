# @backstage/migrate-permissioned-route

Migrates deprecated `PermissionedRoute` from `@backstage/plugin-permission-react` to `Route` (from `react-router-dom`) wrapping `RequirePermission`.

Targets Backstage **v1.50**+ where `PermissionedRoute` was removed.

## Installation

```bash
# From registry
yarn dlx codemod@latest run @backstage/migrate-permissioned-route -t /path/to/target
```

## Usage (from this repo)

```bash
yarn dlx codemod@latest workflow run \
  -w codemods/v1.50.0/migrate-permissioned-route/workflow.yaml \
  -t /path/to/your/backstage-repo

# With AI fixup for edge cases
yarn dlx codemod@latest workflow run \
  -w codemods/v1.50.0/migrate-permissioned-route/workflow.yaml \
  -t /path/to/your/backstage-repo \
  --param aiFixup=true
```

### Optional: AI fixup step

Enable with `--param aiFixup=true` to address edge cases the AST codemod cannot handle mechanically:

- Remaining `PermissionedRoute` references in re-exports, type annotations, or dynamic rendering patterns
- Dynamic element props with conditional expressions where the `RequirePermission` wrapping needs verification
- Type annotations or generic parameters referencing `PermissionedRoute`

## Development

From the repo root:

```bash
yarn install
yarn workspace @backstage/migrate-permissioned-route test
```

Or from this package directory:

```bash
yarn test
yarn check-types
```
