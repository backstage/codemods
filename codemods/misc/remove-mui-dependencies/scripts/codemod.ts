import type { Codemod } from 'codemod:ast-grep'
import type JSON from 'codemod:ast-grep/langs/json'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('remove-mui-dependencies')
const muiUsageMetric = useMetricAtom('mui-import-usage')

const MUI_PACKAGES = ['@material-ui/core', '@material-ui/icons', '@material-ui/lab', '@material-ui/styles'] as const

type MuiPackage = (typeof MUI_PACKAGES)[number]

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

const transform: Codemod<JSON> = (root) => {
  const rootNode = root.root()
  const source = normalizeSource(rootNode.text())

  let pkg: PackageJson
  try {
    pkg = globalThis.JSON.parse(source) as PackageJson
  } catch {
    return Promise.resolve(null)
  }

  if (listMuiDependencies(pkg).length === 0) {
    return Promise.resolve(null)
  }

  const packageDir = getPackageDir(root)
  const usedPackages = getUsedPackagesFromMetrics(packageDir)

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
    return Promise.resolve(null)
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
    return Promise.resolve(null)
  }

  return Promise.resolve(result)
}

export default transform
