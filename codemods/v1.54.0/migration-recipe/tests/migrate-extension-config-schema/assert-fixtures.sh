#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

# Each fixture is a full app tree; the whole recipe workflow must succeed on it
# and produce exactly the expected output. The other steps are expected to
# no-op on these fixtures, which the diff verifies.
for fixture in tests/migrate-extension-config-schema/*/; do
  scratch=$(mktemp -d "tests/.fixture-XXXXXX")
  trap 'rm -rf "$scratch"' EXIT
  cp -R "${fixture}input/." "$scratch/"
  log=$(mktemp)
  yarn exec codemod workflow run -w workflow.yaml -t "$scratch" --allow-dirty --no-interactive --format jsonl > "$log" 2>&1 || { cat "$log"; exit 1; }
  if ! grep -q '"outcome":"success"' "$log" || grep -q '"outcome":"failure"' "$log"; then
    cat "$log"
    exit 1
  fi
  rm "$log"
  diff -ru "${fixture}expected" "$scratch"
  rm -rf "$scratch"
  trap - EXIT
  echo "passed: ${fixture%/}"
done
