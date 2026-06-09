# @backstage/migrate-nav-item-to-page

Backstage 1.51.0 migration codemod that merges `NavItemBlueprint` navigation metadata into matching `PageBlueprint` extensions.

## What it does

`NavItemBlueprint` was removed from `@backstage/frontend-plugin-api` in Backstage 1.51.0. Navigation items are now discovered from `PageBlueprint` extensions via their `title` and `icon` params.

For each `NavItemBlueprint.make` call, the codemod:

1. Extracts `title`, `icon`, and `routeRef` from `params`
2. Finds the matching `PageBlueprint.make` or `PageBlueprint.makeWithOverrides` with the same static `routeRef`
3. Adds `title` and `icon` to the page extension params (or the `originalFactory` argument for `makeWithOverrides`)
4. Wraps MUI icon identifiers as `<Icon fontSize="inherit" />` when the icon is not already JSX
5. Removes the nav item declaration and its entry from `extensions` arrays
6. Removes unused `NavItemBlueprint` imports

### Before / After

```ts
// Before
import { NavItemBlueprint, PageBlueprint } from '@backstage/frontend-plugin-api';
import ExampleIcon from '@material-ui/icons/Extension';

const navItem = NavItemBlueprint.make({
  params: { title: 'Example', icon: ExampleIcon, routeRef },
});
const page = PageBlueprint.make({
  params: { routeRef, path: '/example', loader: () => import('./Page').then(m => <m.Page />) },
});

// After
import { PageBlueprint } from '@backstage/frontend-plugin-api';
import ExampleIcon from '@material-ui/icons/Extension';

const page = PageBlueprint.make({
  params: {
    title: 'Example',
    icon: <ExampleIcon fontSize="inherit" />,
    routeRef,
    path: '/example',
    loader: () => import('./Page').then(m => <m.Page />),
  },
});
```

### Known limitations

- **MUI to Remix icon migration** is not performed — icons are wrapped as JSX elements only. Use `--param aiFixup=true` for heuristic MUI → `@remixicon/react` conversion.
- **Dynamic `routeRef` values** (non-identifier expressions) are flagged with `TODO(backstage-codemod)` for manual migration.
- **Unpaired nav items** (no matching `PageBlueprint` with the same `routeRef`) are flagged with `TODO(backstage-codemod)` and left in place.
- **Ambiguous pairings** (multiple pages sharing the same static `routeRef`) are flagged with `TODO(backstage-codemod)`.
- **Non-static icons** (computed expressions, function calls) may need manual conversion to `IconElement` JSX.
- **Namespace imports** of `NavItemBlueprint` are detected via usage patterns but not fully decomposed — use AI fixup for complex cases.

### Optional: AI fixup step

Enable the AI-powered fixup step with `--param aiFixup=true` to address edge cases:

- Pair orphaned `NavItemBlueprint` extensions with the correct `PageBlueprint`
- Convert MUI icons to `@remixicon/react` where only used for navigation
- Clean up `createFrontendModule` / `createFrontendPlugin` extension arrays
- Resolve ambiguous pairings and dynamic `routeRef` values

## Installation

```bash
# From registry
yarn dlx codemod@latest run @backstage/migrate-nav-item-to-page -t /path/to/target
```

## Usage (from this repo)

```bash
# AST codemod only (deterministic)
yarn dlx codemod@latest workflow run \
  -w codemods/v1.51.0/migrate-nav-item-to-page/workflow.yaml \
  -t /path/to/your/backstage-repo

# AST codemod + AI fixup for edge cases
yarn dlx codemod@latest workflow run \
  -w codemods/v1.51.0/migrate-nav-item-to-page/workflow.yaml \
  -t /path/to/your/backstage-repo \
  --param aiFixup=true

# Dry run (preview changes)
yarn dlx codemod@latest workflow run \
  -w codemods/v1.51.0/migrate-nav-item-to-page/workflow.yaml \
  -t /path/to/your/backstage-repo \
  --dry-run
```

## Development

From the repo root:

```bash
yarn install
yarn workspace @backstage/migrate-nav-item-to-page test
```

Or from this package directory:

```bash
yarn test
```
