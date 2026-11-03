import { execSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// The shared recipe runner does not infer CSS fixture languages.
test('rename-bui-css-tokens-v1-47-css fixtures', () => {
  execSync(
    'yarn exec codemod jssg test -l css scripts/rename-bui-css-tokens-v1-47-css.ts tests/rename-bui-css-tokens-v1-47-css',
    { cwd: fileURLToPath(new URL('../../', import.meta.url)), stdio: 'inherit' },
  );
});
