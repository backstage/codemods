# v1.49.0-migration-recipe

One-shot migration recipe for upgrading a Backstage app to 1.49.0. Chains every `@backstage/*` v1.49.0 codemod from the Codemod registry through a single workflow so you don't have to run each one by hand.

## What it runs

Each step below is a registry package that you can also run on its own. The recipe executes them sequentially in an order aligned with the [Backstage 1.49.0 release notes](https://backstage.io/docs/releases/v1.49.0/): BUI CSS renames first, then the remaining breaking changes grouped by domain.

| #   | Registry package                                                                                                                        | What it does                                                                   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | [`@backstage/rename-bui-header-css-classes`](https://app.codemod.com/registry/@backstage/rename-bui-header-css-classes)                 | Rename `bui-HeaderPage*` CSS classes to `bui-Header*`                          |
| 2   | [`@backstage/remove-catalog-card-variant-props`](https://app.codemod.com/registry/@backstage/remove-catalog-card-variant-props)         | Remove deprecated `variant` and `gridSizes` props from catalog card components |
| 3   | [`@backstage/migrate-gerrit-gitiles-functions`](https://app.codemod.com/registry/@backstage/migrate-gerrit-gitiles-functions)           | Rename deprecated Gerrit Gitiles functions in `@backstage/integration`         |
| 4   | [`@backstage/remove-any-extension-data-ref`](https://app.codemod.com/registry/@backstage/remove-any-extension-data-ref)                 | Rename deprecated `AnyExtensionDataRef` to `ExtensionDataRef`                  |
| 5   | [`@backstage/remove-create-public-sign-in-app`](https://app.codemod.com/registry/@backstage/remove-create-public-sign-in-app)           | Replace `createPublicSignInApp` with `createApp` + `appModulePublicSignIn`     |
| 6   | [`@backstage/remove-allow-unknown-extension-config`](https://app.codemod.com/registry/@backstage/remove-allow-unknown-extension-config) | Remove deprecated `allowUnknownExtensionConfig` from `createApp()`             |

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
  -w codemods/v1.49.0/migration-recipe/workflow.yaml \
  --target /path/to/backstage-app \
  --dry-run
```

## AI fixup

The recipe runs every codemod at its default settings (no AI fixup). One of the six codemods ships an optional `aiFixup` param (`remove-create-public-sign-in-app`) that uses an LLM to refine edge cases the AST transform cannot handle mechanically. If you want AI fixup, run that package on its own after the recipe:

```bash
yarn dlx codemod@latest run @backstage/remove-create-public-sign-in-app \
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
