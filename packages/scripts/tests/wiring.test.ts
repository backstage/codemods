// Regression: every wired entry point (CI workflows, hooks, lint-staged,
// root scripts) invokes the TypeScript bins from @backstage/scripts instead
// of removed bash scripts.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = join(import.meta.dirname, '..', '..', '..')

function read(path: string): string {
  return readFileSync(join(repoRoot, path), 'utf8')
}

test('CI runs the scripts package tests and the shared gates', () => {
  const ci = read('.github/workflows/ci.yml')
  assert.ok(ci.includes('yarn test:scripts'), 'CI must run the scripts package tests')
  assert.ok(ci.includes('yarn check:changed origin/main'), 'CI must run the changed-file gates')
  assert.doesNotMatch(ci, /bash scripts\//)
})

test('release and README-sync workflows call the bins', () => {
  assert.ok(read('.github/workflows/release.yml').includes('yarn tag-and-publish'))
  const syncReadme = read('.github/workflows/sync-readme.yml')
  assert.ok(syncReadme.includes('yarn sync-readme-pr'))
  assert.ok(syncReadme.includes('yarn test'))
  assert.doesNotMatch(read('.github/workflows/release.yml'), /bash scripts\//)
  assert.doesNotMatch(syncReadme, /bash scripts\//)
})

test('root package.json scripts and devDependency use the bins', () => {
  const manifest = JSON.parse(read('package.json')) as { scripts: Record<string, string>; devDependencies: Record<string, string> }
  assert.equal(manifest.scripts['version-packages'], 'changeset version && sync-codemod-versions')
  assert.equal(manifest.scripts['readme'], 'generate-readme-codemods')
  assert.equal(manifest.scripts['check:changed'], 'check-changed')
  assert.ok(manifest.devDependencies['@backstage/scripts'] !== undefined)
})

test('lint-staged and husky hooks use the bins', () => {
  const lintstagedrc = read('.lintstagedrc.json')
  assert.ok(lintstagedrc.includes('"format-staged"'))
  assert.ok(lintstagedrc.includes('"test-staged"'))
  assert.doesNotMatch(lintstagedrc, /bash scripts\//)
  const prePush = read('.husky/pre-push')
  assert.ok(prePush.includes('yarn check:changed origin/main'))
})
