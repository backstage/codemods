# v1.45.0-migration-recipe

One-shot migration recipe for upgrading a Backstage app to 1.45.0. Runs bundled local scripts through a single workflow so you don't have to run each one by hand.

## What it runs

Each step below runs a bundled local script. The recipe executes them sequentially in an order aligned with the [Backstage 1.45.0 release notes](https://backstage.io/docs/releases/v1.45.0/): BUI component migrations from Base UI to custom/React Aria implementations.

| #   | Local script                                  | What it does                                                                                                               |
| --- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1   | `scripts/migrate-avatar-to-custom.ts`         | Remove deprecated `render` prop, rename `size="large"` to `size="x-large"` on `Avatar` from `@backstage/ui`                |
| 2   | `scripts/migrate-checkbox-to-react-aria.ts`   | Rename `checked`→`isSelected`, `disabled`→`isDisabled`, etc. and convert `label` prop to children on `Checkbox`            |
| 3   | `scripts/migrate-collapsible-to-accordion.ts` | Replace `Collapsible.Root/Trigger/Panel` with `Accordion/AccordionTrigger/AccordionPanel` and migrate `render` to children |

## Usage

```bash
# Dry run (preview every step without writing any changes)
yarn dlx codemod@latest run @backstage/v1-45-0-migration-recipe \
  --target /path/to/backstage-app \
  --dry-run

# Apply the full recipe
yarn dlx codemod@latest run @backstage/v1-45-0-migration-recipe \
  --target /path/to/backstage-app
```

You can also run the recipe directly from this repo:

```bash
yarn dlx codemod@latest workflow run \
  -w codemods/v1.45.0/workflow.yaml \
  --target /path/to/backstage-app \
  --dry-run
```

## AI fixup

The optional `ai-fixup` node runs after all AST transforms when `aiFixup=true`. By default it is `false`. AI fixups are not covered by fixture tests. It handles:

- Checkbox — complex `label` → `children` conversions, spread props, CSS class references
- Collapsible — complex `render` patterns, controlled state, nested collapsibles

Avatar migration is fully mechanical and does not require AI fixup.

Enable both fixups on the recipe:

```bash
yarn dlx codemod@latest run @backstage/v1-45-0-migration-recipe \
  --target /path/to/backstage-app \
  --param aiFixup=true
```

## Out of scope (document only)

These v1.45.0 breaking changes are not covered by automated codemods:

- **`componentDefinitions` / `ComponentDefinitionName` / `ComponentClassNames` removal** — no clear replacement, requires judgment
- **`className` prop behavior change** (augment vs override) — semantic change, no code transformation needed
- **`SelectProps` generic type parameter** — backward compatible for component usage
- **Bitbucket Cloud `appPassword` deprecation** (×5 packages) — config change, not yet removed

## Notes

- Each step runs a bundled local script in workflow order; no registry codemods are resolved.
- Several of the codemods insert `TODO(backstage-codemod)` markers where a value needs a human review. After the recipe finishes, grep for `TODO(backstage-codemod)` in your repo to find everything that still needs attention.
- `yarn test` runs fixture suites and workflow structure validation through `run-recipe-tests`.
