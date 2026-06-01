# Codemod issue body template

Copy and fill for each codemod. Remove sections that do not apply (e.g. drop **Optional: AI fixup step** when aiFixup is not recommended).

```markdown
### Summary

<What was removed/changed, in which package, and what consumers must do instead.
State clearly if this is NOT a drop-in rename. Link to release notes if helpful.>

### Detection Criteria

- <Import pattern, e.g. `NavItemBlueprint` from `@backstage/frontend-plugin-api`>
- <Call/site pattern, e.g. `NavItemBlueprint.make({...})`>
- <Additional patterns: JSX tags, config keys, CSS classes, interface implementations>

### Transformation Logic

1. <First deterministic step>
2. <Second step — usage rewrite, not just imports>
3. <Cleanup: remove unused imports, extension registrations, etc.>
4. <Flag ambiguous cases with `TODO(backstage-codemod)` and note aiFixup if applicable>

### Before / After Example

```ts
// Before
<minimal realistic snippet>
```

```ts
// After
<expected result>
```

<Add a second example variant when props map differently, nested children move, or error prop renames.>

### Notes / Edge Cases

- <Skip files already migrated>
- <Do not conflate with other v1.X migrations — name the related issue if users might confuse them>
- <Built-in plugins in main repo already migrated — target consumer apps>
- <Re-exports, namespace imports, dynamic values>

### Optional: AI fixup step

Ship `params.aiFixup` (boolean, default `false`) and an `ai-fixup` workflow node (mirror a prior-release codemod that ships aiFixup — see closed issues from v1.(N-1)).

**`params.schema.aiFixup` description:** <one-line param description for workflow UI>

**AST step already handles:**
- <bullet>
- <bullet>

**AI fixup prompt should address:**
1. <residual case>
2. <residual case>

**Workflow:** `model: 'claude-sonnet-4-6'`, `max_steps: 50`

```bash
yarn dlx codemod@latest run @backstage/<package-name> -t /path/to/target --param aiFixup=true
```

**Dry-run target:** `../backstage` monorepo (Backstage <version> sources).

### Changeset (when implementing)

- Package: `@backstage/<package-name>`
- Bump: **minor** (initial release)
- Summary example: `<Add codemod to ... for Backstage 1.X.0>`

### Implementation notes

- Branch/worktree: `.worktrees/feat/v1.<minor>.0/<codemod-name>`
- Open PR when ready; one PR per codemod
```

## Recipe issue template (separate issue, filed last)

```markdown
### Summary

Add a v1.<minor>.0 **migration recipe** workflow that chains every `@backstage/*` v1.<minor>.0 codemod in a single ordered run (same pattern as `codemods/v1.<prior>.0/migration-recipe/`).

### Release sequencing (required)

1. Implement and merge codemods **#<first>–#<last>** (each with changeset → Version Packages → registry publish).
2. Only then implement and merge this recipe (**#<recipe>**).
3. Do **not** publish the recipe to the registry until all dependency packages are published.

Recipe workflow steps must use `source: '@backstage/<package>'` (registry resolution), not local paths.

### Recipe order (proposed)

Align with [Backstage 1.<minor>.0 release notes](https://backstage.io/docs/releases/v1.<minor>.0):

| # | Package | Domain |
|---|---------|--------|
| 1 | `@backstage/<name>` | <domain> |
| ... | ... | ... |

### Deliverables

- `codemods/v1.<minor>.0/migration-recipe/` directory (package.json, codemod.yaml, workflow.yaml, README.md, CHANGELOG.md)
- Package name: `@backstage/v1-<minor>-0-migration-recipe` (match prior release: `@backstage/v1-<prior>-0-migration-recipe`)
- README table listing each step with registry links (mirror prior release README)
- Workflow `version: '1'` with sequential `codemod:` steps

### AI fixup (recipe behavior)

Same as the prior release migration recipe:

- The recipe runs every codemod at **default settings** (`aiFixup=false`).
- **<N>** of the **<M>** codemods ship optional `aiFixup`: #<list>.
- **No** `aiFixup` on #<list> — <reason, e.g. YAML-only>.
- The workflow engine cannot forward a top-level `aiFixup` flag to all steps; document running individual packages with `--param aiFixup=true` after the recipe.

### Out of scope for recipe (document only in README)

- <manual change 1>
- <manual change 2>

### QA target

Document dry-run against sample monorepo: `../backstage` (<absolute path if known>).

### Changeset (when implementing)

- Package: `@backstage/v1-<minor>-0-migration-recipe`
- Bump: **minor** (initial release)

### Blocked by

- #<n> — <package-name>
- ...

### Implementation notes

- Branch/worktree: `.worktrees/feat/v1.<minor>.0/migration-recipe`
- One PR; merge **after** codemod issues are merged and published
```
