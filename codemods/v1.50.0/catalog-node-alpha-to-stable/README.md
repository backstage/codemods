# @backstage/catalog-node-alpha-to-stable

Backstage 1.50.0 migration codemod that replaces deprecated `@backstage/plugin-catalog-node/alpha` exports with their stable equivalents.

## What it does

### Stabilized exports — direct import path change

These alpha exports graduated to stable with the same identifier and the same API. Only the import path changes, moving from `@backstage/plugin-catalog-node/alpha` to `@backstage/plugin-catalog-node`:

- `catalogServiceRef`
- `CatalogLocationsExtensionPoint` / `catalogLocationsExtensionPoint`
- `CatalogProcessingExtensionPoint` / `catalogProcessingExtensionPoint`
- `CatalogAnalysisExtensionPoint` / `catalogAnalysisExtensionPoint`

Handles imports, `import type`, re-exports, and aliased imports (`as` renames).

### Superseded exports — replaced by a core service

These alpha exports were removed in 1.50 because the permission extension-point mechanism was superseded by `coreServices.permissionsRegistry` from `@backstage/backend-plugin-api`:

- `catalogPermissionExtensionPoint` → `coreServices.permissionsRegistry` (including aliased references)
- `CatalogPermissionExtensionPoint` (removed from import; warns if used in file body)
- `CatalogPermissionRuleInput` (removed from import; warns if used in file body)

### What is NOT migrated

These exports remain in `@backstage/plugin-catalog-node/alpha` and are left unchanged:

- `CatalogModelExtensionPoint`
- `catalogModelExtensionPoint`
- `catalogEntityPermissionResourceRef`

### Known limitations

- **Namespace imports** (`import * as Alpha from '...alpha'`) are detected but not transformed — a warning is emitted for manual migration.
- **Superseded dep variable renaming**: The codemod replaces the dep _value_ (e.g., `catalogPermissionExtensionPoint` → `coreServices.permissionsRegistry`) but does not rename the dep _key_ or destructured parameter (e.g., `catalog` → `permissions`). Users may want to rename these manually for clarity.
- **Superseded type exports** (`CatalogPermissionRuleInput`, `CatalogPermissionExtensionPoint`): These are removed from the import since no stable replacement type exists. If used as type annotations in the file body, a warning is emitted and manual migration is required.
- **Superseded re-exports**: Re-exports of permission-related symbols are removed with a warning, since `coreServices.permissionsRegistry` cannot be re-exported as a named export.
- **Shorthand properties**: If `catalogPermissionExtensionPoint` is used as a shorthand property (e.g., `{ catalogPermissionExtensionPoint }` instead of `{ key: catalogPermissionExtensionPoint }`), the codemod cannot replace it since `{ coreServices.permissionsRegistry }` is invalid syntax. Use the non-shorthand form.
- **Variable shadowing**: If a local variable shadows the name of a superseded import (e.g., `const catalogPermissionExtensionPoint = ...` in an inner scope), the codemod may incorrectly replace it. This is extremely unlikely with Backstage extension point names.

### Optional: AI fixup step

The known limitations above can be addressed by an optional AI-powered fixup step that runs after the AST codemod. Enable it with `--param aiFixup=true`:

- Rewrites namespace imports (`import * as Alpha`) into direct named imports
- Renames misleading dep keys (e.g., `catalog` → `permissions`) and their destructured usages
- Resolves dangling superseded type references with replacement types or TODO comments
- Fixes shorthand property patterns
- Annotates removed re-exports with migration guidance for downstream consumers

When running inside a coding agent (Claude Code, Cursor, etc.), the AI step hands off `[AI INSTRUCTIONS]` to the parent agent. Otherwise, set `LLM_API_KEY` to execute the step via the configured LLM provider.

## Installation

```bash
# From registry
yarn dlx codemod@latest run @backstage/catalog-node-alpha-to-stable -t /path/to/target
```

## Usage (from this repo)

```bash
# AST codemod only (deterministic)
yarn dlx codemod@latest workflow run \
  -w codemods/v1.50.0/catalog-node-alpha-to-stable/workflow.yaml \
  -t /path/to/your/backstage-repo

# AST codemod + AI fixup for edge cases
yarn dlx codemod@latest workflow run \
  -w codemods/v1.50.0/catalog-node-alpha-to-stable/workflow.yaml \
  -t /path/to/your/backstage-repo \
  --param aiFixup=true

# Dry run (preview changes)
yarn dlx codemod@latest workflow run \
  -w codemods/v1.50.0/catalog-node-alpha-to-stable/workflow.yaml \
  -t /path/to/your/backstage-repo \
  --dry-run
```

## Development

From the repo root:

```bash
yarn install
yarn workspace @backstage/catalog-node-alpha-to-stable test
```

Or from this package directory:

```bash
yarn test
yarn check-types
```

## License

MIT
