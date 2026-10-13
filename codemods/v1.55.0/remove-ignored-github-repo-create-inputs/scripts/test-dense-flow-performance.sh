#!/usr/bin/env bash
# Dense single-file regression: compare exact output bytes and reject the former ~quadratic edit path.
set -euo pipefail
cd "$(dirname "$0")/.."
target=$(mktemp -d)
trap 'rm -rf "$target"' EXIT

run_size() {
  local size=$1 start end
  node - "$target" "$size" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')
const [directory, size] = process.argv.slice(2)
const header = 'apiVersion: scaffolder.backstage.io/v1beta3\nkind: Template\nmetadata:\n  name: dense\nspec:\n  steps:\n'
const input = header + Array.from({ length: Number(size) }, (_, i) =>
  `    - id: create-${String(i).padStart(4, '0')}\n      action: github:repo:create\n      input: { repoUrl: github.com?repo=dense${i}&owner=team, sourcePath: ./skeleton, defaultBranch: main, description: keep-${i} }\n`
).join('')
fs.writeFileSync(path.join(directory, 'dense.yaml'), input)
fs.writeFileSync(path.join(directory, 'expected'), input.replaceAll(', sourcePath: ./skeleton, defaultBranch: main', ''))
NODE
  start=$(node -p 'Date.now()')
  yarn exec codemod workflow run -w workflow.yaml --target "$target" --allow-dirty --no-interactive --disable-analytics >/dev/null
  end=$(node -p 'Date.now()')
  cmp "$target/dense.yaml" "$target/expected"
  rm "$target/expected"
  echo $((end - start))
}

small=$(run_size 600)
large=$(run_size 1200)
echo "dense flow mapping: 600=${small}ms 1200=${large}ms"
if (( large >= 20000 || large * 10 >= small * 28 )); then
  echo 'dense edit application regressed' >&2
  exit 1
fi
