# ADR 0005: Release-owned README and version generation

- **Status**: Accepted
- **Date**: 2026-10-13 → 2026-11-03
- **Evidence**: `0fa47b2` (README sync to manual review PR), `5e9246b` (regenerate README on the Version Packages PR), `664f55a` (remove the redundant README-sync workflow), `8e52cb2` (regenerate the README inside the version-packages script), `c11b739` (pin the version-packages README stage in the wiring test)

## Context

The root README (codemod index) is generated, but syncing it drifted: a separate README-sync workflow caused churn, codemod PRs regenerated it inconsistently, and hand-edited `version` fields in `package.json`/`codemod.yaml` fought the Changesets bot.

## Decision

Changesets owns version bumps. The release workflow's `version-packages` script runs `changeset version && sync-codemod-versions && generate-readme-codemods` as one version commit on the **Version Packages** PR, so changeset consumption, version bumps, `codemod.yaml` sync, and the README always land together. There is no separate README-sync workflow. Codemod PRs leave the README unchanged; drift is regenerated on the next release PR or via `yarn readme` through a normal PR. The stage is pinned by a wiring test.

## Consequences

One place generates versions and README; no double-bookkeeping. The cost is that the README can lag `main` between releases (accepted), and manual version edits are always wrong (overwritten on the next Version Packages PR).
