import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const workflow = readFileSync(new URL('../workflow.yaml', import.meta.url), 'utf8');

test('every codemod step runs a local script, not a registry package', () => {
  assert.doesNotMatch(workflow, /^\s{6}codemod:\s*$/m);
  const jsFiles = [...workflow.matchAll(/js_file: (\S+)/g)].map((match) => match[1]);
  assert.equal(jsFiles.length, 7);
  for (const file of jsFiles) {
    assert.match(file, /^scripts\//);
    assert.ok(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').length > 0);
  }
});

test('shell step references the local openapi shell script', () => {
  assert.match(workflow, /CODEMOD_SCRIPT: 'scripts\/rename-openapi-validate-command-shell\.mjs'/);
});

test('extension config schema step binds default-false aiFixup', () => {
  assert.match(workflow, /params:\s+schema:\s+aiFixup:\s+type: boolean\s+default: false/);
  assert.match(workflow, /if: params\.aiFixup == true/);
});
