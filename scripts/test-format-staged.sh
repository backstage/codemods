#!/usr/bin/env bash
set -euo pipefail

scripts_dir=$(cd "$(dirname "$0")" && pwd)
[ "$(grep -Fc '"bash scripts/format-staged.sh"' "$scripts_dir/../.lintstagedrc.json")" -eq 2 ]
fixture=$(mktemp -d)
trap 'rm -rf "$fixture"' EXIT
mkdir -p "$fixture/bin"
cat > "$fixture/bin/yarn" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$@" > "$CALLS"
exit "${FORMAT_EXIT:-0}"
EOF
chmod +x "$fixture/bin/yarn"
export PATH="$fixture/bin:$PATH" CALLS="$fixture/calls"

bash "$scripts_dir/format-staged.sh" \
  'codemods/misc/example/tests/fixture/metrics.json' \
  'C:\repo\codemods\misc\example\tests-css\fixture\input.css'
[ ! -e "$CALLS" ]

bash "$scripts_dir/format-staged.sh" \
  'codemods/misc/example/tests/fixture/metrics.json' \
  'docs/file with spaces.md' \
  'C:\repo\codemods\misc\example\tests-css\fixture\input.css' \
  'src/code.ts'
printf '%s\n' format 'docs/file with spaces.md' 'src/code.ts' > "$fixture/expected"
cmp "$fixture/expected" "$CALLS"

rm "$CALLS"
status=0
FORMAT_EXIT=17 bash "$scripts_dir/format-staged.sh" 'src/code.ts' || status=$?
[ "$status" -eq 17 ]
[ -e "$CALLS" ]
echo 'staged formatter ignored-fixture regression passed'
