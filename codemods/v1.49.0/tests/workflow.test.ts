import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const workflow = readFileSync(new URL('../workflow.yaml', import.meta.url), 'utf8')
const lines = workflow.split('\n').map(line => line.trim())

test('v1.49.0 local scripts run in migration order', () => {
  assert.ok(!lines.includes('codemod:'))
  const scripts = lines.filter(line => line.startsWith('js_file: ')).map(line => line.slice(9))
  assert.deepEqual(scripts, [
    'scripts/rename-bui-header-css-classes.ts',
    'scripts/rename-bui-header-css-classes-css.ts',
    'scripts/remove-catalog-card-variant-props.ts',
    'scripts/migrate-gerrit-gitiles-functions.ts',
    'scripts/remove-any-extension-data-ref.ts',
    'scripts/remove-create-public-sign-in-app.ts',
    'scripts/remove-allow-unknown-extension-config.ts',
  ])
  for (const script of scripts) {
    assert.ok(readFileSync(new URL('../' + script, import.meta.url), 'utf8').length > 0)
  }
})

test('v1.49.0 AI fixup follows all transforms and requires explicit opt-in', () => {
  const param = lines.indexOf('aiFixup:')
  assert.ok(param >= 0)
  assert.equal(lines[param + 1], 'type: boolean')
  assert.equal(lines[param + 2], 'default: false')
  const applyIndex = lines.indexOf('- id: apply-recipe')
  const aiIndex = lines.indexOf('- id: ai-fixup')
  assert.ok(applyIndex >= 0 && aiIndex > applyIndex)
  assert.equal(lines.slice(0, aiIndex).filter(line => line === 'ai:').length, 0)
  const aiNode = lines.slice(aiIndex)
  assert.ok(aiNode.includes("depends_on: ['apply-recipe']"))
  assert.equal(aiNode.filter(line => line === 'if: params.aiFixup == true').length, 1)
  assert.equal(aiNode.filter(line => line === 'ai:').length, 1)
  assert.equal(aiNode[aiNode.indexOf('ai:') - 1], 'if: params.aiFixup == true')
  assert.ok(!aiNode.includes('js-ast-grep:'))
})
