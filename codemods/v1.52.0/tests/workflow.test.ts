import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const workflow = readFileSync(new URL('../workflow.yaml', import.meta.url), 'utf8');

test('v1.52.0 workflow preserves script order, including both CSS transforms', () => {
  assert.doesNotMatch(workflow, /^\s+codemod:/m);
  assert.deepEqual(
    [...workflow.matchAll(/js_file: (\S+)/g)].map((match) => match[1]),
    [
      'scripts/migrate-bui-props-to-intersection.ts',
      'scripts/migrate-bui-props-to-intersection-css.ts',
      'scripts/remove-stitching-strategy-mode.ts',
      'scripts/rename-bui-css-tokens-v1-52.ts',
      'scripts/rename-bui-css-tokens-v1-52-css.ts',
      'scripts/migrate-select-combobox-props.ts',
    ],
  );
  assert.match(workflow, /id: apply-recipe/);
});
