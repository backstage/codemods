---
name: validate-codemod-recipe
description: |
  Validate a codemod or migration recipe by running it against a real codebase
  and iteratively fixing issues found in the output. Use when asked to "test a
  codemod", "validate a recipe", "run the migration recipe and fix issues",
  "QA the codemods", "check the codemod output", or "clean up false positives".
  Also use when a codemod produces incorrect diffs, modifies files it shouldn't,
  leaves TODO comments that could be resolved, or breaks compilation in the target.
  Requires a codemod path and a target directory.
argument-hint: '<codemod-path> <target-dir>'
---

# Validate Codemod Recipe

Run a codemod or migration recipe against a real codebase, inspect every diff,
fix issues in the AST transforms, add test fixtures, and re-run until the output
is clean. This is an iterative loop — expect multiple passes.

## Inputs

| Input            | Example                                         | Required |
| ---------------- | ----------------------------------------------- | -------- |
| Codemod path     | `../codemods/codemods/v1.51.0/migration-recipe` | Yes      |
| Target directory | `packages`, `plugins`, or `.`                   | Yes      |

The codemod path points to a directory containing `codemod.yaml` and
`workflow.yaml`. The target is relative to the current working directory.

## The Loop

```
 ┌─► Run codemod against target
 │        ↓
 │   Lint changed files
 │        ↓
 │   Inspect every diff
 │        ↓
 │   Identify issues (see taxonomy below)
 │        ↓
 │   Fix AST transform source
 │        ↓
 │   Add/update test fixtures
 │        ↓
 │   Run codemod tests
 │        ↓
 │   Reset target, re-run
 │        ↓
 └── Any issues remain? → loop back
```

### Step 1: Run the codemod

Reset the target directory first, then run:

```bash
git checkout -- .
yarn dlx codemod workflow run -w <codemod-path> --no-interactive --target <target-dir>
```

If the recipe references registry sources (`source: '@backstage/...'`) and you
need to test local changes, swap them to relative paths in `workflow.yaml`
before running. The path resolves relative to the current working directory,
not the workflow file. Restore registry sources after validation.

`--target` accepts a single path. Run once per target directory.

### Step 2: Lint changed files

Run the target project's linter on changed files only. For Backstage:

```bash
yarn lint --fix
```

Fix any lint errors before proceeding — they may mask codemod issues.

### Step 3: Inspect every diff

```bash
git diff --name-only   # overview
git diff               # full diff
```

Read each changed file in context (not just the diff) to understand whether the
transform is correct. Check the surrounding code for references the codemod may
have broken.

### Step 4: Identify issues

Check each change against this taxonomy of common codemod bugs:

#### False positives (wrong files modified)

The codemod modifies code it should not touch. Root causes:

- **Overly broad AST matching**: Pattern matches nodes at any depth via
  `stopBy: 'end'` or missing parent-kind checks. Fix: add guards to filter
  out unintended matches (check parent node kind, verify type annotations).
- **Missing scope check**: Codemod processes all files that import from a
  package instead of only files that use the specific type being migrated.
  Fix: add a type-annotation or binding-tracking guard before processing.
- **Name collision**: A field name like `token` or `loading` exists in
  unrelated code. Fix: verify the field belongs to the target type before
  transforming.
- **Workspace member bleed**: A dependency-adding codemod modifies every
  sub-package in a monorepo when the workspace root already provides the
  dependency. Use judgement — sometimes sub-packages legitimately need
  their own entry (published packages, version pinning). When the codemod
  was designed to target only the workspace root (workflow excludes
  `packages/**`), add a guard in the transform (e.g., check for a
  `workspaces` field). When it makes sense for both root and members,
  consider a param like `skipWorkspaceMembers` to let users choose.
- **Workflow glob paths shift with `--target`**: A workflow that excludes
  `packages/**/package.json` works with `--target .` but not `--target
packages`, because `include`/`exclude` resolve relative to the target
  root. Transforms that should only hit the repo root need guards in the
  transform code itself, not just workflow globs.

#### Redundant transforms

A rename inside a fallback pattern creates identical sides:
`X ?? EXPERIMENTAL_X` → `X ?? X`. Fix: detect member-expression property
accesses vs object-literal keys and skip property accesses.

#### Broken references

Removing a variable declaration or field that is still used downstream.
Symptoms: `const {} = expr` left behind, or a variable used later is now
undefined. Fix: check if the statement defines bindings used elsewhere
before deleting; clean up empty destructuring.

#### Type/value mismatch

A field is removed from runtime destructuring but left in the type definition
(or vice versa). Fix: handle both the destructuring and the type shape
together, or scope the transform to avoid touching type-only positions.

#### Formatting damage

Multi-line code collapsed to single-line, or indentation changed. Fix:
preserve the original formatting structure when replacing AST nodes.

#### Dangling artifacts

Orphaned semicolons, extra blank lines, stale TODO comments that could be
mechanically resolved. Fix: extend the transform to clean up surrounding
syntax when removing nodes.

### Step 5: Fix the AST transform

