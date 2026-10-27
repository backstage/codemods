#!/usr/bin/env bash
# Repo-wide test runner for migration recipes (codemods/<version>/migration-recipe).
# A recipe's package.json test script is:
#   "test": "bash ../../../scripts/run-recipe-tests.sh"
#
# Suites are discovered by convention; adding a script or fixture suite needs
# no change to any test command:
#
#   scripts/<name>.ts  +  tests/<name>/<case>/input.<ext>  -> codemod jssg test
#     (ext ts/tsx -> language tsx, json -> json, yaml/yml -> yaml; fixture roots
#      without JSSG input files, e.g. .sh suites, are skipped here and covered
#      by their node --test suites)
#   tests/<name>/assert-fixtures.sh                         -> workflow fixture run
#   tests/**/tsconfig.json                                  -> tsc -p
#   tests/**/*.test.mjs                                     -> node --test
# plus codemod workflow validate.
#
# --list prints the planned suites and commands without running them.
set -euo pipefail

recipe_dir=$PWD
if [ ! -f "$recipe_dir/workflow.yaml" ]; then
  echo "error: run this from a recipe directory containing workflow.yaml (got $recipe_dir)" >&2
  exit 1
fi

list_only=false
[ "${1:-}" = '--list' ] && list_only=true

run() {
  if $list_only; then
    printf '  %s\n' "$*"
  else
    "$@"
  fi
}

# --- JSSG fixture suites, one per scripts/<name>.ts with a matching tests/<name>/
for script_file in scripts/*.ts; do
  name=$(basename "$script_file" .ts)
  fixture_root="tests/$name"
  [ -d "$fixture_root" ] || continue

  lang=''
  for input in "$fixture_root"/*/input.*; do
    [ -f "$input" ] || continue
    case "${input##*.}" in
      ts | tsx) discovered=tsx ;;
      json) discovered=json ;;
      yaml | yml) discovered=yaml ;;
      *) continue ;;
    esac
    if [ -n "$lang" ] && [ "$lang" != "$discovered" ]; then
      echo "error: $fixture_root mixes fixture languages ($lang and $discovered)" >&2
      exit 1
    fi
    lang=$discovered
  done
  # No JSSG input files (e.g. shell fixtures): covered by node --test suites.
  [ -n "$lang" ] || continue

  echo "== jssg test: $name ($lang)"
  run yarn exec codemod jssg test -l "$lang" "$script_file" "$fixture_root"
done

# --- Workflow-level fixture suites
for fixture_runner in tests/*/assert-fixtures.sh; do
  [ -f "$fixture_runner" ] || continue
  echo "== workflow fixtures: $fixture_runner"
  run bash "$fixture_runner"
done

# --- Fixture type checks
while IFS= read -r tsconfig; do
  echo "== tsc: $tsconfig"
  run yarn exec tsc -p "$tsconfig"
done < <(find tests -name tsconfig.json -not -path '*/node_modules/*' | sort)

# --- Node unit tests
while IFS= read -r -d '' test_file; do
  echo "== node --test: $test_file"
  run node --test "$test_file"
done < <(find tests -name '*.test.mjs' -not -path '*/node_modules/*' -print0 | sort -z)

# --- Workflow schema
echo "== codemod workflow validate"
run yarn exec codemod workflow validate -w workflow.yaml
