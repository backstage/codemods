# migrate-valkey-config

Backstage 1.46.0 codemod: Migrate Valkey cache configuration to new native options.

## Background

The Valkey cache configuration in `@backstage/backend-defaults@0.14.0` now uses Valkey-native options. Projects using `store: valkey` must update their `app-config.yaml` to replace `namespace`/`keyPrefixSeparator` with `keyPrefix` and remove unsupported `clearBatchSize`/`useUnlink` options.

## What it does

- Scans `app-config.yaml` and `app-config.*.yaml` files
- Detects `backend.cache.store: valkey` configuration
- Combines `namespace` + `keyPrefixSeparator` into `keyPrefix`
- If only `namespace` exists (no separator), uses `:` as default separator
- Removes `clearBatchSize` and `useUnlink` options (no Valkey equivalent)
- Does NOT modify `store: redis` configurations
- Adds a migration comment documenting the change

## Usage

```bash
# Dry run (preview changes)
npx codemod workflow run \
  -w codemods/v1.46.0/migrate-valkey-config/workflow.yaml \
  --target /path/to/backstage-app \
  --dry-run

# Apply changes
npx codemod workflow run \
  -w codemods/v1.46.0/migrate-valkey-config/workflow.yaml \
  --target /path/to/backstage-app
```

## Known limitations

- **Dotted-key form is not supported.** The codemod only handles the nested
  YAML form (`backend: cache: store: …`). If your config uses dotted keys
  (e.g. `backend.cache.store: valkey`), you must migrate those entries manually.

## Notes

- Only applies to `store: valkey` — Redis configurations are untouched
- If `keyPrefix` already exists alongside `namespace`, `keyPrefix` is preserved and `namespace` is removed
- YAML comments near the modified keys are preserved where possible
