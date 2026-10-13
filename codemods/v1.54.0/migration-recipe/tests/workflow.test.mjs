import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const workflow = readFileSync(new URL('../workflow.yaml', import.meta.url), 'utf8');

test('extension config schema step binds default-false aiFixup', () => {
  assert.match(
    workflow,
    /params:\s+schema:\s+aiFixup:\s+type: boolean\s+default: false/,
  );
  assert.match(
    workflow,
    /name: 'Migrate extension config schemas to Standard Schema values'\s+codemod:\s+source: '@backstage\/migrate-extension-config-schema'\s+args: \['aiFixup'\]/,
  );
});
