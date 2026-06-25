# backstage-codemods

Official codemods for upgrading and maintaining Backstage projects, built by the community and approved by the Backstage core team.

Backstage moves fast! APIs get deprecated, plugin systems get rewritten, and manual upgrades across a large app become tedious and error-prone. This repo provides automated transformations that handle the mechanical parts of those migrations for you.

See the [Codemod docs](https://docs.codemod.com) for more on building and running codemods.

## Codemods

<!-- CODEMODS_START -->

### v1.52.0

Run the [`migration-recipe`](./codemods/v1.52.0/migration-recipe) to apply every codemod below in one pass, or run any individual codemod on its own.

| Codemod                                                                                   | Description                                                                                    |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [migrate-bui-props-to-intersection](./codemods/v1.52.0/migrate-bui-props-to-intersection) | Migrate ComboboxProps/SelectProps interface extends to type intersection                       |
| [migrate-select-combobox-props](./codemods/v1.52.0/migrate-select-combobox-props)         | Migrate deprecated Select/Combobox search props and option value to id                         |
| [migration-recipe](./codemods/v1.52.0/migration-recipe)                                   | Migration recipe that runs every @backstage v1.52.0 codemod from the registry in a safe order. |
| [remove-stitching-strategy-mode](./codemods/v1.52.0/remove-stitching-strategy-mode)       | Remove deprecated catalog.stitchingStrategy.mode from app-config                               |
| [rename-bui-css-tokens-v1-52](./codemods/v1.52.0/rename-bui-css-tokens-v1-52)             | Rename deprecated BUI semantic color tokens                                                    |

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

Older versions are available in the [`codemods/`](./codemods) directory.

### misc

| Codemod                                                                                          | Description                                       |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| [migrate-mui-alert-to-bui-alert](./codemods/misc/migrate-mui-alert-to-bui-alert)                 | MUI 4 to BUI: Replace MUI Alert with BUI Alert    |
| [migrate-mui-button-to-bui-button](./codemods/misc/migrate-mui-button-to-bui-button)             | MUI 4 to BUI: Replace MUI Button with BUI Button  |
| [migrate-mui-icon-button-to-button-icon](./codemods/misc/migrate-mui-icon-button-to-button-icon) | MUI 4 to BUI: Replace IconButton with ButtonIcon  |
| [migrate-mui-tooltip-to-bui-tooltip](./codemods/misc/migrate-mui-tooltip-to-bui-tooltip)         | MUI 4 to BUI: Replace Tooltip with TooltipTrigger |
| [migrate-mui-typography-to-text](./codemods/misc/migrate-mui-typography-to-text)                 | MUI 4 to BUI: Replace Typography with Text        |

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
