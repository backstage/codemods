import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('move-connections-config-imports')

const ROOT_SOURCE = '@backstage/connections'
const CONFIG_SOURCE = '@backstage/connections/config'

const MOVED_EXPORT_LIST = ['buildConnectionsFromConfig', 'ConfiguredConnection', 'ConfiguredConnectionAuth']
const MOVED_EXPORTS = new Set(MOVED_EXPORT_LIST)

const DYNAMIC_IMPORT_TODO =
  "// TODO(backstage-codemod): Review dynamic import from '@backstage/connections' — move configuration exports to '@backstage/connections/config' when provenance is clear."

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

function withPreservedInlineComments(statement: SgNode<TSX>, replacement: string): string {
  const comments = statement.findAll({ rule: { kind: 'comment' } }).map((c) => c.text())
  if (comments.length === 0) {
    return replacement
  }

  const missingComments = comments.filter((comment) => !replacement.includes(comment))
  if (missingComments.length === 0) {
    return replacement
  }

  return `${missingComments.join('\n')}\n${replacement}`
}

function collectLocalReferences(aliasNode: SgNode<TSX>, filename: string): SgNode<TSX>[] {
  const refs: SgNode<TSX>[] = []

  for (const refGroup of aliasNode.references()) {
    if (refGroup.root.filename() !== filename) {
      continue
    }

    for (const refNode of refGroup.nodes) {
      if (refNode.id() === aliasNode.id()) {
        continue
      }
      refs.push(refNode)
    }
  }

  return refs
}

function classifyNamespaceUsage(refNode: SgNode<TSX>): { outcome: 'moved' | 'non-moved' | 'unknown'; symbol?: string } {
  const parent = refNode.parent()
  if (!parent) {
    return { outcome: 'unknown' }
  }

  if (parent.kind() === 'member_expression') {
    const objectNode = parent.field('object')
    if (!objectNode || objectNode.id() !== refNode.id()) {
      return { outcome: 'unknown' }
    }

    const nestedMember = parent.parent()
    if (nestedMember?.kind() === 'member_expression') {
      const nestedObject = nestedMember.field('object')
      if (nestedObject && nestedObject.id() === parent.id()) {
        return { outcome: 'unknown' }
      }
    }

    const propertyNode = parent.field('property')
    if (!propertyNode) {
      return { outcome: 'unknown' }
    }

    const propertyName = propertyNode.text()
    if (MOVED_EXPORTS.has(propertyName)) {
      return { outcome: 'moved', symbol: propertyName }
    }

    if (propertyNode.is('property_identifier') || propertyNode.is('identifier')) {
      return { outcome: 'non-moved', symbol: propertyName }
    }

    return { outcome: 'unknown' }
  }

  if (parent.kind() === 'nested_type_identifier') {
    const segments = parent.children().filter((c) => c.is('identifier') || c.is('type_identifier'))

    if (segments.length !== 2) {
      return { outcome: 'unknown' }
    }

    const [namespaceNode, typeNode] = segments
    if (!namespaceNode || !typeNode || namespaceNode.id() !== refNode.id()) {
      return { outcome: 'unknown' }
    }

    const symbol = typeNode.text()
    if (MOVED_EXPORTS.has(symbol)) {
      return { outcome: 'moved', symbol }
    }

    return { outcome: 'non-moved', symbol }
  }

  return { outcome: 'unknown' }
}

