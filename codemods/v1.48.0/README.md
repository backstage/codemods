# @backstage/v1-48-0-migration-recipe

Migration recipe that runs every local Backstage v1.48.0 codemod script in a safe
order.

## What it runs

| #   | Codemod                                                                                       | Description                                       |
| --- | --------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 1   | [`rename-bui-css-tokens-v1-48`](scripts/rename-bui-css-tokens-v1-48.ts)                       | Rename deprecated BUI CSS tokens and selectors    |
| 2   | [`remove-alert-surface-prop`](scripts/remove-alert-surface-prop.ts)                           | Remove deprecated surface prop from Alert         |
| 3   | [`migrate-surface-to-bg-system`](scripts/migrate-surface-to-bg-system.ts)                     | Migrate surface/onSurface props to bg system      |
| 4   | [`migrate-column-config-to-react-element`](scripts/migrate-column-config-to-react-element.ts) | Wrap ColumnConfig cell/header returns             |
| 5   | [`rename-header-to-plugin-header`](scripts/rename-header-to-plugin-header.ts)                 | Rename Header to PluginHeader                     |
| 6   | [`migrate-blueprints-to-plugin-app-react`](scripts/migrate-blueprints-to-plugin-app-react.ts) | Move blueprint exports to plugin-app-react        |
| 7   | [`migrate-app-experimental-packages`](scripts/migrate-app-experimental-packages.ts)           | Migrate app.experimental.packages to app.packages |

## Usage

```bash
npx codemod@latest @backstage/v1-48-0-migration-recipe
```

## Running a single script

To run one transform, copy its `js-ast-grep` step from `workflow.yaml` into a minimal workflow, preserving `js_file`, `language`, selectors, and any step options. Point `js_file` at the bundled script, then run `codemod workflow run -w <your-workflow.yaml> --target /path/to/backstage-app --dry-run` before applying. Keep related passes in recipe order when selecting more than one step.

## AI behavior and review

AI fixups are disabled by default. Enable both optional fixups after all AST
transforms with:

```bash
npx codemod@latest @backstage/v1-48-0-migration-recipe --param aiFixup=true
```

The fixups cover dynamic surface values and complex ColumnConfig cell/header returns.

### Out of scope (document only)

These changes are runtime behavior or deprecation warnings — no codemod needed:

- `API_FACTORY_CONFLICT` warning → error — runtime behavior change
- API override logic now rejects at startup — runtime behavior
- `IconComponent` → `IconElement` — deprecated not yet removed
- `pluginId` replaces `id` on plugins — deprecated not yet removed
- Non-standard plugin ID format deprecated — runtime validation
- Extension multiple attachment points deprecated — runtime still supports

## Development

`yarn test` runs bundled fixtures and workflow checks through `run-recipe-tests`.

The package-root `tsconfig.json` checks production scripts and excludes `tests/`; repository-wide `yarn lint` includes source type checking.

## Notes

Each workflow step uses a bundled local script; no standalone registry codemod packages are required.
