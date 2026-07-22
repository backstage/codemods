# @backstage/migrate-mui-typography-to-text

Migrates MUI `Typography` to Backstage UI `Text` (valid TextVariants only).

## Covers

- Body / heading variants mapped to BUI Text variants
- Emits `as` from the MUI variant default element when `component` is omitted (`h5`→`as="h5"`, `body1`→`as="p"`, …)
- Named barrel imports; merge into existing `@backstage/ui`
- Drops `gutterBottom` where unsupported

## Variant map

| MUI         | BUI Text        | Default `as` |
| ----------- | --------------- | ------------ |
| `h1`        | `title-large`   | `h1`         |
| `h2`        | `title-medium`  | `h2`         |
| `h3`        | `title-small`   | `h3`         |
| `h4`        | `title-x-small` | `h4`         |
| `h5`        | `title-x-small` | `h5`         |
| `h6`        | `title-small`   | `h6`         |
| `subtitle1` | `title-x-small` | `h6`         |
| `subtitle2` | `body-medium`   | `h6`         |
| `body1`     | `body-medium`   | `p`          |
| `body2`     | `body-small`    | `p`          |
| `caption`   | `body-x-small`  | `span`       |

Explicit `component` still wins and becomes `as`.

## TODOs / won't-do

- Unmapped variants (`unmapped-variant-todo`)
- Theme typography overrides / custom variant maps

## Test

```bash
yarn test
```
