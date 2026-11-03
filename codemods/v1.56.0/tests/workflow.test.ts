import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { parse } from 'yaml'

test('v1.56.0 runs all local transforms in migration order', () => {
  const workflow = parse(readFileSync('workflow.yaml', 'utf8'))
  assert.deepEqual(workflow.nodes.map(node => node.id), ['apply-recipe'])
  const transforms = workflow.nodes[0].steps.map(step => step['js-ast-grep'])
  assert.deepEqual(transforms.map(step => step.js_file), [
    'scripts/migrate-catalog-filters-to-query.ts',
    'scripts/remove-atlassian-username-resolver.ts',
    'scripts/remove-atlassian-username-resolver-yaml.ts',
    'scripts/remove-total-items-option.ts',
    'scripts/move-bui-menusection-disabled-keys.ts',
  ])
  assert.deepEqual(transforms.map(step => step.language), ['tsx', 'tsx', 'yaml', 'tsx', 'tsx'])
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
})
