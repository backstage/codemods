// Workflow-level fixture suite for the extension config schema codemod.
// Each fixture is a full app tree; the whole recipe workflow must succeed on
// it and produce exactly the expected output. The other steps are expected
// to no-op on these fixtures, which the diff verifies.
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

function runYarn(args: string[]): { status: number | null; stdout: string } {
  // Invoked through run-recipe-tests, which runs under Yarn (npm_execpath set).
  // Corepack points npm_execpath at a shell shim; only a JS entry can be
  // executed directly, everything else goes through the shell with quoting.
  const execPath = process.env.npm_execpath
  const quote = (arg: string) =>
    process.platform === 'win32' ? `"${arg.replaceAll('"', '""')}"` : `'${arg.replaceAll("'", `'\\''`)}'`
  if (execPath !== undefined && /\.(cm?js|mjs)$/i.test(execPath)) {
    const result = spawnSync(process.execPath, [execPath, ...args], { encoding: 'utf8' })
    return { status: result.status, stdout: result.stdout ?? '' }
  }
  const result = spawnSync(['yarn', ...args.map(quote)].join(' '), { encoding: 'utf8', shell: true })
  return { status: result.status, stdout: result.stdout ?? '' }
}

function diffTrees(expected: string, actual: string): string[] {
  const problems: string[] = []
  const walk = (relative: string) => {
    const expectedPath = join(expected, relative)
    const actualPath = join(actual, relative)
    const expectedExists = existsSync(expectedPath)
    const actualExists = existsSync(actualPath)
    if (expectedExists !== actualExists) {
      problems.push(`${relative}: ${expectedExists ? 'missing in actual' : 'unexpected in actual'}`)
      return
    }
    if (!expectedExists) {
      return
    }
    if (statSync(expectedPath).isDirectory()) {
      const entries = new Set([...readdirSync(expectedPath), ...readdirSync(actualPath)])
      for (const entry of entries) {
        walk(join(relative, entry))
      }
      return
    }
    const expectedContents = readFileSync(expectedPath, 'utf8')
    const actualContents = readFileSync(actualPath, 'utf8')
    if (expectedContents !== actualContents) {
      problems.push(`${relative.replaceAll('\\', '/')}: contents differ`)
    }
  }
  walk('.')
  return problems
}

const fixtureRoot = 'tests/migrate-extension-config-schema'
for (const entry of readdirSync(fixtureRoot).sort()) {
  if (!statSync(join(fixtureRoot, entry)).isDirectory() || !existsSync(join(fixtureRoot, entry, 'input'))) {
    continue
  }
  const fixture = `${fixtureRoot}/${entry}`

  const scratch = mkdtempSync('tests/.fixture-')
  try {
    const input = join(fixture, 'input')
    for (const entry of readdirSync(input)) {
      cpSync(join(input, entry), join(scratch, entry), { recursive: true })
    }
    const run = runYarn([
      'exec',
      'codemod',
      'workflow',
      'run',
      '-w',
      'workflow.yaml',
      '-t',
      scratch,
      '--allow-dirty',
      '--no-interactive',
      '--format',
      'jsonl',
    ])
    if (run.status !== 0) {
      console.error(run.stdout)
      process.exit(1)
    }
    if (!run.stdout.includes('"outcome":"success"') || run.stdout.includes('"outcome":"failure"')) {
      console.error(run.stdout)
      process.exit(1)
    }
    const problems = diffTrees(join(fixture, 'expected'), scratch)
    if (problems.length > 0) {
      for (const problem of problems) {
        console.error(`diff: ${problem}`)
      }
      process.exit(1)
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
  console.log(`passed: ${fixture}`)
}
