# v1-54-0-migration-recipe

Runs every Backstage 1.54.0 codemod in a safe order. All transform scripts are bundled locally in `scripts/` and run as individual `js-ast-grep`/shell steps — one recipe, one published package, no per-codemod registry packages.

Users who need only one transform can still run that script individually (see below).

## What it runs

| #   | Script                                                                                            | Migration                                                                     |
| --- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1   | `scripts/move-connections-backend-imports.ts`                                                     | Move backend-only Connections exports; preserve common imports.               |
| 2   | `scripts/migrate-connections-query.ts`                                                            | Move built-in URL lookups from `find({ url })` to `find({ query: { url } })`. |
| 3   | `scripts/rename-root-connection-auth.ts`                                                          | Rename `RootConnectionAuth` to `ConfiguredConnectionAuth`.                    |
| 4   | `scripts/migrate-extension-config-schema-index.ts` + `scripts/migrate-extension-config-schema.ts` | Migrate extension `config.schema` factories to Standard Schema values.        |
| 5   | `scripts/rename-openapi-validate-command-*.ts`/`.mjs`/`.js`                                       | Rename `repo schema openapi verify` to `validate`.                            |

## Usage

```bash
# Preview first
yarn dlx codemod@latest workflow run -w codemods/v1.54.0/migration-recipe/workflow.yaml \
  --target /path/to/backstage-app --dry-run

# Apply
yarn dlx codemod@latest workflow run -w codemods/v1.54.0/migration-recipe/workflow.yaml \
  --target /path/to/backstage-app
```

Once the recipe is published, replace `workflow run -w codemods/v1.54.0/migration-recipe/workflow.yaml` with `run @backstage/v1-54-0-migration-recipe`.

## Running a single script

Each script is a standalone JSSG transform. To run one individually, copy the corresponding step from `workflow.yaml` into a minimal workflow that points `js_file` at the script and run it with `codemod workflow run -w <your-workflow.yaml> --target /path/to/backstage-app`. Keep the step's `language`, `include`, and `exclude` values as they appear in the recipe. Note that step 4's two scripts share workflow state (`zod-v4-package:*`), so always run them together and in order; the OpenAPI shell step depends on state (`targetDirEncoded`) set by its package.json step, so run those together too.

## AI behavior and review

The recipe defaults `aiFixup` to `false`; the default run is AST-only. The optional `aiFixup=true` path has **not** been tested or approved for this recipe. To use it, run the recipe with `--param aiFixup=true` only with a supported, approved OpenAI work provider and work credentials (never `openai-codex`); verify the AI step actually runs and review its edits on a disposable worktree. Check package-local Zod v4 availability, unresolved schema factories, and type checks. Do not silently change dependency versions.

Search the migrated app for residual markers: `rg -F 'TODO(backstage-codemod)' /path/to/backstage-app`. Resolve each with context; the recipe does not guarantee every migration is mechanical.

## Manual-only changes

- OAuth redirect URI and CIMD allowlist matching is component-wise and strict: inspect URL patterns and security intent, especially wildcard ports and paths.
- Custom Connections service implementations and portable-schema parsing need case-by-case review. Removed `RootConnection` / `AnyRootConnection` and custom AWS CodeCommit unauthenticated options have no safe generic replacement.
- `catalog.providers.backstageOpenapi.plugins` is optional/deprecated. Deleting an explicit subset changes discovery scope; choose the desired plugins manually.
- For the extension config schema step, confirm package-local Zod v4 support and review unresolved schema factories; do not invent a dependency version.

## Development

`yarn test` runs `run-recipe-tests` (the repo-wide recipe runner from `@backstage/scripts`), which discovers every suite by convention — adding a script or fixture suite needs no test-command change:

- `scripts/<name>.ts` + `tests/<name>/<case>/input.<ext>` fixtures run as JSSG tests (language inferred from the fixture extension).
- `tests/<name>/assert-fixtures.ts` suites run whole app trees through the recipe workflow (the extension config schema fixtures; the diffs prove the other steps no-op on them) and `typed-extension` is type-checked with `tsc`.
- `tests/**/*.test.mjs` run under `node --test` (OpenAPI `rewriteCommand` and shell walker unit tests, plus workflow structure checks).
- `codemod workflow validate` checks the workflow schema.

```bash
yarn install
yarn test
```
