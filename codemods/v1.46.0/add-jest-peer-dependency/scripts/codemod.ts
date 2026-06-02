import type { Codemod } from 'codemod:ast-grep'
import type JSON from 'codemod:ast-grep/langs/json'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('add-jest-peer-dependency')

interface PackageJson {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  [key: string]: unknown
}

interface JestDeps {
  [key: string]: string
}

function getJest30Deps(): JestDeps {
  return {
    '@jest/environment-jsdom-abstract': '^30',
    '@types/jest': '^30',
    jest: '^30',
    jsdom: '^27',
  }
}

function getJest29Deps(): JestDeps {
  return {
    '@types/jest': '^29',
    jest: '^29',
    'jest-environment-jsdom': '^29',
  }
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

const transform: Codemod<JSON> = async (root, options) => {
  const rootNode = root.root()
  const source = normalizeSource(rootNode.text())

  let pkg: PackageJson
  try {
    pkg = globalThis.JSON.parse(source) as PackageJson
  } catch {
    return null
  }

  // Check if @backstage/cli is present
  const hasBackstageCli =
    pkg.dependencies?.['@backstage/cli'] !== undefined || pkg.devDependencies?.['@backstage/cli'] !== undefined

  if (!hasBackstageCli) {
    return null
  }

  // Check if jest is already present
  const hasJest = pkg.dependencies?.jest !== undefined || pkg.devDependencies?.jest !== undefined

  if (hasJest) {
    migrationMetric.increment({ action: 'skipped-already-present' })
    return null
  }

  // Determine jest version from params
  const jestVersionParam = options.params.jestVersion ?? '30'
  const jestVersion = jestVersionParam === '29' ? '29' : '30'

  const newDeps = jestVersion === '29' ? getJest29Deps() : getJest30Deps()

  // Merge into devDependencies
  const existingDevDeps = pkg.devDependencies ?? {}
  const mergedDevDeps = sortObjectKeys({ ...existingDevDeps, ...newDeps })

  // Detect indentation from source
  const indentMatch = source.match(/\n(\s+)"/)
  const indent = indentMatch?.[1] ?? '  '

  // Rebuild the JSON with the updated devDependencies
  pkg.devDependencies = mergedDevDeps

  // Use JSON.stringify with detected indentation
  const result = `${globalThis.JSON.stringify(pkg, null, indent)}\n`

  if (result === source) {
    return null
  }

  migrationMetric.increment({
    action: 'deps-added',
    jestVersion,
    packageCount: String(Object.keys(newDeps).length),
  })

  await Promise.resolve()
  return result
}

export default transform
