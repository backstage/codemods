# v1.52.0-migration-recipe

Run every `@backstage/*` v1.52.0 codemod from the [Codemod Registry](https://go.codemod.com/registry) in a single ordered pass.

## What it runs

| #   | Package                                                                                                                         | Domain                      | Type        |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ----------- |
| 1   | [`@backstage/migrate-bui-props-to-intersection`](https://go.codemod.com/registry?q=backstage+migrate-bui-props-to-intersection) | @backstage/ui — type change | breaking    |
| 2   | [`@backstage/remove-stitching-strategy-mode`](https://go.codemod.com/registry?q=backstage+remove-stitching-strategy-mode)       | app-config — catalog config | breaking    |
| 3   | [`@backstage/rename-bui-css-tokens-v1-52`](https://go.codemod.com/registry?q=backstage+rename-bui-css-tokens-v1-52)             | @backstage/ui — CSS tokens  | deprecation |
| 4   | [`@backstage/migrate-select-combobox-props`](https://go.codemod.com/registry?q=backstage+migrate-select-combobox-props)         | @backstage/ui — JSX props   | deprecation |

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

- Each step is invoked through the `codemod:` workflow action and resolved from the Codemod registry, so running the recipe installs the latest published version of every referenced package. All four underlying codemods must be published before the recipe can run end-to-end from the registry.
- The recipe does not reorder edits across codemods; each registry package owns its own before/after behavior. Check the individual READMEs for the details of any single step.
- Several of the codemods insert `TODO(backstage-codemod)` markers where a value needs human review. After the recipe finishes, grep for `TODO(backstage-codemod)` in your repo to find everything that still needs attention.
- This recipe is orchestration only — it has no transform script of its own, so there are no fixture tests. Running `yarn test` in this package validates the workflow schema via `codemod workflow validate`.

## Out of scope

The following changes in Backstage 1.52.0 require manual migration and are **not** covered by this recipe:

- **FrontendHostDiscovery discovery.endpoints** — default discovery API changed to `FrontendHostDiscovery` in `@backstage/plugin-app@0.5.0`. If `discovery.endpoints` contains string `target` values pointing to internal-only URLs, update to object form `{ internal: "url" }` to prevent the frontend from routing to internal addresses. Requires deployment topology knowledge — no automated codemod. ([PR #34532](https://github.com/backstage/backstage/pull/34532))
- **Deprecated typo fixes** — `AzureBlobStorageIntergation` → `AzureBlobStorageIntegration` (`@backstage/integration`), `domainEntityColums` → `domainEntityColumns` (`@backstage/plugin-catalog`), `editSettingsTooptip` → `editSettingsTooltip` (`@backstage/plugin-home`), `'heder'` → `'header'` (`@backstage/core-components` TableFiltersClassKey). Old names still work; rename manually if used.
- **`runCliModule` → `runCli`** — deprecated in `@backstage/cli-node@0.3.3`. API signature change (single module → collection), not a simple rename.
- **Neutral interaction token removal** — `--bui-bg-neutral-{1..4}-{hover,pressed,disabled}` have no direct replacement. The token rename codemod adds TODO markers; manual restyling required.
- **Kubernetes standalone page removal** — the default `/kubernetes` page was removed; it was "added by mistake" and is not a code migration.
