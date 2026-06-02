# @backstage/v1-48-0-migration-recipe

Migration recipe that chains every `@backstage/*` v1.48.0 codemod in a safe
order.

## Usage

```bash
npx codemod@latest @backstage/v1-48-0-migration-recipe
```

## Steps

| #   | Codemod                                                                                                                        | Description                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| 1   | [`@backstage/rename-bui-css-tokens-v1-48`](https://go.codemod.com/backstage/rename-bui-css-tokens-v1-48)                       | Rename deprecated BUI CSS tokens and selectors    |
| 2   | [`@backstage/remove-alert-surface-prop`](https://go.codemod.com/backstage/remove-alert-surface-prop)                           | Remove deprecated surface prop from Alert         |
| 3   | [`@backstage/migrate-surface-to-bg-system`](https://go.codemod.com/backstage/migrate-surface-to-bg-system)                     | Migrate surface/onSurface props to bg system      |
| 4   | [`@backstage/migrate-column-config-to-react-element`](https://go.codemod.com/backstage/migrate-column-config-to-react-element) | Wrap ColumnConfig cell/header returns             |
| 5   | [`@backstage/rename-header-to-plugin-header`](https://go.codemod.com/backstage/rename-header-to-plugin-header)                 | Rename Header to PluginHeader                     |
| 6   | [`@backstage/migrate-blueprints-to-plugin-app-react`](https://go.codemod.com/backstage/migrate-blueprints-to-plugin-app-react) | Move blueprint exports to plugin-app-react        |
| 7   | [`@backstage/migrate-app-experimental-packages`](https://go.codemod.com/backstage/migrate-app-experimental-packages)           | Migrate app.experimental.packages to app.packages |

## AI fixup

The recipe runs every codemod at default settings (`aiFixup=false`). Two of the
seven codemods ship optional AI fixup steps:

- `@backstage/migrate-surface-to-bg-system` — resolves dynamic surface values
- `@backstage/migrate-column-config-to-react-element` — fixes complex cell/header returns

To enable AI fixup, run the individual codemods after the recipe:

```bash
npx codemod@latest @backstage/migrate-surface-to-bg-system --param aiFixup=true
npx codemod@latest @backstage/migrate-column-config-to-react-element --param aiFixup=true
```

## Out of scope (document only)

These changes are runtime behavior or deprecation warnings — no codemod needed:

- `API_FACTORY_CONFLICT` warning → error — runtime behavior change
- API override logic now rejects at startup — runtime behavior
- `IconComponent` → `IconElement` — deprecated not yet removed
- `pluginId` replaces `id` on plugins — deprecated not yet removed
- Non-standard plugin ID format deprecated — runtime validation
- Extension multiple attachment points deprecated — runtime still supports
