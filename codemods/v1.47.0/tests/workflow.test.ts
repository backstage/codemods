import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const workflow = readFileSync(new URL('../workflow.yaml', import.meta.url), 'utf8');
const lines = workflow.split(String.fromCharCode(10)).map((line) => line.trim());

test('local scripts run in recipe order', () => {
  assert.ok(!lines.includes('codemod:'));
  const scripts = lines.filter((line) => line.startsWith('js_file: ')).map((line) => line.slice(9));
  assert.deepEqual(scripts, ["scripts/rename-bui-css-tokens-v1-47.ts","scripts/rename-bui-css-tokens-v1-47-css.ts","scripts/migrate-table-to-use-table-hook.ts"]);
  for (const script of scripts) {
    assert.ok(readFileSync(new URL('../' + script, import.meta.url), 'utf8').length > 0);
  }
});

test('AI fixups follow all transforms and require explicit opt-in', () => {
  const param = lines.indexOf('aiFixup:');
  assert.equal(lines[param + 1], 'type: boolean');
  assert.equal(lines[param + 2], 'default: false');
  const aiNode = lines.slice(lines.indexOf('- id: ai-fixup'));
  assert.ok(aiNode.includes('depends_on: [apply-recipe]'));
  assert.equal(aiNode.filter((line) => line === 'if: params.aiFixup == true').length, 1);
  assert.equal(aiNode.filter((line) => line === 'ai:').length, 1);
  assert.ok(!aiNode.includes('js-ast-grep:'));
});
