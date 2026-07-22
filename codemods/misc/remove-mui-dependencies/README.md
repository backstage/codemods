# @backstage/remove-mui-dependencies

Removes unused `@material-ui/*` dependencies from `package.json` after source migration.

## Covers

- Scans TS/TSX for remaining Material UI imports
- Drops unused `@material-ui/*` entries from package manifests
- Intended as the **last** step in the MUI 4 → BUI recipe

## TODOs / won't-do

- Does not rewrite source imports (run component codemods first)
- Does not remove transitive / workspace-hoisted deps outside the scanned package

## Test

```bash
yarn test
```
