# v1.52.0-migration-recipe

Run every Backstage v1.52.0 migration using bundled local scripts in a single ordered pass.

## What it runs

| #   | Package                                                                             | Domain                      | Type        |
| --- | ----------------------------------------------------------------------------------- | --------------------------- | ----------- |
| 1   | [`migrate-bui-props-to-intersection`](scripts/migrate-bui-props-to-intersection.ts) | @backstage/ui — type change | breaking    |
| 2   | [`remove-stitching-strategy-mode`](scripts/remove-stitching-strategy-mode.ts)       | app-config — catalog config | breaking    |
| 3   | [`rename-bui-css-tokens-v1-52`](scripts/rename-bui-css-tokens-v1-52.ts)             | @backstage/ui — CSS tokens  | deprecation |
| 4   | [`migrate-select-combobox-props`](scripts/migrate-select-combobox-props.ts)         | @backstage/ui — JSX props   | deprecation |

## Usage

```bash
# Dry-run first
yarn dlx codemod@latest run @backstage/v1-52-0-migration-recipe \
  --target /path/to/backstage-app \
  --dry-run

# Apply
yarn dlx codemod@latest run @backstage/v1-52-0-migration-recipe \
  --target /path/to/backstage-app
```

## AI fixup

None of the four v1.52.0 codemods ship an `aiFixup` parameter. All transforms are fully mechanical (type rewrites, YAML key removal, CSS token renames, JSX prop restructuring).

## Notes

- Each step runs a bundled local script; no nested registry packages are downloaded.
- Script order preserves the original codemods' behavior, including the CSS selector review and token rename steps.
- Several scripts insert `TODO(backstage-codemod)` markers where a value needs human review. After the recipe finishes, grep for `TODO(backstage-codemod)` in your repo.
- `yarn test` runs the fixture suites, CSS regression suites, and local workflow structure validation through `run-recipe-tests`.

## Out of scope

The following changes in Backstage 1.52.0 require manual migration and are **not** covered by this recipe:

- **FrontendHostDiscovery discovery.endpoints** — default discovery API changed to `FrontendHostDiscovery` in `@backstage/plugin-app@0.5.0`. If `discovery.endpoints` contains string `target` values pointing to internal-only URLs, update to object form `{ internal: "url" }` to prevent the frontend from routing to internal addresses. Requires deployment topology knowledge — no automated codemod. ([PR #34532](https://github.com/backstage/backstage/pull/34532))
- **Deprecated typo fixes** — `AzureBlobStorageIntergation` → `AzureBlobStorageIntegration` (`@backstage/integration`), `domainEntityColums` → `domainEntityColumns` (`@backstage/plugin-catalog`), `editSettingsTooptip` → `editSettingsTooltip` (`@backstage/plugin-home`), `'heder'` → `'header'` (`@backstage/core-components` TableFiltersClassKey). Old names still work; rename manually if used.
- **`runCliModule` → `runCli`** — deprecated in `@backstage/cli-node@0.3.3`. API signature change (single module → collection), not a simple rename.
- **Neutral interaction token removal** — `--bui-bg-neutral-{1..4}-{hover,pressed,disabled}` have no direct replacement. The token rename codemod adds TODO markers; manual restyling required.
- **Kubernetes standalone page removal** — the default `/kubernetes` page was removed; it was "added by mistake" and is not a code migration.
