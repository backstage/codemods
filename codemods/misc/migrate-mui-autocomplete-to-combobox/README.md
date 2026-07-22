# @backstage/migrate-mui-autocomplete-to-combobox

Heuristically migrates MUI 4 `Autocomplete` to Backstage UI `Combobox` or `SearchAutocomplete`.

## Covers

- Form-like option pickers with string[] literal `options` → `Combobox`
- Clear free-text search (`onInputChange` + word-boundary search/find/filter cue, no selection value) → `SearchAutocomplete`
- Deep and barrel imports from `@material-ui/lab`
- Best-effort option literal flattening for string arrays
- Prunes unused `TextField` imports left behind by `renderInput`

## TODOs left for humans

- Ambiguous Autocomplete usage (left as MUI with a TODO)
- Object `options` / `getOptionLabel` shapes (not safe for BUI Combobox)
- `freeSolo`, custom `renderOption`, and other complex cases
- Non-trivial `onChange` / options shapes

## Won't do

- Perfect API parity for every Autocomplete prop
