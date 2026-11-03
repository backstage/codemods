# ADR 0003: AST-first codemods, AI fixup only as fallback

- **Status**: Accepted
- **Date**: 2026-04-23
- **Evidence**: `32517ac` (deterministic duck-typing from AI to AST), `a882bc6` (namespace/dynamic import handling from AI to AST), `4526cae` (template literal scanning from AI to AST), `aae72ff` + `ed1608d` (deterministic patterns from AI fixup into AST codemod), `d3734c0` (semantic analysis suggestions), `b5f7380`, `2d936f2` (further AI→AST moves)

## Context

Recipe workflows originally used AI fixup steps for fuzzy transformations (renames scoped to a receiver type, import handling, duck-typed object matching). AI steps are nondeterministic and hard to test. Moving the patterns into deterministic AST transforms then required a series of follow-up fixes to tighten receiver and type scoping (`d12b8fc` guard on call arguments, `8b709dc` narrowing to return types, `38f173a` scoping renames to `DialogApi` receivers) — the cost of getting deterministic detection right.

## Decision

Any pattern that can be expressed deterministically moves into the AST codemod (`js-ast-grep` script with semantic analysis: type anchors, `ref.inside()` for conditional/loop detection, receiver-scoped renames). AI fixup steps remain only for genuinely fuzzy edits the AST cannot decide.

## Consequences

Deterministic, fixture-testable transforms; false-positive fixes land once in the script instead of per-run. Residual AI steps are the explicitly acknowledged fuzzy surface — new PRs should justify keeping a pattern in AI rather than moving it to AST.
