# @backstage/migrate-mui-layout-to-bui-layout

Converts common MUI layout primitives (Box / Paper / Grid) toward BUI layout.

## Covers

- Box flex-container happy paths
- Simple Grid boolean / item patterns
- Paper heuristic: bare → `Box bg="neutral"`; card-like → `Card` (never `Surface`)

## TODOs / won't-do

- `box-component-todo`, `grid-todo`, `paper-elevation-todo`
- Elevation / ambiguous Paper left with `TODO(backstage-codemod)`
- Full Grid system / responsive matrix rewrites

## Test

```bash
yarn test
```
