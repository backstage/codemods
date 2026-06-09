# @backstage/migrate-collapsible-to-accordion

Migrates `Collapsible` compound component usage to `Accordion` as introduced in `@backstage/ui@0.9.0` (Backstage v1.45.0).

## What it transforms

- **Import replacement** — `import { Collapsible } from '@backstage/ui'` → `import { Accordion, AccordionTrigger, AccordionPanel } from '@backstage/ui'`
- **Component renames** — `Collapsible.Root` → `Accordion`, `Collapsible.Trigger` → `AccordionTrigger`, `Collapsible.Panel` → `AccordionPanel`
- **Simple render prop conversion** — `<Collapsible.Trigger render={(props) => <button {...props}>Label</button>} />` → `<AccordionTrigger>Label</AccordionTrigger>`
- **Complex render prop** — adds a `{/* TODO(backstage-codemod) */}` comment for render props that cannot be mechanically converted
- Handles aliased imports (`import { Collapsible as Collapse }`)

## Installation

```bash
yarn dlx codemod@latest run @backstage/migrate-collapsible-to-accordion -t /path/to/target
```

## Usage (from this repo)

```bash
yarn dlx codemod@latest workflow run \
  -w codemods/v1.45.0/migrate-collapsible-to-accordion/workflow.yaml \
  -t /path/to/your/backstage-repo
```

## AI fixup

For complex `render` prop patterns the AST transform cannot handle:

```bash
yarn dlx codemod@latest workflow run \
  -w codemods/v1.45.0/migrate-collapsible-to-accordion/workflow.yaml \
  -t /path/to/your/backstage-repo \
  --param aiFixup=true
```

## Development

From the repo root:

```bash
yarn install
yarn workspace @backstage/migrate-collapsible-to-accordion test
```

## Known limitations

- **Namespace imports** (`import * as UI from '@backstage/ui'` with `<UI.Collapsible.Root>`) are not supported — these must be migrated manually
- Self-closing render elements with props (e.g., `render={(props) => <Icon {...props} />}`) are treated as complex cases requiring manual review
- Props on `Collapsible.Trigger` other than `render` (e.g., `id`, `className`) are preserved in the complex-render path but may be lost in the simple-render extraction
