#!/usr/bin/env bash
set -euo pipefail

dirs=()
for file in "$@"; do
  dir=$(dirname "$file")
  pkg_dir=$(cd "$dir" && cd .. && pwd)
  dirs+=("$pkg_dir")
done

unique_dirs=($(printf '%s\n' "${dirs[@]}" | sort -u))

for pkg in "${unique_dirs[@]}"; do
  if [ -f "$pkg/package.json" ]; then
    (cd "$pkg" && yarn test)
  fi
done
