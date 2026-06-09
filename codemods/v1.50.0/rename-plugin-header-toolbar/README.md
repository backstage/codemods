# @backstage/rename-plugin-header-toolbar

Backstage 1.50.0 migration codemod that renames the removed `.bui-PluginHeaderToolbarWrapper` CSS class to `.bui-PluginHeaderToolbar` and updates the corresponding `classNames.toolbarWrapper` property access to `classNames.toolbar`.

## What it does

### CSS class rename

In BUI v0.14.0 (Backstage 1.50.0), the `toolbarWrapper` DOM element was removed from `PluginHeader`. The CSS class `.bui-PluginHeaderToolbarWrapper` no longer exists and must be replaced with `.bui-PluginHeaderToolbar`.

This codemod finds and replaces the class name in:

- String literals (`'.bui-PluginHeaderToolbarWrapper'`)
- Template literals (`` `.bui-PluginHeaderToolbarWrapper` ``)
- Object property keys in styled-components, Emotion, MUI `styled()`, etc.

### Property access rename

Replaces `classNames.toolbarWrapper` with `classNames.toolbar` in JS/TS:

```ts
// Before
PluginHeaderDefinition.classNames.toolbarWrapper
// After
PluginHeaderDefinition.classNames.toolbar
```

### Descendant/child selector warnings

When the codemod detects a CSS selector using `>` (child combinator) or descendant combinators after `.bui-PluginHeaderToolbarWrapper`, it adds a TODO comment because the wrapper element was removed and these selectors may need restructuring:

```ts
// Before
'& .bui-PluginHeaderToolbarWrapper > button': { color: 'red' }

// After
/* TODO(backstage-codemod): wrapper element was removed — review child/descendant selectors */
'& .bui-PluginHeaderToolbar > button': { color: 'red' }
```

### Known limitations

- **Pure CSS/SCSS files**: The AST codemod processes CSS/SCSS files through the workflow `include` globs but parses them as TSX. For standalone `.css` and `.scss` files that contain only CSS (no JS/TS), a text-based search-and-replace may be more appropriate.
- **Complex selectors in concatenated strings**: If the class name is split across multiple string concatenations, the codemod may not detect the full selector context for adding TODO comments.

### Optional: AI fixup step

Enable with `--param aiFixup=true` to address edge cases:

- Reviews TODO comments and assesses whether selectors need restructuring
- Checks for remaining `PluginHeaderToolbarWrapper` references in styled-components or Emotion
- Verifies selector correctness after the wrapper element removal

## Installation

```bash
# From registry
yarn dlx codemod@latest run @backstage/rename-plugin-header-toolbar -t /path/to/target
```

## Usage (from this repo)

```bash
# AST codemod only (deterministic)
yarn dlx codemod@latest workflow run \
  -w codemods/v1.50.0/rename-plugin-header-toolbar/workflow.yaml \
  -t /path/to/your/backstage-repo

# AST codemod + AI fixup for edge cases
yarn dlx codemod@latest workflow run \
  -w codemods/v1.50.0/rename-plugin-header-toolbar/workflow.yaml \
  -t /path/to/your/backstage-repo \
  --param aiFixup=true

# Dry run (preview changes)
yarn dlx codemod@latest workflow run \
  -w codemods/v1.50.0/rename-plugin-header-toolbar/workflow.yaml \
  -t /path/to/your/backstage-repo \
  --dry-run
```

## Development

From the repo root:

```bash
yarn install
yarn workspace @backstage/rename-plugin-header-toolbar test
```

Or from this package directory:

```bash
yarn test
yarn check-types
```
