# PR #89 Copilot Review Fixes — v1.47.0 Codemods

Commit: `92e492f` — `fix: address Copilot review findings on v1.47.0 codemods`

## Fix 1: `isTypeOnly` detection too broad

**File:** `codemods/v1.47.0/migrate-table-to-use-table-hook/scripts/codemod.ts`

**Problem:** `imp.children().some((c) => c.text() === 'type')` matched the `type` keyword inside individual import specifiers (e.g., `import { type ColumnConfig, Table }`), misclassifying mixed imports as fully type-only.

**Fix:** Replaced with `/^import\s+type\s+\{/.test(imp.text())` which only matches the top-level `import type {` syntax.

## Fix 2: Removed imports without rewriting JSX

**File:** `codemods/v1.47.0/migrate-table-to-use-table-hook/scripts/codemod.ts`

**Problem:** `TableHeader`, `TableBody`, `TablePagination` were removed from imports but their JSX usages were left without any guidance.

**Fix:** After removing import specifiers, the codemod now scans for JSX elements (`jsx_opening_element` / `jsx_self_closing_element`) using those names and inserts `{/* TODO(backstage-codemod): Migrate TableHeader/TableBody/TablePagination to new Table API */}` before each usage. Test fixture `basic-table-migration/expected.tsx` updated accordingly.

## Fix 3: Unused `_has*` variables

**File:** `codemods/v1.47.0/migrate-table-to-use-table-hook/scripts/codemod.ts`

**Problem:** `_hasTableHeaderImport`, `_hasTableBodyImport`, `_hasTablePaginationImport` were declared and assigned but never read.

**Fix:** Removed all three variables and their assignment loops entirely.

## Fix 4: Recipe README contradicted `args: ['aiFixup']`

**File:** `codemods/v1.47.0/migration-recipe/README.md`

**Problem:** `workflow.yaml` forwards `aiFixup` via `args:`, consistent with the v1.50.0 recipe pattern, but the README stated forwarding was unsupported and directed users to run individual codemods.

**Fix:** Updated the "AI fixup" section to document that the recipe accepts and forwards `aiFixup` via `--param aiFixup=true`.

## Fix 5: Missing `CHANGELOG.md` files

**Added:**

- `codemods/v1.47.0/rename-bui-css-tokens-v1-47/CHANGELOG.md`
- `codemods/v1.47.0/migrate-table-to-use-table-hook/CHANGELOG.md`

Both follow the same minimal format used by `codemods/v1.47.0/migration-recipe/CHANGELOG.md` (header-only; Changesets bot manages entries).

## Validation

- `yarn format` — 0 changes needed
- `yarn lint` — 0 warnings, 0 errors
- `yarn test` — all tests pass (including the updated `basic-table-migration` fixture)
- Pushed to `origin/feat/v1.47.0-codemods`
