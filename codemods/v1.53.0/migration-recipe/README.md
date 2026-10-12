# v1.53.0-migration-recipe

Run the eligible Backstage 1.53.0 config migration from the [Codemod Registry](https://go.codemod.com/registry). This recipe covers the mechanical rename only; not every breaking change in 1.53.0 needs or supports a codemod. Review the [Backstage 1.53.0 release notes](https://backstage.io/docs/releases/v1.53.0/) and the manual steps below.

## What it runs

| #   | Registry package                                                                                                            | Scope                                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1   | [`@backstage/rename-experimental-cimd-config`](https://go.codemod.com/registry?q=backstage+rename-experimental-cimd-config) | Deprecated `auth.experimentalClientIdMetadataDocuments` YAML key |

## Usage

Run after `@backstage/rename-experimental-cimd-config` is published to the registry. Until then, the workflow can be validated locally but cannot run end-to-end.

```bash
# Dry-run first
yarn dlx codemod@latest run @backstage/v1-53-0-migration-recipe \
  --target /path/to/backstage-app \
  --dry-run

# Apply after reviewing the dry-run
yarn dlx codemod@latest run @backstage/v1-53-0-migration-recipe \
  --target /path/to/backstage-app
```

The workflow resolves its single `codemod:` step from the registry. It has no transform script or fixtures of its own; `yarn test` in this package validates the workflow schema. No 1.53.0 codemod has an `aiFixup` parameter, so this recipe exposes no AI fixup flag.

If upgrading across releases, first run the existing [`@backstage/remove-bootstrap-env-proxy`](https://go.codemod.com/registry?q=backstage+remove-bootstrap-env-proxy) migration from 1.50.0 for the removed `bootstrapEnvProxyAgents` export. Do not expect this recipe to repeat it.

## Manual migration

These 1.53.0 changes require project-specific work rather than a blanket source rewrite:

- **OpenAPI test server:** Update actual `wrapInOpenApiTestServer` callers and tests to the async `wrapServer` contract. No consumer matches were found in the checked upstream/plugin repositories; there is no safe call-site rewrite to include here.
- **OpenAPI tooling:** Replace Optic CLI installation and root dependency with oasdiff, review changed diff output, and remove or rethink OpenAPI `init` and `test` commands. Those commands have no direct replacement.
- **MCP transport:** Migrate SSE clients to Streamable HTTP endpoints, including client configuration outside this repository.
- **Proxy deployments:** After removing the legacy bootstrap proxy call, configure Node's `NODE_USE_ENV_PROXY=1` and any corporate proxy deployment settings as appropriate. The 1.50.0 codemod removes the old call; it does not configure runtime environments.
- **Catalog alpha UI:** Customize entity headers and context menus using BUI/data output and suitable icons; this requires UI design. Previous source-level `icon`/`useProps` patterns remain, so blanket AST rewrites are unsafe. Add new translations where localized messages are supplied.
- **Configuration schema imports:** Configuration schemas now validate imported types. Correct invalid schema imports on a case-by-case basis, not through a source-wide syntax rewrite.
- **Connections auth labels:** Supply a meaningful human-readable `title` for each custom Connections auth method.
- **Client identity/security:** Moving from Dynamic Client Registration to Client ID Metadata Documents (CIMD) is a security and operational decision. The recipe only renames a deprecated config key; it does not make that decision or migrate an entire DCR deployment.
