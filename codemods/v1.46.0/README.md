# Backstage 1.46.0 Migration Recipe

Runs bundled local scripts in a single ordered run.

## What it runs

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

## Running a single script

To run one transform, copy its `js-ast-grep` step from `workflow.yaml` into a minimal workflow, preserving `js_file`, `language`, selectors, and any step options. Point `js_file` at the bundled script, then run `codemod workflow run -w <your-workflow.yaml> --target /path/to/backstage-app --dry-run` before applying. Keep related passes in recipe order when selecting more than one step.

## AI behavior and review

The recipe has no AI fixup parameter. Review the manual migration items below.

### Out of scope (document only)

These changes require manual attention and are not covered by the recipe:

- **`TechDocsAddonTester.renderWithEffects()` screen change** — narrow scope, requires new npm dep (`shadow-dom-testing-library`)
- **Jest peer dep version choice** — the codemod defaults to Jest 30 (recommended); use `--param jestVersion=29` for Jest 29
- **Jest 30 test code migration** — asymmetric matchers, JSDOM 27 changes; see [Jest 30 migration guide](https://backstage.io/docs/tutorials/jest30-migration)
- **`getBitbucketCloudRequestOptions` now returns Promise** — narrow internal API
- **CLI `moduleResolution` → `bundler` default** — tsconfig defaults, not consumer code
- **Node.js 22/24 requirement** — runtime environment

## Development

`yarn test` runs bundled fixtures and workflow checks through `run-recipe-tests`.

The package-root `tsconfig.json` checks production scripts and excludes `tests/`; repository-wide `yarn lint` includes source type checking.

## Notes

Each workflow step uses a bundled local script; no standalone registry codemod packages are required.
