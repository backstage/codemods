import { removeImport } from '@jssg/utils/javascript/imports'
import { parse } from 'codemod:ast-grep'
import type { Codemod, Edit, SgNode, SgRoot } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const KUBERNETES_REACT = '@backstage/plugin-kubernetes-react'
const TARGET_COMPONENTS = new Set(['FixDialog', 'ContainerCard', 'PodLogs'])
const TODO_COMMENT =
  '// TODO(backstage-codemod): Review effectful Kubernetes component children manually before removal.'
const TSX_LANG = 'tsx'

const migrationMetric = useMetricAtom('remove-kubernetes-implicit-children')

interface ImportedComponents {
  localNames: Map<string, string>
  namespaceAliases: string[]
}

interface InertAnalysis {
  safe: boolean
  reason?: string
}

interface ImportRemoval {
  edit: Edit
  localName: string
  importType: 'named' | 'default' | 'namespace'
}

function parseTsx(source: string): SgRoot<TSX> {
  return parse<TSX>(TSX_LANG, source)
}

function escapeRegex(str: string): string {
  return str.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function findImportStatementsFrom(rootNode: SgNode<TSX, 'program'>, source: string): SgNode<TSX, 'import_statement'>[] {
  return rootNode.findAll({
    rule: {
      kind: 'import_statement',
      has: {
        kind: 'string',
        has: {
          kind: 'string_fragment',
          regex: `^${escapeRegex(source)}$`,
        },
      },
    },
  }) as SgNode<TSX, 'import_statement'>[]
}

function collectImportedComponents(importStatements: SgNode<TSX, 'import_statement'>[]): ImportedComponents {
  const localNames = new Map<string, string>()
  const namespaceAliases: string[] = []

  for (const imp of importStatements) {
    const nsImport = imp.find({ rule: { kind: 'namespace_import' } })
    if (nsImport) {
      const aliasNode = nsImport.find({ rule: { kind: 'identifier' } })
      if (aliasNode) {
        namespaceAliases.push(aliasNode.text())
      }
      continue
    }

    for (const spec of imp.findAll({ rule: { kind: 'import_specifier' } })) {
      const identifiers = spec.findAll({
        rule: {
          any: [{ kind: 'identifier' }, { kind: 'type_identifier' }],
        },
      })

      const [importedNameNode, localNameNode] = identifiers
      if (!importedNameNode || !TARGET_COMPONENTS.has(importedNameNode.text())) {
        continue
      }

      localNames.set((localNameNode ?? importedNameNode).text(), importedNameNode.text())
    }
  }

  return { localNames, namespaceAliases }
}

function getOpeningElement(el: SgNode<TSX>): SgNode<TSX> | null {
  if (el.is('jsx_self_closing_element')) {
    return el
  }
  if (el.is('jsx_element')) {
    const opening = el.child(0)
    return opening?.is('jsx_opening_element') ? opening : null
  }
  return null
}

function getClosingElement(el: SgNode<TSX>): SgNode<TSX> | null {
  if (!el.is('jsx_element')) {
    return null
  }
  const closing = el.children().at(-1)
  return closing?.is('jsx_closing_element') ? closing : null
}

function getComponentNameNode(opening: SgNode<TSX>): SgNode<TSX> | null {
  return opening.child(1) ?? null
}

function getTargetComponentName(
  nameNode: SgNode<TSX>,
  localNames: Map<string, string>,
  namespaceAliases: string[],
): string | null {
  if (nameNode.is('identifier')) {
    return localNames.get(nameNode.text()) ?? null
  }

  if (nameNode.is('member_expression')) {
    const objNode = nameNode.child(0)
    const propNode = nameNode.find({ rule: { kind: 'property_identifier' } })

    if (
      objNode?.is('identifier') === true &&
      namespaceAliases.includes(objNode.text()) &&
      propNode !== null &&
      TARGET_COMPONENTS.has(propNode.text())
    ) {
      return propNode.text()
    }
  }

  return null
}

function isWhitespaceJsxText(node: SgNode<TSX>): boolean {
  return node.is('jsx_text') && node.text().trim().length === 0
}

function getJsxChildren(element: SgNode<TSX>): SgNode<TSX>[] {
  if (!element.is('jsx_element')) {
    return []
  }
  const children = element.children()
  if (children.length < 3) {
    return []
  }
  return children.slice(1, -1)
}

function safeAnalysis(): InertAnalysis {
  return { safe: true }
}

function unsafeAnalysis(reason: string): InertAnalysis {
  return { safe: false, reason }
}

function inferExpressionReason(node: SgNode<TSX>): string {
  const kind = node.kind()
  const hasSpread = node.findAll({ rule: { kind: 'spread_element' } }).length > 0
  if (kind === 'spread_element' || hasSpread) {
    return 'spread expression'
  }

  const hasFunctionCall =
    node.findAll({
      rule: {
        any: [
          { kind: 'call_expression' },
          { kind: 'new_expression' },
          { kind: 'await_expression' },
          { kind: 'yield_expression' },
        ],
      },
    }).length > 0

  if (
    kind === 'call_expression' ||
    kind === 'new_expression' ||
    kind === 'await_expression' ||
    kind === 'yield_expression' ||
    hasFunctionCall
  ) {
    return 'function call'
  }

  return 'computed expression'
}

function isInertJsxTagName(nameNode: SgNode<TSX>): boolean {
  if (nameNode.is('identifier')) {
    const name = nameNode.text()
    if (name === 'Fragment') {
      return true
    }
    const first = name.charAt(0)
    return first.length > 0 && first === first.toLowerCase()
  }

  if (nameNode.is('member_expression')) {
    const objectNode = nameNode.child(0)
    const propNode = nameNode.find({ rule: { kind: 'property_identifier' } })
    return objectNode?.is('identifier') === true && objectNode.text() === 'React' && propNode?.text() === 'Fragment'
  }

  return false
}

function analyzeExpressionContainer(expr: SgNode<TSX>): InertAnalysis {
  const meaningfulChildren = expr.children().filter((c) => c.kind() !== '{' && c.kind() !== '}')

  if (meaningfulChildren.length === 0) {
    return safeAnalysis()
  }

  for (const child of meaningfulChildren) {
    if (child.kind() === 'comment') {
      continue
    }
    const analysis = analyzeInertNode(child)
    if (!analysis.safe) {
      return analysis
    }
  }

  return safeAnalysis()
}

function analyzeAttributeValue(attr: SgNode<TSX>): InertAnalysis {
  const expr = attr.find({ rule: { kind: 'jsx_expression' } })
  if (expr) {
    return analyzeExpressionContainer(expr)
  }

  const str = attr.find({ rule: { kind: 'string' } })
  if (str) {
    return safeAnalysis()
  }

  return safeAnalysis()
}

function analyzeJsxRenderable(node: SgNode<TSX>): InertAnalysis {
  const opening = getOpeningElement(node)
  if (!opening) {
    return unsafeAnalysis('computed expression')
  }

  const nameNode = getComponentNameNode(opening)
  if (!nameNode || !isInertJsxTagName(nameNode)) {
    return unsafeAnalysis('unknown component initialization')
  }

  for (const child of opening.children()) {
    if (child.is('jsx_attribute')) {
      const analysis = analyzeAttributeValue(child)
      if (!analysis.safe) {
        return analysis
      }
      continue
    }

    if (child.is('jsx_expression')) {
      return unsafeAnalysis('spread expression')
    }
  }

  if (node.is('jsx_element')) {
    for (const child of getJsxChildren(node)) {
      if (isWhitespaceJsxText(child)) {
        continue
      }
      const analysis = analyzeInertNode(child)
      if (!analysis.safe) {
        return analysis
      }
    }
  }

  return safeAnalysis()
}

function analyzeInertNode(node: SgNode<TSX>): InertAnalysis {
  const kind = node.kind()

  if (kind === 'comment' || kind === 'jsx_text') {
    return safeAnalysis()
  }

  if (kind === 'string' || kind === 'number' || kind === 'true' || kind === 'false' || kind === 'null') {
    return safeAnalysis()
  }

  if (kind === 'template_string') {
    if (node.findAll({ rule: { kind: 'template_substitution' } }).length > 0) {
      return unsafeAnalysis('computed expression')
    }
    return safeAnalysis()
  }

  if (kind === 'parenthesized_expression') {
    const meaningful = node.children().filter((c) => c.kind() !== '(' && c.kind() !== ')')
    if (meaningful.length === 0) {
      return safeAnalysis()
    }
    for (const child of meaningful) {
      const analysis = analyzeInertNode(child)
      if (!analysis.safe) {
        return analysis
      }
    }
    return safeAnalysis()
  }

  if (kind === 'jsx_expression') {
    return analyzeExpressionContainer(node)
  }

  if (kind === 'jsx_fragment' || kind === 'jsx_element' || kind === 'jsx_self_closing_element') {
    return analyzeJsxRenderable(node)
  }

  return unsafeAnalysis(inferExpressionReason(node))
}

function findChildrenAttribute(opening: SgNode<TSX>): SgNode<TSX> | null {
  for (const child of opening.children()) {
    if (!child.is('jsx_attribute')) {
      continue
    }

    const attrNameNode = child.find({
      rule: {
        kind: 'property_identifier',
        regex: '^children$',
      },
    })

    if (attrNameNode) {
      return child
    }
  }

  return null
}

function removeNodeWithLeadingWhitespace(node: SgNode<TSX>, fullSource: string): Edit {
  let startPos = node.range().start.index
  const endPos = node.range().end.index

  while (startPos > 0 && (fullSource[startPos - 1] === ' ' || fullSource[startPos - 1] === '\t')) {
    startPos--
  }

  let lineStart = startPos
  while (lineStart > 0 && fullSource[lineStart - 1] !== '\n') {
    lineStart--
  }

  if (startPos === lineStart && startPos > 0 && fullSource[startPos - 1] === '\n') {
    startPos--
  }

  return {
    startPos,
    endPos,
    insertedText: '',
  }
}

function findContainingStatement(node: SgNode<TSX>): SgNode<TSX> | null {
  let current = node

  for (;;) {
    const parent = current.parent()
    if (!parent) {
      return null
    }

    const parentKind = parent.kind()
    if (parentKind === 'statement_block' || parentKind === 'program') {
      return current
    }

    current = parent
  }
}

function getIndentation(node: SgNode<TSX>, fullSource: string): string {
  const startIndex = node.range().start.index
  let lineStart = startIndex

  while (lineStart > 0 && fullSource[lineStart - 1] !== '\n') {
    lineStart--
  }

  const linePrefix = fullSource.slice(lineStart, startIndex)
  const match = linePrefix.match(/^(\s*)/)
  return match ? (match[1] ?? '') : ''
}

function hasTodoBeforeStatement(node: SgNode<TSX>, fullSource: string): boolean {
  const startIndex = node.range().start.index
  let lineStart = startIndex

  while (lineStart > 0 && fullSource[lineStart - 1] !== '\n') {
    lineStart--
  }

  if (lineStart === 0) {
    return false
  }

  const prevLineEnd = lineStart - 1
  let prevLineStart = prevLineEnd
  while (prevLineStart > 0 && fullSource[prevLineStart - 1] !== '\n') {
    prevLineStart--
  }

  const prevLine = fullSource.slice(prevLineStart, prevLineEnd).trim()
  return prevLine === TODO_COMMENT
}

function rangesOverlap(a: Edit, b: Edit): boolean {
  return a.startPos < b.endPos && b.startPos < a.endPos
}

function canAddEdits(existing: Edit[], incoming: Edit[]): boolean {
  for (const next of incoming) {
    for (const current of existing) {
      if (rangesOverlap(next, current)) {
        return false
      }
    }
  }

  for (let i = 0; i < incoming.length; i++) {
    const current = incoming[i]
    if (!current) {
      continue
    }
    for (let j = i + 1; j < incoming.length; j++) {
      const next = incoming[j]
      if (!next) {
        continue
      }
      if (rangesOverlap(current, next)) {
        return false
      }
    }
  }

  return true
}

function collectIdentifiersFromNode(node: SgNode<TSX>, target: Set<string>): void {
  if (node.is('identifier') || node.is('type_identifier')) {
    target.add(node.text())
  }

  for (const id of node.findAll({
    rule: {
      any: [{ kind: 'identifier' }, { kind: 'type_identifier' }],
    },
  })) {
    target.add(id.text())
  }
}

function hasUsageOutsideImports(
  rootNode: SgNode<TSX, 'program'>,
  localName: string,
  declarationNodeId: number,
): boolean {
  const escaped = escapeRegex(localName)
  const matches = rootNode.findAll({
    rule: {
      any: [
        { kind: 'identifier', regex: `^${escaped}$` },
        { kind: 'type_identifier', regex: `^${escaped}$` },
      ],
    },
  })

  for (const match of matches) {
    if (match.id() === declarationNodeId) {
      continue
    }

    if (match.inside({ rule: { kind: 'import_statement' } })) {
      continue
    }

    return true
  }

  return false
}

function getImportSource(statement: SgNode<TSX, 'import_statement'>): string | null {
  const source = statement.field('source')
  if (!source) {
    return null
  }

  const fragment = source.find({ rule: { kind: 'string_fragment' } })
  return fragment?.text() ?? null
}

function findUnusedCandidateImportRemoval(
  rootNode: SgNode<TSX, 'program'>,
  candidateNames: Set<string>,
): ImportRemoval | null {
  if (candidateNames.size === 0) {
    return null
  }

  const importStatements = rootNode.findAll({
    rule: {
      kind: 'import_statement',
    },
  }) as SgNode<TSX, 'import_statement'>[]

  for (const statement of importStatements) {
    const source = getImportSource(statement)
    if (!source) {
      continue
    }

    for (const specifier of statement.findAll({ rule: { kind: 'import_specifier' } })) {
      const importedNameNode = specifier.field('name')
      if (!importedNameNode) {
        continue
      }

      const localNameNode = specifier.field('alias') ?? importedNameNode
      const localName = localNameNode.text()
      if (!candidateNames.has(localName)) {
        continue
      }

      if (hasUsageOutsideImports(rootNode, localName, localNameNode.id())) {
        continue
      }

      const edit = removeImport(rootNode, {
        type: 'named',
        specifiers: [importedNameNode.text()],
        from: source,
      })

      if (edit) {
        return { edit, localName, importType: 'named' }
      }
    }

    const importClause = statement.find({ rule: { kind: 'import_clause' } })
    if (importClause) {
      const defaultBinding = importClause.children().find((c) => c.is('identifier'))
      if (defaultBinding) {
        const localName = defaultBinding.text()
        if (candidateNames.has(localName) && !hasUsageOutsideImports(rootNode, localName, defaultBinding.id())) {
          const edit = removeImport(rootNode, {
            type: 'default',
            from: source,
          })

          if (edit) {
            return { edit, localName, importType: 'default' }
          }
        }
      }
    }

    const namespaceImport = statement.find({ rule: { kind: 'namespace_import' } })
    if (namespaceImport) {
      const aliasNode = namespaceImport.find({
        rule: {
          any: [{ kind: 'identifier' }, { kind: 'type_identifier' }],
        },
      })

      if (aliasNode) {
        const localName = aliasNode.text()
        if (candidateNames.has(localName) && !hasUsageOutsideImports(rootNode, localName, aliasNode.id())) {
          const edit = removeImport(rootNode, {
            type: 'namespace',
            from: source,
          })

          if (edit) {
            return { edit, localName, importType: 'namespace' }
          }
        }
      }
    }
  }

  return null
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const fullSource = rootNode.text()

  const kubernetesImports = findImportStatementsFrom(rootNode, KUBERNETES_REACT)
  if (kubernetesImports.length === 0) {
    return null
  }

  const { localNames, namespaceAliases } = collectImportedComponents(kubernetesImports)
  if (localNames.size === 0 && namespaceAliases.length === 0) {
    return null
  }

  const edits: Edit[] = []
  const todoStatementIds = new Set<number>()
  const removedIdentifierCandidates = new Set<string>()

  const jsxNodes = rootNode.findAll({
    rule: {
      any: [{ kind: 'jsx_element' }, { kind: 'jsx_self_closing_element' }],
    },
  })

  const sortedNodes = [...jsxNodes].sort((a, b) => a.range().start.index - b.range().start.index)

  for (const node of sortedNodes) {
    const opening = getOpeningElement(node)
    if (!opening) {
      continue
    }

    const nameNode = getComponentNameNode(opening)
    if (!nameNode) {
      continue
    }

    const componentName = getTargetComponentName(nameNode, localNames, namespaceAliases)
    if (!componentName) {
      continue
    }

    const childrenAttr = findChildrenAttribute(opening)

    let childrenAttrSafe = false
    let unsafeReason: string | null = null

    if (childrenAttr) {
      const analysis = analyzeAttributeValue(childrenAttr)
      if (!analysis.safe) {
        unsafeReason = analysis.reason ?? 'computed expression'
      } else {
        childrenAttrSafe = true
      }
    }

    const jsxChildren = node.is('jsx_element') ? getJsxChildren(node) : []
    const meaningfulChildren = jsxChildren.filter((child) => !isWhitespaceJsxText(child))

    if (!unsafeReason && meaningfulChildren.length > 0) {
      for (const child of meaningfulChildren) {
        const analysis = analyzeInertNode(child)
        if (!analysis.safe) {
          unsafeReason = analysis.reason ?? 'computed expression'
          break
        }
      }
    }

    if (unsafeReason) {
      const statement = findContainingStatement(node)
      if (!statement) {
        continue
      }

      const statementId = statement.id()
      if (todoStatementIds.has(statementId) || hasTodoBeforeStatement(statement, fullSource)) {
        continue
      }

      todoStatementIds.add(statementId)
      const indent = getIndentation(statement, fullSource)
      const todoEdit: Edit = {
        startPos: statement.range().start.index,
        endPos: statement.range().start.index,
        insertedText: `${TODO_COMMENT}\n${indent}`,
      }

      if (!canAddEdits(edits, [todoEdit])) {
        continue
      }

      edits.push(todoEdit)
      migrationMetric.increment({ action: 'todo-added', component: componentName, reason: unsafeReason })
      continue
    }

    const elementEdits: Edit[] = []
    const removedNodes: SgNode<TSX>[] = []

    if (childrenAttrSafe && childrenAttr) {
      elementEdits.push(removeNodeWithLeadingWhitespace(childrenAttr, fullSource))
      removedNodes.push(childrenAttr)
    }

    if (node.is('jsx_element') && (meaningfulChildren.length > 0 || childrenAttrSafe)) {
      const closing = getClosingElement(node)
      if (!closing) {
        continue
      }

      const openingEnd = opening.range().end.index
      elementEdits.push({
        startPos: openingEnd,
        endPos: closing.range().start.index,
        insertedText: '',
      })
      elementEdits.push({
        startPos: openingEnd - 1,
        endPos: openingEnd,
        insertedText: ' />',
      })
      elementEdits.push({
        startPos: closing.range().start.index,
        endPos: closing.range().end.index,
        insertedText: '',
      })

      for (const child of meaningfulChildren) {
        removedNodes.push(child)
      }
    }

    if (elementEdits.length === 0 || !canAddEdits(edits, elementEdits)) {
      continue
    }

    edits.push(...elementEdits)

    if (childrenAttrSafe && childrenAttr) {
      migrationMetric.increment({ action: 'children-prop-removed', component: componentName })
    }

    if (meaningfulChildren.length > 0) {
      migrationMetric.increment({ action: 'nested-children-removed', component: componentName })
    }

    for (const removedNode of removedNodes) {
      collectIdentifiersFromNode(removedNode, removedIdentifierCandidates)
    }
  }

  if (edits.length === 0) {
    return null
  }

  let out = rootNode.commitEdits(edits)

  for (;;) {
    const phaseRoot = parseTsx(out).root()
    const removal = findUnusedCandidateImportRemoval(phaseRoot, removedIdentifierCandidates)
    if (!removal) {
      break
    }

    out = phaseRoot.commitEdits([removal.edit])
    migrationMetric.increment({
      action: 'unused-import-removed',
      importType: removal.importType,
      local: removal.localName,
    })
  }

  const result = await Promise.resolve(out)
  return result
}

export default transform
