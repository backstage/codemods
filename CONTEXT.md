# Context

Codemod recipes for Backstage release migrations, published to the [Codemod registry](https://codemod.com). One recipe package per Backstage release under `codemods/<version>/`, plus a misc recipe under `codemods/misc/`. Repository tooling lives in the private `packages/scripts` workspace package.

## Layout

```
codemods/<version>/     # one published migration-recipe package per release
  scripts/<name>.ts     # transform entrypoints (js-ast-grep targets)
  tests/<name>/         # JSSG fixture suites + node:test suites
  workflow.yaml         # steps reference local scripts
  codemod.yaml / package.json / README.md
codemods/misc/          # non-release recipes (mui4-to-bui)
packages/scripts/       # gates, generators, release helpers, recipe runner
docs/agents/            # agent config: tracker, triage labels, domain rules
docs/adr/               # architecture decision records
.agents/skills/         # repo skills (codemod authoring, release research)
```

## Where knowledge lives

- **Contributor conventions and release flow**: [`CONTRIBUTING.md`](./CONTRIBUTING.md) — read end-to-end before opening a PR.
- **Agent pointers and failure modes**: [`AGENTS.md`](./AGENTS.md), [`REVIEW.md`](./REVIEW.md).
- **Architectural decisions and why**: [`docs/adr/`](./docs/adr/).
- **Repo skills**: [`.agents/skills/`](./.agents/skills/) — `codemod` (implementation), `backstage-codemod-issue-research` (release planning), `validate-codemod-recipe`.
- **Agent config**: [`docs/agents/`](./docs/agents/) — issue tracker, triage labels, domain docs.

## Working rules that are easy to miss

- Every PR that changes a codemod needs a changeset — CI does not enforce it.
- Versions in `package.json` / `codemod.yaml` are owned by Changesets and the release pipeline; never hand-edit.
- The root README is generated; it regenerates on the Version Packages PR, so codemod PRs leave it unchanged.
