#!/usr/bin/env bash
# Creates git tags for each codemod whose version was bumped by changesets.
# Outputs the list of changed codemod directories for the publish job.
# Tags follow the pattern: <name>@v<version>

set -euo pipefail

changed_dirs="[]"

for pkg_json in codemods/*/package.json; do
  dir="$(dirname "$pkg_json")"
  name="$(node -p "require('./$pkg_json').name")"
  version="$(node -p "require('./$pkg_json').version")"
  tag="${name}@v${version}"

  if git rev-parse "$tag" >/dev/null 2>&1; then
    echo "Tag $tag already exists, skipping"
    continue
  fi

  echo "Creating tag $tag"
  git tag "$tag"
  changed_dirs="$(echo "$changed_dirs" | node -p "JSON.stringify([...JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')), \"$dir\"])")"
done

git push --tags

echo "changed_dirs=$changed_dirs" >> "$GITHUB_OUTPUT"
