import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/** Published recipes: one per version, plus the nested misc recipe. */
export function recipeDirs(root = 'codemods'): string[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(root, entry.name, ...(entry.name === 'misc' ? ['mui4-to-bui-migration-recipe'] : [])))
    .filter((directory) => existsSync(join(directory, 'package.json')))
    .sort()
}

/** Package root for a changed file in either supported recipe layout. */
export function recipeDirForFile(file: string): string {
  const parts = file.replaceAll('\\', '/').split('/')
  return parts.slice(0, parts[1] === 'misc' ? 3 : 2).join('/')
}
