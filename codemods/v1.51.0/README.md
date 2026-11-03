# v1.51.0-migration-recipe

One-shot migration recipe for upgrading a Backstage app to 1.51.0. Runs every local v1.51.0 codemod script through a single workflow so you don't have to run each one by hand.

## What it runs

Each step below runs a bundled local script. The recipe executes them sequentially in an order aligned with the [Backstage 1.51.0 release notes](https://backstage.io/docs/releases/v1.51.0/): frontend-plugin-api nav model changes first, then the remaining breaking changes grouped by domain, then the deprecations.

| #   | Local script                                                                                             | What it does                                                                                            |
| --- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1   | [`scripts/migrate-nav-item-to-page.ts`](scripts/migrate-nav-item-to-page.ts)                             | Merge `NavItemBlueprint` title/icon into matching `PageBlueprint` params and remove nav item extensions |
| 2   | [`scripts/portable-schema-method-call.ts`](scripts/portable-schema-method-call.ts)                       | Call `PortableSchema.schema()` as a method instead of property access                                   |
| 3   | [`scripts/migrate-policy-query-user.ts`](scripts/migrate-policy-query-user.ts)                           | Migrate `PolicyQueryUser` off removed `token`, `expiresInSeconds`, and `identity` fields                |
| 4   | [`scripts/rename-header-main-class.ts`](scripts/rename-header-main-class.ts)                             | Rename removed `.bui-Header` root class and `HeaderDefinition.classNames.root`                          |
| 5   | [`scripts/render-test-app-nav-migration.ts`](scripts/render-test-app-nav-migration.ts)                   | Migrate `renderInTestApp` nav-item tests to `renderTestApp`                                             |
| 6   | [`scripts/loading-to-is-pending.ts`](scripts/loading-to-is-pending.ts)                                   | Rename deprecated `loading` prop to `isPending` on `@backstage/ui` components                           |
| 7   | [`scripts/experimental-form-decorators-to-stable.ts`](scripts/experimental-form-decorators-to-stable.ts) | Rename `EXPERIMENTAL_formDecorators` to `formDecorators` in scaffolder templates                        |
| 8   | [`scripts/remove-immediate-stitching-mode.ts`](scripts/remove-immediate-stitching-mode.ts)               | Migrate `catalog.stitchingStrategy.mode: immediate` to `deferred` in app-config YAML                    |

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
  -w codemods/v1.51.0/workflow.yaml \
  --target /path/to/backstage-app \
  --dry-run
```

## AI fixup

AI fixups are disabled by default. Enable the six bundled fixup steps after the local AST transforms with:

```bash
yarn dlx codemod@latest run @backstage/v1-51-0-migration-recipe   --target /path/to/backstage-app   --param aiFixup=true
```

## Notes

- All transforms run bundled local scripts in workflow order; no nested registry packages are downloaded.
- Several transforms insert `TODO(backstage-codemod)` markers where a value needs human review. Search for these after running the recipe.
- `yarn test` runs the bundled TypeScript, YAML, and CSS fixture suites plus workflow structure and ordering checks.

## Out of scope

These Backstage 1.51.0 changes are not covered by this recipe. Handle them manually when upgrading:

- OIDC CIMD/DCR defaults for auth providers
- Catalog pagination behavior changes
- Microsoft Graph provider disabled-user handling
- `@remixicon/react` version cap
- Zod v4-only bump in `@backstage/config`
- React Aria monopackage migration in `@backstage/ui`
- `Header.breadcrumbs` deprecation (not removed in 1.51.0)
