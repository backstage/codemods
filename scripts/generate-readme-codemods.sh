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

# Render a table for a group of codemods
render_group() {
  local group="$1"
  local group_dir="$CODEMODS_DIR/$group"

  echo "### $group"
  echo ""

  # Only show migration-recipe link for version directories that have one
  if [ -d "$group_dir/migration-recipe" ]; then
    # shellcheck disable=SC2016
    echo "Run the [\`migration-recipe\`](./codemods/$group/migration-recipe) to apply every codemod below in one pass, or run any individual codemod on its own."
    echo ""
  fi

  echo "| Codemod | Description |"
  echo "| ------- | ----------- |"

  for codemod_dir in "$group_dir"/*/; do
    local name
    name=$(basename "$codemod_dir")
    local yaml="$codemod_dir/codemod.yaml"
    [ -f "$yaml" ] || continue

    local desc
    desc=$(grep -m1 '^description:' "$yaml" | sed "s/^description: *'\\(.*\\)'/\\1/;s/^description: *\"\\(.*\\)\"/\\1/;s/^description: *//")
    # Strip "Backstage X.Y.Z: " prefix — the version header already shows it
    desc=$(echo "$desc" | sed 's/^Backstage [0-9.]*: *//')

    echo "| [$name](./codemods/$group/$name) | $desc |"
  done

  echo ""
}

# Separate version directories (v*) from non-version groups (misc, etc.).
# Avoid `mapfile` / array slicing so this works on macOS system bash 3.2.
version_dirs=()
while IFS= read -r line; do
  version_dirs+=("$line")
done < <(ls "$CODEMODS_DIR" | grep '^v' | sort -Vr)

other_dirs=()
while IFS= read -r line; do
  other_dirs+=("$line")
done < <(ls "$CODEMODS_DIR" | grep -v '^v' | grep -v '^\.gitkeep$' | sort)

# Show latest 2 versions
total=${#version_dirs[@]}
show=2
if [ "$total" -lt "$show" ]; then
  show=$total
fi

# Build the section
section=""
i=0
for version in "${version_dirs[@]}"; do
  if [ "$i" -ge "$show" ]; then
    break
  fi
  section+=$(render_group "$version")
  section+=$'\n'
  i=$((i + 1))
done

if [ "$total" -gt "$show" ]; then
  section+="Older versions are available in the [\`codemods/\`](./codemods) directory."$'\n\n'
fi

# Append non-version groups (misc, etc.) if they contain any codemods
for group in "${other_dirs[@]}"; do
  local_dir="$CODEMODS_DIR/$group"
  # Skip empty groups (only .gitkeep) — count subdirectories with codemod.yaml
  codemod_count=$(find "$local_dir" -mindepth 2 -maxdepth 2 -name 'codemod.yaml' 2>/dev/null | head -1 || true)
  if [ -n "$codemod_count" ]; then
    section+=$(render_group "$group")
    section+=$'\n'
  fi
done

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

# Format so the committed output matches what prettier expects
yarn format "$README" >/dev/null 2>&1 || true

echo "✅ README.md updated with ${version_dirs[0]} and ${version_dirs[1]} ($total versions on disk)"
