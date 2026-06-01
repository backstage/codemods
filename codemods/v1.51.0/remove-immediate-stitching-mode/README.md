# remove-immediate-stitching-mode

Backstage 1.51.0 codemod: Migrates `catalog.stitchingStrategy.mode: immediate` to `deferred` in app-config YAML files.

## Background

In Backstage 1.51.0, `catalog.stitchingStrategy.mode: immediate` is deprecated. A warning is logged on startup when immediate mode is configured. Immediate mode will be removed in a future Backstage release. Deferred mode is the default.

## What it does

- Scans `app-config.yaml` and `app-config.*.yaml` files
- Finds `catalog.stitchingStrategy.mode: immediate` (any quoting style)
- If `stitchingStrategy` only contains `mode: immediate`, removes the entire block (deferred is the default)
- If other `stitchingStrategy` keys exist, changes only `mode` to `deferred`
- Adds a migration comment under `catalog` documenting the change

## Usage

```bash
# Dry run (preview changes)
npx codemod workflow run \
  -w codemods/v1.51.0/remove-immediate-stitching-mode/workflow.yaml \
  --target /path/to/backstage-app \
  --dry-run

# Apply changes
npx codemod workflow run \
  -w codemods/v1.51.0/remove-immediate-stitching-mode/workflow.yaml \
  --target /path/to/backstage-app
```

## Before / After

```yaml
# Before
catalog:
  stitchingStrategy:
    mode: immediate
```

```yaml
# After
catalog:
  # Migrated by @backstage/remove-immediate-stitching-mode — immediate mode deprecated in 1.51
```

When other stitching settings are present:

```yaml
# Before
catalog:
  stitchingStrategy:
    mode: immediate
    debounceDelayMs: 100
```

```yaml
# After
catalog:
  stitchingStrategy:
    mode: deferred
    debounceDelayMs: 100
  # Migrated by @backstage/remove-immediate-stitching-mode — immediate mode deprecated in 1.51
```

## Notes

- Environment-specific config files (`app-config.production.yaml`, etc.) are included in the scan.
- Files already using `mode: deferred` or without a `stitchingStrategy` block are left unchanged.
