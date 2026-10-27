#!/usr/bin/env bash
# Regression: the recipe test runner discovers suites by convention and
# --list prints the plan without executing anything.
set -euo pipefail

script="$(cd "$(dirname "$0")" && pwd)/run-recipe-tests.sh"
fixture=$(mktemp -d)
trap 'rm -rf "$fixture"' EXIT
cd "$fixture"

printf 'version: 1\n' > workflow.yaml
mkdir -p scripts "tests/alpha/case-ts" "tests/alpha/case-tsx" "tests/beta/case" \
  "tests/gamma/case" "tests/delta/case" "tests/epsilon" "tests/zeta/typed-extension" tests/unit
printf 'export const a = 1;\n' > scripts/alpha.ts
printf 'export const b = 2;\n' > scripts/beta.ts
printf 'export const c = 3;\n' > scripts/gamma.ts
printf 'export const d = 4;\n' > scripts/delta.ts
printf 'export const lib = true;\n' > scripts/lib.js
printf 'fixture\n' > "tests/alpha/case-ts/input.ts"
printf 'fixture\n' > "tests/alpha/case-tsx/input.tsx"
printf '{"fixture":true}\n' > "tests/beta/case/input.json"
printf 'fixture: true\n' > "tests/gamma/case/input.yaml"
printf 'fixture\n' > "tests/delta/case/input.sh"
printf '#!/usr/bin/env bash\nprintf ran > tests/epsilon/ran\n' > tests/epsilon/assert-fixtures.sh
printf '{}\n' > tests/zeta/typed-extension/tsconfig.json
printf "import { test } from 'node:test'\ntest('unit', () => {})\n" > tests/unit.test.mjs

plan=$(bash "$script" --list)

# JSSG suites: one per script with a matching fixture root, language inferred
# from the input extension; ts and tsx fold into tsx; delta (.sh) and lib.js
# are skipped; epsilon and zeta are not jssg suites.
expected_plan='== jssg test: alpha (tsx)
  yarn exec codemod jssg test -l tsx scripts/alpha.ts tests/alpha
== jssg test: beta (json)
  yarn exec codemod jssg test -l json scripts/beta.ts tests/beta
== jssg test: gamma (yaml)
  yarn exec codemod jssg test -l yaml scripts/gamma.ts tests/gamma
== workflow fixtures: tests/epsilon/assert-fixtures.sh
  bash tests/epsilon/assert-fixtures.sh
== tsc: tests/zeta/typed-extension/tsconfig.json
  yarn exec tsc -p tests/zeta/typed-extension/tsconfig.json
== node --test: tests/unit.test.mjs
  node --test tests/unit.test.mjs
== codemod workflow validate
  yarn exec codemod workflow validate -w workflow.yaml'

if [ "$plan" != "$expected_plan" ]; then
  diff <(printf '%s\n' "$expected_plan") <(printf '%s\n' "$plan") || true
  echo 'error: unexpected discovery plan' >&2
  exit 1
fi

# Nothing was executed: --list must not run the discovered suites.
[ ! -e tests/epsilon/ran ]

# Mixed fixture languages in one suite must fail loudly.
mkdir -p "tests/alpha/case-mixed"
printf 'fixture\n' > "tests/alpha/case-mixed/input.json"
if bash "$script" --list >/dev/null 2>&1; then
  echo 'error: mixed fixture languages were not rejected' >&2
  exit 1
fi

# Running outside a recipe directory must fail loudly.
cd "$fixture/tests"
if bash "$script" --list >/dev/null 2>&1; then
  echo 'error: running outside a recipe directory was not rejected' >&2
  exit 1
fi

echo 'run-recipe-tests: ok'
