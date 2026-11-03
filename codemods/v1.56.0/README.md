# v1.56.0-migration-recipe

One-shot migration recipe for upgrading a Backstage app to 1.56.0. Runs every bundled local transform script through one workflow.

## What it runs

| #   | Local script                                                                                               | Scope                                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | [`scripts/migrate-catalog-filters-to-query.ts`](scripts/migrate-catalog-filters-to-query.ts)               | Adds `getCatalogQuery()` next to deprecated `getCatalogFilters()` on custom `EntityFilter`  |
| 2   | [`scripts/remove-atlassian-username-resolver.ts`](scripts/remove-atlassian-username-resolver.ts)           | Replaces the removed Atlassian `usernameMatchingUserEntityName` sign-in resolver            |
| 3   | [`scripts/remove-atlassian-username-resolver-yaml.ts`](scripts/remove-atlassian-username-resolver-yaml.ts) | Flags the removed Atlassian resolver in `app-config` YAML (TODO only)                       |
| 4   | [`scripts/remove-total-items-option.ts`](scripts/remove-total-items-option.ts)                             | Removes the deprecated-and-ignored `totalItems` option of `StreamEntitiesRequest`           |
| 5   | [`scripts/move-bui-menusection-disabled-keys.ts`](scripts/move-bui-menusection-disabled-keys.ts)           | Moves BUI `MenuSection` `disabledKeys` to the enclosing `Menu` (or `MenuItem` `isDisabled`) |

## Usage

```bash
# Dry-run first

yarn dlx codemod@latest run @backstage/v1-56-0-migration-recipe \
  --target /path/to/backstage-app \
  --dry-run

# Apply

yarn dlx codemod@latest run @backstage/v1-56-0-migration-recipe \
  --target /path/to/backstage-app
```

## Running a single script

To run one transform, copy its `js-ast-grep` step from `workflow.yaml` into a minimal workflow, preserving `js_file`, `language`, selectors, and any step options. Point `js_file` at the bundled script, then run `codemod workflow run -w <your-workflow.yaml> --target /path/to/backstage-app --dry-run` before applying. Keep related passes in recipe order when selecting more than one step.

## AI behavior and review

None. The v1.56.0 codemods are deterministic AST transforms and do not expose an `aiFixup` parameter.

- Several transforms mark unresolved intent with `TODO(backstage-codemod)` comments (computed filter returns, the Atlassian resolver choice, dynamic `disabledKeys`). After running the recipe, grep for `TODO(backstage-codemod)` and resolve each marker manually.
- `EntityFilter.getCatalogFilters()` is never deleted: `EntityListProvider` still honors it as a fallback for filters without `getCatalogQuery()`.
- The Atlassian resolver replacement is mechanical (`emailLocalPartMatchingUserEntityName`), but the two replacement resolvers differ in data requirements; review each TODO before applying.

### Manual-only migration work (out of scope)

The following Backstage 1.56.0 changes require manual migration decisions and are not covered by this recipe:

- `FilterPredicate` root must be an object (`@backstage/filter-predicates`); the catalog backend rejects primitive roots. Use `AnyFilterPredicate` where primitives are intended.
- Backend instance IDs (BREAKING for producers): custom backend implementations and mocks must supply a stable unique ID; TypeScript flags the missing member. `createBackend` gains an optional `instanceId` option.
- Incremental ingestion `ingestion_mark_entities` upsert (`source_key` column, `ref` → `entity_ref`): DB schema migration that is not rolling/zero-downtime upgradable.
- TechDocs engine abstraction: `techdocs` generator key alias, `serve:mkdocs`, and `--mkdocs-parameter-*` warnings are CLI/config concerns; the MkDocs default is unchanged and the alias still works.
- GitLab action raw token outputs deprecated: adopt `variableKey` per template as a security choice.
- Checkbox/Switch programmatic label clicks no longer toggle: test behavior; target the input and use full pointer interaction.
- Builtin catalog filter behavior changes (`EntityTagFilter` all-tags, `EntityUserFilter.starred` full refs, `EntityOrderFilter` exclusions, `EntityListProvider` on `streamEntities`): semantics and test-mock adjustments with no mechanical rewrite.
- `--bui-bg-app` color-scheme follow and the new `theme` CSS cascade layer: behavioral/additive; apps with their own `theme` layer should verify ordering.
- New CLI modules (catalog/scaffolder/search), Featured Templates widget, org `UserAvatar`, and TechDocs `NotFoundErrorPage`/`withoutFeedbackLink` are purely additive.

## Development

- `yarn test` runs fixture suites, script type checks, Node regression suites, and workflow validation via `run-recipe-tests`.

The package-root `tsconfig.json` checks production scripts and excludes `tests/`; repository-wide `yarn lint` includes source type checking. The `tests/**/tsconfig.json` files also check scripts, not fixture input/output trees.

## Notes

- The Atlassian resolver change spans TypeScript and YAML. The recipe ships two script entrypoints (`remove-atlassian-username-resolver.ts` for TS, `remove-atlassian-username-resolver-yaml.ts` for `app-config`), mirroring the per-language script convention used by earlier recipes; the recipe runs both as one logical step.
- This recipe only orchestrates Backstage 1.56.0 codemods. Run earlier release recipes first when upgrading from older versions.
- Each step is a `js-ast-grep` workflow action using a bundled local script; no separate registry packages are required.
