import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rewriteCommand } from '../../scripts/rename-techdocs-cli-serve-flags-command.ts'

test('rewrites TechDocs serve flags for supported invocation forms only', () => {
  for (const command of [
    'techdocs-cli', '@techdocs/cli', './node_modules/.bin/techdocs-cli', 'node_modules/.bin/techdocs-cli',
    'yarn techdocs-cli', 'pnpm exec techdocs-cli', 'npm exec -- techdocs-cli', 'npx @techdocs/cli',
    'npx -y @techdocs/cli@latest', 'npx --yes @techdocs/cli@1.15.0', 'yarn dlx @techdocs/cli',
    'pnpm dlx @techdocs/cli@latest', 'bunx @techdocs/cli', 'env FOO=bar techdocs-cli',
  ]) {
    assert.equal(rewriteCommand(`${command} serve --mkdocs-port=8001`), `${command} serve --engine-port=8001`)
  }
  for (const [input, expected] of [
    ['yarn techdocs-cli serve --mkdocs-config-file-name docs.yml --mkdocs-parameter-strict', 'yarn techdocs-cli serve --config-file-name docs.yml --parameter-strict'],
    ['techdocs-cli serve "--mkdocs-port" "$PORT"', 'techdocs-cli serve "--engine-port" "$PORT"'],
    ['techdocs-cli serve --mkdocs-port="$PORT" && mkdocs serve --mkdocs-port 2', 'techdocs-cli serve --engine-port="$PORT" && mkdocs serve --mkdocs-port 2'],
    ...[
      'techdocs-cli generate --mkdocs-port 1', 'mkdocs serve --mkdocs-port 1',
      'echo "techdocs-cli serve --mkdocs-port 1"', '# techdocs-cli serve --mkdocs-port 1',
      'techdocs-cli serve --engine-port 1', 'techdocs-cli serve --mkdocs-portable',
      'echo $(techdocs-cli serve --mkdocs-port 1)', "alias techdocs-cli='echo'\ntechdocs-cli serve --mkdocs-port 1",
      'npm techdocs-cli serve --mkdocs-port 1', 'npx @techdocs/cli-other@latest serve --mkdocs-port 1',
      'cat <<EOF\ntechdocs-cli serve --mkdocs-port 1\nEOF',
    ].map((input) => [input, input]),
  ]) {
    assert.equal(rewriteCommand(input), expected, input)
  }
})
