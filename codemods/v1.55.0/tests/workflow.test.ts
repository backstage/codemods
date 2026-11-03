import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { parse } from 'yaml'

test('v1.55.0 runs all six local transforms in migration order', () => {
  const workflow = parse(readFileSync('workflow.yaml', 'utf8'))
  assert.deepEqual(workflow.nodes.map(node => node.id), ['apply-recipe'])
  const transforms = workflow.nodes[0].steps.map(step => step['js-ast-grep'])
  assert.deepEqual(transforms.map(step => step.js_file), [
    'scripts/rename-connections-public-api.ts',
    'scripts/move-connections-config-imports.ts',
    'scripts/remove-relations-compatibility-config.ts',
    'scripts/remove-bui-anchor-render-props.ts',
    'scripts/remove-kubernetes-implicit-children.ts',
    'scripts/remove-ignored-github-repo-create-inputs.ts',
  ])
  assert.deepEqual(transforms.map(step => step.language), ['tsx', 'tsx', 'yaml', 'tsx', 'tsx', 'yaml'])
  assert.deepEqual(transforms[2].include, [
    '**/app-config.yaml',
    '**/app-config.*.yaml',
    '**/app-config.yml',
    '**/app-config.*.yml',
  ])
  for (const step of transforms) {
    assert.deepEqual(step.exclude, ['**/node_modules/**'])
    if (step.language === 'tsx') {
      assert.equal(step.semantic_analysis, 'file')
      assert.deepEqual(step.include, ['**/*.ts', '**/*.tsx'])
    }
  }
  assert.deepEqual(transforms[5].include, ['**/*.yaml', '**/*.yml'])
})
