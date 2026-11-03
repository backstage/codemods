# ADR 0001: Yarn 4 toolchain with oxfmt/oxlint and changed-file gates

- **Status**: Accepted
- **Date**: 2026-04-16 → 2026-10-13
- **Evidence**: `1ee5c96` (switch to Yarn), `9b9ec7d` (Corepack + Yarn 4 cache order), `933d821` (lockfile v9 under Yarn 4.14.1), `aab8333` (untrack install-state.gz), `b5e7d52` (oxfmt/oxlint/typescript configs), `ee079f8` (husky + lint-staged), `2502ea2` (CI format/lint checks), `6e1d555` (CI scoped to changed files), `ac50c6e` (batch changed-file checks for Windows argv limit), `42f0c8b`+`8e9a0c7` (check-changed from @backstage/scripts)

## Context

The repo started as npm-style standalone codemod packages with no shared formatting or CI gates. Per-codemod configs drifted, CI ran everything on every PR, and Windows contributors hit argv-length limits and CRLF mismatches.

## Decision

- Yarn 4 via Corepack; `yarn.lock` committed (lockfile v9), `.yarn/install-state.gz` untracked.
- oxfmt + oxlint (not Prettier/ESLint) as root tooling; recipes keep recipe-local `tsconfig.json` files, and the newer recipes (`v1.54.0+`) declare their own `typescript` devDependency.
- husky pre-commit runs `yarn lint-staged`; pre-push runs `yarn check:changed`; CI runs the same `check-changed` bin from the private `@backstage/scripts` package, so local and remote gates cannot drift.
- Changed-file checks batch paths and skip ignored test fixtures.

## Consequences

Fast PRs (only changed packages gate), one formatting dialect, loud failures when `node_modules` is missing in worktrees. Contributors must use Corepack-enabled Yarn, and Windows argv/CRLF pitfalls are handled centrally rather than per-PR.
