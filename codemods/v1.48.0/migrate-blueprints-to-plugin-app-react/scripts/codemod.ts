import { addImport } from '@jssg/utils/javascript/imports'
import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('migrate-blueprints-to-plugin-app-react')

const MOVED_BLUEPRINTS = new Set([
  'IconBundleBlueprint',
  'NavContentBlueprint',
  'RouterBlueprint',
  'SignInPageBlueprint',
  'SwappableComponentBlueprint',
  'ThemeBlueprint',
  'TranslationBlueprint',
])

const OLD_SOURCE = '@backstage/frontend-plugin-api'
const NEW_SOURCE = '@backstage/plugin-app-react'

function escapeRegex(str: string): string {
  return str.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function findStatementsFrom<K extends 'import_statement' | 'export_statement'>(
  rootNode: SgNode<TSX>,
  kind: K,
  source: string,
): SgNode<TSX, K>[] {
  return rootNode.findAll({
    rule: {
      kind,
      has: {
        kind: 'string',
        has: {
          kind: 'string_fragment',
          regex: `^${escapeRegex(source)}$`,
        },
      },
    },
  }) as SgNode<TSX, K>[]
}

interface SpecifierInfo {
  importedName: string
  localName: string
  specText: string
}

function extractSpecifiers(node: SgNode<TSX>, kind: 'import_specifier' | 'export_specifier'): SpecifierInfo[] {
  const specifiers = node.findAll({ rule: { kind } })
  const result: SpecifierInfo[] = []

  for (const spec of specifiers) {
    const identifiers = spec.findAll({ rule: { kind: 'identifier' } })
    const [importedNameNode] = identifiers
    if (!importedNameNode) {
      continue
    }
    const importedName = importedNameNode.text()
    const localNameNode = identifiers[1] ?? importedNameNode
    const localName = localNameNode.text()
    result.push({ importedName, localName, specText: spec.text() })
  }

  return result
}

function isTypeOnlyStatement(node: SgNode<TSX>): boolean {
  return /^(import|export)\s+type\s/.test(node.text())
}

function buildNamedStatement(
  keyword: 'import' | 'export',
  specTexts: string[],
  source: string,
  typeOnly: boolean,
): string {
  const typeKw = typeOnly ? 'type ' : ''
  if (specTexts.length <= 2) {
    return `${keyword} ${typeKw}{ ${specTexts.join(', ')} } from '${source}';`
  }
  return `${keyword} ${typeKw}{\n  ${specTexts.join(',\n  ')},\n} from '${source}';`
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  // Process imports — two-pass to avoid generating duplicate new-source imports
  const oldImports = findStatementsFrom(rootNode, 'import_statement', OLD_SOURCE)

  interface ImportAnalysis {
    imp: SgNode<TSX, 'import_statement'>
    typeOnly: boolean
    movedSpecs: SpecifierInfo[]
    remainingSpecs: SpecifierInfo[]
  }

  // Phase 1: Analyse every old import
  const analyses: ImportAnalysis[] = []
  const allMovedByType = new Map<boolean, SpecifierInfo[]>()

  for (const imp of oldImports) {
    const typeOnly = isTypeOnlyStatement(imp)
    const specifiers = extractSpecifiers(imp, 'import_specifier')

    const movedSpecs: SpecifierInfo[] = []
    const remainingSpecs: SpecifierInfo[] = []

    for (const spec of specifiers) {
      if (MOVED_BLUEPRINTS.has(spec.importedName)) {
        movedSpecs.push(spec)
      } else {
        remainingSpecs.push(spec)
      }
    }

    if (movedSpecs.length === 0) {
      continue
    }

    analyses.push({ imp, typeOnly, movedSpecs, remainingSpecs })

    const existing = allMovedByType.get(typeOnly) ?? []
    existing.push(...movedSpecs)
    allMovedByType.set(typeOnly, existing)
  }

  // Phase 2: Emit edits — one new-source import per typeOnly group
  const newImportEmitted = new Set<boolean>()

  for (const { imp, typeOnly, movedSpecs, remainingSpecs } of analyses) {
    let replacement = ''
    if (remainingSpecs.length > 0) {
      replacement = buildNamedStatement(
        'import',
        remainingSpecs.map((s) => s.specText),
        OLD_SOURCE,
        typeOnly,
      )
    }

    // Emit the new-source import only once per typeOnly group
    if (!newImportEmitted.has(typeOnly)) {
      newImportEmitted.add(typeOnly)

      const allMoved = allMovedByType.get(typeOnly) ?? []

      // Try to merge into existing import from new source
      const existingNewImports = findStatementsFrom(rootNode, 'import_statement', NEW_SOURCE)
      const existingNewImport = existingNewImports.find((i) => isTypeOnlyStatement(i) === typeOnly)

      if (existingNewImport) {
        const edit = addImport(rootNode, {
          type: 'named',
          specifiers: allMoved.map((s) => ({
            name: s.importedName,
            alias: s.localName !== s.importedName ? s.localName : undefined,
          })),
          from: NEW_SOURCE,
        })
        if (edit) {
          edits.push(edit)
        }
      } else {
        // Create new import statement with ALL moved specs for this typeOnly group
        const newImport = buildNamedStatement(
          'import',
          allMoved.map((s) => s.specText),
          NEW_SOURCE,
          typeOnly,
        )
        replacement = replacement ? `${replacement}\n${newImport}` : newImport
      }
    }

    edits.push(imp.replace(replacement))

    for (const spec of movedSpecs) {
      migrationMetric.increment({ action: 'import-moved', name: spec.importedName })
    }
  }

  // Process re-exports
  const oldExports = findStatementsFrom(rootNode, 'export_statement', OLD_SOURCE)

  for (const exp of oldExports) {
    const typeOnly = isTypeOnlyStatement(exp)
    const specifiers = extractSpecifiers(exp, 'export_specifier')

    const movedSpecs: SpecifierInfo[] = []
    const remainingSpecs: SpecifierInfo[] = []

    for (const spec of specifiers) {
      if (MOVED_BLUEPRINTS.has(spec.importedName)) {
        movedSpecs.push(spec)
      } else {
        remainingSpecs.push(spec)
      }
    }

    if (movedSpecs.length === 0) {
      continue
    }

    let replacement = ''
    if (remainingSpecs.length > 0) {
      replacement = buildNamedStatement(
        'export',
        remainingSpecs.map((s) => s.specText),
        OLD_SOURCE,
        typeOnly,
      )
    }

    const newExport = buildNamedStatement(
      'export',
      movedSpecs.map((s) => s.specText),
      NEW_SOURCE,
      typeOnly,
    )
    replacement = replacement ? `${replacement}\n${newExport}` : newExport

    edits.push(exp.replace(replacement))

    for (const spec of movedSpecs) {
      migrationMetric.increment({ action: 'export-moved', name: spec.importedName })
    }
  }

  const result = await Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
  return result
}

export default transform
