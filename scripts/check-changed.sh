#!/usr/bin/env bash
#
# Shared quality gates for local hooks and CI.
# Checks the merge-base diff against BASE (default: origin/main).
#
# Usage: bash scripts/check-changed.sh [BASE]
#
set -euo pipefail

BASE="${1:-origin/main}"

if ! git rev-parse --verify "$BASE" >/dev/null 2>&1; then
  echo "error: base ref '$BASE' not found. Fetch it first (e.g. git fetch origin main)." >&2
  exit 1
fi

# Portable (macOS bash 3.2 + Linux): build arrays without mapfile.
ALL_FILES=()
while IFS= read -r f; do
  [ -n "$f" ] && ALL_FILES+=("$f")
done < <(git diff --name-only --diff-filter=ACMR "$BASE"...HEAD)

# oxfmt exits 2 when every supplied file is ignored (shell scripts or test fixtures).
FORMAT_FILES=()
for f in "${ALL_FILES[@]}"; do
  case "$f" in
    *.sh|tests/*|tests-*/*|*/tests/*|*/tests-*/*) ;;
    *) FORMAT_FILES+=("$f") ;;
  esac
done

LINT_FILES=()
while IFS= read -r f; do
  [ -n "$f" ] && LINT_FILES+=("$f")
done < <(
  git diff --name-only --diff-filter=ACMR "$BASE"...HEAD | grep -E '\.(ts|js|mts|mjs|tsx|jsx)$' || true
)

CODEMOD_DIRS=()
while IFS= read -r candidate; do
  [ -n "$candidate" ] || continue
  [ -f "$candidate/package.json" ] && CODEMOD_DIRS+=("$candidate")
done < <(
  git diff --name-only "$BASE"...HEAD -- 'codemods/' |
    awk -F/ 'NF>=3 {print $1"/"$2"/"$3}' |
    sort -u
)

# Keep each Yarn invocation below the Windows command-line limit (8191 chars).
# The 4000-char budget leaves room for Yarn, shell quoting, and executable paths.
check_files_in_batches() {
  local check="$1" file batch_length=0
  local batch=()
  shift
  for file in "$@"; do
    if [ "${#batch[@]}" -gt 0 ] && [ "$((batch_length + ${#file} + 3))" -gt 4000 ]; then
      yarn "$check" "${batch[@]}"
      batch=()
      batch_length=0
    fi
    batch+=("$file")
    batch_length=$((batch_length + ${#file} + 3))
  done
  [ "${#batch[@]}" -eq 0 ] || yarn "$check" "${batch[@]}"
}

if [ "${#FORMAT_FILES[@]}" -gt 0 ]; then
  echo "::group::Format check (changed files)"
  check_files_in_batches format:check "${FORMAT_FILES[@]}"
  echo "::endgroup::"
fi

if [ "${#LINT_FILES[@]}" -gt 0 ]; then
  echo "::group::Lint (changed files)"
  check_files_in_batches lint "${LINT_FILES[@]}"
  echo "::endgroup::"
fi

if [ "${#CODEMOD_DIRS[@]}" -gt 0 ]; then
  echo "::group::Package name length check"
  failed=0
  for dir in "${CODEMOD_DIRS[@]}"; do
    name=$(node -p "require('./$dir/package.json').name")
    len=${#name}
    if [ "$len" -gt 50 ]; then
      echo "::error::Package name '$name' is $len chars (max 50 for Codemod registry)"
      failed=1
    fi
  done
  [ "$failed" -eq 0 ]
  echo "::endgroup::"

  echo "::group::Test (changed codemods)"
  for dir in "${CODEMOD_DIRS[@]}"; do
    (cd "$dir" && yarn test)
  done
  echo "::endgroup::"

  echo "::group::README freshness check"
  yarn readme
  if ! git diff --quiet README.md; then
    echo "::error::README.md is out of date. Run 'yarn readme' and commit the result."
    git diff README.md
    exit 1
  fi
  echo "::endgroup::"
fi

echo "All changed-file checks passed (base: $BASE)."
