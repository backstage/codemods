// Workflow-level fixture suite for the extension config schema codemod.
// Each fixture is a full app tree; the whole recipe workflow must succeed on
// it and produce exactly the expected output. The other steps are expected
// to no-op on these fixtures, which the diff verifies.
//
// Fixtures are independent workflow runs, so they execute concurrently
// (bounded) to keep CI fast; each run has a timeout so a hung CLI fails
// loudly with its log instead of stalling the suite.
import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

const CONCURRENCY = 4
const FIXTURE_TIMEOUT_MS = 120_000

function yarn(args: string[], timeoutMs: number): Promise<{ status: number | null; stdout: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    // Invoked through run-recipe-tests, which runs under Yarn (npm_execpath
    // set). Corepack points it at a shell shim; only a JS entry can be
    // executed directly, everything else goes through the shell with quoting.
    const execPath = process.env.npm_execpath
    const quote = (arg: string) =>
      process.platform === 'win32' ? `"${arg.replaceAll('"', '""')}"` : `'${arg.replaceAll("'", `'\\''`)}'`
    const isJs = execPath !== undefined && /\.(cm?js|mjs)$/i.test(execPath)
    const child = isJs
      ? spawn(process.execPath, [execPath, ...args], { stdio: ['ignore', 'pipe', 'inherit'] })
      : spawn(['yarn', ...args].map(quote).join(' '), {
          shell: true,
          stdio: ['ignore', 'pipe', 'inherit'],
          // A process group lets the timeout kill shell grandchildren too.
          detached: process.platform !== 'win32',
        })
    let stdout = ''
    let timedOut = false
    let settled = false
    const finish = (status: number | null) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      resolve({ status, stdout, timedOut })
    }
    const timer = setTimeout(() => {
      timedOut = true
      // 'exit' fires on process termination; waiting for 'close' would hang
      // forever while a surviving grandchild holds the stdout pipe open.
      if (process.platform === 'win32' || child.pid === undefined) {
        child.kill()
      } else {
        process.kill(-child.pid, 'SIGKILL')
      }
    }, timeoutMs)
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.on('exit', (status) => finish(status))
    child.on('error', () => finish(1))
  })
}

function diffTrees(expected: string, actual: string): string[] {
  const problems: string[] = []
  const walk = (relative: string) => {
    const expectedPath = join(expected, relative)
    const actualPath = join(actual, relative)
    const expectedExists = existsSync(expectedPath)
    const actualExists = existsSync(actualPath)
    if (expectedExists !== actualExists) {
      problems.push(`${relative.replaceAll('\\', '/')}: ${expectedExists ? 'missing in actual' : 'unexpected in actual'}`)
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
    if (readFileSync(expectedPath, 'utf8') !== readFileSync(actualPath, 'utf8')) {
      problems.push(`${relative.replaceAll('\\', '/')}: contents differ`)
    }
  }
  walk('.')
  return problems
}

const fixtureRoot = 'tests/migrate-extension-config-schema'
const fixtures = readdirSync(fixtureRoot)
  .sort()
  .filter((entry) => statSync(join(fixtureRoot, entry)).isDirectory() && existsSync(join(fixtureRoot, entry, 'input')))
  .map((entry) => `${fixtureRoot}/${entry}`)

let failed = false
let next = 0

async function runFixture(fixture: string): Promise<void> {
  const scratch = mkdtempSync('tests/.fixture-')
  try {
    const input = join(fixture, 'input')
    mkdirSync(scratch, { recursive: true })
    for (const entry of readdirSync(input)) {
      cpSync(join(input, entry), join(scratch, entry), { recursive: true })
    }
    const run = await yarn(
      ['exec', 'codemod', 'workflow', 'run', '-w', 'workflow.yaml', '-t', scratch, '--allow-dirty', '--no-interactive', '--format', 'jsonl'],
      FIXTURE_TIMEOUT_MS,
    )
    if (run.timedOut) {
      console.error(`${fixture}: workflow run timed out after ${FIXTURE_TIMEOUT_MS / 1000}s`)
      console.error(run.stdout)
      failed = true
      return
    }
    if (run.status !== 0 || !run.stdout.includes('"outcome":"success"') || run.stdout.includes('"outcome":"failure"')) {
      console.error(`${fixture}: workflow run failed (exit ${run.status})`)
      console.error(run.stdout)
      failed = true
      return
    }
    const problems = diffTrees(join(fixture, 'expected'), scratch)
    if (problems.length > 0) {
      for (const problem of problems) {
        console.error(`diff: ${problem}`)
      }
      failed = true
      return
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
  console.log(`passed: ${fixture}`)
}

const workers = Array.from({ length: Math.min(CONCURRENCY, fixtures.length) }, async () => {
  for (;;) {
    const index = next++
    if (index >= fixtures.length) {
      return
    }
    await runFixture(fixtures[index] ?? '')
  }
})
await Promise.all(workers)

if (failed) {
  process.exit(1)
}
