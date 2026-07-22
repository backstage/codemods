# misc codemods

Codemods that are not tied to a specific Backstage release version.

## MUI 4 → BUI family

Prefer the ordered recipe:

[`@backstage/mui4-to-bui-migration-recipe`](./mui4-to-bui-migration-recipe)

### Ordering

1. **Bootstrap first** — `@backstage/migrate-mui-bootstrap-to-bui`
2. **Transforms** — icons, styles/CSS modules, core and complex components, form controls, then layout (see the [recipe README](./mui4-to-bui-migration-recipe/README.md) for the full ordered list)
3. **Cleanup last** — `@backstage/remove-mui-dependencies`

See the [recipe README](./mui4-to-bui-migration-recipe/README.md) for registry links, domain coverage, out-of-scope items, and notes on intentional package names that omit `-bui-` in the target segment (`Text`, `Tag`, `ButtonIcon`, Remix).
