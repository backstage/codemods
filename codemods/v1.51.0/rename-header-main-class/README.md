# @backstage/rename-header-main-class

Backstage 1.51.0 migration codemod that renames the removed `.bui-Header` CSS class to `.bui-HeaderContent` and updates the corresponding `classNames.root` property access to `classNames.content`.

## What it does

### CSS class rename

In BUI v0.15.0 (Backstage 1.51.0), the root `.bui-Header` class and `HeaderDefinition.classNames.root` were removed. The Header DOM was split into section classes (`headerTop`, `headerBottom`, `content`, `titleStack`, `tags`, etc.). Custom CSS targeting `.bui-Header` must be updated to target the remaining section classes.

This codemod finds and replaces the root class name in:

- String literals (`'.bui-Header'`)
- Template literals (`` `.bui-Header` ``)
- Object property keys in styled-components, Emotion, MUI `styled()`, etc.
- Standalone CSS/SCSS files (via a dedicated CSS pass)

Section classes such as `.bui-HeaderTop`, `.bui-HeaderBottom`, and `.bui-HeaderContent` are not modified.

### Property access rename

Replaces `classNames.root` with `classNames.content` in JS/TS:

```ts
// Before
HeaderDefinition.classNames.root
// After
HeaderDefinition.classNames.content
```

Object keys in `classNames` overrides are also updated when the value targets `bui-Header`.

### Descendant/child selector warnings

When the codemod detects a CSS selector using `>` (child combinator) or descendant combinators after `.bui-Header`, it adds a TODO comment because the root wrapper element was removed and these selectors may need restructuring:

```ts
// Before
'& .bui-Header > .title': { fontWeight: 'bold' }

// After
/* TODO(backstage-codemod): Header root class removed — review selector intent */
'& .bui-HeaderContent > .title': { fontWeight: 'bold' }
```

### Known limitations

- **Complex selectors in concatenated strings**: If the class name is split across multiple string concatenations, the codemod may not detect the full selector context for adding TODO comments.
- **Intent for section classes**: The codemod defaults to `bui-HeaderContent` / `content`; some overrides may need `headerTop` or `headerBottom` instead.

### Optional: AI fixup step

Enable with `--param aiFixup=true` to address edge cases:

- Reviews TODO comments and assesses whether selectors need restructuring
- Checks for remaining `bui-Header` references in styled-components or Emotion
- Verifies selector correctness after the root element removal
- Reverts incorrect renames of section classes

## Installation

```bash
# From registry
yarn dlx codemod@latest run @backstage/rename-header-main-class -t /path/to/target
```

## Usage (from this repo)

```bash
# AST codemod only (deterministic)
yarn dlx codemod@latest workflow run \
  -w codemods/v1.51.0/rename-header-main-class/workflow.yaml \
  -t /path/to/your/backstage-repo

# AST codemod + AI fixup for edge cases
yarn dlx codemod@latest workflow run \
  -w codemods/v1.51.0/rename-header-main-class/workflow.yaml \
  -t /path/to/your/backstage-repo \
  --param aiFixup=true

# Dry run (preview changes)
yarn dlx codemod@latest workflow run \
  -w codemods/v1.51.0/rename-header-main-class/workflow.yaml \
  -t /path/to/your/backstage-repo \
  --dry-run
```

## Development

From the repo root:

```bash
yarn install
yarn workspace @backstage/rename-header-main-class test
```

Or from this package directory:

```bash
yarn test
```
