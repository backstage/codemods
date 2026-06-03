# backstage-codemods

Official codemods for upgrading and maintaining Backstage projects, built by the community and approved by the Backstage core team.

Backstage moves fast! APIs get deprecated, plugin systems get rewritten, and manual upgrades across a large app become tedious and error-prone. This repo provides automated transformations that handle the mechanical parts of those migrations for you.

See the [Codemod docs](https://docs.codemod.com) for more on building and running codemods.

## Codemods

<!-- CODEMODS_START -->

### v1.51.0

Run the [`migration-recipe`](./codemods/v1.51.0/migration-recipe) to apply every codemod below in one pass, or run any individual codemod on its own.

| Codemod                                                                                             | Description                                                                                            |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| [experimental-form-decorators-to-stable](./codemods/v1.51.0/experimental-form-decorators-to-stable) | Rename EXPERIMENTAL_formDecorators to formDecorators in Backstage template specs for 1.51.0            |
| [loading-to-is-pending](./codemods/v1.51.0/loading-to-is-pending)                                   | Rename deprecated loading prop to isPending in @backstage/ui and data-loading to data-ispending in CSS |
| [migrate-nav-item-to-page](./codemods/v1.51.0/migrate-nav-item-to-page)                             | Migrate NavItemBlueprint to PageBlueprint title/icon params for Backstage 1.51.0                       |
| [migrate-policy-query-user](./codemods/v1.51.0/migrate-policy-query-user)                           | Migrate PolicyQueryUser off removed token, expiresInSeconds, and identity fields                       |
| [migration-recipe](./codemods/v1.51.0/migration-recipe)                                             | Migration recipe that runs every @backstage v1.51.0 codemod from the registry in a safe order.         |
| [portable-schema-method-call](./codemods/v1.51.0/portable-schema-method-call)                       | Call PortableSchema.schema() as a method instead of property access                                    |
| [remove-immediate-stitching-mode](./codemods/v1.51.0/remove-immediate-stitching-mode)               | Migrate catalog.stitchingStrategy.mode from immediate to deferred                                      |
| [rename-header-main-class](./codemods/v1.51.0/rename-header-main-class)                             | Rename removed .bui-Header to .bui-HeaderContent and classNames.root to classNames.content             |
| [render-test-app-nav-migration](./codemods/v1.51.0/render-test-app-nav-migration)                   | Migrate renderInTestApp nav-item tests to renderTestApp for Backstage 1.51.0                           |

### v1.50.0

Run the [`migration-recipe`](./codemods/v1.50.0/migration-recipe) to apply every codemod below in one pass, or run any individual codemod on its own.

| Codemod                                                                                       | Description                                                                                                            |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| [add-entity-ref-to-location](./codemods/v1.50.0/add-entity-ref-to-location)                   | Add required entityRef field to Location object literals from @backstage/catalog-client                                |
| [add-update-location-method](./codemods/v1.50.0/add-update-location-method)                   | Add required updateLocation method to CatalogApi and CatalogService implementations                                    |
| [catalog-node-alpha-to-stable](./codemods/v1.50.0/catalog-node-alpha-to-stable)               | Replace deprecated @backstage/plugin-catalog-node/alpha exports with stable equivalents                                |
| [dialog-api-show-to-open](./codemods/v1.50.0/dialog-api-show-to-open)                         | Replace deprecated DialogApi .show() and .showModal() with .open()                                                     |
| [header-tab-to-nav-tab-item](./codemods/v1.50.0/header-tab-to-nav-tab-item)                   | Rename HeaderTab to HeaderNavTabItem and remove matchStrategy property in @backstage/ui                                |
| [humanize-entity-ref-to-presentation](./codemods/v1.50.0/humanize-entity-ref-to-presentation) | Replace deprecated humanizeEntityRef/humanizeEntity with Catalog Presentation API                                      |
| [migrate-permissioned-route](./codemods/v1.50.0/migrate-permissioned-route)                   | Migrate PermissionedRoute to Route + RequirePermission for @backstage/plugin-permission-react                          |
| [migrate-signals-service](./codemods/v1.50.0/migrate-signals-service)                         | Rename deprecated SignalService exports to SignalsService in @backstage/plugin-signals-node                            |
| [migration-recipe](./codemods/v1.50.0/migration-recipe)                                       | Migration recipe that runs every @backstage v1.50.0 codemod from the registry in a safe order.                         |
| [remove-bootstrap-env-proxy](./codemods/v1.50.0/remove-bootstrap-env-proxy)                   | Remove deprecated bootstrapEnvProxyAgents() call and import from @backstage/cli-common                                 |
| [rename-plugin-header-toolbar](./codemods/v1.50.0/rename-plugin-header-toolbar)               | Rename .bui-PluginHeaderToolbarWrapper to .bui-PluginHeaderToolbar and classNames.toolbarWrapper to classNames.toolbar |
| [replace-create-schema-from-zod](./codemods/v1.50.0/replace-create-schema-from-zod)           | Replace createSchemaFromZod and config.schema with configSchema                                                        |

Older versions are available in the [`codemods/`](./codemods) directory.

<!-- CODEMODS_END -->

## Usage

Run any codemod in this repo against your Backstage project with the [Codemod CLI](https://docs.codemod.com/cli):

```bash
npx codemod <codemod-name>
```

Most codemods include an optional AI-powered fixup step that catches edge cases the AST transforms cannot handle mechanically (namespace imports, spread props, aliased re-exports, etc.). It is disabled by default. Enable it on a single codemod or on a migration recipe (which forwards it to every child codemod that supports it):

```bash
# Single codemod
npx codemod <codemod-name> --param aiFixup=true

# Migration recipe — forwards aiFixup to all supported child codemods
npx codemod @backstage/v1-51-0-migration-recipe --param aiFixup=true
```

## Development

Codemods in this repo are written using [jssg](https://docs.codemod.com/jssg) (JS ast-grep) TypeScript transformation scripts that operate on ASTs generated by ast-grep. See the [jssg docs](https://docs.codemod.com/jssg) for the full API reference.

```bash
# Install dependencies
yarn install

# Run all tests
yarn test

# Lint all files
yarn lint

# Format all files
yarn format
```

## Contributing

Contributions are welcome especially codemods that automate common Backstage upgrade steps. See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on submitting changes, adding changesets, and the release process.

## Project structure

```
codemods/
  <version>/
    <name>/
      scripts/codemod.ts   # Codemod logic (jssg / ast-grep)
      tests/               # Input/expected test fixtures
      codemod.yaml         # Codemod manifest
      workflow.yaml        # Execution workflow
      package.json
```

## License

MIT
