# @backstage/add-update-location-method

Backstage 1.50.0 migration codemod that adds the required `updateLocation` method to `CatalogApi` and `CatalogService` implementations.

## What it does

Starting in Backstage 1.50.0, the `CatalogApi` (from `@backstage/catalog-client`) and `CatalogService` (from `@backstage/plugin-catalog-node`) interfaces require an `updateLocation` method. The default `CatalogClient` already includes it -- this codemod only affects custom implementations and test mocks.

### Class implementations

For classes with `implements CatalogApi` or `implements CatalogService`, the codemod adds a throwing stub method:

```ts
async updateLocation(
  id: string,
  location: { type?: string; target: string },
  options?: CatalogRequestOptions, // or `options: CatalogServiceRequestOptions` for CatalogService
): Promise<Location> {
  throw new Error('updateLocation not implemented'); // TODO(backstage-codemod): implement updateLocation
}
```

The codemod also adds missing `Location` and options type imports as needed.

### Test mocks

For mock objects typed as `jest.Mocked<CatalogApi>`, `vi.Mocked<CatalogApi>`, `Partial<jest.Mocked<CatalogApi>>`, or cast via `as unknown as jest.Mocked<CatalogApi>`, the codemod adds:

```ts
updateLocation: jest.fn(), // or vi.fn() based on existing mock calls
```

### Skipped cases

- Classes/mocks that already have `updateLocation` defined are left unchanged
- Objects not typed with `CatalogApi` or `CatalogService` are left unchanged
- Duck-typed objects (no explicit `implements` clause or `Mocked<CatalogApi>` type) require manual migration

### Known limitations

- **Duck-typed objects**: Objects that satisfy the CatalogApi interface without an explicit type annotation are not detected. Use the AI fixup step or migrate manually.
- **Factory functions**: Functions that return `CatalogApi`-typed objects are not detected.
- **Proxy/wrapper patterns**: Dynamic implementations wrapping CatalogApi are not detected.

### Optional: AI fixup step

Enable with `--param aiFixup=true` to address edge cases the AST codemod cannot handle mechanically (duck-typed objects, factory functions, proxy patterns).

## Installation

```bash
# From registry
yarn dlx codemod@latest run @backstage/add-update-location-method -t /path/to/target
```

## Usage (from this repo)

```bash
# AST codemod only (deterministic)
yarn dlx codemod@latest workflow run \
  -w codemods/v1.50.0/add-update-location-method/workflow.yaml \
  -t /path/to/your/backstage-repo

# AST codemod + AI fixup for edge cases
yarn dlx codemod@latest workflow run \
  -w codemods/v1.50.0/add-update-location-method/workflow.yaml \
  -t /path/to/your/backstage-repo \
  --param aiFixup=true

# Dry run (preview changes)
yarn dlx codemod@latest workflow run \
  -w codemods/v1.50.0/add-update-location-method/workflow.yaml \
  -t /path/to/your/backstage-repo \
  --dry-run
```

## Development

From the repo root:

```bash
yarn install
yarn workspace @backstage/add-update-location-method test
```

Or from this package directory:

```bash
yarn test
yarn check-types
```
