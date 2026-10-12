// Node built-ins are untyped in this JSSG-only workspace; host Node executes this step.
/* oxlint-disable typescript/no-unsafe-assignment, typescript/no-unsafe-call, typescript/no-unsafe-member-access, typescript/no-unsafe-argument */
import { readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

async function main() {
  const { rewriteCommand } = await import('./command.js')
  // A URI-encoded state value remains one argument even when the target path contains spaces.
  const target = process.argv.at(-1) && decodeURIComponent(process.argv.at(-1))
  if (!target) {
    throw new Error('Missing workflow targetDirEncoded')
  }
  const root = realpathSync(target)
  if (!statSync(root).isDirectory()) {
    throw new Error('Expected a target directory')
  }
  const excluded = new Set(['.git', '.yarn', 'node_modules', 'docs', 'dist', 'build', 'coverage', 'vendor'])
  const pending = [root]
  while (pending.length) {
    const directory = pending.pop()
    if (!directory) {
      break
    }
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      // Dirents never follow symlinks; every visited path stays under the explicit target.
      if (entry.isSymbolicLink()) {
        continue
      }
      const file = join(directory, entry.name)
      if (entry.isDirectory()) {
        if (!excluded.has(entry.name)) {
          pending.push(file)
        }
      } else if (entry.isFile() && entry.name.endsWith('.sh')) {
        const before = readFileSync(file, 'utf8')
        if (!before.includes('openapi') || !before.includes('verify')) {
          continue
        }
        const after = rewriteCommand(before)
        if (after !== before) {
          writeFileSync(file, after)
        }
      }
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
