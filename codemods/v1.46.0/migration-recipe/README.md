# Backstage 1.46.0 Migration Recipe

Runs every `@backstage/*` v1.46.0 codemod from the registry in a single ordered run.

## Codemods included

| #   | Package                               | Domain         | Registry                                                          |
| --- | ------------------------------------- | -------------- | ----------------------------------------------------------------- |
| 1   | `@backstage/add-jest-peer-dependency` | CLI / tooling  | [link](https://go.codemod.com/backstage/add-jest-peer-dependency) |
| 2   | `@backstage/migrate-valkey-config`    | Backend config | [link](https://go.codemod.com/backstage/migrate-valkey-config)    |

## Usage

```bash
# Dry run (preview changes)
npx codemod workflow run \
  -w codemods/v1.46.0/migration-recipe/workflow.yaml \
  --target /path/to/backstage-app \
  --dry-run

# Apply changes
npx codemod workflow run \
  -w codemods/v1.46.0/migration-recipe/workflow.yaml \
  --target /path/to/backstage-app
```

## Out of scope (document only)

These changes require manual attention and are not covered by the recipe:

- **`TechDocsAddonTester.renderWithEffects()` screen change** — narrow scope, requires new npm dep (`shadow-dom-testing-library`)
- **Jest peer dep version choice** — the codemod defaults to Jest 30 (recommended); use `--param jestVersion=29` for Jest 29
- **Jest 30 test code migration** — asymmetric matchers, JSDOM 27 changes; see [Jest 30 migration guide](https://backstage.io/docs/tutorials/jest30-migration)
- **`getBitbucketCloudRequestOptions` now returns Promise** — narrow internal API
- **CLI `moduleResolution` → `bundler` default** — tsconfig defaults, not consumer code
- **Node.js 22/24 requirement** — runtime environment
