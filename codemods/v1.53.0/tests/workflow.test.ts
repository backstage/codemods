import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { parse } from 'yaml'

const workflow = parse(readFileSync(new URL('../workflow.yaml', import.meta.url), 'utf8'))

test('CIMD rename retains its config-only scope in the local recipe step', () => {
  assert.equal(workflow.nodes.length, 1)
  const [node] = workflow.nodes
  assert.equal(node.id, 'apply-recipe')
  assert.equal(node.name, 'Run the Backstage 1.53.0 config migration')
  assert.deepEqual(node.steps, [
    {
      name: 'Rename deprecated auth.experimentalClientIdMetadataDocuments config key',
      'js-ast-grep': {
        js_file: 'scripts/rename-experimental-cimd-config.ts',
        language: 'yaml',
        include: ['**/app-config*.yaml', '**/app-config*.yml'],
        exclude: ['**/node_modules/**'],
      },
    },
  ])
})
