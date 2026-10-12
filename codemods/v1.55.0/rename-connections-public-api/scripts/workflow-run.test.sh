#!/usr/bin/env bash
set -euo pipefail

workflow_path="workflow.yaml"
codemod_cli="../../../node_modules/codemod/codemod"

repos=()
cleanup() {
  for repo in "${repos[@]:-}"; do
    rm -rf "$repo"
  done
}
trap cleanup EXIT

init_repo() {
  local dir="$1"
  git -C "$dir" init -q
  git -C "$dir" config user.name "Workflow Test"
  git -C "$dir" config user.email "workflow-test@example.com"
  git -C "$dir" add .
  git -C "$dir" commit -qm init
}

run_workflow() {
  local target="$1"
  node "$codemod_cli" workflow run -w "$workflow_path" --target "$target" --allow-dirty --allow-fs --no-interactive >/dev/null
}

assert_positive_case() {
  local repo
  repo="$(mktemp -d -t rename-connections-workflow-test-positive-XXXXXX)"
  repos+=("$repo")

  mkdir -p "$repo/src"
  cat > "$repo/src/positive.ts" <<'EOF'
import { ConnectionAuthValue, LookupStrategy } from '@backstage/connections'

export type Combined = ConnectionAuthValue | LookupStrategy
EOF
  cat > "$repo/src/inert.ts" <<'EOF'
export const unchanged = true
EOF

  init_repo "$repo"
  run_workflow "$repo"

  local changed
  changed="$(git -C "$repo" diff --name-only | tr -d '\r')"
  if [[ "$changed" != "src/positive.ts" ]]; then
    echo "expected only src/positive.ts to change, got: ${changed:-<none>}" >&2
    exit 1
  fi

  grep -q 'ConnectionAuth' "$repo/src/positive.ts"
  grep -q 'ConnectionLookupStrategy' "$repo/src/positive.ts"
  if grep -Eq '\bConnectionAuthValue\b|\bLookupStrategy\b' "$repo/src/positive.ts"; then
    echo 'expected legacy names to be removed from transformed positive.ts' >&2
    exit 1
  fi
}

assert_noop_case() {
  local repo
  repo="$(mktemp -d -t rename-connections-workflow-test-noop-XXXXXX)"
  repos+=("$repo")

  mkdir -p "$repo/src"
  cat > "$repo/src/noop.ts" <<'EOF'
import { notConnections } from '@backstage/core-plugin-api'

export const x = notConnections
EOF
  cat > "$repo/src/extra.tsx" <<'EOF'
export const Widget = () => <div />
EOF

  init_repo "$repo"
  run_workflow "$repo"

  if [[ -n "$(git -C "$repo" diff --name-only)" ]]; then
    echo 'expected no files to change for noop workflow case' >&2
    exit 1
  fi
}

assert_positive_case
assert_noop_case

echo 'workflow-run.test: pass'
