# v1.49.0-migration-recipe

One-shot migration recipe for upgrading a Backstage app to 1.49.0. Runs every v1.49.0 codemod script locally through a single workflow so you don't have to run each one by hand.

## What it runs

Each step below runs a local script. The recipe executes them sequentially in an order aligned with the [Backstage 1.49.0 release notes](https://backstage.io/docs/releases/v1.49.0/): BUI CSS renames first, then the remaining breaking changes grouped by domain.

| #   | Local script                                                                                | What it does                                                                   |
| --- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | [`rename-bui-header-css-classes`](scripts/rename-bui-header-css-classes.ts)                 | Rename `bui-HeaderPage*` CSS classes to `bui-Header*`                          |
| 2   | [`remove-catalog-card-variant-props`](scripts/remove-catalog-card-variant-props.ts)         | Remove deprecated `variant` and `gridSizes` props from catalog card components |
| 3   | [`migrate-gerrit-gitiles-functions`](scripts/migrate-gerrit-gitiles-functions.ts)           | Rename deprecated Gerrit Gitiles functions in `@backstage/integration`         |
| 4   | [`remove-any-extension-data-ref`](scripts/remove-any-extension-data-ref.ts)                 | Rename deprecated `AnyExtensionDataRef` to `ExtensionDataRef`                  |
| 5   | [`remove-create-public-sign-in-app`](scripts/remove-create-public-sign-in-app.ts)           | Replace `createPublicSignInApp` with `createApp` + `appModulePublicSignIn`     |
| 6   | [`remove-allow-unknown-extension-config`](scripts/remove-allow-unknown-extension-config.ts) | Remove deprecated `allowUnknownExtensionConfig` from `createApp()`             |

## Usage

```bash
# Dry run (preview every step without writing any changes)
yarn dlx codemod@latest run @backstage/v1-49-0-migration-recipe \
  --target /path/to/backstage-app \
  --dry-run

# Apply the full recipe
yarn dlx codemod@latest run @backstage/v1-49-0-migration-recipe \
  --target /path/to/backstage-app
```

You can also run the recipe directly from this repo:

```bash
yarn dlx codemod@latest workflow run \
  -w codemods/v1.49.0/workflow.yaml \
  --target /path/to/backstage-app \
  --dry-run
```

## Running a single script

To run one transform, copy its `js-ast-grep` step from `workflow.yaml` into a minimal workflow, preserving `js_file`, `language`, selectors, and any step options. Point `js_file` at the bundled script, then run `codemod workflow run -w <your-workflow.yaml> --target /path/to/backstage-app --dry-run` before applying. Keep related passes in recipe order when selecting more than one step. CSS/SCSS passes are separate steps from source passes; select both where the migration spans both languages.

## AI behavior and review

The recipe defaults to AST-only transforms. Set `aiFixup=true` to run an optional AI fixup after all transforms for `createPublicSignInApp` edge cases:

```bash
yarn dlx codemod@latest run @backstage/v1-49-0-migration-recipe \
  --target /path/to/backstage-app \
  --param aiFixup=true
```

- Some codemods insert `TODO(backstage-codemod)` markers where a value needs human review. After the recipe finishes, grep for `TODO(backstage-codemod)` in your repo to find everything that still needs attention.

### Out of scope (document only)

The following changes in Backstage 1.49.0 are not covered by codemods and require manual attention:

- **Bitbucket integration removals** (`BitbucketUrlReader`, `bitbucket` config, `bitbucket` in ScaffolderClient) — requires judgment: Cloud vs Server
- **Azure DevOps `token`/`credential` → `credentials` array** — config change requiring judgment
- **`getGitHubRequestOptions` removed** — no replacement documented
- **CLI templates renamed** (`new-frontend-plugin` → `frontend-plugin`) — auto-detected by CLI
- **`migrate package-exports` command removed** — use `repo fix` instead
- **CLI camelCase → kebab-case flags** — scripts/CI updates
- **`findPaths` → `targetPaths`/`findOwnPaths`** — CLI internals
- **`PluginOptions` → `CreateFrontendPluginOptions`** — deprecated not removed
- **`ResolvedExtensionInput`/`ExtensionDataRefToValue` types removed** — narrow internal types
- **`ExtensionAttachTo` array form removed** — runtime still supports
- **PluginWrapper promoted from alpha** — additive import path

## Development

`yarn test` runs bundled transform fixtures, workflow order and AI-gating assertions, and workflow schema validation through `run-recipe-tests`.

The package-root `tsconfig.json` checks production scripts and excludes `tests/`; repository-wide `yarn lint` includes source type checking.

## Notes

- Each step runs a bundled local script (`scripts/<name>.ts`) in workflow order; no nested registry packages are resolved.
- The recipe does not reorder edits across steps; check the step list in `workflow.yaml` for the details of any single transform.
