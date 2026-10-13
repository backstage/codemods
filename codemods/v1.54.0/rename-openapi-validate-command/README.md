# Rename OpenAPI validation command (Backstage 1.54.0)

Renames executable `backstage-repo-tools repo schema openapi verify` to `... validate`. Only the command token changes; flags, quoting, environment assignments and shell operators remain. The removed `repo schema openapi test` command from 1.53 is unrelated.

Targets: `package.json` script values (JSON AST), GitHub Actions `.github/workflows/*.yml` and `*.yaml` `run` scalars (YAML AST), and `.sh` files (bounded shell lexer). Historical text, comments, shell aliases, substitutions, concatenated words, here-documents, and unclear command construction stay unchanged; review those manually. The shell pass skips symlinks, hard-linked `.sh` files (`nlink > 1`), `docs`, `.git`, `node_modules`, and generated directories. Hard-linked files must be updated manually after checking every link location: writing one link in place could mutate an outside-target file. No AI fixup or extra file permissions are needed.

From a consumer repository containing a root `package.json`:

```bash
yarn dlx codemod@latest run @backstage/rename-openapi-validate-command -t /path/to/repo --dry-run
yarn dlx codemod@latest run @backstage/rename-openapi-validate-command -t /path/to/repo
```

For local development (before registry publication), use `yarn exec codemod workflow run -w workflow.yaml -t /path/to/repo --dry-run` from this package. The workflow's automatic shell step uses the root package JSON step to preserve the explicit target path across steps; a target without root `package.json` cannot supply that path. A dry-run does not execute the host shell step. After applying, inspect the actual `.sh` and CI YAML diff; workflow completion alone does not prove any matching commands existed. If a CLI run pauses, verify target scoping before resuming and inspect the resulting diff; a separate `workflow resume` can lose the original `-t` target in CLI 1.18.3.

Development: `yarn test` runs JSON/YAML AST fixtures, shell tests and workflow validation. `yarn format`, `yarn lint`, and `yarn test` run the repository checks.
