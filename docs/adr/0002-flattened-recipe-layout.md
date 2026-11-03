# ADR 0002: One flattened migration recipe per Backstage release

- **Status**: Accepted
- **Date**: 2026-10-27 → 2026-11-03
- **Evidence**: `de65869` (bundle 1.54 scripts into the recipe), `fdf77d1` (flatten v1.54.0 + adapt tooling), `f585c23`, `138ae39`, `2d983e2`, `7652a9c`, `e53eaab`, `6d0d7e4`, `57363b7`, `930b994` (fold v1.45–v1.55 into flattened recipes), `defbd23` (fold misc MUI codemods into mui4-to-bui recipe), `d21a333` (integrate flattened layout), `8f470fe` (workflow structural validation)

## Context

Codemods were originally standalone registry packages, with recipe workflows referencing them as `codemod:` registry steps. That meant many published packages per release, version coupling between recipe and steps, and no guarantee that a workflow step existed in the checkout it ran from.

## Decision

Each Backstage release publishes exactly one `migration-recipe` package at `codemods/<version>/`. Workflow steps run local scripts (`js_file: scripts/<name>.ts`); `codemod:` registry steps are structurally rejected by the test runner. The misc recipe keeps its nested root at `codemods/misc/mui4-to-bui-migration-recipe/`. Tooling discovers recipe package roots by convention.

## Consequences

Single published artifact per release, workflow and scripts always version together, and recipe PRs are self-contained. Adding a cross-release shared codemod now requires either duplication or folding into an existing recipe — accepted cost.
