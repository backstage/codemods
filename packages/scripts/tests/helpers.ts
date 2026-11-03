// Shared helpers for the scripts package tests. The Yarn stub is injected via
// npm_execpath, which is how runYarn executes Yarn when invoked under it.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

export function src(name: string): string {
  return join(packageRoot, 'src', name)
}

export interface BinResult {
  status: number | null
  stdout: string
  stderr: string
}

export function runBin(
  name: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): BinResult {
  const result = spawnSync(process.execPath, [src(name), ...args], {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    encoding: 'utf8',
  })
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

export interface RecordedCall {
  command: string
  cwd: string
  args: string[]
}

export function readCalls(callsDir: string): RecordedCall[] {
  if (!existsSync(join(callsDir, 'count'))) {
    return []
  }
  const count = Number(readFileSync(join(callsDir, 'count'), 'utf8'))
  const calls: RecordedCall[] = []
  for (let id = 1; id <= count; id++) {
    const lines = readFileSync(join(callsDir, String(id)), 'utf8').split('\n')
    calls.push({
      command: lines[0] ?? '',
      cwd: lines[1] ?? '',
      args: lines.slice(2).filter((line) => line !== ''),
    })
  }
  return calls
}

/**
 * Writes a Yarn stub that records every invocation to <callsDir>/<id> as
 * "command\ncwd\nargs..." lines, honors FAIL_ON=<id> (exit 17) and the
 * Windows argv budget (exit 23 past 4030 chars), and can delegate
 * `yarn lint-staged` to a real executable via LINT_STAGED.
 */
export function writeYarnStub(directory: string): string {
  const stub = join(directory, 'yarn-stub.mjs')
  writeFileSync(
    stub,
    `import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const calls = process.env.CALLS
const countFile = calls + '/count'
const id = (existsSync(countFile) ? Number(readFileSync(countFile, 'utf8')) : 0) + 1
writeFileSync(countFile, String(id))
writeFileSync(calls + '/' + id, [process.argv[2], process.cwd(), ...process.argv.slice(3)].join('\\n') + '\\n')

const length = process.argv.slice(2).reduce((sum, arg) => sum + arg.length + 3, 0)
if (length > 4030) {
  console.error('The command line is too long.')
  process.exit(23)
}
if (process.argv[2] === 'lint-staged' && process.env.LINT_STAGED) {
  const result = spawnSync(process.env.LINT_STAGED, ['--concurrent', 'false', ...process.argv.slice(3)], { stdio: 'inherit' })
  process.exit(result.status ?? 1)
}
if (process.env.FAIL_ON === String(id)) {
  process.exit(17)
}
if (process.argv[2] === 'test' && process.env.FAIL_TEST_CWD === process.cwd()) {
  process.exit(17)
}
`,
  )
  return stub
}

export function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

export { writeFileSync }
