import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { linkSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')
const script = join(packageRoot, 'scripts', 'rename-techdocs-cli-serve-flags-shell.ts')
const input = 'techdocs-cli serve --mkdocs-port 8001\n'
const expected = 'techdocs-cli serve --engine-port 8001\n'

test('walks docs, skips excluded directories and links, and is idempotent', () => {
  const temp = mkdtempSync(join(tmpdir(), 'techdocs with spaces '))
  const target = join(temp, 'target')
  try {
    mkdirSync(join(target, 'docs'), { recursive: true })
    mkdirSync(join(target, 'dist-types'))
    for (const file of ['docs/serve.sh', 'dist-types/skip.sh']) writeFileSync(join(target, file), input)
    writeFileSync(join(temp, 'outside.sh'), input)
    linkSync(join(temp, 'outside.sh'), join(target, 'linked.sh'))
    try { symlinkSync(join(temp, 'outside.sh'), join(target, 'symbolic.sh')) } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EPERM') throw error
    }
    for (let i = 0; i < 2; i++) {
      execFileSync(process.execPath, [script, encodeURIComponent(target)])
      assert.equal(readFileSync(join(target, 'docs/serve.sh'), 'utf8'), expected)
      assert.equal(readFileSync(join(target, 'dist-types/skip.sh'), 'utf8'), input)
      assert.equal(readFileSync(join(temp, 'outside.sh'), 'utf8'), input)
    }
  } finally { rmSync(temp, { recursive: true, force: true }) }
})

test('nested manifests set shell state even on early returns', () => {
  const temp = mkdtempSync(join(tmpdir(), 'techdocs state '))
  const cli = join(dirname(createRequire(import.meta.url).resolve('codemod/package.json')), 'codemod')
  try {
    for (const [name, manifest] of [
      ['no-tokens', '{"name":"example"}\n'],
      ['invalid-json', '{"scripts":{"docs":"techdocs-cli serve --mkdocs-port 1",}}\n'],
    ]) {
      const target = join(temp, name)
      mkdirSync(join(target, 'plugin'), { recursive: true })
      mkdirSync(join(target, 'docs'))
      writeFileSync(join(target, 'plugin/package.json'), manifest)
      writeFileSync(join(target, 'docs/serve.sh'), input)
      execFileSync(process.execPath, [cli, 'workflow', 'run', '-w', join(packageRoot, 'workflow.yaml'), '-t', target, '--no-interactive', '--allow-dirty', '--allow-child-process'], { cwd: packageRoot })
      assert.equal(readFileSync(join(target, 'docs/serve.sh'), 'utf8'), expected)
      assert.equal(readFileSync(join(target, 'plugin/package.json'), 'utf8'), manifest)
    }
  } finally { rmSync(temp, { recursive: true, force: true }) }
})
