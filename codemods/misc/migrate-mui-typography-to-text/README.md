# @backstage/migrate-mui-typography-to-text

Migrates MUI `Typography` to Backstage UI `Text` (valid TextVariants only).

## Covers

- Body / heading variants mapped to BUI Text variants
- Named barrel imports; merge into existing `@backstage/ui`
- Drops `gutterBottom` where unsupported

## Intentional heading demotion

BUI has fewer title steps than MUI headings. Smaller MUI headings intentionally map into body scale:

| MUI         | BUI Text        |
| ----------- | --------------- |
| `h1`        | `title-large`   |
| `h2`        | `title-medium`  |
| `h3`        | `title-small`   |
| `h4`        | `title-x-small` |
| `h5`        | `body-small`    |
| `h6`        | `body-x-small`  |
| `subtitle1` | `title-x-small` |
| `subtitle2` | `body-medium`   |

Review visual hierarchy after apply — especially `h5` / `h6` demotions.

## TODOs / won't-do

- Unmapped variants (`unmapped-variant-todo`)
- Theme typography overrides / custom variant maps

## Test

```bash
yarn test
```
