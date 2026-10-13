#!/usr/bin/env bash
# Regression: large changed-file lists reach every gate without exceeding Windows argv limits.
set -euo pipefail

script="$(cd "$(dirname "$0")" && pwd)/check-changed.sh"
fixture=$(mktemp -d)
trap 'rm -rf "$fixture"' EXIT
cd "$fixture"
git init -q
git config core.autocrlf false
printf 'fixture\n' > README.md
git add README.md
git -c user.name=Fixture -c user.email=fixture@example.invalid commit -qm base
git update-ref refs/remotes/origin/main HEAD

mkdir -p changed codemods/misc/fixture/scripts scripts bin calls
for ((i = 1; i <= 110; i++)); do
  printf -v number '%03d' "$i"
  printf 'export const fixture = true;\n' > "changed/${number}_$(printf 'x%.0s' {1..100}).ts"
done
printf 'export const fixture = true;\n' > 'changed/a file with spaces.ts'
printf 'export const fixture = true;\n' > codemods/misc/fixture/scripts/codemod.ts
printf '{"name":"@backstage/fixture"}\n' > codemods/misc/fixture/package.json
printf '#!/usr/bin/env bash\n' > scripts/mixed-shell.sh
git add changed codemods scripts
git -c user.name=Fixture -c user.email=fixture@example.invalid commit -qm changed

cat > bin/yarn <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
count=$(cat "$CALLS/count" 2>/dev/null || echo 0)
count=$((count + 1))
printf '%s\n' "$count" > "$CALLS/count"
printf '%s\n' "$1" "$PWD" "${@:2}" > "$CALLS/$count"
length=0
for arg in "$@"; do length=$((length + ${#arg} + 3)); done
if [ "$length" -gt 4030 ]; then echo 'The command line is too long.' >&2; exit 23; fi
if [ "${FAIL_ON:-}" = "$count" ]; then exit 17; fi
EOF
chmod +x bin/yarn
export CALLS="$fixture/calls" PATH="$fixture/bin:$PATH"

bash "$script" > /dev/null
[ "$(cat calls/count)" -gt 4 ] # Both format and lint must require multiple invocations.
: > actual-format
: > actual-lint
for ((i = 1; i <= $(cat calls/count); i++)); do
  command=$(sed -n '1p' "calls/$i")
  case "$command" in
    format:check) sed '1,2d' "calls/$i" >> actual-format ;;
    lint) sed '1,2d' "calls/$i" >> actual-lint ;;
    test) [ "$(sed -n '2p' "calls/$i")" = "$fixture/codemods/misc/fixture" ] ;;
    readme) [ "$(sed -n '2p' "calls/$i")" = "$fixture" ] ;;
    *) echo "unexpected gate: $command" >&2; exit 1 ;;
  esac
done
git diff --name-only origin/main...HEAD > expected-all
grep -vE '\.sh$' expected-all > expected-format
grep -E '\.(ts|js|mts|mjs|tsx|jsx)$' expected-all > expected-lint
cmp expected-format actual-format
cmp expected-lint actual-lint
[ "$(grep -l '^test$' calls/[0-9]* | wc -l)" -eq 1 ]
[ "$(grep -l '^readme$' calls/[0-9]* | wc -l)" -eq 1 ]

rm -f calls/*
set +e
FAIL_ON=2 bash "$script" > /dev/null
status=$?
set -e
[ "$status" -eq 17 ]
[ "$(cat calls/count)" -eq 2 ] # No later batch or gate runs after a failure.

git update-ref refs/remotes/origin/main HEAD
printf '#!/usr/bin/env bash\n' > scripts/shell-only.sh
git add scripts/shell-only.sh
git -c user.name=Fixture -c user.email=fixture@example.invalid commit -qm shell-only
rm -f calls/*
bash "$script" > /dev/null
[ ! -e calls/count ] # No formatter invocation for an unsupported-only diff.
echo 'check-changed batching regression passed'
