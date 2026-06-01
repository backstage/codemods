# @backstage/loading-to-is-pending

Backstage 1.51.0 migration codemod that renames the deprecated `loading` prop to `isPending` on `@backstage/ui` components and updates CSS selectors from `data-loading` to `data-ispending`.

## What it does

### JSX prop rename: `loading` -> `isPending`

In `@backstage/ui` v0.15.0 (Backstage 1.51.0), the `loading` prop was deprecated in favor of `isPending` (React Aria naming) on:

- `Alert`
- `Button`
- `ButtonIcon`
- `Table`
- `TableRoot`

This codemod renames `loading={...}` to `isPending={...}` on those components when imported from `@backstage/ui`, including:

- Named imports: `import { Button } from '@backstage/ui'`
- Aliased imports: `import { Button as SaveButton } from '@backstage/ui'`
- Namespace imports: `<UI.Button loading={...} />`

### CSS selector rename: `[data-loading]` -> `[data-ispending]`

Updates attribute selectors in stylesheets and CSS modules to target the new `data-ispending` attribute.

### What is NOT migrated

- **`loading` on non-BUI components**: MUI `Button`, custom components, and other libraries are unchanged.
- **Spread props**: Dynamic `{...props}` with a `loading` key cannot be renamed statically — use the optional AI fixup step.
- **Unrelated `loading` APIs**: React Query `isLoading`, route loading states, etc. are not touched.

### Optional: AI fixup step

Enable with `--param aiFixup=true`:

- Handles spread props and dynamic `loading` keys on BUI components
- Catches remaining namespace/aliased import edge cases
- Updates CSS still targeting only `data-loading` for BUI pending styles

## Installation

```bash
# From registry
yarn dlx codemod@latest run @backstage/loading-to-is-pending -t /path/to/target
```

## Usage (from this repo)

```bash
# AST codemod only (deterministic)
yarn dlx codemod@latest workflow run \
  -w codemods/v1.51.0/loading-to-is-pending/workflow.yaml \
  -t /path/to/your/backstage-repo

# AST codemod + AI fixup for edge cases
yarn dlx codemod@latest workflow run \
  -w codemods/v1.51.0/loading-to-is-pending/workflow.yaml \
  -t /path/to/your/backstage-repo \
  --param aiFixup=true

# Dry run (preview changes)
yarn dlx codemod@latest workflow run \
  -w codemods/v1.51.0/loading-to-is-pending/workflow.yaml \
  -t /path/to/your/backstage-repo \
  --dry-run
```

## Development

From the repo root:

```bash
yarn install
yarn workspace @backstage/loading-to-is-pending test
```

Or from this package directory:

```bash
yarn test
```

## License

MIT
