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
  if (nameNode.is('identifier')) {
    return nameNode.text()
  }
  if (nameNode.is('member_expression')) {
    return nameNode.text()
  }
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

  // For label conversion or missing label TODO, we need to rebuild the element
  // Build the new element by replacing the entire thing
  const elText = el.text()
  let newElText = elText

  // 1. Rename props
  for (const { attr, newName } of propRenames) {
    const oldPropName = attr.name
    // Replace prop name in the element text
    // We need to be careful to only replace the property identifier, not values
    // Use a targeted approach: find the attribute text and replace the name part
    const attrText = attr.node.text()
    let newAttrText: string

    // Handle boolean shorthand (e.g., `required` with no value)
    if (attrText === oldPropName) {
      newAttrText = newName
    } else {
      newAttrText = attrText.replace(oldPropName, newName)
    }

    newElText = newElText.split(attrText).join(newAttrText)
    migrationMetric.increment({ action: 'prop-renamed', from: oldPropName, to: newName })
  }

  // 2. Handle label
  const labelValue = getLabelValue(labelAttr)
  const labelAttrText = labelAttr.node.text()

  if (labelValue) {
    // Remove the label attribute
    newElText = newElText.split(labelAttrText).join('')
    // Clean up whitespace
    newElText = newElText.split(/\s+/).join(' ')

    let childContent: string
    if (labelValue.kind === 'string') {
      childContent = labelValue.value
    } else {
      childContent = `{${labelValue.value}}`
    }

    if (isSelfClosing) {
      // Convert self-closing to open/close with children
      // Find the component name for opening/closing tags
      newElText = newElText.replace(' />', '>')
      newElText = `${newElText}\n  ${childContent}\n</${componentName}>`
    } else {
      // Already has open/close, insert children
      // This is a more complex case; for now prepend to existing children
      const closingTag = `</${componentName}>`
      const closingIdx = newElText.lastIndexOf(closingTag)
      if (closingIdx >= 0) {
        newElText = `${newElText.slice(0, closingIdx)}${childContent}${newElText.slice(closingIdx)}`
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

  const result = await Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
  return result
}

export default transform
