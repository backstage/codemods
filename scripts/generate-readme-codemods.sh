#!/usr/bin/env bash
#
# Generate the "## Codemods" section of README.md from the filesystem.
# Shows the latest 2 versions expanded, older versions in a <details> block.
# Reads codemod.yaml description fields and writes between markers.
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

# Collect all versions (newest first)
mapfile -t all_versions < <(ls "$CODEMODS_DIR" | sort -Vr)
total=${#all_versions[@]}

# Build the section
section=""

# Latest 2 versions expanded
for version in "${all_versions[@]:0:2}"; do
  section+=$(render_version "$version")
  section+=$'\n'
done

# Older versions in a collapsible block
if [ "$total" -gt 2 ]; then
  oldest="${all_versions[$((total - 1))]}"
  third="${all_versions[2]}"
  older_count=$((total - 2))

  section+="<details>"$'\n'
  section+="<summary>Older versions ($third – $oldest — $older_count more)</summary>"$'\n\n'

  for version in "${all_versions[@]:2}"; do
    section+=$(render_version "$version")
    section+=$'\n'
  done

  section+="</details>"$'\n\n'
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
echo "✅ README.md updated with $total version(s) (${all_versions[0]}, ${all_versions[1]} expanded; $((total - 2)) collapsed)"
