import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const workflow = readFileSync(new URL('../workflow.yaml', import.meta.url), 'utf8');
const scripts = [
  'migrate-nav-item-to-page',
  'portable-schema-method-call',
  'migrate-policy-query-user',
  'rename-header-main-class',
  'rename-header-main-class-css',
  'render-test-app-nav-migration',
  'loading-to-is-pending',
  'loading-to-is-pending-css',
  'experimental-form-decorators-to-stable-yaml',
  'experimental-form-decorators-to-stable',
  'remove-immediate-stitching-mode',
];

test('recipe runs every local transform in the original order', () => {
  assert.doesNotMatch(workflow, /^\s+codemod:/m);
  assert.deepEqual(
    [...workflow.matchAll(/js_file: scripts\/(\S+)\.ts/g)].map((match) => match[1]),
    scripts,
  );
  for (const script of scripts) {
    assert.ok(readFileSync(new URL(`../scripts/${script}.ts`, import.meta.url), 'utf8').length > 0);
  }
});

test('six optional AI fixups depend on the apply node and default to disabled', () => {
  assert.match(workflow, /aiFixup:\s+type: boolean\s+default: false/);
  assert.match(workflow, /id: ai-fixup[\s\S]+depends_on:\s+- apply-recipe/);
  const fixups = workflow.slice(workflow.indexOf('id: ai-fixup'));
  assert.equal([...fixups.matchAll(/if: params\.aiFixup == true/g)].length, 6);
  assert.equal([...fixups.matchAll(/\bai:/g)].length, 6);
});
