# @backstage/render-test-app-nav-migration

Migrates tests that use `renderInTestApp` with `nav-item` features to `renderTestApp`, which uses the real Backstage app shell in Backstage **v1.51**+.

Targets tests that passed `features` with `nav-item` extensions and asserted on stub sidebar links. Tests that only mount a component with APIs or route refs are left unchanged.

## Installation

```bash
# From registry
yarn dlx codemod@latest run @backstage/render-test-app-nav-migration -t /path/to/target
```

## Usage (from this repo)

```bash
yarn dlx codemod@latest workflow run \
  -w codemods/v1.51.0/render-test-app-nav-migration/workflow.yaml \
  -t /path/to/your/backstage-repo

# With AI fixup for edge cases
yarn dlx codemod@latest workflow run \
  -w codemods/v1.51.0/render-test-app-nav-migration/workflow.yaml \
  -t /path/to/your/backstage-repo \
  --param aiFixup=true
```

### Optional: AI fixup step

Enable with `--param aiFixup=true` to finish test migrations the AST codemod cannot handle mechanically:

- Remaining `renderInTestApp` calls with nav features
- Rewrite sidebar/link assertions for the real app shell
- Preserve needed `mountedRoutes` / API options from the original call
- Skip tests that only use `renderInTestApp` without nav features

## Development

From the repo root:

```bash
yarn install
yarn workspace @backstage/render-test-app-nav-migration test
```

Or from this package directory:

```bash
yarn test
```
