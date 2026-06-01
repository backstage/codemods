# v1.51.0-migration-recipe

One-shot migration recipe for upgrading a Backstage app to 1.51.0. Chains every `@backstage/*` v1.51.0 codemod from the Codemod registry through a single workflow so you don't have to run each one by hand.

## What it runs

Each step below is a registry package that you can also run on its own. The recipe executes them sequentially in an order aligned with the [Backstage 1.51.0 release notes](https://backstage.io/docs/releases/v1.51.0/): frontend-plugin-api nav model changes first, then the remaining breaking changes grouped by domain, then the deprecations.

| #   | Registry package                                                                                                                          | What it does                                                                                            |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1   | [`@backstage/migrate-nav-item-to-page`](https://app.codemod.com/registry/@backstage/migrate-nav-item-to-page)                             | Merge `NavItemBlueprint` title/icon into matching `PageBlueprint` params and remove nav item extensions |
| 2   | [`@backstage/portable-schema-method-call`](https://app.codemod.com/registry/@backstage/portable-schema-method-call)                       | Call `PortableSchema.schema()` as a method instead of property access                                   |
| 3   | [`@backstage/migrate-policy-query-user`](https://app.codemod.com/registry/@backstage/migrate-policy-query-user)                           | Migrate `PolicyQueryUser` off removed `token`, `expiresInSeconds`, and `identity` fields                |
| 4   | [`@backstage/rename-header-main-class`](https://app.codemod.com/registry/@backstage/rename-header-main-class)                             | Rename removed `.bui-Header` root class and `HeaderDefinition.classNames.root`                          |
| 5   | [`@backstage/render-test-app-nav-migration`](https://app.codemod.com/registry/@backstage/render-test-app-nav-migration)                   | Migrate `renderInTestApp` nav-item tests to `renderTestApp`                                             |
| 6   | [`@backstage/loading-to-is-pending`](https://app.codemod.com/registry/@backstage/loading-to-is-pending)                                   | Rename deprecated `loading` prop to `isPending` on `@backstage/ui` components                           |
| 7   | [`@backstage/experimental-form-decorators-to-stable`](https://app.codemod.com/registry/@backstage/experimental-form-decorators-to-stable) | Rename `EXPERIMENTAL_formDecorators` to `formDecorators` in scaffolder templates                        |
| 8   | [`@backstage/remove-immediate-stitching-mode`](https://app.codemod.com/registry/@backstage/remove-immediate-stitching-mode)               | Migrate `catalog.stitchingStrategy.mode: immediate` to `deferred` in app-config YAML                    |

## Usage

```bash
# Dry run (preview every step without writing any changes)
yarn dlx codemod@latest run @backstage/v1-51-0-migration-recipe \
  --target /path/to/backstage-app \
  --dry-run

# Apply the full recipe
yarn dlx codemod@latest run @backstage/v1-51-0-migration-recipe \
  --target /path/to/backstage-app
```

You can also run the recipe directly from this repo:

```bash
yarn dlx codemod@latest workflow run \
  -w codemods/v1.51.0/migration-recipe/workflow.yaml \
  --target /path/to/backstage-app \
  --dry-run
```

## AI fixup

The recipe runs every codemod at its default settings (no AI fixup). Six of the eight codemods ship an optional `aiFixup` param that uses an LLM to refine edge cases the AST transform cannot handle mechanically. If you want AI fixup for one of those, run that package on its own after the recipe:

```bash
yarn dlx codemod@latest run @backstage/migrate-nav-item-to-page \
  --target /path/to/backstage-app \
  --param aiFixup=true
```

The Codemod workflow engine does not currently support string interpolation inside a step's `args:`, so the recipe cannot forward a single top-level `aiFixup` flag to every step. Running the individual package with `--param aiFixup=true` is the supported path for now.

## Notes

- Each step is invoked through the `codemod:` workflow action and resolved from the Codemod registry, so running the recipe installs the latest published version of every referenced package. All eight underlying codemods must be published before the recipe can run end-to-end from the registry.
- The recipe does not reorder edits across codemods; each registry package owns its own before/after behavior. Check the individual READMEs for the details of any single step.
- Several of the codemods insert `TODO(backstage-codemod)` markers where a value needs a human review. After the recipe finishes, grep for `TODO(backstage-codemod)` in your repo to find everything that still needs attention.
- This recipe is orchestration only — it has no transform script of its own, so there are no fixture tests. Running `yarn test` in this package validates the workflow schema via `codemod workflow validate`.

## Out of scope

These Backstage 1.51.0 changes are not covered by this recipe. Handle them manually when upgrading:

- OIDC CIMD/DCR defaults for auth providers
- Catalog pagination behavior changes
- Microsoft Graph provider disabled-user handling
- `@remixicon/react` version cap
- Zod v4-only bump in `@backstage/config`
- React Aria monopackage migration in `@backstage/ui`
- `Header.breadcrumbs` deprecation (not removed in 1.51.0)
