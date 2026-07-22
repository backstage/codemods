#!/usr/bin/env bash
#
# Asserts CSS module goldens for fixtures that emit css-module-file-written.
#
# Fixture harness skips sidecar CSS persistence for tests/<case>/input.tsx, so
# this script applies the package workflow and compares written CSS to
# expected.module.css.
#
set -euo pipefail

PACKAGE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TESTS_ROOT="$PACKAGE_ROOT/tests"
FAILED=0

shopt -s nullglob
fixtures=()
for expected in "$TESTS_ROOT"/*/expected.module.css; do
  fixtures+=("$(basename "$(dirname "$expected")")")
done

if [ "${#fixtures[@]}" -eq 0 ]; then
  echo "No fixtures with expected.module.css found" >&2
  exit 1
fi

for fixture in "${fixtures[@]}"; do
  fixture_dir="$TESTS_ROOT/$fixture"
  work_dir="$(mktemp -d "${TMPDIR:-/tmp}/mui-styles-${fixture}-XXXXXX")"

  cp "$fixture_dir/input.tsx" "$work_dir/input.tsx"
  if [ -f "$fixture_dir/input.module.css" ]; then
    cp "$fixture_dir/input.module.css" "$work_dir/input.module.css"
  fi

  set +e
  (
    cd "$PACKAGE_ROOT"
    yarn exec codemod workflow run \
      -w "$PACKAGE_ROOT/workflow.yaml" \
      --target "$work_dir" \
      --no-interactive \
      --allow-dirty \
      --allow-fs
  )
  run_status=$?
  set -e

  if [ "$run_status" -ne 0 ]; then
    echo "FAIL $fixture: workflow run failed" >&2
    rm -rf "$work_dir"
    FAILED=$((FAILED + 1))
    continue
  fi

  if ! python3 - "$work_dir/input.module.css" "$fixture_dir/expected.module.css" <<'PY'
from pathlib import Path
import sys

written = Path(sys.argv[1]).read_text().rstrip()
expected = Path(sys.argv[2]).read_text().rstrip()
if written != expected:
    print(f"FAIL: CSS module mismatch", file=sys.stderr)
    print("--- expected ---", file=sys.stderr)
    print(expected, file=sys.stderr)
    print("--- written ---", file=sys.stderr)
    print(written, file=sys.stderr)
    raise SystemExit(1)
PY
  then
    rm -rf "$work_dir"
    FAILED=$((FAILED + 1))
    continue
  fi

  echo "PASS $fixture"
  rm -rf "$work_dir"
done

if [ "$FAILED" -gt 0 ]; then
  exit 1
fi
