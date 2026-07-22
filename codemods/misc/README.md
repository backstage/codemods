# misc codemods

Codemods that are not tied to a specific Backstage release version.

## MUI 4 → BUI family

Prefer the ordered recipe:

[`@backstage/mui4-to-bui-migration-recipe`](./mui4-to-bui-migration-recipe)

### Ordering

1. **Bootstrap first** — `@backstage/migrate-mui-bootstrap-to-bui`
2. **Transforms** — icons → styles/CSS modules → core (Typography, Alert, Avatar, Skeleton, Button, IconButton, Link, Tooltip) → complex (Dialog, Tabs, Menu/Popover, List, Chip, Card) → forms (Select, TextField, Autocomplete, Accordion, radio/checkbox, Switch, Slider) → layout last
3. **Cleanup last** — `@backstage/remove-mui-dependencies`

New packages in this family: Avatar, Skeleton, Link, Card, Autocomplete→Combobox, Switch. Pre-publish dry-runs use [`workflow.local.yaml`](./mui4-to-bui-migration-recipe/workflow.local.yaml) against a sibling `../backstage` checkout.

See the [recipe README](./mui4-to-bui-migration-recipe/README.md) for the full ordered table, Paper heuristic notes, registry links, out-of-scope items (Badge overlays, Progress, Drawer, Snackbar, Stepper, Timeline, material-table), and intentional package names that omit `-bui-` in the target segment (`Text`, `Tag`, `ButtonIcon`, Remix).
