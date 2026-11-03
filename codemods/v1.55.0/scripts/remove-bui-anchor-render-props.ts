import { importBindingOf } from '@jssg/utils/javascript/bindings'
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

function getOriginalComponentName(nameNode: SgNode<TSX>): string | null {
  if (nameNode.is('identifier')) {
    const binding = importBindingOf(nameNode)
    if (!binding || binding.source !== UI_SOURCE || !TARGET_COMPONENTS.has(binding.importedName)) {
      return null
    }

    return binding.importedName
  }

  if (nameNode.is('member_expression')) {
    const objNode = nameNode.child(0)
    const propNode = nameNode.find({ rule: { kind: 'property_identifier' } })
    if (!objNode?.is('identifier') || !propNode || !TARGET_COMPONENTS.has(propNode.text())) {
      return null
    }

    const binding = importBindingOf(objNode)
    if (!binding || binding.source !== UI_SOURCE || binding.importedName !== '*') {
      return null
    }

    return propNode.text()
  }

  return null
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

function unwrapParenthesizedExpression(node: SgNode<TSX>): SgNode<TSX> {
  let currentNode = node

  while (currentNode.is('parenthesized_expression')) {
    const innerNode = currentNode.children().find((child) => child.kind() !== '(' && child.kind() !== ')')
    if (!innerNode) {
      return currentNode
    }

    currentNode = innerNode
  }

  return currentNode
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
  if (!innerNode) {
    return false
  }

  return isSafeAnchorExpression(unwrapParenthesizedExpression(innerNode))
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
  const edits: Edit[] = []

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

    const originalName = getOriginalComponentName(nameNode)
    if (!originalName) {
      continue
    }

    let todoReason: TodoReason | null = null
    let todoTarget: SgNode<TSX> | null = null

    const attributes = opening.children().filter((child) => child.is('jsx_attribute'))
    for (const attr of attributes) {
      if (getAttrName(attr) !== 'render') {
        continue
      }

      if (isSafeAnchorRenderAttr(attr)) {
        edits.push(removeJsxAttribute(attr, rootNode.text()))
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
