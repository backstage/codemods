# Migrate extension config schemas (Backstage 1.54.0)

Lifts inline, expression-only Zod factories in `config.schema` to top-level Standard Schema values in `configSchema` for imported frontend-plugin-api extension and blueprint calls. Preserves factory access to `config` and other option properties. Only packages directly declaring an unambiguous Zod 4-only version specifier are auto-migrated; mixed or open-ended ranges receive review TODOs. Shadowed local blueprint receivers and comments on the `config` pair also remain unchanged for review. This codemod never edits dependency versions. Unsupported factories, closures, mixed schema values, and ambiguous wrappers remain unchanged with `TODO(backstage-codemod)`.

```bash
codemod workflow run -w codemods/v1.54.0/migrate-extension-config-schema/workflow.yaml -t /path/to/target --dry-run
codemod workflow run -w codemods/v1.54.0/migrate-extension-config-schema/workflow.yaml -t /path/to/target
```

`aiFixup` defaults to `false`. The optional AI step inspects unresolved in-scope factories only. Enable it only in a disposable worktree with a configured, approved OpenAI work provider; do not select `openai-codex`. Codemod CLI 1.18.3 rejects `--agent openai`, and skips AI without credentials even though the workflow reports success; this step has **not** been validated. Review all changes and type-check changed target packages. A recipe does not automatically forward this package's parameter.

Develop: `yarn workspace @backstage/migrate-extension-config-schema test` (fixtures, typed expected extension against `@backstage/frontend-plugin-api` and Zod v4, workflow validation), `yarn lint`, `yarn format:check`.
