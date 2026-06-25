import type { Codemod } from 'codemod:ast-grep'
import type JSON from 'codemod:ast-grep/langs/json'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('migrate-mui-bootstrap-to-bui')

const MUI_PACKAGES = ['@material-ui/core', '@material-ui/icons', '@material-ui/lab'] as const

const BUI_PACKAGE = '@backstage/ui'
const REMIX_PACKAGE = '@remixicon/react'

const DEFAULT_BUI_VERSION = '^0.16.0'
const DEFAULT_REMIX_VERSION = '^4.9.0'

interface PackageJson {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  [key: string]: unknown
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

function normalizeSource(source: string): string {
  return source.replaceAll('\r\n', '\n').replaceAll('\r', '\n')
}

function hasMuiDependency(pkg: PackageJson): boolean {
  return MUI_PACKAGES.some(
    (name) => pkg.dependencies?.[name] !== undefined || pkg.devDependencies?.[name] !== undefined,
  )
}

function hasMuiIcons(pkg: PackageJson): boolean {
  return (
    pkg.dependencies?.['@material-ui/icons'] !== undefined || pkg.devDependencies?.['@material-ui/icons'] !== undefined
  )
}

function dependencySectionForMui(pkg: PackageJson): 'dependencies' | 'devDependencies' {
  for (const name of MUI_PACKAGES) {
    if (pkg.dependencies?.[name] !== undefined) {
      return 'dependencies'
    }
  }
  return 'devDependencies'
}

const transform: Codemod<JSON> = async (root, options) => {
  const rootNode = root.root()
  const source = normalizeSource(rootNode.text())

  const buiVersion = options.params.buiVersion ?? DEFAULT_BUI_VERSION
  const remixVersion = options.params.remixVersion ?? DEFAULT_REMIX_VERSION

  let pkg: PackageJson
  try {
    pkg = globalThis.JSON.parse(source) as PackageJson
  } catch {
    return Promise.resolve(null)
  }

  if (!hasMuiDependency(pkg)) {
    return Promise.resolve(null)
  }

  const section = dependencySectionForMui(pkg)
  const existingDeps = pkg[section] ?? {}
  let changed = false

  if (existingDeps[BUI_PACKAGE] === undefined) {
    existingDeps[BUI_PACKAGE] = buiVersion
    changed = true
    migrationMetric.increment({ action: 'bui-dependency-added' })
  }

  if (hasMuiIcons(pkg) && existingDeps[REMIX_PACKAGE] === undefined) {
    existingDeps[REMIX_PACKAGE] = remixVersion
    changed = true
    migrationMetric.increment({ action: 'remix-dependency-added' })
  }

  if (!changed) {
    migrationMetric.increment({ action: 'already-bootstrapped-deps' })
    return Promise.resolve(null)
  }

  pkg[section] = sortObjectKeys(existingDeps)

  const indentMatch = source.match(/\n(\s+)"/)
  const indent = indentMatch?.[1] ?? '  '
  const result = `${globalThis.JSON.stringify(pkg, null, indent)}\n`

  if (result === source) {
    return Promise.resolve(null)
  }

  return Promise.resolve(result)
}

export default transform
