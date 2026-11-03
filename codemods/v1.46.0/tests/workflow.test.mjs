import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const workflow = readFileSync(new URL('../workflow.yaml', import.meta.url), 'utf8');
const lines = workflow.split(String.fromCharCode(10)).map((line) => line.trim());

test('local scripts run in recipe order', () => {
  assert.ok(!lines.includes('codemod:'));
  const scripts = lines.filter((line) => line.startsWith('js_file: ')).map((line) => line.slice(9));
  assert.deepEqual(scripts, ["scripts/add-jest-peer-dependency.ts","scripts/migrate-valkey-config.ts"]);
  for (const script of scripts) {
    assert.ok(readFileSync(new URL('../' + script, import.meta.url), 'utf8').length > 0);
  }
});

test('Jest version remains configurable with default 30', () => {
  const param = lines.indexOf('jestVersion:');
  assert.equal(lines[param + 1], 'type: string');
  assert.equal(lines[param + 2], "default: '30'");
});
