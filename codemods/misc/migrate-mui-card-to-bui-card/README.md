# @backstage/migrate-mui-card-to-bui-card

Migrates MUI 4 `Card` family usage to Backstage UI `Card`.

## Covers

- `Card` → `Card`
- `CardContent` → `CardBody`
- `CardActions` → `CardFooter`
- Simple `CardHeader` (children-only or string `title`) → `CardHeader` with children
- Deep and barrel imports from `@material-ui/core`
- Merging into an existing `@backstage/ui` import

## TODOs left for humans

- `CardMedia` (no BUI equivalent)
- Complex `CardHeader` with `avatar`, `action`, `subheader`, or non-string `title`

## Won't do

- Rewriting custom Card wrappers or theme overrides
