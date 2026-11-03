import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmodSync, linkSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const shellScript = join(packageRoot, 'scripts', 'rename-openapi-validate-command-shell.mjs')

test('shell-codemod updates .sh under explicit target only, skipping docs and symlinks', () => {
  const temp = mkdtempSync(join(tmpdir(), 'openapi validate '))
  const target = join(temp, 'target with spaces')
  const outside = join(temp, 'outside.sh')
  const positive = join(target, 'scripts', 'check.sh')
  const negative = join(target, 'other.sh')
  const docs = join(target, 'docs', 'history.sh')
  const hardLinked = join(target, 'hard-linked.sh')
  const outsideHardLink = join(temp, 'outside-hard-link.sh')
  try {
    mkdirSync(dirname(positive), { recursive: true })
    mkdirSync(dirname(docs), { recursive: true })
    const fixture = (caseName, fileName) => readFileSync(join(packageRoot, 'tests', 'rename-openapi-validate-command-shell', caseName, fileName), 'utf8')
    writeFileSync(positive, fixture('positive', 'input.sh'))
    writeFileSync(negative, fixture('negative', 'input.sh'))
    writeFileSync(docs, fixture('positive', 'input.sh'))
    writeFileSync(outside, fixture('positive', 'input.sh'))
    writeFileSync(outsideHardLink, fixture('positive', 'input.sh'))
    linkSync(outsideHardLink, hardLinked)
    const outsideInode = statSync(outsideHardLink).ino
    assert.equal(statSync(outsideHardLink).nlink, 2)
    chmodSync(positive, 0o755)
    const positiveMode = statSync(positive).mode & 0o777
    try {
      symlinkSync(outside, join(target, 'linked.sh'))
    } catch (error) {
      if (error.code !== 'EPERM') throw error
    }
    execFileSync(process.execPath, [shellScript, target])
    assert.equal(readFileSync(hardLinked, 'utf8'), fixture('positive', 'input.sh'))
    assert.equal(readFileSync(positive, 'utf8'), fixture('positive', 'expected.sh'))
    assert.equal(readFileSync(negative, 'utf8'), fixture('negative', 'expected.sh'))
    assert.equal(readFileSync(docs, 'utf8'), fixture('positive', 'input.sh'))
    assert.equal(readFileSync(outside, 'utf8'), fixture('positive', 'input.sh'))
    assert.equal(readFileSync(outsideHardLink, 'utf8'), fixture('positive', 'input.sh'))
    assert.equal(statSync(outsideHardLink).ino, outsideInode)
    assert.equal(statSync(hardLinked).ino, outsideInode)
    assert.equal(statSync(positive).mode & 0o777, positiveMode)
    execFileSync(process.execPath, [shellScript, target])
    assert.equal(readFileSync(positive, 'utf8'), fixture('positive', 'expected.sh'))
    assert.equal(readFileSync(hardLinked, 'utf8'), fixture('positive', 'input.sh'))
    assert.equal(readFileSync(outsideHardLink, 'utf8'), fixture('positive', 'input.sh'))
    assert.equal(statSync(positive).mode & 0o777, positiveMode)
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
})
