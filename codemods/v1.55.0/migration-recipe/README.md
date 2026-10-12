# v1.55.0-migration-recipe

One-shot migration recipe for upgrading a Backstage app to 1.55.0. Chains every `@backstage/*` v1.55.0 codemod from the Codemod registry through one workflow.

## What it runs

| #   | Registry package                                                                                                                              | Scope                                               |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 1   | [`@backstage/rename-connections-public-api`](https://go.codemod.com/registry?q=backstage+rename-connections-public-api)                       | Import-bound symbol renames and collisions          |
| 2   | [`@backstage/move-connections-config-imports`](https://go.codemod.com/registry?q=backstage+move-connections-config-imports)                   | `@backstage/connections/config` subpath move        |
| 3   | [`@backstage/remove-relations-compatibility-config`](https://go.codemod.com/registry?q=backstage+remove-relations-compatibility-config)       | Removed catalog compatibility config key            |
| 4   | [`@backstage/remove-bui-anchor-render-props`](https://go.codemod.com/registry?q=backstage+remove-bui-anchor-render-props)                     | Removed BUI anchor `render` prop                    |
| 5   | [`@backstage/remove-kubernetes-implicit-children`](https://go.codemod.com/registry?q=backstage+remove-kubernetes-implicit-children)           | Removed never-rendered Kubernetes children          |
| 6   | [`@backstage/remove-ignored-github-repo-create-inputs`](https://go.codemod.com/registry?q=backstage+remove-ignored-github-repo-create-inputs) | Removed scaffolder GitHub repo-create action inputs |

## Usage

```bash
# Dry-run first

yarn dlx codemod@latest run @backstage/v1-55-0-migration-recipe \
  --target /path/to/backstage-app \
  --dry-run

# Apply

yarn dlx codemod@latest run @backstage/v1-55-0-migration-recipe \
  --target /path/to/backstage-app
```

## AI fixup

None. The six v1.55.0 codemods are deterministic import/config/JSX/YAML transforms and do not expose an `aiFixup` parameter.

## Relationship to previous release recipes

- This recipe only orchestrates Backstage 1.55.0 codemods. Run earlier release recipes first when upgrading from older versions (for example [`@backstage/v1-52-0-migration-recipe`](https://go.codemod.com/registry?q=backstage+v1-52-0-migration-recipe)).
- `catalog.stitchingStrategy.mode` migration is already handled by `@backstage/remove-stitching-strategy-mode` in the v1.52.0 recipe. This v1.55.0 recipe intentionally does not rerun that change.

## Notes

- Each step is a `codemod:` workflow action resolved from the Codemod registry; no sibling/local package paths are used.
- All six referenced packages must be published before this recipe can execute end-to-end from the registry.
- Several child codemods mark unresolved intent with `TODO(backstage-codemod)` comments. After running the recipe, grep for `TODO(backstage-codemod)` and resolve each marker manually.
- This package is orchestration only (no transform script), so `yarn test` validates `workflow.yaml` schema and structure via `codemod workflow validate`.

## Manual-only migration work (out of scope)

The following Backstage 1.55.0 changes require manual migration decisions and are not covered by this recipe:

- Removed `CodeOwnersProcessor` / `AnnotateScmSlugEntityProcessor`: install the corresponding community backend modules, register them, and migrate explicit configuration.
- Relationship target semantics: after the 1.55 config/API changes, inspect relation `target` object consumers and migrate semantics to `targetRef` strings where needed.
- Elasticsearch 8.19+ service upgrade and custom `ElasticSearchClientWrapper` response usage (`meta` vs normalized fields).
- TechDocs MkDocs plugin allowlist migration, Cloudflare Access `audience`, and incremental-ingestion/custom scaffolder permission-policy decisions.
- Sentry per-action `apiBaseUrl` to global `scaffolder.sentry.apiBaseUrl`: when templates set different values per action or per environment, an operator must choose one global URL.
- GitHub username sign-in resolver deprecation: migrating to user ID resolver requires catalog annotation/data alignment.
- Connections removed members (`matchAuth`, `validate`, `ConnectionAuthMethodKey`) with no mechanical equivalent.
- Custom BUI renderers and effectful Kubernetes children intentionally left for manual review by `@backstage/remove-bui-anchor-render-props` and `@backstage/remove-kubernetes-implicit-children`.
