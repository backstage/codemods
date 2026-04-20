# @backstage/location-entityref-required

Backstage 1.50.0 migration codemod that adds the newly required `entityRef: string` field to `Location` object literals from `@backstage/catalog-client`.

## What it does

Backstage 1.50.0 made `entityRef` a required field on the `Location` type exported by `@backstage/catalog-client`. Any code that **constructs or mocks** a `Location` — tests, fixtures, mock implementations — now needs to supply this field.

Production code that only **reads** `Location` values from API responses is unaffected: the backend already populates `entityRef` on the wire.

This codemod detects `Location` literals that need the new field and inserts a placeholder alongside a `TODO` comment for manual follow-up.

### Before

```ts
import type { Location } from '@backstage/catalog-client';

const loc: Location = {
  id: 'abc123',
  type: 'url',
  target: 'https://example.com/catalog-info.yaml',
};
```

### After

```ts
import type { Location } from '@backstage/catalog-client';

const loc: Location = {
  id: 'abc123',
  type: 'url',
  target: 'https://example.com/catalog-info.yaml',
  entityRef: 'location:default/example', // TODO(backstage-codemod): replace with actual entityRef
};
```

The real runtime value looks like `location:default/generated-<sha1hex>` and cannot be computed safely by a codemod, so a placeholder plus a `TODO` is the intentional output.

## Detected patterns

The codemod only acts on object literals that are unambiguously typed as `Location` (or wrapped in a response type from `@backstage/catalog-client`). It handles the local alias used for the import, including type-only imports.

- Variable declarations: `const x: Location = { ... }`
- Array variants: `const xs: Location[] = [...]`, `const xs: Array<Location> = [...]`
- Type assertions: `{ ... } as Location`, `{ ... } satisfies Location` (and array variants)
- Function/method return types: `function f(): Location { return { ... }; }`, `(): Location => ({ ... })`
- `AddLocationResponse` — recurses into the `location: { ... }` property
- `GetLocationsResponse` — recurses into each `data: { ... }` property

### What is skipped

- Objects that already declare an `entityRef` property
- Objects built from a spread (`{ ...existingLocation }`) — they inherit `entityRef`
- Files that do not import `Location`, `AddLocationResponse`, or `GetLocationsResponse` from `@backstage/catalog-client`
- Objects typed as `Location` from a different package

### Known limitations

- **Structural-only inference is intentionally skipped.** Object literals with the shape `{ id, type, target }` but no explicit `Location` type (annotation, cast, satisfies, return type, or nesting inside a response type) are left alone. This avoids false positives on unrelated types. Run the codemod on tests where `Location` is used explicitly, or add an annotation first.
- **Mocks without an explicit return type** (e.g. `jest.fn().mockReturnValue({ id, type, target })` where the mock is untyped) are not detected. Annotate the mock with `jest.Mocked<...>` or the returned expression with `as Location`/`satisfies Location` before running.
- **Single-line object literals** receive the field inline with a `/* */` block comment so the closing brace stays on the same line. Multi-line objects use a `//` line comment on a new line matching the existing indentation. Run your formatter after the codemod if you want a uniform comment style.

### Optional: AI fixup step

Resolving the `TODO` markers by hand is mostly mechanical — read the object's `type`/`target`, decide whether the surrounding test asserts on `entityRef`, then either compute `location:default/generated-<sha1(type:target)>` or pick a readable stable ref. The workflow ships an optional AI-powered step that automates this. Enable it with `--param aiFixup=true`:

- **Assertion-bearing test sites** (`toEqual`/`toMatchObject`/`toMatchSnapshot` against the location, direct `.entityRef` reads, snapshot files) get the deterministic SHA-1 ref inlined as a static string so tests stay self-contained.
- **Presence-only test sites and loose mocks** get a readable `location:default/test-<slug>` derived from nearby naming, keeping diffs human-friendly.
- **Production code** is not rewritten with a real value — the AST codemod's `TODO` is replaced with a `FIXME` note pushing back on the hand-rolled `Location` construction, since the backend should normally populate `entityRef`.

When running inside a coding agent (Claude Code, Cursor, etc.) the AI step hands off `[AI INSTRUCTIONS]` to the parent agent. Otherwise, set `LLM_API_KEY` to execute the step via the configured LLM provider.

## Metrics

The codemod emits `location-entityref-migration` metric increments with cardinality:

- `outcome`: `added`, `skipped-existing`, `skipped-spread`
- `detection`: `type-annotation`, `array-type-annotation`, `as-cast`, `satisfies`, `array-as-cast`, `array-satisfies`, `return-type-annotation`, `add-location-response`, `get-locations-response`

Use a dry run to size the impact before applying.

## Installation

```bash
# From registry
yarn dlx codemod@latest run @backstage/location-entityref-required -t /path/to/target
```

## Usage (from this repo)

```bash
# AST codemod only (deterministic, leaves TODO markers)
yarn dlx codemod@latest workflow run \
  -w codemods/v1.50.0/location-entityref-required/workflow.yaml \
  -t /path/to/your/backstage-repo

# AST codemod + AI fixup for the TODO placeholders
yarn dlx codemod@latest workflow run \
  -w codemods/v1.50.0/location-entityref-required/workflow.yaml \
  -t /path/to/your/backstage-repo \
  --param aiFixup=true

# Dry run (preview changes)
yarn dlx codemod@latest workflow run \
  -w codemods/v1.50.0/location-entityref-required/workflow.yaml \
  -t /path/to/your/backstage-repo \
  --dry-run
```

## Development

From the repo root:

```bash
yarn install
yarn workspace @backstage/location-entityref-required test
```

Or from this package directory:

```bash
yarn test
yarn check-types
```

## License

MIT
