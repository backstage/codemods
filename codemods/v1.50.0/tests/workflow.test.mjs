import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(new URL('../workflow.yaml', import.meta.url), 'utf8');

test('v1.50.0 bundles all transforms in release order', () => {
  const scripts = [...workflow.matchAll(/js_file: '?(scripts\/[^'\n]+)'?/g)].map((match) => match[1]);
  assert.deepEqual(scripts, [
    'scripts/catalog-node-alpha-to-stable.ts',
    'scripts/add-entity-ref-to-location.ts',
    'scripts/add-update-location-method.ts',
    'scripts/migrate-signals-service.ts',
    'scripts/migrate-permissioned-route.ts',
    'scripts/replace-create-schema-from-zod.ts',
    'scripts/header-tab-to-nav-tab-item.ts',
    'scripts/rename-plugin-header-toolbar.ts',
    'scripts/codemod-css.ts',
    'scripts/dialog-api-show-to-open.ts',
    'scripts/humanize-entity-ref-to-presentation.ts',
    'scripts/remove-bootstrap-env-proxy.ts',
  ]);
  assert.doesNotMatch(workflow, /^\s+codemod:/m);
});

test('ten optional AI fixups run after the apply node', () => {
  assert.match(workflow, /aiFixup:\s+type: boolean\s+default: false/);
  const fixups = workflow.slice(workflow.indexOf('- id: \'ai-fixup\''));
  assert.match(fixups, /depends_on:\s+- 'apply-recipe'/);
  assert.equal([...fixups.matchAll(/if: '?params.aiFixup == true'?/g)].length, 10);
  assert.equal([...fixups.matchAll(/\n\s+ai:/g)].length, 10);
});
