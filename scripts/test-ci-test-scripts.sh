#!/usr/bin/env bash
# Exercise the CI step itself: discover every test script and stop on failure.
set -euo pipefail

scripts_dir=$(cd "$(dirname "$0")" && pwd)
workflow="$scripts_dir/../.github/workflows/ci.yml"
run=$(awk '
  /^      - name: Test shell scripts$/ { step = 1; next }
  step && /^        run: \|$/ { body = 1; next }
  body && /^          / { sub(/^          /, ""); print; next }
  body { exit }
' "$workflow")
[ -n "$run" ]

fixture=$(mktemp -d)
trap 'rm -rf "$fixture"' EXIT
mkdir -p "$fixture/path with spaces/scripts"
for script in "$scripts_dir"/test-*.sh; do
  name=$(basename "$script")
  printf '%s\n' "$name" >> "$fixture/expected"
  cat > "$fixture/path with spaces/scripts/$name" <<'EOF'
#!/usr/bin/env bash
name=$(basename "$0")
printf '%s\n' "$name" >> "$RUN_LOG"
if [ "$name" = "${FAIL_SCRIPT:-}" ]; then exit 17; fi
EOF
done
export RUN_LOG="$fixture/actual"
(cd "$fixture/path with spaces" && bash -e -o pipefail -c "$run")
cmp "$fixture/expected" "$RUN_LOG"

: > "$RUN_LOG"
first_script=$(head -n 1 "$fixture/expected")
status=0
(cd "$fixture/path with spaces" && FAIL_SCRIPT="$first_script" bash -e -o pipefail -c "$run") || status=$?
[ "$status" -eq 17 ]
[ "$(cat "$RUN_LOG")" = "$first_script" ]
echo 'CI test-script discovery and failure regression passed'
