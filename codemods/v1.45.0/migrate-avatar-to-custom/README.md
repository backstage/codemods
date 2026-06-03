# @backstage/migrate-avatar-to-custom

Migrates `Avatar` component usage from the Base UI implementation to the custom implementation introduced in `@backstage/ui@0.9.0` (Backstage v1.45.0).

## What it transforms

- **`render` prop removal** — removes the `render` prop and inserts a `// TODO(backstage-codemod)` comment so you can review custom rendering
- **`size="large"` → `size="x-large"`** — the old `large` size maps to the new `x-large` token
- Handles named imports (`import { Avatar } from '@backstage/ui'`), aliased imports, and namespace imports (`import * as UI from '@backstage/ui'`)

## Installation

```bash
yarn dlx codemod@latest run @backstage/migrate-avatar-to-custom -t /path/to/target
```

## Usage (from this repo)

```bash
yarn dlx codemod@latest workflow run \
  -w codemods/v1.45.0/migrate-avatar-to-custom/workflow.yaml \
  -t /path/to/your/backstage-repo
```

## Development

From the repo root:

```bash
yarn install
yarn workspace @backstage/migrate-avatar-to-custom test
```

## Known limitations

- When a `render` prop is removed, the codemod cannot mechanically migrate the custom rendering logic — review the TODO comment and manually adjust
- Namespace imports are supported for detection, but the namespace prefix is preserved as-is

## License

MIT
