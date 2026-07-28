# @backstage/migrate-mui-skeleton-to-bui-skeleton

Migrates MUI 4 `Skeleton` usage to Backstage UI `Skeleton`.

## Covers

- `@material-ui/lab/Skeleton` and `@material-ui/core/Skeleton` (deep + barrel) imports
- `width` / `height` passthrough
- `variant="circle"` → `rounded`
- Merging into an existing `@backstage/ui` import

## TODOs left for humans

- Unsupported props such as `animation` / `classes`

## Won't do

- Replacing `CircularProgress` / `LinearProgress` with Skeleton
