# @backstage/migrate-signals-service

Migrates deprecated `SignalService` exports from `@backstage/plugin-signals-node` to their `SignalsService` equivalents.

Targets Backstage **v1.50**+ where the old export names have been removed or deprecated.

## Installation

```bash
# From registry
yarn dlx codemod@latest run @backstage/migrate-signals-service -t /path/to/target
```

## Usage (from this repo)

```bash
yarn dlx codemod@latest workflow run \
  -w codemods/v1.50.0/migrate-signals-service/workflow.yaml \
  -t /path/to/your/backstage-repo
```

## Development

From the repo root:

```bash
yarn install
yarn workspace @backstage/migrate-signals-service test
```

Or from this package directory:

```bash
yarn test
yarn check-types
```
