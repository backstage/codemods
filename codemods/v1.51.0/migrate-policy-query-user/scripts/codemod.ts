import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const PERMISSION_NODE = '@backstage/plugin-permission-node'
const REMOVED_FIELDS = new Set(['token', 'expiresInSeconds'])
const IDENTITY_FIELD = 'identity'
const INFO_FIELD = 'info'

const TODO_TOKEN = '// TODO(backstage-codemod): migrate to credentials via coreServices.auth'

const migrationMetric = useMetricAtom('migrate-policy-query-user')

function exactMatchRegex(str: string): string {
  return `^${str.replaceAll(/[.*+?^${}()|[\]\\/]/g, '\\$&')}$`
}

function getDirectPairs(objectNode: SgNode<TSX>): SgNode<TSX, 'pair'>[] {
  return objectNode.children().filter((c) => c.kind() === 'pair') as SgNode<TSX, 'pair'>[]
}

function getDirectPropertyNames(objectNode: SgNode<TSX>): string[] {
  return getDirectPairs(objectNode)
    .map((pair) => pair.field('key'))
    .filter((key): key is SgNode<TSX, 'property_identifier'> => key.is('property_identifier'))
    .map((key) => key.text())
}

function findImportStatementsFrom(rootNode: SgNode<TSX>, source: string): SgNode<TSX, 'import_statement'>[] {
  return rootNode.findAll({
    rule: {
      kind: 'import_statement',
      has: {
        kind: 'string',
        has: {
          kind: 'string_fragment',
          regex: exactMatchRegex(source),
        },
      },
    },
  }) as SgNode<TSX, 'import_statement'>[]
}

function importsFromPermissionNode(rootNode: SgNode<TSX>): boolean {
  return findImportStatementsFrom(rootNode, PERMISSION_NODE).length > 0
}

function getLineIndent(source: string, startIndex: number): string {
  const lineStart = source.lastIndexOf('\n', startIndex - 1) + 1
  const lineEnd = source.indexOf('\n', startIndex)
  const line = source.slice(lineStart, lineEnd === -1 ? undefined : lineEnd)
  return line.match(/^(\s*)/)?.[1] ?? ''
}

function consumeTrailingNewline(source: string, endIndex: number): number {
  return source[endIndex] === '\n' ? endIndex + 1 : endIndex
}

function isPolicyQueryUserTypeAnnotation(typeNode: SgNode<TSX> | null): boolean {
  if (!typeNode) {
    return false
  }
  if (typeNode.text() === 'PolicyQueryUser') {
    return true
  }
  return typeNode.find({ rule: { kind: 'type_identifier', regex: exactMatchRegex('PolicyQueryUser') } }) !== null
}

function trackPolicyQueryUserBindings(rootNode: SgNode<TSX>): Set<string> {
  const bindings = new Set<string>()

  for (const param of rootNode.findAll({ rule: { kind: 'required_parameter' } })) {
    const nameNode = param.field('pattern')
    const typeNode = param.field('type')
    if (!nameNode?.is('identifier')) {
      continue
    }
    if (isPolicyQueryUserTypeAnnotation(typeNode)) {
      bindings.add(nameNode.text())
    }
  }

  for (const param of rootNode.findAll({ rule: { kind: 'optional_parameter' } })) {
    const nameNode = param.field('pattern')
    const typeNode = param.field('type')
    if (!nameNode?.is('identifier')) {
      continue
    }
    if (isPolicyQueryUserTypeAnnotation(typeNode)) {
      bindings.add(nameNode.text())
    }
  }

  for (const method of rootNode.findAll({ rule: { kind: 'method_definition' } })) {
    const nameNode = method.field('name')
    if (nameNode?.text() !== 'handle') {
      continue
    }
    const params = method.find({ rule: { kind: 'formal_parameters' } })
    if (!params) {
      continue
    }
    const [, userParam] = params.children().filter((c) => c.isNamed())
    const pattern = userParam?.field('pattern')
    if (pattern?.is('identifier')) {
      bindings.add(pattern.text())
    }
  }

  return bindings
}

interface ObjectPatternBinding {
  localName: string
  fieldName: string
}

function collectObjectPatternBindings(objectPattern: SgNode<TSX>): ObjectPatternBinding[] {
  const bindings: ObjectPatternBinding[] = []

  for (const child of objectPattern.children()) {
    if (child.is('shorthand_property_identifier_pattern')) {
      bindings.push({ localName: child.text(), fieldName: child.text() })
      continue
    }
    if (child.is('pair_pattern')) {
      const keyNode = child.field('key')
      if (!keyNode.is('property_identifier')) {
        continue
      }
      const valueNode = child.field('value')
      const fieldName = keyNode.text()
      const localName = valueNode.is('identifier') ? valueNode.text() : fieldName
      bindings.push({ localName, fieldName })
    }
  }

  return bindings
}

