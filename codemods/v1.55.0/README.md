# v1.55.0-migration-recipe

One-shot migration recipe for upgrading a Backstage app to 1.55.0. Runs six bundled local transform scripts through one workflow.

## What it runs

| #   | Local script                                                                                                 | Scope                                               |
| --- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| 1   | [`scripts/rename-connections-public-api.ts`](scripts/rename-connections-public-api.ts)                       | Import-bound symbol renames and collisions          |
| 2   | [`scripts/move-connections-config-imports.ts`](scripts/move-connections-config-imports.ts)                   | `@backstage/connections/config` subpath move        |
| 3   | [`scripts/remove-relations-compatibility-config.ts`](scripts/remove-relations-compatibility-config.ts)       | Removed catalog compatibility config key            |
| 4   | [`scripts/remove-bui-anchor-render-props.ts`](scripts/remove-bui-anchor-render-props.ts)                     | Removed BUI anchor `render` prop                    |
| 5   | [`scripts/remove-kubernetes-implicit-children.ts`](scripts/remove-kubernetes-implicit-children.ts)           | Removed never-rendered Kubernetes children          |
| 6   | [`scripts/remove-ignored-github-repo-create-inputs.ts`](scripts/remove-ignored-github-repo-create-inputs.ts) | Removed scaffolder GitHub repo-create action inputs |

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

## Running a single script

To run one transform, copy its `js-ast-grep` step from `workflow.yaml` into a minimal workflow, preserving `js_file`, `language`, selectors, and any step options. Point `js_file` at the bundled script, then run `codemod workflow run -w <your-workflow.yaml> --target /path/to/backstage-app --dry-run` before applying. Keep related passes in recipe order when selecting more than one step.

## AI behavior and review

None. The six v1.55.0 codemods are deterministic import/config/JSX/YAML transforms and do not expose an `aiFixup` parameter.

- Several child codemods mark unresolved intent with `TODO(backstage-codemod)` comments. After running the recipe, grep for `TODO(backstage-codemod)` and resolve each marker manually.

### Manual-only migration work (out of scope)

The following Backstage 1.55.0 changes require manual migration decisions and are not covered by this recipe:

- Removed `CodeOwnersProcessor` / `AnnotateScmSlugEntityProcessor`: install the corresponding community backend modules, register them, and migrate explicit configuration.
- Relationship target semantics: after the 1.55 config/API changes, inspect relation `target` object consumers and migrate semantics to `targetRef` strings where needed.
- Elasticsearch 8.19+ service upgrade and custom `ElasticSearchClientWrapper` response usage (`meta` vs normalized fields).
- TechDocs MkDocs plugin allowlist migration, Cloudflare Access `audience`, and incremental-ingestion/custom scaffolder permission-policy decisions.
- Sentry per-action `apiBaseUrl` to global `scaffolder.sentry.apiBaseUrl`: when templates set different values per action or per environment, an operator must choose one global URL.
- GitHub username sign-in resolver deprecation: migrating to user ID resolver requires catalog annotation/data alignment.
- Connections removed members (`matchAuth`, `validate`, `ConnectionAuthMethodKey`) with no mechanical equivalent.
- Custom BUI renderers and effectful Kubernetes children intentionally left for manual review by `@backstage/remove-bui-anchor-render-props` and `@backstage/remove-kubernetes-implicit-children`.

## Development

- `yarn test` runs fixture suites, script type checks, Node regression suites, and workflow validation via `run-recipe-tests`.

The package-root `tsconfig.json` checks production scripts and excludes `tests/`; repository-wide `yarn lint` includes source type checking. The `tests/**/tsconfig.json` files also check scripts, not fixture input/output trees.

## Notes

### Relationship to previous release recipes

- This recipe only orchestrates Backstage 1.55.0 codemods. Run earlier release recipes first when upgrading from older versions (for example [`scripts/v1-52-0-migration-recipe.ts`](scripts/v1-52-0-migration-recipe.ts)).
- `catalog.stitchingStrategy.mode` migration is already handled by `@backstage/remove-stitching-strategy-mode` in the v1.52.0 recipe. This v1.55.0 recipe intentionally does not rerun that change.

- Each step is a `js-ast-grep` workflow action using a bundled local script; no separate registry packages are required.
