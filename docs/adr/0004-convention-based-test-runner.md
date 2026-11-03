# ADR 0004: Convention-based test runner in a private scripts package

- **Status**: Accepted
- **Date**: 2026-10-27 → 2026-11-03
- **Evidence**: `320956c` (repo-wide convention-based test runner), `42f0c8b` (recipe test runner into a private workspace package), `8e9a0c7` (all repository scripts into a TypeScript scripts package), `e9adfa5` (shell test harnesses → TypeScript node:test), `846d7b0` (remaining .mjs suites → TypeScript), `8f470fe` (workflow structure validation in the shared runner)

## Context

Each recipe carried its own test wiring: shell harnesses, bespoke `codemod jssg test` invocations, and per-package test commands that drifted. Repository tooling (gates, generators, release helpers) was scattered shell/`.mjs` scripts.

## Decision

`run-recipe-tests` (a bin from the private `@backstage/scripts` workspace package, declared as a devDependency — no relative paths) discovers suites by convention: `scripts/<name>.ts` + `tests/<name>/<case>/input.<ext>` run as JSSG suites with language inferred from the fixture extension; `tests/<name>/assert-fixtures.ts` runs whole-app trees through the recipe workflow; `tests/**/*.test.ts` runs under `node --test`; every `tests/**/tsconfig.json` is type-checked; workflow structure is validated (local `js_file`/`CODEMOD_SCRIPT` must exist, registry steps rejected). All repository tooling lives in `packages/scripts` as TypeScript bins with `node:test` regression tests (`yarn test:scripts`).

## Consequences

Adding a step never changes a test command, and shell/.mjs drift is gone. The runner itself is now the critical path: changes to discovery rules require updating its regression tests, and helpers need no same-stem fixture suite (tested through entrypoints or focused `node --test` suites).
