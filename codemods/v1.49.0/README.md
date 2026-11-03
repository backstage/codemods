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

## AI fixup

The recipe defaults to AST-only transforms. Set `aiFixup=true` to run an optional AI fixup after all transforms for `createPublicSignInApp` edge cases:

```bash
yarn dlx codemod@latest run @backstage/v1-49-0-migration-recipe \
  --target /path/to/backstage-app \
  --param aiFixup=true
```

## Out of scope (document only)

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

## Notes

- Each step is invoked through the `codemod:` workflow action and resolved from the Codemod registry, so running the recipe installs the latest published version of every referenced package.
- The recipe does not reorder edits across codemods; each registry package owns its own before/after behavior. Check the individual READMEs for the details of any single step.
- Some codemods insert `TODO(backstage-codemod)` markers where a value needs human review. After the recipe finishes, grep for `TODO(backstage-codemod)` in your repo to find everything that still needs attention.
- This recipe is orchestration only — it has no transform script of its own, so there are no fixture tests. Running `yarn test` in this package validates the workflow schema via `codemod workflow validate`.
