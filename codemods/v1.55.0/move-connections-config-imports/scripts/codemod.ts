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

function deferMixedDeclarationWithDirective(
  rootNode: SgNode<TSX>,
  statement: SgNode<TSX, 'import_statement' | 'export_statement'>,
  edits: Edit[],
  kind: 'import' | 'export',
): boolean {
  const comments = rootNode.children().filter((child) => child.is('comment'))
  const isDirective = (comment: SgNode<TSX>) => /^\s*(?:\/\/|\/\*)\s*@ts-(?:expect-error|ignore)\b/.test(comment.text())
  const precedingDirective = comments.find(
    (comment) => comment.range().end.line === statement.range().start.line - 1 && isDirective(comment),
  )
  const inlineDirective = statement.findAll({ rule: { kind: 'comment' } }).find(isDirective)
  if (!precedingDirective && !inlineDirective) {
    return false
  }

  const anchor = precedingDirective ?? statement
  const todo = `// TODO(backstage-codemod): Review mixed ${kind} from '${ROOT_SOURCE}' with next-line diagnostic directive; move configuration exports to '${CONFIG_SOURCE}' manually.`
  if (
    !comments.some((comment) => comment.range().end.line === anchor.range().start.line - 1 && comment.text() === todo)
  ) {
    edits.push({
      startPos: anchor.range().start.index,
      endPos: anchor.range().start.index,
      insertedText: `${todo}\n`,
    })
    migrationMetric.increment({ kind, action: 'todo' })
  }
  return true
}

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
  leadingComments: { text: string; ownLine: boolean }[]
  trailingComment?: string
}

