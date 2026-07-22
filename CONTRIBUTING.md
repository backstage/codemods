# Contributing

Thanks for your interest in contributing to useful-codemods!

> Using an AI coding agent (Codex, Cursor, Claude Code, Aider, etc.)? See [`AGENTS.md`](./AGENTS.md) — it's a thin pointer back to this file.

## Development setup

This repo uses Yarn 4 (via Corepack), Changesets for releases, and **oxfmt + oxlint** (not Prettier/ESLint) for formatting and linting.

```bash
# Install dependencies (also sets up the pre-commit hook via husky)
yarn install

# Format all files
yarn format

# Check formatting without writing
yarn format:check

# Lint all files (includes type checking)
yarn lint

# Lint and auto-fix
yarn lint:fix

# Run all tests
yarn test
```

## Pre-commit hook

A pre-commit hook runs automatically after `yarn install` (via the `prepare` script, which runs `husky`). That sets `core.hooksPath` to `.husky/_` and runs the repo's `.husky/pre-commit` script (`yarn lint-staged`) on commit.

lint-staged is configured in [`.lintstagedrc.json`](./.lintstagedrc.json) to mirror the CI gates that apply to staged files:

- **Format** — `yarn format` on staged `ts`/`tsx`/`js`/`json`/`yaml`/`md`/`css` (and related) files
- **Lint** — `yarn lint` on staged JS/TS (same flags as CI, including `require-await`)
- **Package tests** — when `codemods/**/scripts/*.{ts,tsx}` is staged, run that package's `yarn test`
- **README freshness** — when any `codemods/**/codemod.yaml` is staged, run `yarn readme` and stage `README.md`

If formatting or linting fails, the commit is blocked until the issues are fixed.

**Worktrees / fresh clones:** run `yarn install` in that worktree before committing. If `git config core.hooksPath` is unset, husky is not active and commits will skip these checks (CI will still fail).

The hook only inspects **staged** files. Unstaged edits can still fail CI — run `yarn format:check`, `yarn lint`, and `yarn readme` before pushing when in doubt.

## Making changes

1. Create a branch from `main`.
2. Make your changes and add or update tests.
3. Run `yarn format`, `yarn lint`, and `yarn test` to verify everything passes.
4. Add a changeset (see below).
5. Open a pull request.

## Adding a changeset

This repo uses [Changesets](https://github.com/changesets/changesets) for versioning and releases. **Every PR that changes a codemod must include a changeset.** CI does not block PRs missing a changeset, so this is enforced by convention — without one, the codemod is not tagged or published.

```bash
yarn changeset
```

Follow the prompts to:

1. Select the affected codemod(s).
2. Choose the semver bump type — **patch** for bug fixes, **minor** for new features, **major** for breaking changes.
3. Write a short summary of the change.

This creates a markdown file in `.changeset/` that should be committed with your PR.

## Release workflow

1. Merge a PR with one or more changesets into `main`.
2. CI automatically opens (or updates) a **Version Packages** PR that bumps versions in `package.json`, regenerates `CHANGELOG.md`, and syncs `codemod.yaml` versions.
3. Merge the Version Packages PR — git tags are created and the updated codemods are published to the Codemod registry.

Do not hand-edit the `version` field in `package.json` or `codemod.yaml` to "trigger a release". The Changesets bot owns version bumps; manual edits are overwritten on the next Version Packages PR and may create version drift.

The manual `Publish Codemod (Manual)` workflow (`.github/workflows/publish.yml`) exists for emergencies — don't use it as a normal release path.

## Adding a new codemod

Each codemod lives in its own directory under `codemods/<group>/<codemod-name>/`:

```
codemods/<group>/<codemod-name>/
  scripts/codemod.ts   # Codemod logic (jssg / ast-grep)
  tests/               # Input/expected test fixtures
  codemod.yaml         # Codemod manifest (version is auto-synced)
  workflow.yaml        # Execution workflow
  package.json         # Source of truth for name + version
```

The `<group>` is either a Backstage release version (e.g. `v1.52.0`) for migration codemods, or `misc` for codemods not tied to a specific release (e.g. NFS migration).

Conventions to follow:

- The two-level glob `codemods/*/*/` is assumed by `scripts/sync-codemod-versions.sh` and `scripts/tag-and-publish.sh`. Don't flatten or deepen this layout.
- The `package.json` `name` must be `@backstage/<codemod-name>`. The tagging and publishing scripts assume this scope.
- The `version` field in `codemod.yaml` is generated from `package.json` by `scripts/sync-codemod-versions.sh`. Don't edit it directly.
- Use single-quoted scalars in `codemod.yaml` and `workflow.yaml` to match the oxfmt convention.

Use an existing codemod like `catalog-node-alpha-to-stable` as a reference when creating a new one.
test
