# @backstage/experimental-form-decorators-to-stable

Renames deprecated `EXPERIMENTAL_formDecorators` to `formDecorators` in Backstage scaffolder template specs.

Targets Backstage **v1.51.0**+ where form decorators were promoted from experimental to public.

## Installation

```bash
# From registry
yarn dlx codemod@latest run @backstage/experimental-form-decorators-to-stable -t /path/to/target
```

## Usage (from this repo)

```bash
yarn dlx codemod@latest workflow run \
  -w codemods/v1.51.0/experimental-form-decorators-to-stable/workflow.yaml \
  -t /path/to/your/backstage-repo
```

## Development

From the repo root:

```bash
yarn install
yarn workspace @backstage/experimental-form-decorators-to-stable test
```

Or from this package directory:

```bash
yarn test
```
