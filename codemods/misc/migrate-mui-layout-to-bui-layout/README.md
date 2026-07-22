# @backstage/migrate-mui-layout-to-bui-layout

Converts common MUI layout primitives (Box / Paper / Grid) toward BUI layout.

## Covers

- Box flex-container happy paths
- Simple Grid boolean / item patterns
- Paper heuristic: bare → `Box bg="neutral"` (+ verify TODO for dropped default elevation); card-like → `Card` (never `Surface`)

## TODOs / won't-do

- `box-component-todo`, `grid-todo`, `paper-elevation-todo`
- Explicit `elevation` / `variant` / ambiguous Paper left with `TODO(backstage-codemod)`
- Bare Paper without `elevation` still migrates to `Box`, but emits a default-elevation verify TODO (MUI default is `elevation={1}`)
- Full Grid system / responsive matrix rewrites

## Test

```bash
yarn test
```
