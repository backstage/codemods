# @backstage/header-tab-to-nav-tab-item

Backstage 1.50.0 migration codemod that renames `HeaderTab` to `HeaderNavTabItem` and removes the deprecated `matchStrategy` property in `@backstage/ui`.

## What it does

### Type rename: `HeaderTab` -> `HeaderNavTabItem`

In `@backstage/ui` v0.14.0 (Backstage 1.50.0), the `HeaderTab` type was replaced by `HeaderNavTabItem`, a union type supporting both individual tabs and dropdown tab groups (`HeaderNavTab | HeaderNavTabGroup`).

This codemod renames:

- Import specifiers: `import { HeaderTab }` -> `import { HeaderNavTabItem }`
- `import type` statements and inline `type` specifiers
- Aliased imports: `import { HeaderTab as MyTab }` -> `import { HeaderNavTabItem as MyTab }`
- Re-exports: `export { HeaderTab }` -> `export { HeaderNavTabItem }`
- Body references (type annotations, generic parameters, etc.)

### Property removal: `matchStrategy`

The `matchStrategy` property on tab objects was removed. This codemod strips it from object literals when a `HeaderTab` import from `@backstage/ui` is detected in the same file.

### What is NOT migrated

- **`@backstage/core-components`**: The `Tab` type and `HeaderTabs` in `@backstage/core-components` are unchanged. This codemod only applies to `@backstage/ui`.
- **Namespace imports** (`import * as UI from '@backstage/ui'`): Detected and a warning is emitted, but not automatically transformed.
- **`activeTabId` prop**: The new `activeTabId` prop on `Header` that replaces automatic route-based tab highlighting is not added automatically.

### Optional: AI fixup step

Enable with `--param aiFixup=true`:

- Rewrites namespace imports (`import * as UI`) to replace `UI.HeaderTab` with `UI.HeaderNavTabItem`
- Finds remaining `matchStrategy` properties in complex nested structures
- Fixes type assertions (`as HeaderTab`) and generic type parameters

## Installation

```bash
# From registry
yarn dlx codemod@latest run @backstage/header-tab-to-nav-tab-item -t /path/to/target
```

## Usage (from this repo)

```bash
# AST codemod only (deterministic)
yarn dlx codemod@latest workflow run \
  -w codemods/v1.50.0/header-tab-to-nav-tab-item/workflow.yaml \
  -t /path/to/your/backstage-repo

# AST codemod + AI fixup for edge cases
yarn dlx codemod@latest workflow run \
  -w codemods/v1.50.0/header-tab-to-nav-tab-item/workflow.yaml \
  -t /path/to/your/backstage-repo \
  --param aiFixup=true

# Dry run (preview changes)
yarn dlx codemod@latest workflow run \
  -w codemods/v1.50.0/header-tab-to-nav-tab-item/workflow.yaml \
  -t /path/to/your/backstage-repo \
  --dry-run
```

## Development

From the repo root:

```bash
yarn install
yarn workspace @backstage/header-tab-to-nav-tab-item test
```

Or from this package directory:

```bash
yarn test
yarn check-types
```

## License

MIT
