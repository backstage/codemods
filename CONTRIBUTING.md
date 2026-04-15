# Contributing

Thanks for your interest in contributing to useful-codemods!

## Development setup

```bash
# Install dependencies
pnpm install

# Run all tests
pnpm test

# Type-check all codemods
pnpm check-types
```

## Making changes

1. Create a branch from `main`.
2. Make your changes and add or update tests.
3. Run `pnpm test` and `pnpm check-types` to verify everything passes.
4. Add a changeset (see below).
5. Open a pull request.

## Adding a changeset

This repo uses [Changesets](https://github.com/changesets/changesets) for versioning and releases. Every PR that changes a codemod must include a changeset.

```bash
pnpm changeset
```

Follow the prompts to:
1. Select the affected codemod(s).
2. Choose the semver bump type — **patch** for bug fixes, **minor** for new features, **major** for breaking changes.
3. Write a short summary of the change.

This creates a markdown file in `.changeset/` that should be committed with your PR.

## Release workflow

1. Merge a PR with one or more changesets into `main`.
2. CI automatically opens a **Version Packages** PR that bumps versions in `package.json` and `codemod.yaml`.
3. Merge the version PR — git tags are created and the updated codemods are published to the Codemod registry.

## Adding a new codemod

Each codemod lives in its own directory under `codemods/`:

```
codemods/<name>/
  scripts/codemod.ts   # Codemod logic (jssg / ast-grep)
  tests/               # Input/expected test fixtures
  codemod.yaml         # Codemod manifest
  workflow.yaml        # Execution workflow
  package.json
```

Use an existing codemod like `debarrel` as a reference when creating a new one.
