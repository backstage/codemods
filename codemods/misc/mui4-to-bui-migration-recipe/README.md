# mui4-to-bui-migration-recipe

Run every deterministic `@backstage/*` MUI 4 → BUI codemod from the [Codemod Registry](https://go.codemod.com/registry) in a single ordered pass.

This recipe is **not** tied to a single Backstage release. It is the orchestration package for the ongoing MUI 4 to BUI migration work in app and plugin repositories.

## Recommended order

1. **Bootstrap first** — `@backstage/migrate-mui-bootstrap-to-bui` adds `@backstage/ui` / `@remixicon/react` dependencies and the global BUI stylesheet.
2. **Transforms** — icons, styles, core components, complex components, form controls, then layout, in the stable sequence below.
3. **Cleanup last** — `@backstage/remove-mui-dependencies` drops unused `@material-ui/*` packages from `package.json` only after source files no longer import them.

Do **not** run `remove-mui-dependencies` before the component transforms finish, or packages that still have MUI imports may be removed incorrectly.

## What it runs

| #   | Package                                                                                                                                     | Domain                    | Covers                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1   | [`@backstage/migrate-mui-bootstrap-to-bui`](https://go.codemod.com/registry?q=backstage+migrate-mui-bootstrap-to-bui)                       | Bootstrap / package setup | Adds BUI and Remix deps; ensures root CSS import where MUI is used                                          |
| 2   | [`@backstage/migrate-mui-icons-to-remix-icons`](https://go.codemod.com/registry?q=backstage+migrate-mui-icons-to-remix-icons)               | Icon source migration     | Replaces `@material-ui/icons` imports with `@remixicon/react` equivalents                                   |
| 3   | [`@backstage/migrate-mui-styles-to-bui-css-modules`](https://go.codemod.com/registry?q=backstage+migrate-mui-styles-to-bui-css-modules)     | Styling architecture      | Migrates `makeStyles` / `withStyles` toward BUI CSS modules                                                 |
| 4   | [`@backstage/migrate-mui-typography-to-text`](https://go.codemod.com/registry?q=backstage+migrate-mui-typography-to-text)                   | Typography                | Replaces MUI `Typography` with BUI `Text`                                                                   |
| 5   | [`@backstage/migrate-mui-alert-to-bui-alert`](https://go.codemod.com/registry?q=backstage+migrate-mui-alert-to-bui-alert)                   | Alert banners             | Migrates MUI `Alert` to BUI `Alert`                                                                         |
| 6   | [`@backstage/migrate-mui-avatar-to-bui-avatar`](https://go.codemod.com/registry?q=backstage+migrate-mui-avatar-to-bui-avatar)               | Avatars                   | Migrates MUI `Avatar` to BUI `Avatar`                                                                       |
| 7   | [`@backstage/migrate-mui-skeleton-to-bui-skeleton`](https://go.codemod.com/registry?q=backstage+migrate-mui-skeleton-to-bui-skeleton)       | Loading placeholders      | Migrates MUI `Skeleton` to BUI `Skeleton`                                                                   |
| 8   | [`@backstage/migrate-mui-button-to-bui-button`](https://go.codemod.com/registry?q=backstage+migrate-mui-button-to-bui-button)               | Standard buttons          | Migrates MUI `Button` to BUI `Button` / `ButtonLink`                                                        |
| 9   | [`@backstage/migrate-mui-icon-button-to-button-icon`](https://go.codemod.com/registry?q=backstage+migrate-mui-icon-button-to-button-icon)   | Icon buttons              | Migrates MUI `IconButton` to BUI `ButtonIcon`                                                               |
| 10  | [`@backstage/migrate-mui-link-to-bui-link`](https://go.codemod.com/registry?q=backstage+migrate-mui-link-to-bui-link)                       | Links                     | Migrates MUI `Link` to BUI `Link` (skips `packages/core-components` paths; aliases when core Link coexists) |
| 11  | [`@backstage/migrate-mui-tooltip-to-bui-tooltip`](https://go.codemod.com/registry?q=backstage+migrate-mui-tooltip-to-bui-tooltip)           | Tooltips                  | Migrates MUI `Tooltip` toward BUI `TooltipTrigger`                                                          |
| 12  | [`@backstage/migrate-mui-dialog-to-bui-dialog`](https://go.codemod.com/registry?q=backstage+migrate-mui-dialog-to-bui-dialog)               | Dialogs                   | Migrates Dialog shell patterns to BUI `Dialog`                                                              |
| 13  | [`@backstage/migrate-mui-tabs-to-bui-tabs`](https://go.codemod.com/registry?q=backstage+migrate-mui-tabs-to-bui-tabs)                       | Tabs                      | Migrates MUI Tabs to BUI Tabs                                                                               |
| 14  | [`@backstage/migrate-mui-menu-popover-to-bui-menu`](https://go.codemod.com/registry?q=backstage+migrate-mui-menu-popover-to-bui-menu)       | Menus / popovers          | Migrates Menu **or** Popover: MenuList/MenuItem → BUI `Menu`; otherwise BUI `Popover`                       |
| 15  | [`@backstage/migrate-mui-list-family-to-bui-list`](https://go.codemod.com/registry?q=backstage+migrate-mui-list-family-to-bui-list)         | Lists                     | Migrates List family primitives to BUI List                                                                 |
| 16  | [`@backstage/migrate-mui-chip-to-tag`](https://go.codemod.com/registry?q=backstage+migrate-mui-chip-to-tag)                                 | Tags / chips              | Migrates MUI `Chip` to BUI `Tag`                                                                            |
| 17  | [`@backstage/migrate-mui-card-to-bui-card`](https://go.codemod.com/registry?q=backstage+migrate-mui-card-to-bui-card)                       | Cards                     | Migrates simple Card family patterns to BUI `Card`                                                          |
| 18  | [`@backstage/migrate-mui-select-family-to-bui-select`](https://go.codemod.com/registry?q=backstage+migrate-mui-select-family-to-bui-select) | Select                    | Migrates Select wrapper patterns to BUI Select                                                              |
| 19  | [`@backstage/migrate-mui-textfield-to-bui-textfield`](https://go.codemod.com/registry?q=backstage+migrate-mui-textfield-to-bui-textfield)   | TextField                 | Migrates MUI `TextField` to BUI `TextField` / specialized fields                                            |
| 20  | [`@backstage/migrate-mui-autocomplete-to-combobox`](https://go.codemod.com/registry?q=backstage+migrate-mui-autocomplete-to-combobox)       | Autocomplete              | Heuristically migrates Autocomplete → `Combobox` or `SearchAutocomplete`                                    |
| 21  | [`@backstage/migrate-mui-accordion-to-bui-accordion`](https://go.codemod.com/registry?q=backstage+migrate-mui-accordion-to-bui-accordion)   | Accordion                 | Migrates Accordion patterns to BUI Accordion                                                                |
| 22  | [`@backstage/migrate-mui-radio-checkbox-to-bui`](https://go.codemod.com/registry?q=backstage+migrate-mui-radio-checkbox-to-bui)             | Radio / checkbox          | Migrates radio/checkbox groups and standalone Checkbox to BUI                                               |
| 23  | [`@backstage/migrate-mui-switch-to-bui-switch`](https://go.codemod.com/registry?q=backstage+migrate-mui-switch-to-bui-switch)               | Switch                    | Migrates MUI `Switch` to BUI `Switch`                                                                       |
| 24  | [`@backstage/migrate-mui-slider-to-bui-slider`](https://go.codemod.com/registry?q=backstage+migrate-mui-slider-to-bui-slider)               | Slider                    | Migrates MUI `Slider` to BUI `Slider`                                                                       |
| 25  | [`@backstage/migrate-mui-layout-to-bui-layout`](https://go.codemod.com/registry?q=backstage+migrate-mui-layout-to-bui-layout)               | Layout primitives         | Converts Box / Paper / Grid toward BUI layout (see Paper heuristic below)                                   |
| 26  | [`@backstage/remove-mui-dependencies`](https://go.codemod.com/registry?q=backstage+remove-mui-dependencies)                                 | Cleanup                   | Removes unused `@material-ui/*` dependencies from `package.json` after source migration                     |

Also see the short ordering note in [`../README.md`](../README.md).

### Paper heuristic (layout step)

`@backstage/migrate-mui-layout-to-bui-layout` never maps Paper to `Surface`. Bare Paper → `Box bg="neutral"` **plus** a verify TODO that MUI’s default elevation chrome was dropped; card-like Paper → `Card`; explicit `elevation` / `variant` / ambiguous Paper → left with `TODO(backstage-codemod)`.

### Button outlined → secondary

`@backstage/migrate-mui-button-to-bui-button` maps `variant="outlined"` → `variant="secondary"` silently (BUI secondary is the outlined visual). The transform emits metric `outlined-to-secondary` so operators can quantify remaps in dry-run output.

### Density (size defaults)

BUI controls default to `size="small"` while MUI defaults to medium. These packages emit `size="medium"` when MUI omitted size (or used `medium`/`large`), and preserve explicit `size="small"`:

- Button / ButtonIcon / TextField family / Tag
- Select (Select prop first; else FormControl `size`)
- Combobox / SearchAutocomplete (Autocomplete prop first; else `renderInput` TextField `size`)

## Package naming

Most transforms use `migrate-mui-<source>-to-bui-<target>`. A few intentionally omit `-bui-` in the target segment when the BUI export name is the product surface (not a “BUI-prefixed” alias):

| Package                                             | Why the name looks different                      |
| --------------------------------------------------- | ------------------------------------------------- |
| `@backstage/migrate-mui-typography-to-text`         | Target is BUI `Text`                              |
| `@backstage/migrate-mui-chip-to-tag`                | Target is BUI `Tag`                               |
| `@backstage/migrate-mui-icon-button-to-button-icon` | Target is BUI `ButtonIcon`                        |
| `@backstage/migrate-mui-icons-to-remix-icons`       | Target is `@remixicon/react`, not `@backstage/ui` |
| `@backstage/migrate-mui-radio-checkbox-to-bui`      | Covers radio/checkbox groups → BUI groups         |

## Usage

```bash
# Dry-run first (published registry packages)
yarn dlx codemod@latest run @backstage/mui4-to-bui-migration-recipe \
  --target /path/to/backstage-app \
  --dry-run

# Apply
yarn dlx codemod@latest run @backstage/mui4-to-bui-migration-recipe \
  --target /path/to/backstage-app
```

### Local pre-publish dry-runs (`workflow.local.yaml`)

Before packages are published, use the sibling-path workflow to exercise unpublished transforms against a local Backstage checkout (commonly `../backstage` from the monorepo root):

```bash
cd codemods/misc/mui4-to-bui-migration-recipe

# Validate registry + local workflows (also: yarn test)
bash scripts/validate-workflows.sh

# Dry-run against a sibling Backstage tree (run from this package directory).
# Pass the workflow *file* path so the CLI does not rewrite to workflow.yaml.
yarn exec codemod workflow run -w ./workflow.local.yaml \
  -t /absolute/path/to/backstage \
  --dry-run --no-interactive --allow-dirty
```

`workflow.local.yaml` is a maintainer-only mirror (not the published default). It uses the same step order as `workflow.yaml`, with relative sibling sources (`source: '../migrate-mui-…'`). Published consumers should keep using the registry recipe.

A full dry-run against the Backstage monorepo (pre-merge hardening) completed cleanly: no `Surface` emissions; bare Paper sites emit default-elevation verify TODOs; Button reports `outlined-to-secondary`; Link skips only `packages/core-components` paths and migrates direct MUI `Link` elsewhere.

## Recipe behavior

- Every step runs at **default deterministic settings**.
- The recipe ships **no** `aiFixup` parameter.
- Ambiguous cases are marked with `TODO(backstage-codemod)` in the transformed source rather than embedded AI workflow nodes.

## Manual follow-up

After the recipe finishes:

1. Search the repo for `TODO(backstage-codemod)` and resolve each marker.
2. Search for remaining Material UI imports, for example:
   - `@material-ui/`
   - `@mui/`
3. Re-run typecheck / tests for the packages you migrated.
4. Spot-check visual polish (spacing, dark mode, token usage) — the recipe does not aim for perfect theme parity.

## Out of scope

The following are **not** covered by this recipe (document-only / manual):

- Badge overlays (no safe 1:1 BUI mapping)
- `CircularProgress` / `LinearProgress` (do not auto-map to Skeleton)
- `Drawer`, `Snackbar`, `Stepper`, and `Timeline`
- `@material-table/core` / material-table and broader table-system migrations
- Perfect theme parity, dark-mode polish, and final design-token tuning after the source-level migration
- Custom wrapper abstractions that hide MUI components behind project-specific APIs

## Notes

- `workflow.yaml` resolves each step from the Codemod registry (`source: '@backstage/<package>'`), so underlying packages must be published before the recipe can run end-to-end.
- Use `workflow.local.yaml` for pre-publish dry-runs against sibling packages and a local `../backstage` tree.
- This recipe is orchestration only — it has no transform script of its own. Running `yarn test` validates the workflow schema via `codemod workflow validate`.
