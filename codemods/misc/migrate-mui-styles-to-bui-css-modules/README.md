# migrate-mui-styles-to-bui-css-modules

Migrates static `makeStyles` / `withStyles` usage to adjacent CSS modules during the MUI 4 → BUI migration.

## CSS module coverage

Fixture harness skips persisting adjacent CSS modules for `tests/<case>/input.tsx`. Fixtures that emit `css-module-file-written` keep a golden `expected.module.css`, and `scripts/assert-css-goldens.sh` applies the package workflow to assert written CSS matches the golden.
