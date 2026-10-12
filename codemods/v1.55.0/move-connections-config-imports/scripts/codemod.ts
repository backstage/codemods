import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('move-connections-config-imports')

const ROOT_SOURCE = '@backstage/connections'
const CONFIG_SOURCE = '@backstage/connections/config'

const MOVED_EXPORTS = new Set(['buildConnectionsFromConfig', 'ConfiguredConnection', 'ConfiguredConnectionAuth'])

function escapeRegex(str: string): string {
  return `^${str.replaceAll(/[.*+?^${}()|[\]\\/]/g, '\\$&')}$`
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
          regex: escapeRegex(source),
        },
      },
    },
  }) as SgNode<TSX, K>[]
}

interface SpecifierInfo {
  importedName: string
  specText: string
}

function extractSpecifiers(node: SgNode<TSX>, kind: 'import_specifier' | 'export_specifier'): SpecifierInfo[] {
  const specifiers = node.findAll({ rule: { kind } })
  const result: SpecifierInfo[] = []

  for (const spec of specifiers) {
    const identifiers = spec.findAll({
      rule: {
        any: [{ kind: 'identifier' }, { kind: 'type_identifier' }],
      },
    })

    const [importedNameNode] = identifiers
    if (!importedNameNode) {
      continue
    }

    result.push({
      importedName: importedNameNode.text(),
      specText: spec.text(),
    })
  }

  return result
}

function isTypeOnlyStatement(node: SgNode<TSX, 'import_statement' | 'export_statement'>): boolean {
  return node.children().some((c) => c.text() === 'type')
}

function getImportDefaultSpecifier(node: SgNode<TSX, 'import_statement'>): string | null {
  const clause = node.find({ rule: { kind: 'import_clause' } })
  if (!clause) {
    return null
  }

  for (const child of clause.children()) {
    if (child.is('identifier')) {
      return child.text()
    }
  }

  return null
}

function buildNamedSpecifiers(specTexts: string[]): string {
  if (specTexts.length <= 2) {
    return `{ ${specTexts.join(', ')} }`
  }

  return `{\n  ${specTexts.join(',\n  ')},\n}`
}

function buildImportStatement(
  specTexts: string[],
  source: string,
  isTypeOnly: boolean,
  defaultSpecifier: string | null,
): string {
  const typeKeyword = isTypeOnly ? 'type ' : ''

  if (specTexts.length === 0 && defaultSpecifier) {
    return `import ${typeKeyword}${defaultSpecifier} from '${source}';`
  }

  const namedSpecifiers = buildNamedSpecifiers(specTexts)

  if (defaultSpecifier) {
    return `import ${typeKeyword}${defaultSpecifier}, ${namedSpecifiers} from '${source}';`
  }

  return `import ${typeKeyword}${namedSpecifiers} from '${source}';`
}

function buildExportStatement(specTexts: string[], source: string, isTypeOnly: boolean): string {
  const typeKeyword = isTypeOnly ? 'type ' : ''
  const namedSpecifiers = buildNamedSpecifiers(specTexts)
  return `export ${typeKeyword}${namedSpecifiers} from '${source}';`
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  const rootImports = findStatementsFrom(rootNode, 'import_statement', ROOT_SOURCE)

  for (const statement of rootImports) {
    const specifiers = extractSpecifiers(statement, 'import_specifier')

    if (specifiers.length === 0) {
      continue
    }

    const moved = specifiers.filter((s) => MOVED_EXPORTS.has(s.importedName))
    if (moved.length === 0) {
      continue
    }

    const remaining = specifiers.filter((s) => !MOVED_EXPORTS.has(s.importedName))
    const defaultSpecifier = getImportDefaultSpecifier(statement)
    const isTypeOnly = isTypeOnlyStatement(statement)

    const movedImport = buildImportStatement(
      moved.map((s) => s.specText),
      CONFIG_SOURCE,
      isTypeOnly,
      null,
    )

    const remainingImport =
      remaining.length > 0 || defaultSpecifier
        ? buildImportStatement(
            remaining.map((s) => s.specText),
            ROOT_SOURCE,
            isTypeOnly,
            defaultSpecifier,
          )
        : ''

    const replacement = remainingImport ? `${remainingImport}\n${movedImport}` : movedImport

    edits.push(statement.replace(replacement))

    for (const specifier of moved) {
      migrationMetric.increment({
        kind: 'import',
        symbol: specifier.importedName,
      })
    }
  }

  const rootExports = findStatementsFrom(rootNode, 'export_statement', ROOT_SOURCE)

  for (const statement of rootExports) {
    const specifiers = extractSpecifiers(statement, 'export_specifier')

    if (specifiers.length === 0) {
      continue
    }

    const moved = specifiers.filter((s) => MOVED_EXPORTS.has(s.importedName))
    if (moved.length === 0) {
      continue
    }

    const remaining = specifiers.filter((s) => !MOVED_EXPORTS.has(s.importedName))
    const isTypeOnly = isTypeOnlyStatement(statement)

    const movedExport = buildExportStatement(
      moved.map((s) => s.specText),
      CONFIG_SOURCE,
      isTypeOnly,
    )

    const remainingExport =
      remaining.length > 0
        ? buildExportStatement(
            remaining.map((s) => s.specText),
            ROOT_SOURCE,
            isTypeOnly,
          )
        : ''

    const replacement = remainingExport ? `${remainingExport}\n${movedExport}` : movedExport

    edits.push(statement.replace(replacement))

    for (const specifier of moved) {
      migrationMetric.increment({
        kind: 'export',
        symbol: specifier.importedName,
      })
    }
  }

  if (edits.length === 0) {
    return null
  }

  const result = await Promise.resolve(rootNode.commitEdits(edits))
  return result
}

export default transform
