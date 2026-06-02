# add-jest-peer-dependency

Backstage 1.46.0 codemod: Add jest as explicit peer dependency to root package.json.

## Background

Starting with `@backstage/cli@0.35.0`, `jest` is a peer dependency instead of a bundled dependency. Projects using Backstage CLI for testing must add Jest and its environment dependencies as `devDependencies` in their root `package.json`.

## What it does

- Scans root `package.json` files
- Checks if `@backstage/cli` is present in dependencies or devDependencies
- If `jest` is already present, skips the file (already migrated)
- Adds Jest 30 packages by default (`jest`, `@types/jest`, `@jest/environment-jsdom-abstract`, `jsdom`)
- With `--param jestVersion=29`, adds Jest 29 packages instead (`jest`, `@types/jest`, `jest-environment-jsdom`)
- Preserves existing `package.json` formatting and field order

## Usage

```bash
# Dry run — Jest 30 (default, recommended)
npx codemod workflow run \
  -w codemods/v1.46.0/add-jest-peer-dependency/workflow.yaml \
  --target /path/to/backstage-app \
  --dry-run

# Apply — Jest 30
npx codemod workflow run \
  -w codemods/v1.46.0/add-jest-peer-dependency/workflow.yaml \
  --target /path/to/backstage-app

# Apply — Jest 29
npx codemod workflow run \
  -w codemods/v1.46.0/add-jest-peer-dependency/workflow.yaml \
  --target /path/to/backstage-app \
  --param jestVersion=29
```

## Notes

- Only modifies the ROOT `package.json` — individual package `package.json` files are excluded
- Jest 29 support is temporary; Backstage recommends Jest 30 for CSS `@layer` compatibility
- See the [Jest 30 migration guide](https://backstage.io/docs/tutorials/jest30-migration) for test code changes
