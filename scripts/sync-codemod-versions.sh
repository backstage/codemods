#!/usr/bin/env bash
# Syncs the version field in each codemod's codemod.yaml with its package.json.
# Run after `changeset version` to keep both files in sync.

set -euo pipefail

for pkg_json in codemods/*/package.json; do
  dir="$(dirname "$pkg_json")"
  codemod_yaml="$dir/codemod.yaml"

  if [ ! -f "$codemod_yaml" ]; then
    continue
  fi

  version="$(node -p "require('./$pkg_json').version")"
  # Replace the version line in codemod.yaml
  sed -i'' -e "s/^version: .*/version: \"$version\"/" "$codemod_yaml"

  echo "Synced $codemod_yaml to version $version"
done
