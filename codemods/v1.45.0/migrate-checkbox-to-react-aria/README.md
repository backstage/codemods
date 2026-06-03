# @backstage/migrate-checkbox-to-react-aria

Migrates `Checkbox` component usage from the Base UI implementation to the React Aria implementation introduced in `@backstage/ui@0.9.0` (Backstage v1.45.0).

## What it transforms

- **Prop renames** — `checked` → `isSelected`, `defaultChecked` → `defaultSelected`, `disabled` → `isDisabled`, `required` → `isRequired`
- **`label` prop → children** — converts `label="text"` or `label={expr}` to children content, changing self-closing elements to open/close form
- **`data-checked` → `data-selected`** — renames data attributes in JSX attribute values
- **`bui-CheckboxLabel`** — flags references with a `// TODO(backstage-codemod)` comment since this CSS class was removed

Handles named imports, aliased imports, and namespace imports.

## Installation

```bash
yarn dlx codemod@latest run @backstage/migrate-checkbox-to-react-aria -t /path/to/target
```

## Usage (from this repo)

```bash
yarn dlx codemod@latest workflow run \
  -w codemods/v1.45.0/migrate-checkbox-to-react-aria/workflow.yaml \
  -t /path/to/your/backstage-repo
```

## AI fixup

For complex cases the AST transform cannot handle mechanically:

```bash
yarn dlx codemod@latest workflow run \
  -w codemods/v1.45.0/migrate-checkbox-to-react-aria/workflow.yaml \
  -t /path/to/your/backstage-repo \
  --param aiFixup=true
```

## Development

From the repo root:

```bash
yarn install
yarn workspace @backstage/migrate-checkbox-to-react-aria test
```

## Known limitations

- `bui-CheckboxLabel` CSS class references are flagged with a TODO but not removed — manual review required
- `data-checked` → `data-selected` replacement only applies to strings within JSX attributes; CSS files need manual update
- Checkboxes without a `label` prop and without existing children are not flagged — the new Checkbox requires a label via children

## License

MIT
