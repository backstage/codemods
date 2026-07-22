# @backstage/migrate-mui-styles-to-bui-css-modules

Migrates static `makeStyles` / `withStyles` usage to adjacent CSS modules during the MUI 4 → BUI migration.

## Covers

- Static `makeStyles` / `withStyles` style objects → sibling `*.module.css`
- ClassName wiring updated to CSS module imports where deterministic

## TODOs / won't-do

- Dynamic theme callbacks / nested selectors that need human rewrite
- Runtime style factories that cannot be serialized to CSS modules
- Fixture harness skips persisting adjacent CSS for `tests/<case>/input.tsx`; goldens use `expected.module.css` + `scripts/assert-css-goldens.sh`

## Test

```bash
yarn test
```
