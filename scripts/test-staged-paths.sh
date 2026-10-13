#!/usr/bin/env bash
set -euo pipefail

script="$(cd "$(dirname "$0")" && pwd)/test-staged.sh"
fixture=$(mktemp -d)
trap 'rm -rf "$fixture"' EXIT
first="$fixture/repo with spaces/codemods/misc/first"
second="$fixture/repo with spaces/codemods/misc/second"
mkdir -p "$first/scripts" "$second/scripts" "$fixture/bin"
printf '{}\n' > "$first/package.json"
printf '{}\n' > "$second/package.json"
cat > "$fixture/bin/yarn" <<'EOF'
#!/usr/bin/env bash
case "$1" in
  lint-staged) shift; exec "$LINT_STAGED" --concurrent false "$@" ;;
  format|lint) exit 0 ;;
  test)
    if [ "${HOOK_TEST:-}" = 1 ]; then
      pkg=${PWD##*/}
      printf 'test:%s\n' "$pkg" >> "$CALLS"
      if [ "$pkg" = "${FAIL_PKG:-}" ]; then exit 17; fi
    else
      printf 'test:%s\n' "$PWD" >> "$CALLS"
      if [ "$PWD" = "${FAIL_PKG:-}" ]; then exit 17; fi
    fi
    ;;
esac
EOF
chmod +x "$fixture/bin/yarn"
export PATH="$fixture/bin:$PATH" CALLS="$fixture/calls"

bash "$script"
[ ! -e "$CALLS" ]

bash "$script" "$first/scripts/a.ts" "$first/scripts/b.ts" "$second/scripts/c.ts"
printf 'test:%s\ntest:%s\n' "$first" "$second" > "$fixture/expected"
cmp "$fixture/expected" "$CALLS"

: > "$CALLS"
status=0
FAIL_PKG="$second" bash "$script" "$first/scripts/a.ts" "$first/scripts/b.ts" "$second/scripts/c.ts" || status=$?
[ "$status" -eq 17 ]
cmp "$fixture/expected" "$CALLS"

# Exercise the real pre-commit hook and lint-staged selection in an isolated repo.
repo="$fixture/repo with spaces"
root="$(cd "$(dirname "$script")/.." && pwd)"
mkdir -p "$repo/.husky" "$repo/scripts" "$repo/node_modules/.bin"
cp "$root/.lintstagedrc.json" "$repo/"
cp "$root/.husky/pre-commit" "$repo/.husky/"
cp "$script" "$root/scripts/format-staged.sh" "$repo/scripts/"
printf '#!/usr/bin/env sh\nexec "$LINT_STAGED" --concurrent false "$@"\n' > "$repo/node_modules/.bin/lint-staged"
chmod +x "$repo/node_modules/.bin/lint-staged"
printf '{"scripts":{"format":"node -e \\"process.exit(0)\\"","lint":"node -e \\"process.exit(0)\\""}}\n' > "$repo/package.json"
printf '{"scripts":{"test":"node ../../../test.js"}}\n' > "$first/package.json"
printf '{"scripts":{"test":"node ../../../test.js"}}\n' > "$second/package.json"
cat > "$repo/test.js" <<'EOF'
const fs = require('fs');
const path = require('path');
const pkg = path.basename(process.cwd());
fs.appendFileSync(process.env.CALLS, `test:${pkg}\n`);
if (pkg === process.env.FAIL_PKG) process.exit(17);
EOF
printf 'export const a = true;\n' > "$first/scripts/a.ts"
printf 'export const b = true;\n' > "$first/scripts/b.ts"
printf 'export const c = true;\n' > "$second/scripts/c.ts"
git -C "$repo" init -q
git -C "$repo" -c core.hooksPath=/dev/null -c user.name=Fixture -c user.email=fixture@example.invalid commit --allow-empty -qm base
git -C "$repo" add codemods/misc/first/scripts codemods/misc/second/scripts
export LINT_STAGED="$root/node_modules/.bin/lint-staged"
printf 'test:first\ntest:second\n' > "$fixture/expected-hook"
: > "$CALLS"
(cd "$repo" && HOOK_TEST=1 sh .husky/pre-commit) > "$fixture/hook-success" 2>&1 || { cat "$fixture/hook-success"; exit 1; }
cmp "$fixture/expected-hook" "$CALLS"

: > "$CALLS"
status=0
(cd "$repo" && HOOK_TEST=1 FAIL_PKG=second sh .husky/pre-commit) > "$fixture/hook-failure" 2>&1 || status=$?
[ "$status" -ne 0 ]
cmp "$fixture/expected-hook" "$CALLS"
echo 'staged package path-space/deduplication/failure and hook regression passed'
