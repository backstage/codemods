# remove-relations-compatibility-config

Backstage 1.55.0 codemod: Removes deprecated `catalog.enableRelationsCompatibility` from app-config YAML files.

## What it does

- Scans `app-config*.yaml` and `app-config*.yml` files.
- Removes `enableRelationsCompatibility` only when it is a direct child of `catalog`.
- Removes an empty `catalog` block when that key was its only remaining setting, except when preserving catalog comments (keeps `catalog: {}` with comments).

## What it does not do

- Does **not** rewrite relation `target` object fields to `targetRef`.

Backstage 1.55.0 removes the compatibility config key, but relation consumer updates can be application-specific. Manually review relation `target` consumers in your codebase after running this codemod.