function handleNamespaceImports(rootNode: SgNode<TSX>, edits: Edit[], filename: string, source: string): void {
  const rootImports = findStatementsFrom(rootNode, 'import_statement', ROOT_SOURCE)

  for (const statement of rootImports) {
    const namespaceImport = statement.find({ rule: { kind: 'namespace_import' } })
    if (!namespaceImport) {
      continue
    }

    const aliasNode = namespaceImport.find({ rule: { kind: 'identifier' } })
    if (!aliasNode) {
      continue
    }

    const alias = aliasNode.text()
    const defaultSpecifier = getImportDefaultSpecifier(statement)

    const movedSymbols = new Set<string>()
    const nonMovedSymbols = new Set<string>()
    let unknownUsage = false

    for (const refNode of collectLocalReferences(aliasNode, filename)) {
      const usage = classifyNamespaceUsage(refNode)
      if (usage.outcome === 'moved' && usage.symbol) {
        movedSymbols.add(usage.symbol)
      } else if (usage.outcome === 'non-moved' && usage.symbol) {
        nonMovedSymbols.add(usage.symbol)
      } else {
        unknownUsage = true
      }
    }

    const canMigrateSafely =
      movedSymbols.size > 0 && nonMovedSymbols.size === 0 && !unknownUsage && defaultSpecifier === null

    if (canMigrateSafely) {
      const sourceFragment = statement.find({
        rule: {
          kind: 'string_fragment',
          regex: escapeRegex(ROOT_SOURCE),
        },
      })

      if (sourceFragment) {
        edits.push(sourceFragment.replace(CONFIG_SOURCE))
      }

      for (const symbol of movedSymbols) {
        migrationMetric.increment({
          kind: 'namespace-import',
          action: 'migrated',
          alias,
          symbol,
        })
      }

      continue
    }

    const needsTodo = movedSymbols.size > 0 || unknownUsage
    if (!needsTodo) {
      continue
    }

    const reasons: string[] = []
    if (defaultSpecifier) {
      reasons.push('default-specifier')
    }
    if (nonMovedSymbols.size > 0) {
      reasons.push('mixed-members')
    }
    if (unknownUsage) {
      reasons.push('dynamic-or-ambiguous-usage')
    }

    const reasonSuffix = reasons.length > 0 ? ` (${reasons.join(', ')})` : ''
    const todoComment = `// TODO(backstage-codemod): Review namespace import '${alias}' from '${ROOT_SOURCE}'${reasonSuffix}. Move configuration exports to '${CONFIG_SOURCE}' when provenance is clear.`

    if (!source.includes(todoComment)) {
      edits.push(statement.replace(`${statement.text()}\n${todoComment}`))
      migrationMetric.increment({
        kind: 'namespace-import',
        action: 'todo',
        alias,
      })
    }
  }
}

function getFirstCallArgument(argumentsNode: SgNode<TSX>): SgNode<TSX> | null {
  for (const child of argumentsNode.children()) {
    if (child.text() === '(' || child.text() === ')' || child.text() === ',' || child.is('comment')) {
      continue
    }

    return child
  }

  return null
}

function handleDynamicImports(rootNode: SgNode<TSX>, edits: Edit[], source: string): void {
  if (source.includes(DYNAMIC_IMPORT_TODO)) {
    return
  }

  const hasDynamicImport = rootNode.findAll({ rule: { kind: 'call_expression' } }).some((callExpression) => {
    const calleeNode = callExpression.field('function')
    if (!calleeNode || !calleeNode.is('import')) {
      return false
    }

    const argumentsNode = callExpression.field('arguments')
    if (!argumentsNode) {
      return false
    }

    const firstArgument = getFirstCallArgument(argumentsNode)
    if (!firstArgument || !firstArgument.is('string')) {
      return false
    }

    return (
      firstArgument.find({
        rule: {
          kind: 'string_fragment',
          regex: escapeRegex(ROOT_SOURCE),
        },
      }) !== null
    )
  })

  if (!hasDynamicImport) {
    return
  }

  edits.push({
    startPos: 0,
    endPos: 0,
    insertedText: `${DYNAMIC_IMPORT_TODO}\n`,
  })

  migrationMetric.increment({
    kind: 'dynamic-import',
    action: 'todo',
  })
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []
  const source = rootNode.text()
  const filename = root.filename()

  const rootImports = findStatementsFrom(rootNode, 'import_statement', ROOT_SOURCE)

  for (const statement of rootImports) {
    const namespaceImport = statement.find({ rule: { kind: 'namespace_import' } })
    if (namespaceImport) {
      continue
    }

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

    edits.push(statement.replace(withPreservedInlineComments(statement, replacement)))

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

    edits.push(statement.replace(withPreservedInlineComments(statement, replacement)))

    for (const specifier of moved) {
      migrationMetric.increment({
        kind: 'export',
        symbol: specifier.importedName,
      })
    }
  }

  handleNamespaceImports(rootNode, edits, filename, source)
  handleDynamicImports(rootNode, edits, source)

  if (edits.length === 0) {
    return null
  }

  const result = await Promise.resolve(rootNode.commitEdits(edits))
  return result
}

export default transform
