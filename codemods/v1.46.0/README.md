# Backstage 1.46.0 Migration Recipe

Runs bundled local scripts in a single ordered run.

## Codemods included

| #   | Local script                          | Domain         |
| --- | ------------------------------------- | -------------- |
| 1   | `scripts/add-jest-peer-dependency.ts` | CLI / tooling  |
| 2   | `scripts/migrate-valkey-config.ts`    | Backend config |

## Usage

```bash
# Dry run (preview changes)
npx codemod workflow run \
  -w codemods/v1.46.0/workflow.yaml \
  --target /path/to/backstage-app \
  --dry-run

# Apply changes
npx codemod workflow run \
  -w codemods/v1.46.0/workflow.yaml \
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
