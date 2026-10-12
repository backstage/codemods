import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('remove-bui-anchor-render-props')

const UI_SOURCE = '@backstage/ui'
const TARGET_COMPONENTS = new Set([
  'ButtonLink',
  'ComboboxItem',
  'Link',
  'MenuItem',
  'MenuListBoxItem',
  'SearchAutocompleteItem',
  'SelectItem',
  'Tab',
])

const TODO_MARKER = 'TODO(backstage-codemod): review render migration manually'
const TODO_COMMENT = `/* ${TODO_MARKER} (custom render prop or spread props) */`

type TodoReason = 'custom-render-prop' | 'spread-props' | 'custom-render-and-spread'

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

interface ImportedComponents {
  localNames: Map<string, string>
  namespaceAliases: string[]
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

      const [importedNameNode, maybeLocalNameNode] = identifiers
      if (!importedNameNode || !TARGET_COMPONENTS.has(importedNameNode.text())) {
        continue
      }

      const localNameNode = maybeLocalNameNode ?? importedNameNode
      localNames.set(localNameNode.text(), importedNameNode.text())
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

function getOriginalComponentName(
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

function getAttrName(attr: SgNode<TSX>): string | null {
  const propId = attr.find({ rule: { kind: 'property_identifier' } })
  return propId ? propId.text() : null
}

function isSpreadAttribute(node: SgNode<TSX>): boolean {
  return node.is('jsx_expression') && node.find({ rule: { kind: 'spread_element' } }) !== null
}

function hasJsxPropsOrSpreads(opening: SgNode<TSX>): boolean {
  return opening.children().some((child) => child.is('jsx_attribute') || isSpreadAttribute(child))
}

function isBareAnchorOpening(opening: SgNode<TSX>): boolean {
  const nameNode = opening.child(1)
  return nameNode?.is('identifier') === true && nameNode.text() === 'a' && !hasJsxPropsOrSpreads(opening)
}

function isSafeAnchorExpression(node: SgNode<TSX>): boolean {
  if (node.is('jsx_self_closing_element')) {
    return isBareAnchorOpening(node)
  }

  if (node.is('jsx_element')) {
    const opening = node.child(0)
    if (!opening?.is('jsx_opening_element') || !isBareAnchorOpening(opening)) {
      return false
    }

    const children = node.children()
    for (let i = 1; i < children.length - 1; i++) {
      const child = children[i]
      if (child?.is('jsx_text') && child.text().trim() === '') {
        continue
      }
      return false
    }

    return true
  }

  return false
}

function isSafeAnchorRenderAttr(attr: SgNode<TSX>): boolean {
  const expr = attr.find({ rule: { kind: 'jsx_expression' } })
  if (!expr) {
    return false
  }

  const innerNodes = expr.children().filter((child) => child.kind() !== '{' && child.kind() !== '}')
  if (innerNodes.length !== 1) {
    return false
  }

  const [innerNode] = innerNodes
  return innerNode !== undefined && isSafeAnchorExpression(innerNode)
}

function removeJsxAttribute(attrNode: SgNode<TSX>, fullSource: string): Edit {
  let startPos = attrNode.range().start.index
  const endPos = attrNode.range().end.index

  while (startPos > 0 && fullSource[startPos - 1] === ' ') {
    startPos -= 1
  }

  return {
    startPos,
    endPos,
    insertedText: '',
  }
}

function isRenderStringKey(node: SgNode<TSX>): boolean {
  const text = node.text()
  return text === "'render'" || text === '"render"'
}

function getSpreadAttrTargetNode(spreadAttr: SgNode<TSX>): SgNode<TSX> | null {
  const spreadElement = spreadAttr.find({ rule: { kind: 'spread_element' } })
  if (!spreadElement) {
    return spreadAttr
  }

  const spreadObject = spreadElement.find({ rule: { kind: 'object' } })
  if (!spreadObject) {
    return spreadAttr
  }

  const pairs = spreadObject.findAll({ rule: { kind: 'pair' } })
  for (const pair of pairs) {
    const keyNode = pair.child(0)
    if (!keyNode) {
      continue
    }

    if (keyNode.is('property_identifier') && keyNode.text() === 'render') {
      return spreadAttr
    }

    if (keyNode.is('string') && isRenderStringKey(keyNode)) {
      return spreadAttr
    }

    if (keyNode.is('computed_property_name')) {
      const keyString = keyNode.find({ rule: { kind: 'string' } })
      if (keyString && isRenderStringKey(keyString)) {
        return spreadAttr
      }
    }
  }

  return null
}

function mergeTodoReason(existing: TodoReason | null, next: TodoReason): TodoReason {
  if (!existing || existing === next) {
    return next
  }
  return 'custom-render-and-spread'
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const fullSource = rootNode.text()
  const edits: Edit[] = []

  const uiImports = findImportStatementsFrom(rootNode, UI_SOURCE)
  if (uiImports.length === 0) {
    return null
  }

  const { localNames, namespaceAliases } = collectImportedComponents(uiImports)
  if (localNames.size === 0 && namespaceAliases.length === 0) {
    return null
  }

  const jsxElements = rootNode.findAll({
    rule: {
      any: [{ kind: 'jsx_element' }, { kind: 'jsx_self_closing_element' }],
    },
  })

  for (const element of jsxElements) {
    const opening = getOpeningElement(element)
    if (!opening) {
      continue
    }

    const nameNode = getComponentNameNode(opening)
    if (!nameNode) {
      continue
    }

    const originalName = getOriginalComponentName(nameNode, localNames, namespaceAliases)
    if (!originalName) {
      continue
    }

    let todoReason: TodoReason | null = null
    let todoTarget: SgNode<TSX> | null = null

    const attributes = opening.findAll({ rule: { kind: 'jsx_attribute' } })
    for (const attr of attributes) {
      if (getAttrName(attr) !== 'render') {
        continue
      }

      if (isSafeAnchorRenderAttr(attr)) {
        edits.push(removeJsxAttribute(attr, fullSource))
        migrationMetric.increment({ action: 'render-prop-removed', component: originalName })
      } else {
        todoReason = mergeTodoReason(todoReason, 'custom-render-prop')
        todoTarget = todoTarget ?? attr
      }
    }

    const spreadAttrs = opening.children().filter((child) => isSpreadAttribute(child))
    for (const spreadAttr of spreadAttrs) {
      const spreadTarget = getSpreadAttrTargetNode(spreadAttr)
      if (!spreadTarget) {
        continue
      }

      todoReason = mergeTodoReason(todoReason, 'spread-props')
      todoTarget = todoTarget ?? spreadTarget
    }

    if (todoReason && todoTarget && !opening.text().includes(TODO_MARKER)) {
      edits.push(todoTarget.replace(`${TODO_COMMENT} ${todoTarget.text()}`))
      migrationMetric.increment({ action: 'todo-manual-review', component: originalName, reason: todoReason })
    }
  }

  if (edits.length === 0) {
    return null
  }

  const result = await Promise.resolve(rootNode.commitEdits(edits))
  return result
}

export default transform
