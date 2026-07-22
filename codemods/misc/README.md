# misc codemods

Codemods that are not tied to a specific Backstage release version.

## MUI 4 → BUI family

Prefer the ordered recipe:

[`@backstage/mui4-to-bui-migration-recipe`](./mui4-to-bui-migration-recipe)

### Ordering

1. **Bootstrap first** — `@backstage/migrate-mui-bootstrap-to-bui`
2. **Transforms (any order within)** — icons, styles/CSS modules, layout, and component codemods from PRs [#128](https://github.com/backstage/codemods/pull/128), [#129](https://github.com/backstage/codemods/pull/129), [#130](https://github.com/backstage/codemods/pull/130), and [#131](https://github.com/backstage/codemods/pull/131)
3. **Cleanup last** — `@backstage/remove-mui-dependencies`

See the [recipe README](./mui4-to-bui-migration-recipe/README.md) for the full package list, registry links, and notes on intentional package names that omit `-bui-` in the target segment (`Text`, `Tag`, `ButtonIcon`, Remix).
