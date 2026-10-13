# v1.54.0-migration-recipe

Run the five Backstage 1.54.0 codemods in order from the [Codemod Registry](https://go.codemod.com/registry). **Do not run this recipe until all five dependencies are published to the registry.** This draft cannot be tested end-to-end while they are unavailable.

## What it runs

| #   | Registry package                                                                                                              | Migration                                                                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1   | [`@backstage/move-connections-backend-imports`](https://app.codemod.com/registry/@backstage/move-connections-backend-imports) | Move backend-only Connections exports; preserve common imports.               |
| 2   | [`@backstage/migrate-connections-query`](https://app.codemod.com/registry/@backstage/migrate-connections-query)               | Move built-in URL lookups from `find({ url })` to `find({ query: { url } })`. |
| 3   | [`@backstage/rename-root-connection-auth`](https://app.codemod.com/registry/@backstage/rename-root-connection-auth)           | Rename `RootConnectionAuth` to `ConfiguredConnectionAuth`.                    |
| 4   | [`@backstage/migrate-extension-config-schema`](https://app.codemod.com/registry/@backstage/migrate-extension-config-schema)   | Migrate extension `config.schema` factories to Standard Schema values.        |
| 5   | [`@backstage/rename-openapi-validate-command`](https://app.codemod.com/registry/@backstage/rename-openapi-validate-command)   | Rename `repo schema openapi verify` to `validate`.                            |

## Usage (after dependency publication)

```bash
# Preview first
yarn dlx codemod@latest workflow run -w codemods/v1.54.0/migration-recipe/workflow.yaml \
  --target /path/to/backstage-app --dry-run

# Apply
yarn dlx codemod@latest workflow run -w codemods/v1.54.0/migration-recipe/workflow.yaml \
  --target /path/to/backstage-app
```

Once the recipe itself is published, replace `workflow run -w codemods/v1.54.0/migration-recipe/workflow.yaml` with `run @backstage/v1-54-0-migration-recipe`.

## AI behavior and review

The recipe passes no `aiFixup` parameter and runs AST-only. Only step 4 (#146) has an optional AI fixup. Recipe-level forwarding via `args: ['aiFixup']` has **not** been verified end-to-end with the current CLI and published nested codemod; workflow schema validation alone does not prove forwarding. Do not use the previously advertised `--agent openai` command: CLI 1.18.3 reports `Unknown agent 'openai' ... ignoring` and `Skipping AI step - no API key provided`; workflow exit 0 does **not** prove an AI fixup ran. After the recipe runs and #146 is published, run #146 individually with `--param aiFixup=true` only if a supported, approved OpenAI work provider and work credentials are available (never `openai-codex`); verify the AI step actually runs and review its edits on a disposable worktree. Check package-local Zod v4 availability, unresolved schema factories, and type checks. Do not silently change dependency versions. The other four steps have no AI fixup.

Search the migrated app for residual markers: `rg -F 'TODO(backstage-codemod)' /path/to/backstage-app`. Resolve each with context; the recipe does not guarantee every migration is mechanical. This package has no transform script or fixture tests of its own; `yarn test` validates its workflow schema. End-to-end tests, including mixed-import and schema-factory fixtures, must wait for all five registry packages.

## Manual-only changes

- OAuth redirect URI and CIMD allowlist matching is component-wise and strict: inspect URL patterns and security intent, especially wildcard ports and paths.
- Custom Connections service implementations and portable-schema parsing need case-by-case review. Removed `RootConnection` / `AnyRootConnection` and custom AWS CodeCommit unauthenticated options have no safe generic replacement.
- `catalog.providers.backstageOpenapi.plugins` is optional/deprecated. Deleting an explicit subset changes discovery scope; choose the desired plugins manually.
- For #146, confirm package-local Zod v4 support and review unresolved schema factories; do not invent a dependency version.
