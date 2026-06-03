import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('migrate-checkbox-to-react-aria')

const TARGET_COMPONENT = 'Checkbox'
const UI_SOURCE = '@backstage/ui'

const PROP_RENAMES: Record<string, string> = {
  checked: 'isSelected',
  defaultChecked: 'defaultSelected',
  disabled: 'isDisabled',
  required: 'isRequired',
}

function escapeRegex(str: string): string {
  return str.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function findImportStatementsFrom(rootNode: SgNode<TSX>, source: string): SgNode<TSX, 'import_statement'>[] {
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

interface ImportedComponent {
  localNames: Set<string>
  namespaceAliases: string[]
}

function collectImportedComponent(importStatements: SgNode<TSX, 'import_statement'>[]): ImportedComponent {
  const localNames = new Set<string>()
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

      const [importedNameNode] = identifiers
      if (!importedNameNode || importedNameNode.text() !== TARGET_COMPONENT) {
        continue
      }

      const localNameNode = identifiers[1] ?? importedNameNode
      localNames.add(localNameNode.text())
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

function getComponentNameNode(opening: SgNode<TSX>): SgNode<TSX> | null {
  return opening.child(1) ?? null
}

function isTargetComponent(nameNode: SgNode<TSX>, localNames: Set<string>, namespaceAliases: string[]): boolean {
  if (nameNode.is('identifier')) {
    return localNames.has(nameNode.text())
  }

  if (nameNode.is('member_expression')) {
    const objNode = nameNode.child(0)
    const propNode = nameNode.find({ rule: { kind: 'property_identifier' } })
    return (
      objNode?.is('identifier') === true &&
      namespaceAliases.includes(objNode.text()) &&
      propNode?.text() === TARGET_COMPONENT
    )
  }

  return false
}

function getComponentDisplayName(nameNode: SgNode<TSX>): string {
  return nameNode.text()
}

interface JsxAttribute {
  node: SgNode<TSX>
  nameNode: SgNode<TSX>
  name: string
}

function collectJsxAttributes(opening: SgNode<TSX>): JsxAttribute[] {
  const attrs: JsxAttribute[] = []
  for (const child of opening.children()) {
    if (!child.is('jsx_attribute')) {
      continue
    }
    const nameNode = child.find({ rule: { kind: 'property_identifier' } })
    if (!nameNode) {
      continue
    }
    attrs.push({ node: child, nameNode, name: nameNode.text() })
  }
  return attrs
}

function getLabelValue(
  attr: JsxAttribute,
): { kind: 'string'; value: string } | { kind: 'expression'; value: string } | null {
  const { node } = attr

  // Check for string value: label="text"
  const stringNode = node.find({ rule: { kind: 'string' } })
  if (stringNode) {
    const fragment = stringNode.find({ rule: { kind: 'string_fragment' } })
    if (fragment) {
      return { kind: 'string', value: fragment.text() }
    }
  }

  // Check for expression value: label={expr}
  const jsxExpr = node.find({ rule: { kind: 'jsx_expression' } })
  if (jsxExpr) {
    // Extract the inner expression (skip { and })
    const children = jsxExpr.children()
    const innerParts: string[] = []
    for (const c of children) {
      const k = c.kind()
      if (k === '{' || k === '}') {
        continue
      }
      innerParts.push(c.text())
    }
    const inner = innerParts.join('').trim()
    if (inner.length > 0) {
      return { kind: 'expression', value: inner }
    }
  }

  return null
}

function computeIndent(fullSource: string, startIndex: number): string {
  let lineStart = startIndex
  while (lineStart > 0 && fullSource.charAt(lineStart - 1) !== '\n') {
    lineStart--
  }
  return fullSource.slice(lineStart, startIndex)
}

function findContainingStatement(node: SgNode<TSX>): SgNode<TSX> | null {
  const statementKinds = new Set([
    'expression_statement',
    'variable_declaration',
    'lexical_declaration',
    'return_statement',
    'export_statement',
  ])
  let current: SgNode<TSX> | null = node.parent()
  while (current) {
    if (statementKinds.has(current.kind())) {
      return current
    }
    current = current.parent()
  }
  return null
}

function isInsideJsxAttribute(node: SgNode<TSX>): boolean {
  let current = node.parent()
  while (current) {
    if (current.kind() === 'jsx_attribute') {
      return true
    }
    current = current.parent()
  }
  return false
}

function transformElement(
  el: SgNode<TSX>,
  opening: SgNode<TSX>,
  componentName: string,
  fullSource: string,
  edits: Edit[],
): void {
  const attrs = collectJsxAttributes(opening)

  // Collect what needs to change
  const propRenames: { attr: JsxAttribute; newName: string }[] = []
  let labelAttr: JsxAttribute | null = null
  let hasAnyChange = false

  for (const attr of attrs) {
    if (attr.name in PROP_RENAMES) {
      const newName = PROP_RENAMES[attr.name]
      if (newName) {
        propRenames.push({ attr, newName })
        hasAnyChange = true
      }
    }
    if (attr.name === 'label') {
      labelAttr = attr
      hasAnyChange = true
    }
  }

  const isSelfClosing = el.is('jsx_self_closing_element')

  if (!hasAnyChange) {
    return
  }

  // For simple prop renames without label change, use targeted edits
  if (!labelAttr) {
    for (const { attr, newName } of propRenames) {
      edits.push(attr.nameNode.replace(newName))
      migrationMetric.increment({ action: 'prop-renamed', from: attr.name, to: newName })
    }
    return
  }

  // For label conversion, use positional AST edits within element text
  const elText = el.text()
  const elStart = el.range().start.index
  const indent = computeIndent(fullSource, elStart)

  interface TextReplacement {
    start: number
    end: number
    newText: string
  }
  const replacements: TextReplacement[] = []

  // 1. Prop renames: target just the nameNode (property_identifier)
  for (const { attr, newName } of propRenames) {
    const nameStart = attr.nameNode.range().start.index - elStart
    const nameEnd = attr.nameNode.range().end.index - elStart
    replacements.push({ start: nameStart, end: nameEnd, newText: newName })
    migrationMetric.increment({ action: 'prop-renamed', from: attr.name, to: newName })
  }

  // 2. Handle label
  const labelValue = getLabelValue(labelAttr)

  if (labelValue) {
    // Remove the label attribute via positional edit
    const labelStart = labelAttr.node.range().start.index - elStart
    const labelEnd = labelAttr.node.range().end.index - elStart
    replacements.push({ start: labelStart, end: labelEnd, newText: '' })
  }

  // Apply replacements in reverse position order
  replacements.sort((a, b) => b.start - a.start)
  let newElText = elText
  for (const r of replacements) {
    newElText = newElText.slice(0, r.start) + r.newText + newElText.slice(r.end)
  }

  // Clean up whitespace from attribute removal
  newElText = newElText.replaceAll(/ {2,}/g, ' ')
  newElText = newElText.replaceAll(' >', '>')

  if (labelValue) {
    let childContent: string
    if (labelValue.kind === 'string') {
      childContent = labelValue.value
    } else {
      childContent = `{${labelValue.value}}`
    }

    if (isSelfClosing) {
      // Convert self-closing to open/close with children
      newElText = newElText.replace(/\s*\/>/, '>')
      newElText = `${newElText}\n${indent}  ${childContent}\n${indent}</${componentName}>`
    } else {
      // Already has open/close, insert children before closing tag
      const closingTag = `</${componentName}>`
      const closingIdx = newElText.lastIndexOf(closingTag)
      if (closingIdx >= 0) {
        newElText = `${newElText.slice(0, closingIdx)}${indent}  ${childContent}\n${indent}${newElText.slice(closingIdx)}`
      }
    }

    migrationMetric.increment({ action: 'label-to-children', labelKind: labelValue.kind })
  }

  edits.push(el.replace(newElText))
}

function transformJsxElements(
  rootNode: SgNode<TSX>,
  fullSource: string,
  localNames: Set<string>,
  namespaceAliases: string[],
  edits: Edit[],
): void {
  const jsxElements = rootNode.findAll({
    rule: {
      any: [{ kind: 'jsx_element' }, { kind: 'jsx_self_closing_element' }],
    },
  })

  for (const el of jsxElements) {
    const opening = getOpeningElement(el)
    if (!opening) {
      continue
    }

    const nameNode = getComponentNameNode(opening)
    if (!nameNode || !isTargetComponent(nameNode, localNames, namespaceAliases)) {
      continue
    }

    const componentName = getComponentDisplayName(nameNode)
    transformElement(el, opening, componentName, fullSource, edits)
  }
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const fullSource = rootNode.text()
  const edits: Edit[] = []

  const uiImports = findImportStatementsFrom(rootNode, UI_SOURCE)
  if (uiImports.length === 0) {
    return null
  }

  const { localNames, namespaceAliases } = collectImportedComponent(uiImports)
  if (localNames.size === 0 && namespaceAliases.length === 0) {
    return null
  }

  transformJsxElements(rootNode, fullSource, localNames, namespaceAliases, edits)

  // Rename data-checked → data-selected only in JSX attribute values (S2)
  // Flag bui-CheckboxLabel with a line comment above the containing statement (M2)
  const stringFragments = rootNode.findAll({ rule: { kind: 'string_fragment' } })
  const todoStatements = new Map<number, SgNode<TSX>>()

  for (const frag of stringFragments) {
    const text = frag.text()

    if (text.includes('data-checked') && isInsideJsxAttribute(frag)) {
      edits.push(frag.replace(text.replaceAll('data-checked', 'data-selected')))
      migrationMetric.increment({ action: 'attr-renamed', from: 'data-checked', to: 'data-selected' })
    }

    if (text.includes('bui-CheckboxLabel')) {
      const stmt = findContainingStatement(frag)
      if (stmt) {
        todoStatements.set(stmt.range().start.index, stmt)
      }
      migrationMetric.increment({ action: 'class-flagged', className: 'bui-CheckboxLabel' })
    }
  }

  // Insert TODO comments above statements containing bui-CheckboxLabel
  for (const [, stmt] of todoStatements) {
    const stmtIndent = computeIndent(fullSource, stmt.range().start.index)
    const comment = '// TODO(backstage-codemod): bui-CheckboxLabel removed in v1.45, review CSS selector'
    edits.push(stmt.replace(`${comment}\n${stmtIndent}${stmt.text()}`))
  }

  const result = await Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
  return result
}

export default transform
