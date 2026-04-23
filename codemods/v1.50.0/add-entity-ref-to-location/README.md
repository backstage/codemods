# add-entity-ref-to-location

Backstage 1.50.0 codemod: Adds the required `entityRef` field to `Location` object literals from `@backstage/catalog-client`.

## Background

In Backstage 1.50.0, the `Location` type in `@backstage/catalog-client` now includes a required `entityRef: string` field. Any code constructing or mocking `Location` objects (tests, fixtures, mock implementations) must include this field.

Production code consuming `Location` from API responses is unaffected -- the backend already populates `entityRef`.

## What it does

- Detects `Location` object literals with explicit type annotations (`: Location`, `satisfies Location`, `as Location`)
- Detects nested `Location` objects inside `AddLocationResponse`-typed variables
- Adds `entityRef: 'location:default/example'` with a `TODO(backstage-codemod)` comment for manual follow-up
- Skips objects that use spread (`{ ...existingLocation }`) since they inherit the field
- Skips objects that already have an `entityRef` property

## Usage

```bash
# Dry run (preview changes)
npx codemod workflow run \
  -w codemods/v1.50.0/add-entity-ref-to-location/workflow.yaml \
  --target /path/to/backstage-app \
  --dry-run

# Apply changes
npx codemod workflow run \
  -w codemods/v1.50.0/add-entity-ref-to-location/workflow.yaml \
  --target /path/to/backstage-app

# With AI fixup for edge cases
npx codemod workflow run \
  -w codemods/v1.50.0/add-entity-ref-to-location/workflow.yaml \
  --target /path/to/backstage-app \
  --param aiFixup=true
```

## Before / After

```ts
// Before
const loc: Location = {
  id: 'abc123',
  type: 'url',
  target: 'https://example.com/catalog-info.yaml',
}
```

```ts
// After
const loc: Location = {
  id: 'abc123',
  type: 'url',
  target: 'https://example.com/catalog-info.yaml',
  entityRef: 'location:default/example', // TODO(backstage-codemod): replace with actual entityRef
}
```

## Notes

- The real `entityRef` format is `location:default/generated-<sha1hex>`. The codemod uses a placeholder since the actual value cannot be computed statically.
- After running the codemod, search for `TODO(backstage-codemod)` to find all locations that need manual attention.
- The optional AI fixup step (`--param aiFixup=true`) can handle edge cases like inferred types, dynamic mock setups, and test assertion objects.
