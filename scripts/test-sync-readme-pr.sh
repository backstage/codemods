#!/usr/bin/env bash
# Exercise generation idempotence and the safe create/update/no-op branch lifecycle locally.
set -euo pipefail

scripts_dir=$(cd "$(dirname "$0")" && pwd)
workflow="$scripts_dir/../.github/workflows/sync-readme.yml"
for line in \
  '  workflow_dispatch:' \
  '  contents: write' \
  '  pull-requests: write' \
  '  cancel-in-progress: false' \
  '        run: test "$GITHUB_REF" = refs/heads/main' \
  '          ref: main' \
  '          yarn format:check' \
  '          yarn lint' \
  '          yarn test' \
  '          cmp README.md "$RUNNER_TEMP/generated-readme.md"' \
  '          bash scripts/test-sync-readme-pr.sh' \
  '          GH_TOKEN: ${{ github.token }}' \
  '        run: bash scripts/sync-readme-pr.sh'; do
  grep -Fqx "$line" "$workflow"
done
fixture=$(mktemp -d)
trap 'rm -rf "$fixture"' EXIT
mkdir -p "$fixture/bin" "$fixture/generator/scripts" "$fixture/generator/codemods/v1.2.0/example" "$fixture/generator/codemods/v1.1.0/example"
cp "$scripts_dir/generate-readme-codemods.sh" "$fixture/generator/scripts/"
printf '# Codemods\n<!-- CODEMODS_START -->\n<!-- CODEMODS_END -->\n' > "$fixture/generator/README.md"
printf "description: 'Example migration'\n" > "$fixture/generator/codemods/v1.2.0/example/codemod.yaml"
printf "description: 'Older migration'\n" > "$fixture/generator/codemods/v1.1.0/example/codemod.yaml"
printf '#!/usr/bin/env bash\nexit 0\n' > "$fixture/bin/yarn"
chmod +x "$fixture/bin/yarn"
PATH="$fixture/bin:$PATH" bash "$fixture/generator/scripts/generate-readme-codemods.sh" > /dev/null
cp "$fixture/generator/README.md" "$fixture/generated"
PATH="$fixture/bin:$PATH" bash "$fixture/generator/scripts/generate-readme-codemods.sh" > /dev/null
cmp "$fixture/generated" "$fixture/generator/README.md"
grep -q 'Example migration' "$fixture/generated"

cat > "$fixture/bin/gh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s %s\n' "$1" "$2" >> "$GH_CALLS"
case "$1 $2" in
  'pr list') [ ! -f "$GH_OPEN_PR" ] || printf '1 github-actions[bot]\n' ;;
  'pr create') touch "$GH_OPEN_PR"; echo 'https://example.invalid/pull/1' ;;
  *) exit 1 ;;
esac
EOF
chmod +x "$fixture/bin/gh"
export GH_CALLS="$fixture/gh-calls" GH_OPEN_PR="$fixture/open-pr" PATH="$fixture/bin:$PATH"
git init -q --bare "$fixture/remote.git"
git init -q -b main "$fixture/seed"
(
  cd "$fixture/seed"
  git config user.name Fixture
  git config user.email fixture@example.invalid
  printf 'old README\n' > README.md
  git add README.md
  git commit -qm base
  git remote add origin "$fixture/remote.git"
  git push -q -u origin main
)
git -C "$fixture/remote.git" symbolic-ref HEAD refs/heads/main

git clone -q "$fixture/remote.git" "$fixture/first"
(
  cd "$fixture/first"
  printf 'generated README v1\n' > README.md
  bash "$scripts_dir/sync-readme-pr.sh" > /dev/null
)
[ "$(grep -c '^pr create$' "$GH_CALLS")" -eq 1 ]
first_head=$(git -C "$fixture/remote.git" rev-parse refs/heads/automation/readme-sync)

git clone -q "$fixture/remote.git" "$fixture/no-op"
(
  cd "$fixture/no-op"
  bash "$scripts_dir/sync-readme-pr.sh" > /dev/null
)
[ "$(git -C "$fixture/remote.git" rev-parse refs/heads/automation/readme-sync)" = "$first_head" ]
[ "$(wc -l < "$GH_CALLS")" -eq 2 ] # Only the first run listed/created a PR.

(
  cd "$fixture/seed"
  printf 'new codemod\n' > codemod.yaml
  git add codemod.yaml
  git commit -qm 'add codemod'
  git push -q origin main
)
git clone -q "$fixture/remote.git" "$fixture/update"
(
  cd "$fixture/update"
  printf 'generated README v2\n' > README.md
  bash "$scripts_dir/sync-readme-pr.sh" > /dev/null
)
[ "$(grep -c '^pr create$' "$GH_CALLS")" -eq 1 ]
[ "$(git -C "$fixture/remote.git" diff --name-only main...automation/readme-sync)" = README.md ]
[ "$(git -C "$fixture/remote.git" show automation/readme-sync:README.md)" = 'generated README v2' ]

# After merge, the retained bot branch can advance without a force-push.
(
  cd "$fixture/seed"
  git fetch -q origin
  git merge -q --no-ff origin/automation/readme-sync
  printf 'another codemod\n' > another-codemod.yaml
  git add another-codemod.yaml
  git commit -qm 'add another codemod'
  git push -q origin main
)
rm "$GH_OPEN_PR" # Merging closes the previous PR.
git clone -q "$fixture/remote.git" "$fixture/after-merge"
(
  cd "$fixture/after-merge"
  printf 'generated README v3\n' > README.md
  bash "$scripts_dir/sync-readme-pr.sh" > /dev/null
)
[ "$(grep -c '^pr create$' "$GH_CALLS")" -eq 2 ]
[ "$(git -C "$fixture/remote.git" diff --name-only main...automation/readme-sync)" = README.md ]

# A foreign branch is never overwritten (even if it occupies the stable name).
(
  cd "$fixture/seed"
  git switch -qc foreign
  printf 'foreign\n' > README.md
  git add README.md
  git commit -qm foreign
  git push -q --force origin HEAD:refs/heads/automation/readme-sync
)
foreign_head=$(git -C "$fixture/remote.git" rev-parse refs/heads/automation/readme-sync)
git clone -q "$fixture/remote.git" "$fixture/foreign"
(
  cd "$fixture/foreign"
  printf 'generated README v4\n' > README.md
  if bash "$scripts_dir/sync-readme-pr.sh" > /dev/null 2>&1; then
    echo 'Foreign branch was accepted.' >&2
    exit 1
  fi
)
[ "$(git -C "$fixture/remote.git" rev-parse refs/heads/automation/readme-sync)" = "$foreign_head" ]
echo 'README sync regression passed'
