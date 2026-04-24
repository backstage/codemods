# v1.50.0-migration-recipe

One-shot migration recipe for upgrading a Backstage app to 1.50.0. Chains every `@backstage/*` v1.50.0 codemod from the Codemod registry through a single workflow so you don't have to run each one by hand.

## What it runs

Each step below is a registry package that you can also run on its own. The recipe executes them sequentially in an order aligned with the [Backstage 1.50.0 release notes](https://backstage.io/docs/releases/v1.50.0/): catalog-node import normalization first, then the remaining breaking changes grouped by domain, then the deprecations.

| #   | Registry package                                                                           | What it does                                                                                           |
| --- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| 1   | [`@backstage/catalog-node-alpha-to-stable`](../catalog-node-alpha-to-stable)               | Replace deprecated `@backstage/plugin-catalog-node/alpha` exports with stable equivalents              |
| 2   | [`@backstage/add-entity-ref-to-location`](../add-entity-ref-to-location)                   | Add required `entityRef` field to `Location` object literals from `@backstage/catalog-client`          |
| 3   | [`@backstage/add-update-location-method`](../add-update-location-method)                   | Add required `updateLocation` method to `CatalogApi` and `CatalogService` implementations              |
| 4   | [`@backstage/migrate-signals-service`](../migrate-signals-service)                         | Rename `SignalService` exports to `SignalsService` in `@backstage/plugin-signals-node`                 |
| 5   | [`@backstage/migrate-permissioned-route`](../migrate-permissioned-route)                   | Migrate `PermissionedRoute` to `Route` + `RequirePermission` from `@backstage/plugin-permission-react` |
| 6   | [`@backstage/replace-create-schema-from-zod`](../replace-create-schema-from-zod)           | Replace `createSchemaFromZod` and `config.schema` with `configSchema`                                  |
| 7   | [`@backstage/header-tab-to-nav-tab-item`](../header-tab-to-nav-tab-item)                   | Rename `HeaderTab` to `HeaderNavTabItem` and remove `matchStrategy` in `@backstage/ui`                 |
| 8   | [`@backstage/rename-plugin-header-toolbar`](../rename-plugin-header-toolbar)               | Rename `.bui-PluginHeaderToolbarWrapper` to `.bui-PluginHeaderToolbar` and related `classNames` keys   |
| 9   | [`@backstage/dialog-api-show-to-open`](../dialog-api-show-to-open)                         | Replace deprecated `DialogApi` `.show()` / `.showModal()` with `.open()`                               |
| 10  | [`@backstage/humanize-entity-ref-to-presentation`](../humanize-entity-ref-to-presentation) | Replace deprecated `humanizeEntityRef` / `humanizeEntity` with the Catalog Presentation API            |
| 11  | [`@backstage/remove-bootstrap-env-proxy`](../remove-bootstrap-env-proxy)                   | Remove deprecated `bootstrapEnvProxyAgents()` call and import from `@backstage/cli-common`             |

## Usage

```bash
# Dry run (preview every step without writing any changes)
yarn dlx codemod@latest run @backstage/v1.50.0-migration-recipe \
  --target /path/to/backstage-app \
  --dry-run

# Apply the full recipe
yarn dlx codemod@latest run @backstage/v1.50.0-migration-recipe \
  --target /path/to/backstage-app
```

You can also run the recipe directly from this repo:

```bash
yarn dlx codemod@latest workflow run \
  -w codemods/v1.50.0/migration-recipe/workflow.yaml \
  --target /path/to/backstage-app \
  --dry-run
```

## AI fixup

The recipe runs every codemod at its default settings (no AI fixup). Nine of the eleven codemods ship an optional `aiFixup` param that uses an LLM to refine edge cases the AST transform cannot handle mechanically. If you want AI fixup for one of those, run that package on its own after the recipe:

```bash
yarn dlx codemod@latest run @backstage/humanize-entity-ref-to-presentation \
  --target /path/to/backstage-app \
  --param aiFixup=true
```

The Codemod workflow engine does not currently support string interpolation inside a step's `args:`, so the recipe cannot forward a single top-level `aiFixup` flag to every step. Running the individual package with `--param aiFixup=true` is the supported path for now.

## Notes

- Each step is invoked through the `codemod:` workflow action and resolved from the Codemod registry, so running the recipe installs the latest published version of every referenced package.
- The recipe does not reorder edits across codemods; each registry package owns its own before/after behavior. Check the individual READMEs for the details of any single step.
- Several of the codemods insert `TODO(backstage-codemod)` markers where a value needs a human review. After the recipe finishes, grep for `TODO(backstage-codemod)` in your repo to find everything that still needs attention.
- This recipe is orchestration only -- it has no transform script of its own, so there are no fixture tests. Running `yarn test` in this package validates the workflow schema via `codemod workflow validate`.
