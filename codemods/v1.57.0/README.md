# v1.57.0-migration-recipe

One-shot migration recipe for upgrading a Backstage app to 1.57.0. Runs every bundled local transform script through one workflow.

Backstage 1.57.0 ships the 1.0 releases of the new frontend system packages (`@backstage/frontend-plugin-api`, `@backstage/frontend-app-api`, `@backstage/frontend-test-utils`, `@backstage/frontend-dev-utils`), which remove a large set of deprecated APIs, plus several backend and config breaking changes.

## Before you run it

- If you skipped Backstage 1.48, run the v1.48 recipe step [`migrate-blueprints-to-plugin-app-react`](https://github.com/backstage/codemods/blob/main/codemods/v1.48.0/scripts/migrate-blueprints-to-plugin-app-react.ts) first: steps 13–15 only detect blueprints imported from `@backstage/plugin-app-react`.
- If you skipped Backstage 1.50, run the v1.50 recipe step [`dialog-api-show-to-open`](https://github.com/backstage/codemods/blob/main/codemods/v1.50.0/scripts/dialog-api-show-to-open.ts) first: `DialogApi.show` / `showModal` are removed in 1.57, and step 3 rewrites `dialogApiRef` to `coreApis.dialog`.

## What it runs

| #   | Local script                                                                                                                                                                                                                                                                                                                              | Scope                                                                                                                                                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | [`scripts/migrate-frontend-plugin-api-imports.ts`](scripts/migrate-frontend-plugin-api-imports.ts)                                                                                                                                                                                                                                        | Rewrites removed `@backstage/frontend-plugin-api/alpha` imports; moves `ExtensionFactoryMiddleware` and `AnalyticsImplementation*`                                                    |
| 2   | [`scripts/replace-removed-frontend-plugin-api-types.ts`](scripts/replace-removed-frontend-plugin-api-types.ts)                                                                                                                                                                                                                            | Replaces removed type aliases (`PageTab`, `PluginOptions`, `ExtensionAttachTo`, `ProgressProps`) and deprecated `AnyApiRef` / `AnyApiFactory`; flags `IconComponent`                  |
| 3   | [`scripts/migrate-api-refs-to-core-apis.ts`](scripts/migrate-api-refs-to-core-apis.ts)                                                                                                                                                                                                                                                    | Replaces deprecated individual core API refs with `coreApis.*`                                                                                                                        |
| 4   | [`scripts/replace-create-specialized-app.ts`](scripts/replace-create-specialized-app.ts)                                                                                                                                                                                                                                                  | `createSpecializedApp(opts)` → `prepareSpecializedApp(opts).finalize()`                                                                                                               |
| 5   | [`scripts/replace-removed-mock-api-types.ts`](scripts/replace-removed-mock-api-types.ts)                                                                                                                                                                                                                                                  | Replaces removed `@backstage/frontend-test-utils` mock API types with types derived from `mockApis`                                                                                   |
| 6   | [`scripts/add-timestamp-to-root-logger-json-format.ts`](scripts/add-timestamp-to-root-logger-json-format.ts)                                                                                                                                                                                                                              | Keeps `timestamp` in custom `WinstonLogger` JSON formats                                                                                                                              |
| 7   | [`scripts/add-logger-to-gitlab-token-validator.ts`](scripts/add-logger-to-gitlab-token-validator.ts) + [`scripts/flag-webhook-secret-config-yaml.ts`](scripts/flag-webhook-secret-config-yaml.ts)                                                                                                                                         | Passes a logger to `createGitlabTokenValidator`; flags `events.modules.{github,gitlab,azureDevOps}` config without a webhook secret (TODO only)                                       |
| 8   | [`scripts/migrate-ldap-search-attributes-yaml.ts`](scripts/migrate-ldap-search-attributes-yaml.ts)                                                                                                                                                                                                                                        | Adds `attributes: ['*', '+']` to LDAP user/group search options in `app-config` that don't set `attributes` (pre-1.57 behavior)                                                       |
| 9   | [`scripts/remove-dynamic-client-registration-config.ts`](scripts/remove-dynamic-client-registration-config.ts)                                                                                                                                                                                                                            | Removes `auth.experimentalDynamicClientRegistration` from `app-config`                                                                                                                |
| 10  | [`scripts/remove-alert-display-anchor-origin.ts`](scripts/remove-alert-display-anchor-origin.ts)                                                                                                                                                                                                                                          | Removes the ignored `anchorOrigin` from the alert display extension config                                                                                                            |
| 11  | [`scripts/rename-techdocs-cli-serve-flags-package-json.ts`](scripts/rename-techdocs-cli-serve-flags-package-json.ts) + [`-ci-yaml.ts`](scripts/rename-techdocs-cli-serve-flags-ci-yaml.ts) + [`-shell.ts`](scripts/rename-techdocs-cli-serve-flags-shell.ts) (helper [`-command.ts`](scripts/rename-techdocs-cli-serve-flags-command.ts)) | Renames deprecated TechDocs CLI `--mkdocs-*` serve flags in `package.json` scripts, GitHub Actions and shell scripts                                                                  |
| 12  | [`scripts/update-react-peer-dependency-ranges.ts`](scripts/update-react-peer-dependency-ranges.ts)                                                                                                                                                                                                                                        | Drops React 16/17 alternatives from `peerDependencies` ranges that also allow React 18+, in every workspace `package.json`                                                            |
| 13  | [`scripts/wrap-icon-bundle-icons-in-elements.ts`](scripts/wrap-icon-bundle-icons-in-elements.ts)                                                                                                                                                                                                                                          | Wraps `IconBundleBlueprint` icon components in elements                                                                                                                               |
| 14  | [`scripts/migrate-router-blueprint-to-app-root-wrapper.ts`](scripts/migrate-router-blueprint-to-app-root-wrapper.ts)                                                                                                                                                                                                                      | `RouterBlueprint` → `AppRootWrapperBlueprint` (unwraps `BrowserRouter`); removes `convertLegacyAppOptions` `components.Router`; flags other routers and `app/root` router attachments |
| 15  | [`scripts/migrate-nav-content-items-to-nav-items.ts`](scripts/migrate-nav-content-items-to-nav-items.ts)                                                                                                                                                                                                                                  | Custom nav components: `items` → `navItems.rest()`                                                                                                                                    |
| 16  | [`scripts/flag-bui-standalone-routing.ts`](scripts/flag-bui-standalone-routing.ts)                                                                                                                                                                                                                                                        | Flags `javascript:` / `data:` / `vbscript:` hrefs on Backstage UI elements (TODO only)                                                                                                |

## Usage

```bash
# Dry-run first

yarn dlx codemod@latest run @backstage/v1-57-0-migration-recipe \
  --target /path/to/backstage-app \
  --dry-run

# Apply

yarn dlx codemod@latest run @backstage/v1-57-0-migration-recipe \
  --target /path/to/backstage-app
```

## Running a single script

To run one transform, copy its step from `workflow.yaml` into a minimal workflow, preserving `js_file`, `language`, selectors, and any step options. Point `js_file` at the bundled script, then run `codemod workflow run -w <your-workflow.yaml> --target /path/to/backstage-app --dry-run` before applying. Keep related passes in recipe order when selecting more than one step.

The step 11 scripts must run together and in order: the shell step is a host-run step that reads workflow state (`targetDirEncoded`) set by the `package.json` step, and it is skipped when the target contains no `package.json`. `scripts/rename-techdocs-cli-serve-flags-command.ts` is a shared helper, not an entrypoint. The shell step rewrites `.sh` files in place **even with `--dry-run`** (as in the v1.54 recipe); run it on a clean git tree.

Scripts that are not listed in `workflow.yaml` are helpers imported by several entrypoints, sometimes across steps — check their import sites before removing or changing one:

- `add-logger-to-gitlab-token-validator-todo.ts` (TODO placement): step 7a.
- `replace-removed-frontend-plugin-api-types-common.ts` (import rendering, offsets, TODO placement): steps 1, 2, 4 and 5.
- `remove-dynamic-client-registration-config-helpers.ts` (YAML helpers): steps 9 and 10.
- `migrate-router-blueprint-to-app-root-wrapper-helpers.ts` (blueprint params, offsets, TODO placement): steps 13, 14, 15 and 16.
- `rename-techdocs-cli-serve-flags-command.ts` (command rewriting): step 11.

## AI behavior and review

None. Every step is a deterministic AST transform (or a host-run shell rewrite for step 11); the recipe does not expose an `aiFixup` parameter.

Several steps mark cases that need human judgment with `TODO(backstage-codemod)` comments (`advanced.apis`, non-literal icon maps, non-`BrowserRouter` routers, `IconComponent`, webhook secrets, executable-scheme BUI hrefs). After running the recipe, search for residual markers and resolve each one:

```bash
rg -F 'TODO(backstage-codemod)' /path/to/backstage-app
```

The transforms keep the surrounding layout but do not reflow long lines (merged imports, rewritten JSX attributes). Run your formatter (for example `yarn prettier --write`) on the changed files afterwards.

- Step 8 adds `attributes: ['*', '+']` to every LDAP user/group search in `app-config` that doesn't set `attributes`, so searches keep loading all attributes as before 1.57. Narrow the list to the attributes your mappings and transformers use to benefit from 1.57's attribute selection; an explicit list replaces the defaults, so include the mapped attributes too.
- The webhook secret check (7c) and step 16 (executable-scheme hrefs) only insert TODOs.
- Step 1 does not add dependencies. Add `@backstage/frontend-app-api` (for `ExtensionFactoryMiddleware`) and `@backstage/plugin-app-react` (for `AnalyticsImplementation*`) to the affected `package.json` files yourself.
- When you write new code against the app history API, use `coreApis.appHistory`: the 1.57 migration notes import `appHistoryApiRef`, but `@backstage/frontend-plugin-api@1.0.0` does not export it.

### Known limitations (review these by hand)

- Step 1 only rewrites `import` / `export … from` declarations. `'@backstage/frontend-plugin-api/alpha'` strings in `jest.mock`, `jest.requireActual`, dynamic `import()` and bare `export * from` are left unchanged.
- Steps 13–15 detect blueprints imported by name from `@backstage/plugin-app-react` (aliases included); namespace access (`appReact.IconBundleBlueprint`) is not handled. Step 16 likewise needs named imports from `@backstage/ui`.
- Step 6 only recognizes a named `format` import from `winston`; `winston.format.json()` via a default or namespace import is not rewritten and not flagged.
- Step 14 renames `RouterBlueprint` references but doesn't flag re-exports (`export { RouterBlueprint }`) or array `attachTo` values.
- Step 15 migrates a same-file component referenced by `NavContentBlueprint` in place; other call sites of that component that still pass `items` are not updated.
- Steps 7c and 9 look at one `app-config*.yaml` file at a time: a secret or a `clientIdMetadataDocuments` / `staticClients` entry set in another app-config file still gets a TODO.
- YAML steps (7c, 8, 9, 10) handle block-style config. Flow-style mappings (`modules: { gitlab: {} }`, `options: {}`, `auth: { … }`, `config: { … }`) are left unchanged; a leftover alert display `anchorOrigin` fails extension config validation at startup.
- Step 11 rewrites the common TechDocs CLI invocations (`techdocs-cli`, `npx [-y] @techdocs/cli[@version]`, `yarn`/`pnpm dlx`, `node_modules/.bin/techdocs-cli`) in `package.json` scripts, `.github/workflows/*.y{a,}ml` and `*.sh`. Commands inside heredocs, `sh -c "…"`, command substitutions, composite actions (`.github/actions/**`) and other files are left for you.
- Step 12 leaves ranges without a React 18+ alternative (e.g. `^17.0.0`, `^16.13.1 || ^17.0.2`) and compound comparator ranges (e.g. `>=17.0.0 <18`) unchanged; update them by hand.
- Not flagged on purpose (they would mark every app, configured or not): webhook modules added in backend code without `events.modules.<key>.webhookSecret` in config (step 7c checks `app-config`), and `BUIProvider` without `useNavigation` (inside a Backstage app navigation is inherited; standalone apps must pass `useNavigation` themselves).

### Manual-only migration work (out of scope)

The following Backstage 1.57.0 changes are not automated by this recipe.

**TypeScript reports it**

- `withApis` removed from `@backstage/frontend-plugin-api`; the fix needs a hand-written wrapper component.
- `FrontendPlugin.id` removed (use `pluginId`); `.id` cannot be attributed to a plugin without types.
- `IconsApi.getIcon` removed (and `getIcon` / `show` / `showModal` on test helpers); custom `dialogApiRef` / `iconsApiRef` implementations must implement the v2 contracts (`core.dialog.v2`, `core.icons.v2`). `icon()` returns elements — a semantic change; upgrade `@backstage/plugin-app` alongside.
- `useApi` returns `Awaited<T>`: TypeScript reports most uses (`.then` / `Promise` typing); `await useApi(…)` keeps working. Intentional promise consumers switch to `useApiHolder().get(ref)`.
- BUI `routerOptions` is limited to `replace` / `state`.
- Custom `TranslationApi` implementations must provide `t`; `TranslationRef` is callable (producers only).
- Custom `HttpRouterService` / `RootHttpRouterService` implementations must implement `addWebSocketHandler` (producers only).

**Covered by an earlier recipe**

- `DialogApi.show` / `showModal` removed: run the v1.50 [`dialog-api-show-to-open`](https://github.com/backstage/codemods/blob/main/codemods/v1.50.0/scripts/dialog-api-show-to-open.ts) step first if you skipped 1.50 (before step 3 rewrites `dialogApiRef`).

**Runtime behavior, failing tests, or startup errors**

- `useRouteRefParams` no longer includes the splat `*`: the return type is unchanged, so `params['*']` silently becomes `undefined`. Read the matched tail from the page router's own params API ([migration notes](https://backstage.io/docs/frontend-system/architecture/migrations#userouterefparams-returns-only-declared-parameters)).
- `pluginId` is required on `FrontendFeature`: old plugins fail at startup; rebuild them against the current framework.
- `renderInTestApp` / `renderTestApp` / `createExtensionTester` throw on errors and tests get isolated API defaults; fix per test.
- `coreServices` / `mockServices` are frozen (`jest.spyOn(mockServices.…)` throws a `TypeError`).
- `MarkdownContent` loads its renderer lazily; tests asserting immediately may need `findBy*`.
- App-owned history, app-absolute navigation and page router adapters: existing pages keep implicit React Router v6 compatibility (with a dev warning).
- Express-only WebSocket upgrades (e.g. the Kubernetes proxy).
- Malformed `$all` / `$any` / `$not` catalog filter predicates now return HTTP 400.
- Placeholder reads (`$openapi` / `$asyncapi`) are restricted to the entity's own repository.
- TechDocs `mkdocs.yml` `markdown_extensions` are restricted to an allowlist (`techdocs.generator.mkdocs.dangerouslyAllowAdditionalExtensions`, CLI `--dangerouslyAllowAdditionalExtensions`) — a security decision.
- Dynamic Client Registration database migration / re-sign-in, PKCE `S256` only, `auth.staticClients` (step 9 only removes the config).
- Authorization-code exchanges without `client_id` log a deprecation warning (client-side).

**Configuration review, operations and dependency management**

- `app.extensions` entries keyed `app-router-component:…` become stale after step 14 renames the extension to `app-root-wrapper:…`; the right new config depends on what the override did.
- Catalog rules match URL locations in canonical form; percent-encoded or default-port patterns may stop matching.
- Log pipelines or dashboards reading `date` from JSON request logs (step 6 covers the code side).
- LDAP parallel reads (`disableParallelReads`) are an operational decision (step 8 covers attributes).
- Google Cloud task recovery needs the `storage.objects.list` permission (IAM).
- Large catalog installs: the upgrade builds an index concurrently and can exceed startup deadlines — prepare it out of band ([upgrading large installations](https://github.com/backstage/backstage/blob/master/plugins/catalog-backend/README.md#upgrading-large-installations)).
- Valkey cache keys are namespaced per plugin; old entries without TTL need manual cleanup.
- `pm verify-patches` users must add `@yarnpkg/*` root devDependencies (and a `got` resolution).
- Node.js 24/26 `engines`, TypeScript 5.9 and the React 18 runtime upgrade: the Upgrade Helper shows the root `engines.node` change (`^24.15.0 || ^26.13.0`); run `yarn up -R avsc` / `yarn up -R node-gyp` if the lockfile has the affected versions; upgrade React per the React 18 guide (step 12 only updates peer ranges).
- Adding `@backstage/frontend-app-api` / `@backstage/plugin-app-react` to `package.json` after step 1.

**Deprecated, not removed**

- `alertApiRef` → Toast (different API shape).
- `core-components` deprecations → Backstage UI (props/composition changes).
- `withApis` in `@backstage/core-plugin-api`.
- `BitbucketCloudClient.searchCode` → `searchWorkspaceCode` (different API and credentials).

## Development

- `yarn test` runs fixture suites, script type checks, Node regression suites, and workflow validation via `run-recipe-tests`.

The package-root `tsconfig.json` checks production scripts and excludes `tests/`; repository-wide `yarn lint` includes source type checking. The `tests/**/tsconfig.json` files also check scripts, not fixture input/output trees.

## Notes

- Several changes span TypeScript and YAML (steps 7 and 8) or several file kinds (step 11). The recipe ships one script entrypoint per language, mirroring the per-language script convention used by earlier recipes; each group runs as one logical step.
- Source-scanning AST steps exclude `node_modules`, `dist`, `dist-types`, `build` and `coverage`; step 16 also skips test, story and fixture files. Preserve these exclusions in custom workflows.
- This recipe only orchestrates Backstage 1.57.0 codemods. Run earlier release recipes first when upgrading from older versions.
- Each step is a `js-ast-grep` workflow action (or, for TechDocs shell scripts, a host-run step) using a bundled local script; no separate registry packages are required.
