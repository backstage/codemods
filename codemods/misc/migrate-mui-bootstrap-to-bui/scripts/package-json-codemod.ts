import type { Codemod } from 'codemod:ast-grep'
import type JSON from 'codemod:ast-grep/langs/json'
import { useMetricAtom } from 'codemod:metrics'

import { resolveLatestCaretRange } from './resolve-latest-version.ts'

const migrationMetric = useMetricAtom('migrate-mui-bootstrap-to-bui')

const MUI_PACKAGES = ['@material-ui/core', '@material-ui/icons', '@material-ui/lab'] as const

const BUI_PACKAGE = '@backstage/ui'
const REMIX_PACKAGE = '@remixicon/react'

/** Offline fallback when registry lookup is disabled or unavailable (e.g. jssg tests). */
const FALLBACK_BUI_VERSION = '^0.16.0'
const FALLBACK_REMIX_VERSION = '^4.9.0'

interface PackageJson {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  [key: string]: unknown
}

interface PackageJsonCodemodParams {
  resolveLatestVersions?: boolean
  buiVersion?: string
  remixVersion?: string
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

async function resolveDependencyVersion(
  packageName: string,
  params: PackageJsonCodemodParams,
  paramOverride: string | undefined,
  fallback: string,
): Promise<string> {
  if (paramOverride !== undefined) {
    return paramOverride
  }

  if (params.resolveLatestVersions === false) {
    migrationMetric.increment({ action: 'version-fallback', package: packageName, reason: 'disabled' })
    return fallback
  }

  const latest = await resolveLatestCaretRange(packageName)
  if (latest !== null) {
    migrationMetric.increment({ action: 'version-resolved', package: packageName, version: latest })
    return latest
  }

  migrationMetric.increment({ action: 'version-fallback', package: packageName, reason: 'registry-unavailable' })
  return fallback
}

const transform: Codemod<JSON> = async (root, options) => {
  const rootNode = root.root()
  const source = normalizeSource(rootNode.text())
  const params = options.params as PackageJsonCodemodParams

  let pkg: PackageJson
  try {
    pkg = globalThis.JSON.parse(source) as PackageJson
  } catch {
    return Promise.resolve(null)
  }

  if (!hasMuiDependency(pkg)) {
    return Promise.resolve(null)
  }

  const buiVersion = await resolveDependencyVersion(BUI_PACKAGE, params, params.buiVersion, FALLBACK_BUI_VERSION)

  const section = dependencySectionForMui(pkg)
  const existingDeps = pkg[section] ?? {}
  let changed = false

  if (existingDeps[BUI_PACKAGE] === undefined) {
    existingDeps[BUI_PACKAGE] = buiVersion
    changed = true
    migrationMetric.increment({ action: 'bui-dependency-added' })
  }

  if (hasMuiIcons(pkg) && existingDeps[REMIX_PACKAGE] === undefined) {
    const remixVersion = await resolveDependencyVersion(
      REMIX_PACKAGE,
      params,
      params.remixVersion,
      FALLBACK_REMIX_VERSION,
    )
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