function rebuildObjectPattern(objectPattern: SgNode<TSX>): { text: string; renamedLocals: Map<string, string> } | null {
  const bindings = collectObjectPatternBindings(objectPattern)
  if (bindings.length === 0) {
    return null
  }

  const renamedLocals = new Map<string, string>()
  const kept: string[] = []
  let changed = false

  for (const binding of bindings) {
    if (REMOVED_FIELDS.has(binding.fieldName)) {
      changed = true
      continue
    }
    if (binding.fieldName === IDENTITY_FIELD) {
      changed = true
      if (binding.localName === IDENTITY_FIELD) {
        kept.push(INFO_FIELD)
        renamedLocals.set(IDENTITY_FIELD, INFO_FIELD)
      } else {
        kept.push(`${INFO_FIELD}: ${binding.localName}`)
      }
      continue
    }
    if (binding.localName === binding.fieldName) {
      kept.push(binding.fieldName)
    } else {
      kept.push(`${binding.fieldName}: ${binding.localName}`)
    }
  }

  if (!changed) {
    return null
  }

  if (kept.length === 0) {
    return { text: '{}', renamedLocals }
  }

  return { text: `{ ${kept.join(', ')} }`, renamedLocals }
}

function processObjectPattern(objectPattern: SgNode<TSX>, edits: Edit[]): Map<string, string> {
  const rebuilt = rebuildObjectPattern(objectPattern)
  if (!rebuilt) {
    return new Map()
  }

  edits.push(objectPattern.replace(rebuilt.text))
  migrationMetric.increment({ action: 'object-pattern-updated' })
  return rebuilt.renamedLocals
}

function isPolicyQueryUserObjectLiteral(objectNode: SgNode<TSX>): boolean {
  const parent = objectNode.parent()
  if (!parent) {
    return false
  }

  if (parent.is('variable_declarator')) {
    const typeNode = parent.field('type')
    if (isPolicyQueryUserTypeAnnotation(typeNode)) {
      return true
    }
  }

  if (parent.is('as_expression')) {
    const namedChildren = parent.children().filter((c) => c.isNamed())
    const typeNode = namedChildren.at(-1) ?? null
    if (isPolicyQueryUserTypeAnnotation(typeNode)) {
      return true
    }
  }

  const properties = getDirectPropertyNames(objectNode)
  const hasCredentials = properties.includes('credentials')
  const hasRemovedField = properties.some((p) => REMOVED_FIELDS.has(p) || p === IDENTITY_FIELD)
  return hasCredentials && hasRemovedField
}

function rebuildObjectLiteral(objectNode: SgNode<TSX>): string | null {
  const properties = getDirectPairs(objectNode)
  if (properties.length === 0) {
    return null
  }

  const kept: string[] = []
  let changed = false

  for (const pair of properties) {
    const keyNode = pair.field('key')
    if (!keyNode.is('property_identifier')) {
      kept.push(pair.text())
      continue
    }
    const key = keyNode.text()
    if (REMOVED_FIELDS.has(key) || key === IDENTITY_FIELD) {
      changed = true
      continue
    }
    kept.push(pair.text())
  }

  if (!changed) {
    return null
  }

  if (kept.length === 0) {
    return '{}'
  }

  const multiline = objectNode.text().includes('\n')
  if (multiline) {
    const propertyIndent = objectNode.text().match(/\n(\s+)/)?.[1] ?? '  '
    const parentIndent = propertyIndent.length >= 2 ? propertyIndent.slice(0, propertyIndent.length - 2) : ''
    return `{\n${propertyIndent}${kept.join(`,\n${propertyIndent}`)},\n${parentIndent}}`
  }

  return `{ ${kept.join(', ')} }`
}

function findMemberAccessOnBinding(
  rootNode: SgNode<TSX>,
  binding: string,
  property: string,
): SgNode<TSX, 'member_expression'>[] {
  return rootNode.findAll({
    rule: {
      kind: 'member_expression',
      all: [
        {
          has: {
            field: 'object',
            kind: 'identifier',
            regex: exactMatchRegex(binding),
          },
        },
        {
          has: {
            field: 'property',
            kind: 'property_identifier',
            regex: exactMatchRegex(property),
          },
        },
      ],
    },
  }) as SgNode<TSX, 'member_expression'>[]
}

function findIdentifierUsages(rootNode: SgNode<TSX>, name: string): SgNode<TSX, 'identifier'>[] {
  return rootNode.findAll({
    rule: {
      kind: 'identifier',
      regex: exactMatchRegex(name),
    },
  }) as SgNode<TSX, 'identifier'>[]
}

