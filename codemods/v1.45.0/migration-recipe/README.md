# v1.45.0-migration-recipe

One-shot migration recipe for upgrading a Backstage app to 1.45.0. Chains every `@backstage/*` v1.45.0 codemod from the Codemod registry through a single workflow so you don't have to run each one by hand.

## What it runs

Each step below is a registry package that you can also run on its own. The recipe executes them sequentially in an order aligned with the [Backstage 1.45.0 release notes](https://backstage.io/docs/releases/v1.45.0/): BUI component migrations from Base UI to custom/React Aria implementations.

| #   | Registry package                                                                                                              | What it does                                                                                                               |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1   | [`@backstage/migrate-avatar-to-custom`](https://app.codemod.com/registry/@backstage/migrate-avatar-to-custom)                 | Remove deprecated `render` prop, rename `size="large"` to `size="x-large"` on `Avatar` from `@backstage/ui`                |
| 2   | [`@backstage/migrate-checkbox-to-react-aria`](https://app.codemod.com/registry/@backstage/migrate-checkbox-to-react-aria)     | Rename `checked`→`isSelected`, `disabled`→`isDisabled`, etc. and convert `label` prop to children on `Checkbox`            |
| 3   | [`@backstage/migrate-collapsible-to-accordion`](https://app.codemod.com/registry/@backstage/migrate-collapsible-to-accordion) | Replace `Collapsible.Root/Trigger/Panel` with `Accordion/AccordionTrigger/AccordionPanel` and migrate `render` to children |

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
  -w codemods/v1.45.0/migration-recipe/workflow.yaml \
  --target /path/to/backstage-app \
  --dry-run
```

## AI fixup

The recipe runs every codemod at its default settings (no AI fixup). Two of the three codemods ship an optional `aiFixup` param that uses an LLM to refine edge cases the AST transform cannot handle mechanically:

- `@backstage/migrate-checkbox-to-react-aria` — complex `label` → `children` conversions, spread props, CSS class references
- `@backstage/migrate-collapsible-to-accordion` — complex `render` patterns, controlled state, nested collapsibles

The `@backstage/migrate-avatar-to-custom` codemod is fully mechanical and does not require AI fixup.

If you want AI fixup for one of those, run that package on its own after the recipe:

```bash
yarn dlx codemod@latest run @backstage/migrate-checkbox-to-react-aria \
  --target /path/to/backstage-app \
  --param aiFixup=true
```

The Codemod workflow engine does not currently support string interpolation inside a step's `args:`, so the recipe cannot forward a single top-level `aiFixup` flag to every step. Running the individual package with `--param aiFixup=true` is the supported path for now.

## Out of scope (document only)

These v1.45.0 breaking changes are not covered by automated codemods:

- **`componentDefinitions` / `ComponentDefinitionName` / `ComponentClassNames` removal** — no clear replacement, requires judgment
- **`className` prop behavior change** (augment vs override) — semantic change, no code transformation needed
- **`SelectProps` generic type parameter** — backward compatible for component usage
- **Bitbucket Cloud `appPassword` deprecation** (×5 packages) — config change, not yet removed

## Notes

- Each step is invoked through the `codemod:` workflow action and resolved from the Codemod registry, so running the recipe installs the latest published version of every referenced package.
- The recipe does not reorder edits across codemods; each registry package owns its own before/after behavior. Check the individual READMEs for the details of any single step.
- Several of the codemods insert `TODO(backstage-codemod)` markers where a value needs a human review. After the recipe finishes, grep for `TODO(backstage-codemod)` in your repo to find everything that still needs attention.
- This recipe is orchestration only — it has no transform script of its own, so there are no fixture tests. Running `yarn test` in this package validates the workflow schema via `codemod workflow validate`.
