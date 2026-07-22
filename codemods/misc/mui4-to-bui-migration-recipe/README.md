# mui4-to-bui-migration-recipe

Run every `@backstage/*` MUI 4 → BUI codemod from the [Codemod Registry](https://go.codemod.com/registry) in a single ordered pass.

## Recommended order

1. **Bootstrap first** — `@backstage/migrate-mui-bootstrap-to-bui` adds `@backstage/ui` / `@remixicon/react` dependencies and the global BUI stylesheet.
2. **Component / icon / style / layout transforms** — run in any order within this phase. The recipe uses a stable sequence for reproducibility.
3. **Cleanup last** — `@backstage/remove-mui-dependencies` drops unused `@material-ui/*` packages from `package.json` only after source files no longer import them.

Do **not** run `remove-mui-dependencies` before the component transforms finish, or packages that still have MUI imports may be removed incorrectly.

## What it runs

| #   | Package                                                                                                                                                     | Phase     | Source PR                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------ |
| 1   | [`@backstage/migrate-mui-bootstrap-to-bui`](https://go.codemod.com/registry?q=backstage+migrate-mui-bootstrap-to-bui)                                       | bootstrap | [#128](https://github.com/backstage/codemods/pull/128) |
| 2   | [`@backstage/migrate-mui-icons-to-remix-icons`](https://go.codemod.com/registry?q=backstage+migrate-mui-icons-to-remix-icons)                               | transform | [#128](https://github.com/backstage/codemods/pull/128) |
| 3   | [`@backstage/migrate-mui-styles-to-bui-css-modules`](https://go.codemod.com/registry?q=backstage+migrate-mui-styles-to-bui-css-modules)                     | transform | [#128](https://github.com/backstage/codemods/pull/128) |
| 4   | [`@backstage/migrate-mui-layout-to-bui-layout`](https://go.codemod.com/registry?q=backstage+migrate-mui-layout-to-bui-layout)                               | transform | [#128](https://github.com/backstage/codemods/pull/128) |
| 5   | [`@backstage/migrate-mui-typography-to-text`](https://go.codemod.com/registry?q=backstage+migrate-mui-typography-to-text)                                   | transform | [#129](https://github.com/backstage/codemods/pull/129) |
| 6   | [`@backstage/migrate-mui-button-to-bui-button`](https://go.codemod.com/registry?q=backstage+migrate-mui-button-to-bui-button)                               | transform | [#129](https://github.com/backstage/codemods/pull/129) |
| 7   | [`@backstage/migrate-mui-icon-button-to-button-icon`](https://go.codemod.com/registry?q=backstage+migrate-mui-icon-button-to-button-icon)                   | transform | [#129](https://github.com/backstage/codemods/pull/129) |
| 8   | [`@backstage/migrate-mui-alert-to-bui-alert`](https://go.codemod.com/registry?q=backstage+migrate-mui-alert-to-bui-alert)                                   | transform | [#129](https://github.com/backstage/codemods/pull/129) |
| 9   | [`@backstage/migrate-mui-tooltip-to-bui-tooltip`](https://go.codemod.com/registry?q=backstage+migrate-mui-tooltip-to-bui-tooltip)                           | transform | [#129](https://github.com/backstage/codemods/pull/129) |
| 10  | [`@backstage/migrate-mui-textfield-to-bui-textfield`](https://go.codemod.com/registry?q=backstage+migrate-mui-textfield-to-bui-textfield)                   | transform | [#131](https://github.com/backstage/codemods/pull/131) |
| 11  | [`@backstage/migrate-mui-select-family-to-bui-select`](https://go.codemod.com/registry?q=backstage+migrate-mui-select-family-to-bui-select)                 | transform | [#131](https://github.com/backstage/codemods/pull/131) |
| 12  | [`@backstage/migrate-mui-radio-checkbox-groups-to-bui-groups`](https://go.codemod.com/registry?q=backstage+migrate-mui-radio-checkbox-groups-to-bui-groups) | transform | [#131](https://github.com/backstage/codemods/pull/131) |
| 13  | [`@backstage/migrate-mui-slider-to-bui-slider`](https://go.codemod.com/registry?q=backstage+migrate-mui-slider-to-bui-slider)                               | transform | [#131](https://github.com/backstage/codemods/pull/131) |
| 14  | [`@backstage/migrate-mui-accordion-to-bui-accordion`](https://go.codemod.com/registry?q=backstage+migrate-mui-accordion-to-bui-accordion)                   | transform | [#131](https://github.com/backstage/codemods/pull/131) |
| 15  | [`@backstage/migrate-mui-chip-to-tag`](https://go.codemod.com/registry?q=backstage+migrate-mui-chip-to-tag)                                                 | transform | [#130](https://github.com/backstage/codemods/pull/130) |
| 16  | [`@backstage/migrate-mui-dialog-to-bui-dialog`](https://go.codemod.com/registry?q=backstage+migrate-mui-dialog-to-bui-dialog)                               | transform | [#130](https://github.com/backstage/codemods/pull/130) |
| 17  | [`@backstage/migrate-mui-list-family-to-bui-list`](https://go.codemod.com/registry?q=backstage+migrate-mui-list-family-to-bui-list)                         | transform | [#130](https://github.com/backstage/codemods/pull/130) |
| 18  | [`@backstage/migrate-mui-menu-popover-to-bui-menu`](https://go.codemod.com/registry?q=backstage+migrate-mui-menu-popover-to-bui-menu)                       | transform | [#130](https://github.com/backstage/codemods/pull/130) |
| 19  | [`@backstage/migrate-mui-tabs-to-bui-tabs`](https://go.codemod.com/registry?q=backstage+migrate-mui-tabs-to-bui-tabs)                                       | transform | [#130](https://github.com/backstage/codemods/pull/130) |
| 20  | [`@backstage/remove-mui-dependencies`](https://go.codemod.com/registry?q=backstage+remove-mui-dependencies)                                                 | cleanup   | [#128](https://github.com/backstage/codemods/pull/128) |

Also see the short ordering note in [`../README.md`](../README.md).

## Package naming

Most transforms use `migrate-mui-<source>-to-bui-<target>`. A few intentionally omit `-bui-` in the target segment when the BUI export name is the product surface (not a “BUI-prefixed” alias):

| Package                                             | Why the name looks different                      |
| --------------------------------------------------- | ------------------------------------------------- |
| `@backstage/migrate-mui-typography-to-text`         | Target is BUI `Text`                              |
| `@backstage/migrate-mui-chip-to-tag`                | Target is BUI `Tag`                               |
| `@backstage/migrate-mui-icon-button-to-button-icon` | Target is BUI `ButtonIcon`                        |
| `@backstage/migrate-mui-icons-to-remix-icons`       | Target is `@remixicon/react`, not `@backstage/ui` |

## Usage

```bash
# Dry-run first
yarn dlx codemod@latest run @backstage/mui4-to-bui-migration-recipe \
  --target /path/to/backstage-app \
  --dry-run

# Apply
yarn dlx codemod@latest run @backstage/mui4-to-bui-migration-recipe \
  --target /path/to/backstage-app
```

## Notes

- Each step resolves from the Codemod registry, so underlying packages must be published before the recipe can run end-to-end.
- Several codemods insert `TODO(backstage-codemod)` markers where a value needs human review. After the recipe finishes, grep for `TODO(backstage-codemod)`.
- This recipe is orchestration only — it has no transform script of its own. Running `yarn test` validates the workflow schema via `codemod workflow validate`.
