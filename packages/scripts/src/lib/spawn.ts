import { spawnSync } from 'node:child_process'

export interface SpawnResult {
  status: number | null
  stdout: string
  stderr: string
}

export interface SpawnOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  capture?: boolean
}

function spawn(command: string, args: string[], options: SpawnOptions = {}): SpawnResult {
  const stdio = options.capture ? 'pipe' : 'inherit'
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio,
    encoding: 'utf8',
  })
  // stdout/stderr are null when stdio is 'inherit'; the spawn types do not model that.
  const text = (value: string | null): string => value ?? ''
  return { status: result.status, stdout: text(result.stdout), stderr: text(result.stderr) }
}

function quote(arg: string): string {
  if (process.platform === 'win32') {
    return `"${arg.replaceAll('"', '""')}"`
  }
  return `'${arg.replaceAll("'", `'\\''`)}'`
}

function spawnShell(command: string, args: string[], options: SpawnOptions = {}): SpawnResult {
  const stdio = options.capture ? 'pipe' : 'inherit'
  const result = spawnSync([command, ...args.map(quote)].join(' '), {
    cwd: options.cwd,
    env: options.env,
    stdio,
    encoding: 'utf8',
    shell: true,
  })
  const text = (value: string | null): string => value ?? ''
  return { status: result.status, stdout: text(result.stdout), stderr: text(result.stderr) }
}

/**
 * Runs `yarn <args>`. When Yarn's JS entry point is known (npm_execpath points
 * at a .js/.cjs/.mjs file, e.g. Yarn installed through npm), it is executed
 * directly with argument-array safety on every platform. Corepack installs
 * point npm_execpath at a shell shim, in which case Yarn runs through the
 * shell with explicit per-argument quoting.
 */
export function runYarn(args: string[], options: SpawnOptions = {}): SpawnResult {
  const env = options.env ?? process.env
  const execPath = env.npm_execpath
  if (execPath !== undefined && /\.(cm?js|mjs)$/i.test(execPath)) {
    return spawn(process.execPath, [execPath, ...args], options)
  }
  return spawnShell('yarn', args, options)
}

/** Runs a git command; git is a native executable on every supported platform. */
export function runGit(args: string[], options: SpawnOptions = {}): SpawnResult {
  return spawn('git', args, options)
}

/** Runs a GitHub CLI command; gh is a native executable on every supported platform. */
export function runGh(args: string[], options: SpawnOptions = {}): SpawnResult {
  return spawn('gh', args, options)
}

/** Exits the process with the command's status when it failed. */
export function exitOnFailure(result: SpawnResult): void {
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}