function extractSpecifiers(node: SgNode<TSX>, kind: 'import_specifier' | 'export_specifier'): SpecifierInfo[] {
  const specifiers = node.findAll({ rule: { kind } })
  const result: SpecifierInfo[] = []

  for (const [index, spec] of specifiers.entries()) {
    const importedNameNode = spec
      .children()
      .find((child) => child.is('identifier') || child.is('type_identifier') || child.is('string'))
    if (!importedNameNode) {
      continue
    }

    const previous = specifiers[index - 1]
    const next = specifiers[index + 1]
    const siblings = spec.parent()?.children() ?? []
    const comments = siblings.filter((child) => child.is('comment'))
    const trailingComment = comments.find((comment) => {
      if (
        comment.range().start.index <= spec.range().end.index ||
        comment.range().start.line !== spec.range().end.line
      ) {
        return false
      }
      const comma = siblings.find(
        (child) =>
          child.text() === ',' &&
          child.range().start.index > spec.range().end.index &&
          child.range().start.index < comment.range().start.index,
      )
      return (
        (!comma || comment.text().startsWith('//')) && (!next || comment.range().start.index < next.range().start.index)
      )
    })
    const leadingComments = comments
      .filter(
        (comment) =>
          comment.range().end.index <= spec.range().start.index &&
          (!previous || comment.range().start.index > previous.range().end.index) &&
          !(previous && comment.range().start.line === previous.range().end.line && comment.text().startsWith('//')) &&
          !(
            previous &&
            siblings.some(
              (child) =>
                child.text() === ',' &&
                child.range().start.index > comment.range().end.index &&
                child.range().start.index < spec.range().start.index,
            )
          ),
      )
      .map((comment) => ({ text: comment.text(), ownLine: comment.range().end.line < spec.range().start.line }))

    result.push({
      importedName: importedNameNode.is('string')
        ? (importedNameNode.find({ rule: { kind: 'string_fragment' } })?.text() ?? '')
        : importedNameNode.text(),
      specText: spec.text(),
      leadingComments,
      trailingComment: trailingComment?.text(),
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

function buildNamedSpecifiers(specifiers: SpecifierInfo[]): string {
  const render = (specifier: SpecifierInfo, multiline: boolean): string => {
    const leading = specifier.leadingComments
      .map(
        (comment) => `${comment.text}${multiline && (comment.ownLine || comment.text.startsWith('//')) ? '\n  ' : ' '}`,
      )
      .join('')
    return `${leading}${specifier.specText}${multiline ? ',' : ''}${specifier.trailingComment ? ` ${specifier.trailingComment}` : ''}`
  }
  const multiline =
    specifiers.length > 2 ||
    specifiers.some(
      (s) =>
        (s.trailingComment?.startsWith('//') ?? false) ||
        s.leadingComments.some((c) => c.ownLine || c.text.startsWith('//')),
    )
  if (!multiline) {
    return `{ ${specifiers.map((s) => render(s, false)).join(', ')} }`
  }

  return `{\n  ${specifiers.map((s) => render(s, true)).join('\n  ')}\n}`
}

function buildImportStatement(
  specifiers: SpecifierInfo[],
  source: string,
  isTypeOnly: boolean,
  defaultSpecifier: string | null,
  attributes: string,
): string {
  const typeKeyword = isTypeOnly ? 'type ' : ''
  const suffix = attributes ? ` ${attributes}` : ''

  if (specifiers.length === 0 && defaultSpecifier) {
    return `import ${typeKeyword}${defaultSpecifier} from '${source}'${suffix};`
  }

  const namedSpecifiers = buildNamedSpecifiers(specifiers)

  if (defaultSpecifier) {
    return `import ${typeKeyword}${defaultSpecifier}, ${namedSpecifiers} from '${source}'${suffix};`
  }

  return `import ${typeKeyword}${namedSpecifiers} from '${source}'${suffix};`
}

function buildExportStatement(specifiers: SpecifierInfo[], source: string, isTypeOnly: boolean): string {
  const typeKeyword = isTypeOnly ? 'type ' : ''
  const namedSpecifiers = buildNamedSpecifiers(specifiers)
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

function isTypeContext(node: SgNode<TSX>): boolean {
  let current: SgNode<TSX> | null = node

  while (current) {
    const kind = current.kind()
    if (kind.includes('type') || kind === 'interface_declaration') {
      return true
    }

    if (
      kind === 'expression_statement' ||
      kind === 'lexical_declaration' ||
      kind === 'statement_block' ||
      kind === 'return_statement' ||
      kind === 'arguments' ||
      kind === 'array' ||
      kind === 'object' ||
      kind === 'pair'
    ) {
      return false
    }

    current = current.parent()
  }

  return false
}

function isIdentifierLikeNode(node: SgNode<TSX>): boolean {
  return node.is('identifier') || node.is('property_identifier') || node.is('type_identifier')
}

function getDynamicImportMemberSymbol(callExpression: SgNode<TSX>): string | null {
  let current: SgNode<TSX> = callExpression

  for (;;) {
    const parentNode: SgNode<TSX> = current.parent() as SgNode<TSX>

    if (parentNode.kind() === 'member_expression') {
      const objectNode = parentNode.field('object')
      const propertyNode = parentNode.field('property')
      if (objectNode?.id() === current.id() && propertyNode && isIdentifierLikeNode(propertyNode)) {
        return propertyNode.text()
      }
    }

    const argumentNode = parentNode.field('argument')
    const qualifierNode = parentNode.field('qualifier')
    if (argumentNode?.id() === current.id() && qualifierNode && isIdentifierLikeNode(qualifierNode)) {
      return qualifierNode.text()
    }

    if (
      parentNode.kind() === 'program' ||
      parentNode.kind() === 'expression_statement' ||
      parentNode.kind() === 'lexical_declaration' ||
      parentNode.kind() === 'statement_block' ||
      parentNode.kind() === 'return_statement' ||
      parentNode.kind() === 'arguments' ||
      parentNode.kind() === 'array' ||
      parentNode.kind() === 'object' ||
      parentNode.kind() === 'pair'
    ) {
      return null
    }

    current = parentNode
  }
}

function isLikelyTsxGenericTypeArgument(callExpression: SgNode<TSX>): boolean {
  const memberNode = callExpression.parent()
  if (memberNode?.kind() !== 'member_expression') {
    return false
  }

  const memberObject = memberNode.field('object')
  if (!memberObject || memberObject.id() !== callExpression.id()) {
    return false
  }

  const lessThanExpression = memberNode.parent()
  if (lessThanExpression?.kind() !== 'binary_expression') {
    return false
  }

  const lessThanRight = lessThanExpression.field('right')
  if (!lessThanRight || lessThanRight.id() !== memberNode.id()) {
    return false
  }

  const greaterThanExpression = lessThanExpression.parent()
  if (greaterThanExpression?.kind() !== 'binary_expression') {
    return false
  }

  const greaterThanLeft = greaterThanExpression.field('left')
  if (!greaterThanLeft || greaterThanLeft.id() !== lessThanExpression.id()) {
    return false
  }

  const greaterThanRight = greaterThanExpression.field('right')
  if (!greaterThanRight) {
    return false
  }

  return (
    greaterThanRight.kind() === 'parenthesized_expression' ||
    greaterThanRight.kind() === 'arguments' ||
    greaterThanRight.text().startsWith('({')
  )
}

function isKnownUnmovedDynamicImportUsage(callExpression: SgNode<TSX>): boolean {
  let valueNode = callExpression
  let parent = valueNode.parent()
  if (parent?.kind() === 'await_expression') {
    valueNode = parent
    parent = valueNode.parent()
  }
  while (parent?.kind() === 'parenthesized_expression') {
    valueNode = parent
    parent = valueNode.parent()
  }
  if (parent?.kind() === 'member_expression' && parent.field('object')?.id() === valueNode.id()) {
    const property = parent.field('property')
    return !!property && isIdentifierLikeNode(property) && !MOVED_EXPORTS.has(property.text())
  }

  const declarator = parent
  if (declarator?.kind() !== 'variable_declarator' || declarator.field('value')?.id() !== valueNode.id()) {
    return false
  }

  const pattern = declarator.field('name')
  if (!pattern?.is('object_pattern')) {
    return false
  }

  const properties = pattern
    .children()
    .filter((child) => child.text() !== '{' && child.text() !== '}' && child.text() !== ',')
  return (
    properties.length > 0 &&
    properties.every((property) => {
      const name = property.is('shorthand_property_identifier_pattern')
        ? property.text()
        : property.is('pair_pattern')
          ? property
              .children()
              .find((child) => child.is('property_identifier'))
              ?.text()
          : undefined
      return name !== undefined && !MOVED_EXPORTS.has(name)
    })
  )
}

function getDirectAwaitedDynamicImportSymbols(callExpression: SgNode<TSX>): string[] | null {
  const awaited = callExpression.parent()
  if (awaited?.kind() !== 'await_expression') {
    return null
  }

  let valueNode = awaited
  let parent = valueNode.parent()
  while (parent?.kind() === 'parenthesized_expression') {
    valueNode = parent
    parent = valueNode.parent()
  }

  if (parent?.kind() === 'member_expression' && parent.field('object')?.id() === valueNode.id()) {
    const property = parent.field('property')
    return property && isIdentifierLikeNode(property) && MOVED_EXPORTS.has(property.text()) ? [property.text()] : null
  }

  if (parent?.kind() !== 'variable_declarator' || parent.field('value')?.id() !== valueNode.id()) {
    return null
  }

  const pattern = parent.field('name')
  if (!pattern?.is('object_pattern')) {
    return null
  }

  const properties = pattern
    .children()
    .filter((child) => child.text() !== '{' && child.text() !== '}' && child.text() !== ',')
  const names = properties.map((property) =>
    property.is('shorthand_property_identifier_pattern')
      ? property.text()
      : property.is('pair_pattern')
        ? property
            .children()
            .find((child) => child.is('property_identifier'))
            ?.text()
        : undefined,
  )
  return names.length > 0 && names.every((name) => name !== undefined && MOVED_EXPORTS.has(name))
    ? (names as string[])
    : null
}

function classifyDynamicImportCall(callExpression: SgNode<TSX>): {
  action: 'ignore' | 'migrate' | 'todo'
  sourceFragment?: SgNode<TSX>
  symbols?: string[]
} {
  const calleeNode = callExpression.field('function')
  if (!calleeNode || !calleeNode.is('import')) {
    return { action: 'ignore' }
  }

  const argumentsNode = callExpression.field('arguments')
  if (!argumentsNode) {
    return { action: 'ignore' }
  }

  const firstArgument = getFirstCallArgument(argumentsNode)
  if (!firstArgument || !firstArgument.is('string')) {
    return { action: 'ignore' }
  }

  const sourceFragment = firstArgument.find({
    rule: {
      kind: 'string_fragment',
      regex: escapeRegex(ROOT_SOURCE),
    },
  })

  if (!sourceFragment) {
    return { action: 'ignore' }
  }

  const isTypeOnlyDynamicImport = isTypeContext(callExpression) || isLikelyTsxGenericTypeArgument(callExpression)
  if (!isTypeOnlyDynamicImport) {
    const symbols = getDirectAwaitedDynamicImportSymbols(callExpression)
    if (symbols) {
      return { action: 'migrate', sourceFragment, symbols }
    }
    return { action: isKnownUnmovedDynamicImportUsage(callExpression) ? 'ignore' : 'todo' }
  }

  const symbol = getDynamicImportMemberSymbol(callExpression)
  if (symbol && MOVED_EXPORTS.has(symbol)) {
    return { action: 'migrate', sourceFragment, symbols: [symbol] }
  }

  return { action: 'ignore' }
}

function handleDynamicImports(rootNode: SgNode<TSX>, edits: Edit[], source: string): void {
  const hasTodoComment = source.includes(DYNAMIC_IMPORT_TODO)
  let needsTodo = false

  for (const callExpression of rootNode.findAll({ rule: { kind: 'call_expression' } })) {
    const classification = classifyDynamicImportCall(callExpression)

    if (classification.action === 'migrate' && classification.sourceFragment && classification.symbols) {
      edits.push(classification.sourceFragment.replace(CONFIG_SOURCE))
      for (const symbol of classification.symbols) {
        migrationMetric.increment({
          kind:
            isTypeContext(callExpression) || isLikelyTsxGenericTypeArgument(callExpression)
              ? 'dynamic-import-type'
              : 'dynamic-import',
          action: 'migrated',
          symbol,
        })
      }
      continue
    }

    if (classification.action === 'todo') {
      needsTodo = true
    }
  }

  if (!needsTodo || hasTodoComment) {
    return
  }

  const insertPos = source.startsWith('#!') ? source.indexOf('\n') + 1 : 0
  edits.push({
    startPos: insertPos,
    endPos: insertPos,
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
    if (
      (remaining.length > 0 || defaultSpecifier) &&
      deferMixedDeclarationWithDirective(rootNode, statement, edits, 'import')
    ) {
      continue
    }
    const isTypeOnly = isTypeOnlyStatement(statement)
    const attributes =
      statement
        .children()
        .find((child) => child.is('import_attribute'))
        ?.text() ?? ''

    const movedImport = buildImportStatement(moved, CONFIG_SOURCE, isTypeOnly, null, attributes)

    const remainingImport =
      remaining.length > 0 || defaultSpecifier
        ? buildImportStatement(remaining, ROOT_SOURCE, isTypeOnly, defaultSpecifier, attributes)
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
    if (remaining.length > 0 && deferMixedDeclarationWithDirective(rootNode, statement, edits, 'export')) {
      continue
    }
    const isTypeOnly = isTypeOnlyStatement(statement)

    const movedExport = buildExportStatement(moved, CONFIG_SOURCE, isTypeOnly)

    const remainingExport = remaining.length > 0 ? buildExportStatement(remaining, ROOT_SOURCE, isTypeOnly) : ''

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
