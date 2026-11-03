import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const workflow = readFileSync(new URL('../workflow.yaml', import.meta.url), 'utf8');

test('v1.48.0 runs local transforms in migration order before optional AI fixups', () => {
  assert.doesNotMatch(workflow, /^\s+codemod:/m);
  assert.deepEqual([...workflow.matchAll(/js_file: (\S+)/g)].map(match => match[1]), [
    'scripts/rename-bui-css-tokens-v1-48.ts',
    'scripts/rename-bui-css-tokens-v1-48-css.ts',
    'scripts/remove-alert-surface-prop.ts',
    'scripts/migrate-surface-to-bg-system.ts',
    'scripts/migrate-column-config-to-react-element.ts',
    'scripts/rename-header-to-plugin-header.ts',
    'scripts/migrate-blueprints-to-plugin-app-react.ts',
    'scripts/migrate-app-experimental-packages.ts',
  ]);
  assert.match(workflow, /aiFixup:\s+type: boolean\s+default: false/);
  assert.deepEqual([...workflow.matchAll(/  - id: (\S+)/g)].map(match => match[1]), [
    'apply-recipe',
    'ai-fixup',
  ]);
  const fixup = workflow.split('  - id: ai-fixup')[1];
  assert.match(fixup, /depends_on: \[apply-recipe\]/);
  assert.equal([...fixup.matchAll(/if: params.aiFixup == true/g)].length, 2);
  assert.equal([...fixup.matchAll(/\n        ai:/g)].length, 2);
});
