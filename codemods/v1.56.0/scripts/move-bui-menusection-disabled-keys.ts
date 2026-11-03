import { importBindingOf } from '@jssg/utils/javascript/bindings'
import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('move-bui-menusection-disabled-keys')

const UI_SOURCE = '@backstage/ui'
const MENU_SECTION = 'MenuSection'
const MENU = 'Menu'
const MENU_ITEM = 'MenuItem'
const DISABLED_KEYS = 'disabledKeys'
const IS_DISABLED = 'isDisabled'

const TODO_MARKER = 'TODO(backstage-codemod)'

type UiComponent = 'MenuSection' | 'Menu' | 'MenuItem'

function lineIndentOf(source: string, index: number): string {
  const lineStart = source.lastIndexOf('\n', index - 1) + 1
  const line = source.slice(lineStart, index)
  const match = line.match(/^[ \t]*/)
  return match?.[0] ?? ''
}

function resolveUiComponent(nameNode: SgNode<TSX> | null): UiComponent | null {
  if (!nameNode?.is('identifier')) {
    return null
  }

  const binding = importBindingOf(nameNode)
  if (!binding || binding.source !== UI_SOURCE) {
    return null
  }

  if (binding.importedName === MENU_SECTION || binding.importedName === MENU || binding.importedName === MENU_ITEM) {
    return binding.importedName
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

function getAttributes(opening: SgNode<TSX>): SgNode<TSX>[] {
  return opening.children().filter((child) => child.is('jsx_attribute'))
}

function getAttrName(attr: SgNode<TSX>): string | null {
  const propId = attr.find({ rule: { kind: 'property_identifier' } })
  return propId ? propId.text() : null
}

function findAttribute(opening: SgNode<TSX>, name: string): SgNode<TSX> | null {
  return getAttributes(opening).find((attr) => getAttrName(attr) === name) ?? null
}

/** Inner expression text of a JSX attribute value, e.g. `['delete']`. */
function getAttrValueText(attr: SgNode<TSX>): string | null {
  const expr = attr.find({ rule: { kind: 'jsx_expression' } })
  if (!expr) {
    return null
  }

  const inner = expr.children().filter((child) => child.kind() !== '{' && child.kind() !== '}')
  if (inner.length !== 1) {
    return null
  }

  return inner[0]?.text() ?? null
}

/** String literal keys of `disabledKeys={['a', 'b']}`, or null when dynamic. */
function getLiteralKeys(attr: SgNode<TSX>): string[] | null {
  const expr = attr.find({ rule: { kind: 'jsx_expression' } })
  if (!expr) {
    return null
  }

  const arrayNode = expr.find({ rule: { kind: 'array' } })
  if (!arrayNode) {
    return null
  }

  const elements = arrayNode.children().filter((child) => child.is('string'))
  const totalCount = arrayNode.children().filter((child) => ![',', '[', ']'].includes(child.kind())).length
  if (elements.length !== totalCount) {
    return null
  }

  return elements.map((element) => unquote(element.text()))
}

function removeJsxAttribute(attrNode: SgNode<TSX>, fullSource: string): Edit {
  let startPos = attrNode.range().start.index
  const endPos = attrNode.range().end.index

  while (startPos > 0 && fullSource.charAt(startPos - 1) === ' ') {
    startPos -= 1
  }

  return {
    startPos,
    endPos,
    insertedText: '',
  }
}

function insertPropBeforeClosingTag(opening: SgNode<TSX>, propText: string): Edit | null {
  const text = opening.text()
  const selfClosing = text.endsWith('/>')
  const insertPos = opening.range().end.index - (selfClosing ? 2 : 1)
  if (insertPos < opening.range().start.index) {
    return null
  }

  return {
    startPos: insertPos,
    endPos: insertPos,
    insertedText: ` ${propText}`,
  }
}

function unquote(text: string): string {
  if ((text.startsWith("'") && text.endsWith("'")) || (text.startsWith('"') && text.endsWith('"'))) {
    return text.slice(1, -1)
  }

  return text
}

function insertJsxCommentBefore(element: SgNode<TSX>, comment: string, source: string): Edit {
  const startPos = element.range().start.index
  const indent = lineIndentOf(source, startPos)
  return {
    startPos,
    endPos: startPos,
    insertedText: `{/* ${comment} */}\n${indent}`,
  }
}

/** Nearest enclosing JSX element resolving to the given UI component. */
function findEnclosingElement(element: SgNode<TSX>, component: UiComponent): SgNode<TSX> | null {
  for (const ancestor of element.ancestors()) {
    if (!ancestor.is('jsx_element') && !ancestor.is('jsx_self_closing_element')) {
      continue
    }

    const opening = getOpeningElement(ancestor)
    const nameNode = opening ? getComponentNameNode(opening) : null
    if (resolveUiComponent(nameNode) === component) {
      return ancestor
    }
  }

  return null
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const source = rootNode.text()
  const edits: Edit[] = []
  const menusAlreadyHandled = new Set<number>()

  const sectionElements = rootNode
    .findAll({ rule: { any: [{ kind: 'jsx_element' }, { kind: 'jsx_self_closing_element' }] } })
    .filter((element) => {
      const opening = getOpeningElement(element)
      const nameNode = opening ? getComponentNameNode(opening) : null
      return resolveUiComponent(nameNode) === MENU_SECTION
    })

  for (const section of sectionElements) {
    const sectionOpening = getOpeningElement(section)
    if (!sectionOpening) {
      continue
    }

    const disabledKeysAttr = findAttribute(sectionOpening, DISABLED_KEYS)
    if (!disabledKeysAttr) {
      continue // Already migrated.
    }

    const valueText = getAttrValueText(disabledKeysAttr)
    const literalKeys = getLiteralKeys(disabledKeysAttr)

    // 1. Remove disabledKeys from the MenuSection element.
    edits.push(removeJsxAttribute(disabledKeysAttr, source))

    // 2. Hoist to the nearest enclosing Menu when one exists.
    const menuElement = findEnclosingElement(section, MENU)
    if (menuElement) {
      const menuOpening = getOpeningElement(menuElement)
      const menuAlreadyDisabled =
        menuOpening !== null &&
        (findAttribute(menuOpening, DISABLED_KEYS) !== null || menusAlreadyHandled.has(menuElement.id()))

      if (menuOpening && valueText !== null && !menuAlreadyDisabled) {
        const insert = insertPropBeforeClosingTag(menuOpening, `${DISABLED_KEYS}={${valueText}}`)
        if (insert) {
          edits.push(insert)
          menusAlreadyHandled.add(menuElement.id())
          migrationMetric.increment({ action: 'disabledKeys-hoisted-to-menu' })
          continue
        }
      }

      // The Menu cannot take another disabledKeys prop; keep the original for review.
      edits.push(
        insertJsxCommentBefore(
          section,
          `${TODO_MARKER}: Menu already has disabledKeys; merge ${DISABLED_KEYS}={${valueText ?? '…'}} manually`,
          source,
        ),
      )
      migrationMetric.increment({ action: 'todo-manual-review', reason: 'menu-already-disabled' })
      continue
    }

    // 3. No enclosing Menu: disable the literal-keyed MenuItems directly.
    if (literalKeys !== null) {
      const keySet = new Set(literalKeys)
      let disabledCount = 0

      const menuItems = section.findAll({
        rule: {
          any: [{ kind: 'jsx_element' }, { kind: 'jsx_self_closing_element' }],
        },
      })

      for (const item of menuItems) {
        const itemOpening = getOpeningElement(item)
        const itemNameNode = itemOpening ? getComponentNameNode(itemOpening) : null
        if (resolveUiComponent(itemNameNode) !== MENU_ITEM || !itemOpening) {
          continue
        }

        const keyAttr = findAttribute(itemOpening, 'key')
        const keyText = keyAttr?.find({ rule: { kind: 'string' } })?.text()
        if (!keyAttr || keyText === undefined || !keySet.has(unquote(keyText))) {
          continue
        }

        if (findAttribute(itemOpening, IS_DISABLED)) {
          continue
        }

        const insert = insertPropBeforeClosingTag(itemOpening, IS_DISABLED)
        if (insert) {
          edits.push(insert)
          disabledCount += 1
          migrationMetric.increment({ action: 'menuItem-isDisabled-set' })
        }
      }

      if (disabledCount === 0) {
        migrationMetric.increment({ action: 'todo-manual-review', reason: 'no-matching-menuitem' })
      }
      continue
    }

    // 4. Dynamic keys without a Menu: leave a TODO carrying the original prop.
    edits.push(
      insertJsxCommentBefore(
        section,
        `${TODO_MARKER}: MenuSection no longer accepts ${DISABLED_KEYS}; set ${IS_DISABLED} on the MenuItem elements or ${DISABLED_KEYS} on the Menu. Original: ${DISABLED_KEYS}={${valueText ?? '…'}}`,
        source,
      ),
    )
    migrationMetric.increment({ action: 'todo-manual-review', reason: 'dynamic-keys' })
  }

  if (edits.length === 0) {
    return null
  }

  const result = await Promise.resolve(rootNode.commitEdits(edits))
  return result
}

export default transform
