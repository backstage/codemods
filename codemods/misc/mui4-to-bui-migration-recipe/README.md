# mui4-to-bui-migration-recipe

Run every deterministic MUI 4 → BUI transform from bundled local scripts in a single ordered pass.

This recipe is **not** tied to a single Backstage release. It is the orchestration package for the ongoing MUI 4 to BUI migration work in app and plugin repositories.

## Recommended order

1. **Bootstrap first** — `migrate-mui-bootstrap-to-bui` adds `@backstage/ui` / `@remixicon/react` dependencies and the global BUI stylesheet.
2. **Transforms** — icons, styles, core components, complex components, form controls, then layout, in the stable sequence below.
3. **Cleanup last** — `remove-mui-dependencies` drops unused `@material-ui/*` packages from `package.json` only after source files no longer import them.

Do **not** run `remove-mui-dependencies` before the component transforms finish, or packages that still have MUI imports may be removed incorrectly.

## What it runs

| #   | Package                                                                                         | Domain                    | Covers                                                                                                      |
| --- | ----------------------------------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1   | [`migrate-mui-bootstrap-to-bui`](scripts/migrate-mui-bootstrap-to-bui.ts)                       | Bootstrap / package setup | Adds BUI and Remix deps; ensures root CSS import where MUI is used                                          |
| 2   | [`migrate-mui-icons-to-remix-icons`](scripts/migrate-mui-icons-to-remix-icons.ts)               | Icon source migration     | Replaces `@material-ui/icons` imports with `@remixicon/react` equivalents                                   |
| 3   | [`migrate-mui-styles-to-bui-css-modules`](scripts/migrate-mui-styles-to-bui-css-modules.ts)     | Styling architecture      | Migrates `makeStyles` / `withStyles` toward BUI CSS modules                                                 |
| 4   | [`migrate-mui-typography-to-text`](scripts/migrate-mui-typography-to-text.ts)                   | Typography                | Replaces MUI `Typography` with BUI `Text`                                                                   |
| 5   | [`migrate-mui-alert-to-bui-alert`](scripts/migrate-mui-alert-to-bui-alert.ts)                   | Alert banners             | Migrates MUI `Alert` to BUI `Alert`                                                                         |
| 6   | [`migrate-mui-avatar-to-bui-avatar`](scripts/migrate-mui-avatar-to-bui-avatar.ts)               | Avatars                   | Migrates MUI `Avatar` to BUI `Avatar`                                                                       |
| 7   | [`migrate-mui-skeleton-to-bui-skeleton`](scripts/migrate-mui-skeleton-to-bui-skeleton.ts)       | Loading placeholders      | Migrates MUI `Skeleton` to BUI `Skeleton`                                                                   |
| 8   | [`migrate-mui-button-to-bui-button`](scripts/migrate-mui-button-to-bui-button.ts)               | Standard buttons          | Migrates MUI `Button` to BUI `Button` / `ButtonLink`                                                        |
| 9   | [`migrate-mui-icon-button-to-button-icon`](scripts/migrate-mui-icon-button-to-button-icon.ts)   | Icon buttons              | Migrates MUI `IconButton` to BUI `ButtonIcon`                                                               |
| 10  | [`migrate-mui-link-to-bui-link`](scripts/migrate-mui-link-to-bui-link.ts)                       | Links                     | Migrates MUI `Link` to BUI `Link` (skips `packages/core-components` paths; aliases when core Link coexists) |
| 11  | [`migrate-mui-tooltip-to-bui-tooltip`](scripts/migrate-mui-tooltip-to-bui-tooltip.ts)           | Tooltips                  | Migrates MUI `Tooltip` toward BUI `TooltipTrigger`                                                          |
| 12  | [`migrate-mui-dialog-to-bui-dialog`](scripts/migrate-mui-dialog-to-bui-dialog.ts)               | Dialogs                   | Migrates Dialog shell patterns to BUI `Dialog`                                                              |
| 13  | [`migrate-mui-tabs-to-bui-tabs`](scripts/migrate-mui-tabs-to-bui-tabs.ts)                       | Tabs                      | Migrates MUI Tabs to BUI Tabs                                                                               |
| 14  | [`migrate-mui-menu-popover-to-bui-menu`](scripts/migrate-mui-menu-popover-to-bui-menu.ts)       | Menus / popovers          | Migrates Menu **or** Popover: MenuList/MenuItem → BUI `Menu`; otherwise BUI `Popover`                       |
| 15  | [`migrate-mui-list-family-to-bui-list`](scripts/migrate-mui-list-family-to-bui-list.ts)         | Lists                     | Migrates List family primitives to BUI List                                                                 |
| 16  | [`migrate-mui-chip-to-tag`](scripts/migrate-mui-chip-to-tag.ts)                                 | Tags / chips              | Migrates MUI `Chip` to BUI `Tag`                                                                            |
| 17  | [`migrate-mui-card-to-bui-card`](scripts/migrate-mui-card-to-bui-card.ts)                       | Cards                     | Migrates simple Card family patterns to BUI `Card`                                                          |
| 18  | [`migrate-mui-select-family-to-bui-select`](scripts/migrate-mui-select-family-to-bui-select.ts) | Select                    | Migrates Select wrapper patterns to BUI Select                                                              |
| 19  | [`migrate-mui-textfield-to-bui-textfield`](scripts/migrate-mui-textfield-to-bui-textfield.ts)   | TextField                 | Migrates MUI `TextField` to BUI `TextField` / specialized fields                                            |
| 20  | [`migrate-mui-autocomplete-to-combobox`](scripts/migrate-mui-autocomplete-to-combobox.ts)       | Autocomplete              | Heuristically migrates Autocomplete → `Combobox` or `SearchAutocomplete`                                    |
| 21  | [`migrate-mui-accordion-to-bui-accordion`](scripts/migrate-mui-accordion-to-bui-accordion.ts)   | Accordion                 | Migrates Accordion patterns to BUI Accordion                                                                |
| 22  | [`migrate-mui-radio-checkbox-to-bui`](scripts/migrate-mui-radio-checkbox-to-bui.ts)             | Radio / checkbox          | Migrates radio/checkbox groups and standalone Checkbox to BUI                                               |
| 23  | [`migrate-mui-switch-to-bui-switch`](scripts/migrate-mui-switch-to-bui-switch.ts)               | Switch                    | Migrates MUI `Switch` to BUI `Switch`                                                                       |
| 24  | [`migrate-mui-slider-to-bui-slider`](scripts/migrate-mui-slider-to-bui-slider.ts)               | Slider                    | Migrates MUI `Slider` to BUI `Slider`                                                                       |
| 25  | [`migrate-mui-layout-to-bui-layout`](scripts/migrate-mui-layout-to-bui-layout.ts)               | Layout primitives         | Converts Box / Paper / Grid toward BUI layout (see Paper heuristic below)                                   |
| 26  | [`remove-mui-dependencies`](scripts/remove-mui-dependencies.ts)                                 | Cleanup                   | Removes unused `@material-ui/*` dependencies from `package.json` after source migration                     |

