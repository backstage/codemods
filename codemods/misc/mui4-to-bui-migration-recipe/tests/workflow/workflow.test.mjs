import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const root = new URL('../../', import.meta.url)
const workflow = readFileSync(new URL('workflow.yaml', root), 'utf8')

test('local mirror preserves bundled workflow', () => {
  assert.equal(
    readFileSync(new URL('workflow.local.yaml', root), 'utf8').split('\n').slice(1).join('\n'),
    workflow,
  )
})

test('bootstrap precedes transforms and dependency cleanup follows them', () => {
  assert.match(workflow, /id: apply-recipe/)
  const scripts = [...workflow.matchAll(/js_file: '?([^'\n]+)'?/g)].map(match => match[1])
  assert.equal(scripts.length, 28)
  assert.equal(new Set(scripts).size, 28)
  assert.deepEqual(scripts.slice(0, 2), [
    'scripts/migrate-mui-bootstrap-to-bui-package-json-codemod.ts',
    'scripts/migrate-mui-bootstrap-to-bui.ts',
  ])
  assert.deepEqual(scripts.slice(-2), [
    'scripts/remove-mui-dependencies.ts',
    'scripts/remove-mui-dependencies-package-json-codemod.ts',
  ])
})

test('styles transform writes expected CSS module goldens', () => {
  const result = spawnSync('bash', ['scripts/migrate-mui-styles-to-bui-css-modules-assert-css-goldens.sh'], {
    cwd: root,
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, `${result.error ?? ''}\n${result.stdout}\n${result.stderr}`)
})
