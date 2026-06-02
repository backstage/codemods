# v1.47.0-migration-recipe

One-shot migration recipe for upgrading a Backstage app to 1.47.0. Chains every `@backstage/*` v1.47.0 codemod from the Codemod registry through a single workflow so you don't have to run each one by hand.

## What it runs

Each step below is a registry package that you can also run on its own. The recipe executes them sequentially in an order aligned with the [Backstage 1.47.0 release notes](https://backstage.io/docs/releases/v1.47.0/): CSS token renames first, then the structural Table component migration.

| #   | Registry package                                                                                                            | What it does                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 1   | [`@backstage/rename-bui-css-tokens-v1-47`](https://app.codemod.com/registry/@backstage/rename-bui-css-tokens-v1-47)         | Rename deprecated BUI CSS custom properties (`--bui-bg`, `--bui-bg-tint*`) to new equivalents |
| 2   | [`@backstage/migrate-table-to-use-table-hook`](https://app.codemod.com/registry/@backstage/migrate-table-to-use-table-hook) | Migrate `Table` component to new `useTable` hook API from `@backstage/ui`                     |

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
  -w codemods/v1.47.0/migration-recipe/workflow.yaml \
  --target /path/to/backstage-app \
  --dry-run
```

## AI fixup

The recipe runs every codemod at its default settings (no AI fixup). One of the two codemods ships an optional `aiFixup` param that uses an LLM to refine edge cases the AST transform cannot handle mechanically. If you want AI fixup for that codemod, run it on its own after the recipe:

```bash
yarn dlx codemod@latest run @backstage/migrate-table-to-use-table-hook \
  --target /path/to/backstage-app \
  --param aiFixup=true
```

The Codemod workflow engine does not currently support string interpolation inside a step's `args:`, so the recipe cannot forward a single top-level `aiFixup` flag to every step. Running the individual package with `--param aiFixup=true` is the supported path for now.

## Out of scope (document only)

The following v1.47.0 changes are not covered by codemods and require manual attention:

- **`FetchUrlReader` constructor now private** — use `FetchUrlReader.fromConfig` instead (narrow internal API)
- **URL reader redirect chain validation** — configure `reading.allow` in `app-config.yaml`
- **Blueprints moving to `@backstage/plugin-app-react`** — deprecated, not yet removed
- **Color token tint replacements are approximate** — the `--bui-bg-tint*` tokens have "no direct replacement" per changelog; the `--bui-bg-neutral-on-surface-0*` set is the recommended equivalent

## Notes

- Each step is invoked through the `codemod:` workflow action and resolved from the Codemod registry, so running the recipe installs the latest published version of every referenced package.
- The recipe does not reorder edits across codemods; each registry package owns its own before/after behavior. Check the individual READMEs for the details of any single step.
- Several of the codemods insert `TODO(backstage-codemod)` markers where a value needs a human review. After the recipe finishes, grep for `TODO(backstage-codemod)` in your repo to find everything that still needs attention.
- This recipe is orchestration only — it has no transform script of its own, so there are no fixture tests. Running `yarn test` in this package validates the workflow schema via `codemod workflow validate`.