### Paper heuristic (layout step)

`migrate-mui-layout-to-bui-layout` never maps Paper to `Surface`. Bare Paper → `Box bg="neutral"` **plus** a verify TODO that MUI’s default elevation chrome was dropped; card-like Paper → `Card`; explicit `elevation` / `variant` / ambiguous Paper → left with `TODO(backstage-codemod)`.

### Button outlined → secondary

`migrate-mui-button-to-bui-button` maps `variant="outlined"` → `variant="secondary"` silently (BUI secondary is the outlined visual). The transform emits metric `outlined-to-secondary` so operators can quantify remaps in dry-run output.

### Density (size defaults)

BUI controls default to `size="small"` while MUI defaults to medium. These packages emit `size="medium"` when MUI omitted size (or used `medium`/`large`), and preserve explicit `size="small"`:

- Button / ButtonIcon / Tag
- TextField family (TextField prop first; else parent FormControl `size`)
- Select (Select prop first; else FormControl `size`)
- Combobox / SearchAutocomplete (Autocomplete prop first; else `renderInput` TextField `size`)

## Package naming

Most transforms use `migrate-mui-<source>-to-bui-<target>`. A few intentionally omit `-bui-` in the target segment when the BUI export name is the product surface (not a “BUI-prefixed” alias):

| Package                                  | Why the name looks different                      |
| ---------------------------------------- | ------------------------------------------------- |
| `migrate-mui-typography-to-text`         | Target is BUI `Text`                              |
| `migrate-mui-chip-to-tag`                | Target is BUI `Tag`                               |
| `migrate-mui-icon-button-to-button-icon` | Target is BUI `ButtonIcon`                        |
| `migrate-mui-icons-to-remix-icons`       | Target is `@remixicon/react`, not `@backstage/ui` |
| `migrate-mui-radio-checkbox-to-bui`      | Covers radio/checkbox groups → BUI groups         |

## Usage

```bash
# Dry-run first (published recipe)
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

`workflow.local.yaml` is a maintainer-only mirror of the bundled-script workflow. Published consumers use the registry recipe.

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

- `workflow.yaml` runs bundled local scripts; standalone transform packages are no longer required.
- Use `workflow.local.yaml` for pre-publish dry-runs against a local `../backstage` tree.
- `yarn test` runs transform fixtures, CSS golden checks, workflow regression tests, and workflow schema validation.
