# @backstage/humanize-entity-ref-to-presentation

Backstage 1.50.0 migration codemod that replaces deprecated `humanizeEntityRef` and `humanizeEntity` from `@backstage/plugin-catalog-react` with the Catalog Presentation API.

## What it does

### Context-dependent replacement

The codemod detects the call-site context and applies the appropriate replacement:

| Context | Before | After |
|---------|--------|-------|
| JSX expression | `{humanizeEntityRef(ref)}` | `<EntityDisplayName entityRef={ref} />` |
| React component body | `const name = humanizeEntityRef(ref)` | `const name = useEntityPresentation(ref).primaryTitle` |
| Non-React / utility | `humanizeEntityRef(ref)` | `entityPresentationSnapshot(ref).primaryTitle` |

### Options mapping

- `defaultKind` and `defaultNamespace` options are mapped to the context parameter for `useEntityPresentation` and `entityPresentationSnapshot`, or to JSX props for `EntityDisplayName`.

### humanizeEntity

`humanizeEntity(entity, fallbackName)` follows the same context-dependent replacement. The fallback parameter is dropped since the Presentation API handles display name resolution automatically.

### Import handling

- Deprecated import specifiers are removed from the import statement
- New imports (`EntityDisplayName`, `useEntityPresentation`, `entityPresentationSnapshot`) are added as needed based on the replacements used
- Other specifiers from the same import statement are preserved
- Aliased imports (e.g., `import { humanizeEntityRef as formatRef }`) are handled correctly

### Re-exports

Re-exports like `export { humanizeEntityRef } from '@backstage/plugin-catalog-react'` are replaced with the new API exports.

### Known limitations

- **Namespace imports** (`import * as CatalogReact from '...'`) are detected but not transformed — a warning is emitted for manual migration.
- **`humanizeEntityRef` returns `string`** while `EntityDisplayName` returns `JSX.Element`. If the return value is used where only a string is accepted (e.g., passed to a function expecting `string`), the JSX replacement may cause type errors that need manual correction.
- **`useEntityPresentation` is a React hook** and cannot be used outside React components or in conditional branches. The codemod only uses it inside functions that contain JSX.
- **Complex options expressions**: If the options argument is a variable reference or computed expression rather than an inline object literal, the JSX props conversion for `EntityDisplayName` will not parse it.

### Optional: AI fixup step

Enable the AI-powered fixup step with `--param aiFixup=true` to address edge cases:

- Rewrites namespace imports
- Fixes type compatibility issues where `string` was expected but JSX was substituted
- Corrects mixed-context files where the wrong replacement was chosen

## Installation

```bash
# From registry
yarn dlx codemod@latest run @backstage/humanize-entity-ref-to-presentation -t /path/to/target
```

## Usage (from this repo)

```bash
# AST codemod only (deterministic)
yarn dlx codemod@latest workflow run \
  -w codemods/v1.50.0/humanize-entity-ref-to-presentation/workflow.yaml \
  -t /path/to/your/backstage-repo

# AST codemod + AI fixup for edge cases
yarn dlx codemod@latest workflow run \
  -w codemods/v1.50.0/humanize-entity-ref-to-presentation/workflow.yaml \
  -t /path/to/your/backstage-repo \
  --param aiFixup=true

# Dry run (preview changes)
yarn dlx codemod@latest workflow run \
  -w codemods/v1.50.0/humanize-entity-ref-to-presentation/workflow.yaml \
  -t /path/to/your/backstage-repo \
  --dry-run
```

## Development

From the repo root:

```bash
yarn install
yarn workspace @backstage/humanize-entity-ref-to-presentation test
```

Or from this package directory:

```bash
yarn test
yarn check-types
```

## License

MIT