function isBindingIdentifier(node: SgNode<TSX>): boolean {
  const parent = node.parent()
  if (!parent) {
    return false
  }
  const kind = parent.kind()
  if (kind === 'required_parameter' || kind === 'optional_parameter' || kind === 'variable_declarator') {
    return parent.field('pattern') === node || parent.field('name') === node
  }
  if (kind === 'shorthand_property_identifier_pattern' || kind === 'pair_pattern') {
    return true
  }
  return false
}

function getEnclosingStatement(node: SgNode<TSX>): SgNode<TSX> | null {
  for (const ancestor of node.ancestors()) {
    const kind = ancestor.kind()
    if (
      kind === 'expression_statement' ||
      kind === 'return_statement' ||
      kind === 'variable_declarator' ||
      kind === 'lexical_declaration' ||
      kind === 'if_statement'
    ) {
      return ancestor
    }
  }
  return null
}

function replaceStatementWithTodo(statement: SgNode<TSX>, source: string, edits: Edit[]): void {
  const range = statement.range()
  const lineStart = source.lastIndexOf('\n', range.start.index - 1) + 1
  const indent = getLineIndent(source, range.start.index)
  const endPos = consumeTrailingNewline(source, range.end.index)

  edits.push({
    startPos: lineStart,
    endPos,
    insertedText: `${indent}${TODO_TOKEN}\n`,
  })
  migrationMetric.increment({ action: 'token-usage-todo' })
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  if (!importsFromPermissionNode(rootNode)) {
    return null
  }

  const edits: Edit[] = []
  const source = rootNode.text()
  const userBindings = trackPolicyQueryUserBindings(rootNode)
  const renamedLocals = new Map<string, string>()
  const tokenLocals = new Set<string>()
  const statementsWithTodo = new Set<number>()

  for (const objectPattern of rootNode.findAll({ rule: { kind: 'object_pattern' } })) {
    const bindings = collectObjectPatternBindings(objectPattern)
    for (const binding of bindings) {
      if (REMOVED_FIELDS.has(binding.fieldName)) {
        tokenLocals.add(binding.localName)
      }
    }
    const renamed = processObjectPattern(objectPattern, edits)
    for (const [from, to] of renamed) {
      renamedLocals.set(from, to)
    }
  }

  for (const objectNode of rootNode.findAll({ rule: { kind: 'object' } })) {
    if (!isPolicyQueryUserObjectLiteral(objectNode)) {
      continue
    }
    const rebuilt = rebuildObjectLiteral(objectNode)
    if (rebuilt) {
      edits.push(objectNode.replace(rebuilt))
      migrationMetric.increment({ action: 'object-literal-updated' })
    }
  }

  for (const [from, to] of renamedLocals) {
    for (const node of findIdentifierUsages(rootNode, from)) {
      if (isBindingIdentifier(node)) {
        continue
      }
      edits.push(node.replace(to))
      migrationMetric.increment({ action: 'identity-local-renamed' })
    }
  }

  for (const binding of userBindings) {
    for (const member of findMemberAccessOnBinding(rootNode, binding, IDENTITY_FIELD)) {
      edits.push(member.field('property').replace(INFO_FIELD))
      migrationMetric.increment({ action: 'identity-member-renamed' })
    }

    for (const member of findMemberAccessOnBinding(rootNode, binding, 'token')) {
      const statement = getEnclosingStatement(member)
      if (statement && !statementsWithTodo.has(statement.range().start.index)) {
        statementsWithTodo.add(statement.range().start.index)
        replaceStatementWithTodo(statement, source, edits)
      }
    }

    for (const member of findMemberAccessOnBinding(rootNode, binding, 'expiresInSeconds')) {
      const statement = getEnclosingStatement(member)
      if (statement && !statementsWithTodo.has(statement.range().start.index)) {
        statementsWithTodo.add(statement.range().start.index)
        replaceStatementWithTodo(statement, source, edits)
      }
    }
  }

  for (const tokenLocal of tokenLocals) {
    for (const node of findIdentifierUsages(rootNode, tokenLocal)) {
      if (isBindingIdentifier(node)) {
        continue
      }
      const statement = getEnclosingStatement(node)
      if (statement && !statementsWithTodo.has(statement.range().start.index)) {
        statementsWithTodo.add(statement.range().start.index)
        replaceStatementWithTodo(statement, source, edits)
      }
    }
  }

  if (edits.length === 0) {
    return null
  }

  const result = await Promise.resolve(rootNode.commitEdits(edits))
  return result
}

export default transform