**Generic fixes only.** Every fix must be a general rule that happens to solve
the specific case — not a patch targeting one repo's file. Before editing the
transform, ask: "Would this fix improve the codemod for ANY consumer codebase,
or only for this target?" If the answer is only this target, skip it — the
codemod is working as designed and the target code needs a manual migration.

Signals that a fix is **generic** (implement it):

- The AST rule matches too broadly and would false-positive in any codebase
  with a similarly-named field (e.g., removing `token` from all destructuring
  instead of only `PolicyQueryUser`-typed patterns).
- The transform produces syntactically broken output (empty destructuring,
  undefined references) regardless of which codebase it runs against.
- A rename inside a fallback pattern creates `X ?? X` — structurally wrong
  in any project.

Signals that a fix is **too specific** (skip it):

- The "fix" would encode one repo's internal API patterns (e.g., replacing
  `backstageToken: token` with `(credentials as any).token`).
- The transform correctly identifies the target pattern but the surrounding
  code needs manual follow-up — this is what TODO comments are for.
- The fix would only matter for a single file in one codebase.

Edit the codemod's `scripts/codemod.ts`. Common fix patterns:

- **Add parent-kind guard**: Skip matches whose parent is an unintended node
  type (e.g., `member_expression` vs `pair` key).
- **Add type-annotation check**: Only process patterns that are typed as the
  target type, not all patterns with a matching field name.
- **Handle empty results**: When all fields are removed from a destructuring,
  clean up the enclosing statement instead of leaving `const {} = expr`.
- **Preserve declarations**: When a statement references a removed field but
  also defines a binding used elsewhere, add a TODO comment above instead of
  replacing the entire statement.

### Step 6: Add test fixtures

Each test case is a directory under `tests/`:

```
tests/<test-name>/
  input.ts      # code before the transform
  expected.ts   # code after the transform (identical to input for negative tests)
  metrics.json  # optional: expected metric counters (no trailing newline)
```

Always add:

- A **positive test** for each new fix (verifies the fix works)
- A **negative test** for each false-positive class (verifies the codemod
  does NOT touch code it should skip)

For `metrics.json`, check existing fixtures for the format. The file must not
have a trailing newline — some test runners treat that as a mismatch.

### Step 7: Run codemod tests

```bash
cd <codemod-dir>
yarn dlx codemod jssg test -l tsx ./scripts/codemod.ts ./tests
```

Use `-l yaml` for YAML transforms. All tests must pass before proceeding.

### Step 8: Reset target and re-run

```bash
cd <target-repo>
git checkout -- .
yarn dlx codemod workflow run -w <codemod-path> --no-interactive --target <dir>
```

Compare the new diff against the previous run. Verify:

- False positives are eliminated (files that should not change are untouched)
- Legitimate transforms still apply correctly
- No new issues introduced

### Step 9: Iterate

Repeat from Step 3 until no issues remain. A clean run means:

- Every changed file has only intentional, correct transforms
- No lint errors
- No broken references or undefined variables
- No dangling artifacts
- All codemod tests pass

## Diagnostic signals

**Metrics output.** After each run, check the metrics summary. Unexpected
counts reveal issues — e.g., `object-pattern-updated: 2` when only one
`PolicyQueryUser` pattern exists means a false positive hit an unrelated
destructuring.

**Files that should not have changed.** For every modified file, verify it
actually uses the target type/API. If a file has no relevant imports or type
references, the modification is a false positive. Run:

```bash
grep -n '<TargetType>' <modified-file>
```

If it returns nothing, the codemod's scope guard is too broad.

**Diff count between runs.** After fixing the codemod, the re-run should
modify fewer files (false positives eliminated) while still transforming all
legitimate targets. If the file count drops to zero, verify you didn't
over-restrict the scope.

## Pitfalls

- **Don't install codemod globally.** Always use `yarn dlx codemod`.
- **Registry vs local sources.** Workflow `source: '@backstage/...'` fetches
  from the registry, not local files. Swap to local paths for testing, restore
  before committing.
- **`--target` is singular.** Run separately for each target directory.
- **Metrics trailing newline.** `metrics.json` files must not end with `\n` —
  the test runner compares byte-for-byte.
- **lint-staged interference.** The repo's pre-commit hooks may reformat files
  via prettier. If prettier and a generator script (like `yarn readme`)
  disagree on formatting, the generator should run prettier as its last step.
- **`params` must be forwarded in recipes.** When a sub-codemod declares
  `params:` (e.g., `aiFixup`), the recipe workflow must also declare those
  params at its own top level and forward them via `args:` on each step that
  uses them. Without this, the codemod CLI crashes with
  `Variable identifier is not bound to anything by context: "params.xxx"`.
  Compare against v1.50.0+ recipes for the correct pattern.
- **Cross-version audit.** Before fixing one recipe, `grep -r` across all
  version directories for the same pattern. A bug in one recipe's
  `params`/`args` setup is likely repeated in adjacent versions.
- **JSON test fixtures and `JSON.stringify`.** When a transform round-trips
  through `JSON.stringify`, arrays are expanded to one-element-per-line.
  Test fixture `input.json` and `expected.json` must match this expanded
  format or the test runner reports a false mismatch.
