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

test('steps run in dependency order', () => {
  const order = [
    'scripts/move-connections-backend-imports.ts',
    'scripts/migrate-connections-query.ts',
    'scripts/rename-root-connection-auth.ts',
    // The zod index feeds the transform through workflow state.
    'scripts/migrate-extension-config-schema-index.ts',
    'scripts/migrate-extension-config-schema.ts',
    // The shell step reads state set by the package.json step.
    'scripts/rename-openapi-validate-command-package-json.ts',
    'scripts/rename-openapi-validate-command-ci-yaml.ts',
  ];
  let position = -1;
  for (const script of order) {
    const index = workflow.indexOf(script);
    assert.ok(index > position, `${script} must come after the preceding step`);
    position = index;
  }
  assert.ok(workflow.indexOf("name: 'Update shell scripts'") > position);
});

test('shell step payload is quoted for sh and cmd compatibility', () => {
  // An unquoted parenthesized node -e payload is an sh syntax error on Linux.
  const runLine = workflow.split('\n').find((line) => line.includes("run: 'node -e"));
  assert.ok(runLine !== undefined, 'run step not found');
  assert.match(runLine, /run: 'node -e "import\(require\(process\.env\.CODEMOD_URL_MODULE\)/);
  assert.match(runLine, /\)" \$\{\{ state\.targetDirEncoded \}\}'/);
});
