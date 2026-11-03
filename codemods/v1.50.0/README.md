# v1.50.0-migration-recipe

One-shot migration recipe for upgrading a Backstage app to 1.50.0. Runs every v1.50.0 codemod as a local script through a single workflow so you don't have to run each one by hand.

## What it runs

Each step below is a local script bundled with the recipe. The recipe executes them sequentially in an order aligned with the [Backstage 1.50.0 release notes](https://backstage.io/docs/releases/v1.50.0/): catalog-node import normalization first, then the remaining breaking changes grouped by domain, then the deprecations.

| #   | Local script                                                                                       | What it does                                                                                           |
| --- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1   | [`scripts/catalog-node-alpha-to-stable.ts`](scripts/catalog-node-alpha-to-stable.ts)               | Replace deprecated `@backstage/plugin-catalog-node/alpha` exports with stable equivalents              |
| 2   | [`scripts/add-entity-ref-to-location.ts`](scripts/add-entity-ref-to-location.ts)                   | Add required `entityRef` field to `Location` object literals from `@backstage/catalog-client`          |
| 3   | [`scripts/add-update-location-method.ts`](scripts/add-update-location-method.ts)                   | Add required `updateLocation` method to `CatalogApi` and `CatalogService` implementations              |
| 4   | [`scripts/migrate-signals-service.ts`](scripts/migrate-signals-service.ts)                         | Rename `SignalService` exports to `SignalsService` in `@backstage/plugin-signals-node`                 |
| 5   | [`scripts/migrate-permissioned-route.ts`](scripts/migrate-permissioned-route.ts)                   | Migrate `PermissionedRoute` to `Route` + `RequirePermission` from `@backstage/plugin-permission-react` |
| 6   | [`scripts/replace-create-schema-from-zod.ts`](scripts/replace-create-schema-from-zod.ts)           | Replace `createSchemaFromZod` and `config.schema` with `configSchema`                                  |
| 7   | [`scripts/header-tab-to-nav-tab-item.ts`](scripts/header-tab-to-nav-tab-item.ts)                   | Rename `HeaderTab` to `HeaderNavTabItem` and remove `matchStrategy` in `@backstage/ui`                 |
| 8   | [`scripts/rename-plugin-header-toolbar.ts`](scripts/rename-plugin-header-toolbar.ts)               | Rename `.bui-PluginHeaderToolbarWrapper` to `.bui-PluginHeaderToolbar` and related `classNames` keys   |
| 9   | [`scripts/dialog-api-show-to-open.ts`](scripts/dialog-api-show-to-open.ts)                         | Replace deprecated `DialogApi` `.show()` / `.showModal()` with `.open()`                               |
| 10  | [`scripts/humanize-entity-ref-to-presentation.ts`](scripts/humanize-entity-ref-to-presentation.ts) | Replace deprecated `humanizeEntityRef` / `humanizeEntity` with the Catalog Presentation API            |
| 11  | [`scripts/remove-bootstrap-env-proxy.ts`](scripts/remove-bootstrap-env-proxy.ts)                   | Remove deprecated `bootstrapEnvProxyAgents()` call and import from `@backstage/cli-common`             |

## Usage

```bash
# Dry run (preview every step without writing any changes)
yarn dlx codemod@latest run @backstage/v1-50-0-migration-recipe \
  --target /path/to/backstage-app \
  --dry-run

# Apply the full recipe
yarn dlx codemod@latest run @backstage/v1-50-0-migration-recipe \
  --target /path/to/backstage-app
```

You can also run the recipe directly from this repo:

```bash
yarn dlx codemod@latest workflow run \
  -w codemods/v1.50.0/workflow.yaml \
  --target /path/to/backstage-app \
  --dry-run
```

## Running a single script

To run one transform, copy its `js-ast-grep` step from `workflow.yaml` into a minimal workflow, preserving `js_file`, `language`, selectors, and any step options. Point `js_file` at the bundled script, then run `codemod workflow run -w <your-workflow.yaml> --target /path/to/backstage-app --dry-run` before applying. Keep related passes in recipe order when selecting more than one step. CSS/SCSS passes are separate steps from source passes; select both where the migration spans both languages.

## AI behavior and review

Ten transforms include optional AI fixups for edge cases requiring contextual review. Enable them together after all AST steps:

```bash
yarn dlx codemod@latest run @backstage/v1-50-0-migration-recipe   --target /path/to/backstage-app   --param aiFixup=true
```

- After running, review remaining `TODO(backstage-codemod)` markers.

## Development

- `yarn test` runs fixture suites, CSS regression tests, and workflow validation through `run-recipe-tests`.

The package-root `tsconfig.json` checks production scripts and excludes `tests/`; repository-wide `yarn lint` includes source type checking.

## Notes

- All transforms run from bundled local scripts; no nested registry packages are resolved.
- The toolbar rename includes both JS/TS and CSS/SCSS transforms (`scripts/rename-plugin-header-toolbar-css.ts`).
