import { access, constants, readdir, readFile } from 'fs/promises' // oxlint-disable-line unicorn/prefer-node-protocol -- LLRT typed entrypoint

import type { Codemod } from 'codemod:ast-grep'
import type JSON from 'codemod:ast-grep/langs/json'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('remove-mui-dependencies')
const muiUsageMetric = useMetricAtom('mui-import-usage')

const MUI_PACKAGES = ['@material-ui/core', '@material-ui/icons', '@material-ui/lab', '@material-ui/styles'] as const

type MuiPackage = (typeof MUI_PACKAGES)[number]

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs'])

const SOURCE_DIRS = ['src', 'dev'] as const

const SKIP_DIRS = new Set(['node_modules', 'dist', 'dist-types', 'build', 'coverage', '.git', 'target'])

interface PackageJson {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  [key: string]: unknown
}

function normalizeSource(source: string): string {
  return source.replaceAll('\r\n', '\n').replaceAll('\r', '\n')
}

function normalizeFilepath(filepath: string): string {
  let normalized = filepath.replaceAll('\\', '/')
  if (normalized.startsWith('/?/')) {
    normalized = normalized.slice(3)
  } else if (/^\/[A-Za-z]:\//.test(normalized)) {
    normalized = normalized.slice(1)
  }
  return normalized
}

function dirname(filepath: string): string {
  const normalized = normalizeFilepath(filepath)
  const idx = normalized.lastIndexOf('/')
  return idx === -1 ? '.' : normalized.slice(0, idx)
}

function getPackageDir(root: { filename(): string; relativeFilename(): string }): string {
  const relative = root.relativeFilename()
  if (relative && relative !== 'anonymous') {
    return dirname(normalizeFilepath(relative))
  }
  return dirname(normalizeFilepath(root.filename()))
}

function sortObjectKeys(obj: Record<string, string>): Record<string, string> {
  const sorted: Record<string, string> = {}
  for (const key of Object.keys(obj).sort()) {
    const value = obj[key]
    if (value !== undefined) {
      sorted[key] = value
    }
  }
  return sorted
}

function listMuiDependencies(pkg: PackageJson): MuiPackage[] {
  const found: MuiPackage[] = []
  for (const name of MUI_PACKAGES) {
    if (pkg.dependencies?.[name] !== undefined || pkg.devDependencies?.[name] !== undefined) {
      found.push(name)
    }
  }
  return found
}

function getUsedPackagesFromMetrics(packageDir: string): Set<MuiPackage> {
  const used = new Set<MuiPackage>()
  for (const entry of muiUsageMetric.getEntries()) {
    if (entry.cardinality.workspacePackage === packageDir && entry.cardinality.muiPackage) {
      used.add(entry.cardinality.muiPackage as MuiPackage)
    }
  }
  return used
}

async function collectSourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const fullPath = `${dir}/${entry.name}`.replaceAll('\\', '/')
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) {
        continue
      }
      files.push(...(await collectSourceFiles(fullPath)))
      continue
    }

    if (!entry.isFile()) {
      continue
    }

    const dotIndex = entry.name.lastIndexOf('.')
    if (dotIndex === -1) {
      continue
    }

    const ext = entry.name.slice(dotIndex)
    if (SOURCE_EXTENSIONS.has(ext)) {
      files.push(fullPath)
    }
  }

  return files
}

async function directoryExists(dir: string): Promise<boolean> {
  try {
    await access(dir, constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function scanSourceFilesForMuiUsage(dir: string, used: Set<MuiPackage>): Promise<void> {
  const files = await collectSourceFiles(dir)

  for (const file of files) {
    const content = await readFile(file, 'utf8')
    for (const pkg of MUI_PACKAGES) {
      if (content.includes(pkg)) {
        used.add(pkg)
      }
    }
  }
}

async function getUsedMuiPackagesViaFs(packageDir: string): Promise<Set<MuiPackage>> {
  const used = new Set<MuiPackage>()

  for (const sourceDir of SOURCE_DIRS) {
    const dir = `${packageDir}/${sourceDir}`.replaceAll('\\', '/')
    if (await directoryExists(dir)) {
      await scanSourceFilesForMuiUsage(dir, used)
    }
  }

  return used
}

async function resolveUsedMuiPackages(packageDir: string): Promise<Set<MuiPackage>> {
  const fromMetrics = getUsedPackagesFromMetrics(packageDir)
  if (fromMetrics.size > 0) {
    return fromMetrics
  }

  return getUsedMuiPackagesViaFs(packageDir)
}

function removeUnusedMuiPackages(
  section: Record<string, string> | undefined,
  usedPackages: Set<MuiPackage>,
): { deps: Record<string, string> | undefined; removed: MuiPackage[] } {
  if (section === undefined) {
    return { deps: undefined, removed: [] }
  }

  const removed: MuiPackage[] = []
  const deps = { ...section }

  for (const name of MUI_PACKAGES) {
    if (deps[name] !== undefined && !usedPackages.has(name)) {
      delete deps[name]
      removed.push(name)
    }
  }

  if (Object.keys(deps).length === 0) {
    return { deps: undefined, removed }
  }

  return { deps: sortObjectKeys(deps), removed }
}

const transform: Codemod<JSON> = async (root) => {
  const rootNode = root.root()
  const source = normalizeSource(rootNode.text())

  let pkg: PackageJson
  try {
    pkg = globalThis.JSON.parse(source) as PackageJson
  } catch {
    return null
  }

  if (listMuiDependencies(pkg).length === 0) {
    return null
  }

  const packageDir = getPackageDir(root)
  const usedPackages = await resolveUsedMuiPackages(packageDir)

  const { deps: dependencies, removed: removedFromDependencies } = removeUnusedMuiPackages(
    pkg.dependencies,
    usedPackages,
  )
  const { deps: devDependencies, removed: removedFromDevDependencies } = removeUnusedMuiPackages(
    pkg.devDependencies,
    usedPackages,
  )

  const removed = [...removedFromDependencies, ...removedFromDevDependencies]
  if (removed.length === 0) {
    migrationMetric.increment({ action: 'skipped-still-in-use' })
    return null
  }

  for (const name of removed) {
    migrationMetric.increment({ action: 'mui-dependency-removed', package: name })
  }

  pkg.dependencies = dependencies
  pkg.devDependencies = devDependencies

  const indentMatch = source.match(/\n(\s+)"/)
  const indent = indentMatch?.[1] ?? '  '
  const result = `${globalThis.JSON.stringify(pkg, null, indent)}\n`

  if (result === source) {
    return null
  }

  return result
}

export default transform
