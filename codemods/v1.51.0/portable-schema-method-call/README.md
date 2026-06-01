# @backstage/portable-schema-method-call

Backstage 1.51.0 migration codemod that rewrites `PortableSchema.schema` property access to method calls.

## What it does

In Backstage 1.51.0, the deprecated property form of `PortableSchema.schema` was removed from `@backstage/frontend-plugin-api`. The `schema` member is now a plain method and must be called as `schema()`.

This codemod rewrites:

- `portableSchema.schema.type` -> `portableSchema.schema().type`
- `config.schema.properties` -> `config.schema().properties`
- Optional chaining: `schema?.type` -> `schema()?.type`

The codemod only rewrites `.schema.<jsonSchemaProp>` when the receiver is typed as `PortableSchema` (or a local alias), and only in files that import or reference `PortableSchema`. Unrelated `.schema` members — including config objects in files that import other symbols from `@backstage/frontend-plugin-api` — are left unchanged.

### What is NOT migrated (AST step)

- Bare assignments like `const s = x.schema` (no JSON Schema property access) — use `--param aiFixup=true` or migrate manually
- Type-only references to the old property form
- Unrelated config objects that happen to use a `schema` property name

### Optional: AI fixup step

Enable with `--param aiFixup=true`:

- Fixes remaining `.schema.type` / `.schema.properties` without `()`
- Migrates `const s = portable.schema` value assignments
- Reverts false positives on non-PortableSchema `.schema` members
- Updates type annotations referencing the old property form

## Installation

```bash
# From registry
yarn dlx codemod@latest run @backstage/portable-schema-method-call -t /path/to/target
```

## Usage (from this repo)

```bash
# AST codemod only (deterministic)
yarn dlx codemod@latest workflow run \
  -w codemods/v1.51.0/portable-schema-method-call/workflow.yaml \
  -t /path/to/your/backstage-repo

# AST codemod + AI fixup for edge cases
yarn dlx codemod@latest workflow run \
  -w codemods/v1.51.0/portable-schema-method-call/workflow.yaml \
  -t /path/to/your/backstage-repo \
  --param aiFixup=true

# Dry run (preview changes)
yarn dlx codemod@latest workflow run \
  -w codemods/v1.51.0/portable-schema-method-call/workflow.yaml \
  -t /path/to/your/backstage-repo \
  --dry-run
```

## Development

From the repo root:

```bash
yarn install
yarn workspace @backstage/portable-schema-method-call test
```

Or from this package directory:

```bash
yarn test
```

## License

MIT
