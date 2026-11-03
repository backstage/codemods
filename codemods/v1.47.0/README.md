# v1.47.0-migration-recipe

One-shot migration recipe for upgrading a Backstage app to 1.47.0. Runs bundled local scripts through a single workflow so you don't have to run each one by hand.

## What it runs

Each step below runs a bundled local script. The recipe executes them sequentially in an order aligned with the [Backstage 1.47.0 release notes](https://backstage.io/docs/releases/v1.47.0/): CSS token renames first, then the structural Table component migration.

| #   | Local script                                 | What it does                                                                                  |
| --- | -------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 1   | `scripts/rename-bui-css-tokens-v1-47.ts`     | Rename deprecated BUI CSS custom properties (`--bui-bg`, `--bui-bg-tint*`) to new equivalents |
| 2   | `scripts/migrate-table-to-use-table-hook.ts` | Migrate `Table` component to new `useTable` hook API from `@backstage/ui`                     |

## Usage

```bash
# Dry run (preview every step without writing any changes)
yarn dlx codemod@latest run @backstage/v1-47-0-migration-recipe \
  --target /path/to/backstage-app \
  --dry-run

# Apply the full recipe
yarn dlx codemod@latest run @backstage/v1-47-0-migration-recipe \
  --target /path/to/backstage-app
```

You can also run the recipe directly from this repo:

```bash
yarn dlx codemod@latest workflow run \
  -w codemods/v1.47.0/workflow.yaml \
  --target /path/to/backstage-app \
  --dry-run
```

## Running a single script

To run one transform, copy its `js-ast-grep` step from `workflow.yaml` into a minimal workflow, preserving `js_file`, `language`, selectors, and any step options. Point `js_file` at the bundled script, then run `codemod workflow run -w <your-workflow.yaml> --target /path/to/backstage-app --dry-run` before applying. Keep related passes in recipe order when selecting more than one step. CSS/SCSS passes are separate steps from source passes; select both where the migration spans both languages.

## AI behavior and review

The optional `ai-fixup` node runs after all AST transforms when `aiFixup=true`. By default it is `false`. AI fixups are not covered by fixture tests.

```bash
# Apply the full recipe with AI fixup enabled
yarn dlx codemod@latest run @backstage/v1-47-0-migration-recipe \
  --target /path/to/backstage-app \
  --param aiFixup=true
```

- Several of the codemods insert `TODO(backstage-codemod)` markers where a value needs a human review. After the recipe finishes, grep for `TODO(backstage-codemod)` in your repo to find everything that still needs attention.

### Out of scope (document only)

The following v1.47.0 changes are not covered by codemods and require manual attention:

- **`FetchUrlReader` constructor now private** - use `FetchUrlReader.fromConfig` instead (narrow internal API)
- **URL reader redirect chain validation** - configure `reading.allow` in `app-config.yaml`
- **Blueprints moving to `@backstage/plugin-app-react`** - deprecated, not yet removed
- **Color token tint replacements are approximate** - the `--bui-bg-tint*` tokens have "no direct replacement" per changelog; the `--bui-bg-neutral-on-surface-0*` set is the recommended equivalent

## Development

- `yarn test` runs fixture suites and workflow structure validation through `run-recipe-tests`.

The package-root `tsconfig.json` checks production scripts and excludes `tests/`; repository-wide `yarn lint` includes source type checking.

## Notes

- Each step runs a bundled local script in workflow order; no registry codemods are resolved.
