#!/usr/bin/env bash
# Dense single-file regression: compare exact output bytes and reject the former ~quadratic edit path.
set -euo pipefail
cd "$(dirname "$0")/.."
target=$(mktemp -d)
trap 'rm -rf "$target"' EXIT

node - "$target" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')
const directory = process.argv[2]
const header = 'apiVersion: scaffolder.backstage.io/v1beta3\nkind: Template\nmetadata:\n  name: dense\nspec:\n  steps:\n'
const input = header + Array.from({ length: 1200 }, (_, i) =>
  `    - id: create-${String(i).padStart(4, '0')}\n      action: github:repo:create\n      input: { repoUrl: github.com?repo=dense${i}&owner=team, sourcePath: ./skeleton, defaultBranch: main, description: keep-${i} }\n`
).join('')
fs.writeFileSync(path.join(directory, 'input'), input)
fs.writeFileSync(path.join(directory, 'expected'), input.replaceAll(', sourcePath: ./skeleton, defaultBranch: main', ''))
// One character per action changes; size, parser shape, and workflow stay the same.
fs.writeFileSync(path.join(directory, 'noop'), input.replaceAll('action: github:repo:create', 'action: github:repo:creatE'))
NODE

run_flow() {
  local start end
  start=$(node -p 'Date.now()')
  yarn exec codemod workflow run -w workflow.yaml --target "$target" --allow-dirty --no-interactive --disable-analytics >/dev/null
  end=$(node -p 'Date.now()')
  echo $((end - start))
}

noop_times=()
real_times=()
for iteration in 1 2 3; do
  cp "$target/noop" "$target/dense.yaml"
  noop_times+=("$(run_flow)")
  cmp "$target/dense.yaml" "$target/noop"

  cp "$target/input" "$target/dense.yaml"
  real_times+=("$(run_flow)")
  cmp "$target/dense.yaml" "$target/expected"
done
# Reapplying the real workflow must preserve the exact transformed bytes.
run_flow >/dev/null
cmp "$target/dense.yaml" "$target/expected"

noop_median=$(printf '%s\n' "${noop_times[@]}" | sort -n | sed -n '2p')
real_median=$(printf '%s\n' "${real_times[@]}" | sort -n | sed -n '2p')
echo "dense flow mapping (1200 steps): no-op=${noop_median}ms real=${real_median}ms (medians of 3)"
if (( real_median >= noop_median * 5 )); then
  echo 'dense edit application regressed relative to the same-size no-op workflow' >&2
  exit 1
fi
