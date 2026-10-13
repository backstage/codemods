# Rename RootConnectionAuth

Backstage 1.54.0 renames the `@backstage/connections` type `RootConnectionAuth` to `ConfiguredConnectionAuth`. This codemod updates TypeScript and TSX type imports, re-exports, and references bound to those imports, including aliases, namespace members, generic arguments and constraints, and inline `import('@backstage/connections').RootConnectionAuth` types. It preserves comments when removing duplicate imports or re-exports.

Unrelated local symbols, runtime import expressions, other modules, and `@backstage/connections/config` are not changed.

## Usage

```bash
# Preview changes in your Backstage app before applying them.
yarn dlx codemod@latest run @backstage/rename-root-connection-auth \
  --target /path/to/backstage-app \
  --dry-run

yarn dlx codemod@latest run @backstage/rename-root-connection-auth \
  --target /path/to/backstage-app
```

## Development

From this package directory, run `yarn test` for fixtures and workflow validation. From the repository root, run `yarn format:check`, `yarn lint`, `yarn test`, and `yarn check:changed`.
