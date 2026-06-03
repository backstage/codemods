#!/usr/bin/env bash
#
# Generate the "## Codemods" section of README.md from the filesystem.
# Shows only the latest 2 versions. Older versions are discoverable
# by browsing the codemods/ directory.
#
# Usage: bash scripts/generate-readme-codemods.sh
#        yarn readme
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
README="$REPO_ROOT/README.md"
CODEMODS_DIR="$REPO_ROOT/codemods"

START_MARKER="<!-- CODEMODS_START -->"
END_MARKER="<!-- CODEMODS_END -->"

# Render a version table
render_version() {
  local version="$1"
  local version_dir="$CODEMODS_DIR/$version"

  echo "### $version"
  echo ""
  # shellcheck disable=SC2016
  echo "Run the [\`migration-recipe\`](./codemods/$version/migration-recipe) to apply every codemod below in one pass, or run any individual codemod on its own."
  echo ""
  echo "| Codemod | Description |"
  echo "| ------- | ----------- |"

  for codemod_dir in "$version_dir"/*/; do
    local name
    name=$(basename "$codemod_dir")
    local yaml="$codemod_dir/codemod.yaml"
    [ -f "$yaml" ] || continue

    local desc
    desc=$(grep -m1 '^description:' "$yaml" | sed "s/^description: *'\\(.*\\)'/\\1/;s/^description: *\"\\(.*\\)\"/\\1/;s/^description: *//")
    # Strip "Backstage X.Y.Z: " prefix — the version header already shows it
    desc=$(echo "$desc" | sed 's/^Backstage [0-9.]*: *//')

    echo "| [$name](./codemods/$version/$name) | $desc |"
  done

  echo ""
}

# Collect all versions (newest first), show only latest 2
mapfile -t all_versions < <(ls "$CODEMODS_DIR" | sort -Vr)
total=${#all_versions[@]}
show=2
if [ "$total" -lt "$show" ]; then
  show=$total
fi

# Build the section
section=""
for version in "${all_versions[@]:0:$show}"; do
  section+=$(render_version "$version")
  section+=$'\n'
done

if [ "$total" -gt "$show" ]; then
  section+="Older versions are available in the [\`codemods/\`](./codemods) directory."$'\n\n'
fi

# Check markers exist
if ! grep -q "$START_MARKER" "$README"; then
  echo "ERROR: $START_MARKER not found in README.md"
  echo "Add these markers around the Codemods section:"
  echo "  $START_MARKER"
  echo "  $END_MARKER"
  exit 1
fi

# Replace content between markers
awk -v start="$START_MARKER" -v end="$END_MARKER" -v content="$section" '
  $0 ~ start { print; printf "%s", content; skip=1; next }
  $0 ~ end   { skip=0 }
  !skip      { print }
' "$README" > "$README.tmp"

mv "$README.tmp" "$README"
echo "✅ README.md updated with ${all_versions[0]} and ${all_versions[1]} ($total total on disk)"
