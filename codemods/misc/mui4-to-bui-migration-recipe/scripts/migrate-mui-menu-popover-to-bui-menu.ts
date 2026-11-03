import { addImport, getAllImports, getImport, listImports, removeImport } from '@jssg/utils/javascript/imports'
import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('migrate-mui-menu-popover-to-bui-menu')

const BUI_SOURCE = '@backstage/ui'

const MUI_MENU_COMPONENTS = ['Menu', 'MenuItem', 'MenuList', 'Popover']

/** Props on Menu/Popover that trigger a TODO — not mechanically migratable. */
const TODO_PROPS = new Set([
  'anchorOrigin',
  'transformOrigin',
  'getContentAnchorEl',
  'TransitionComponent',
  'TransitionProps',
  'transitionDuration',
  'PaperProps',
  'PopoverClasses',
  'classes',
  'disableAutoFocusItem',
  'MenuListProps',
  'elevation',
  'marginThreshold',
  'container',
  'disablePortal',
  'disableScrollLock',
])

function escapeRegex(str: string): string {
  return str.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

interface MenuImports {
  localNames: Map<string, string>
  deepComponents: string[]
  barrelNames: string[]
}

function withTodoComment(comment: string, elementText: string): string {
  return `<>
  ${comment}
  ${elementText}
</>`
}

function collectMenuImports(rootNode: SgNode<TSX, 'program'>): MenuImports {
  const localNames = new Map<string, string>()
  const deepComponents: string[] = []
  const barrelNames: string[] = []

  for (const componentName of MUI_MENU_COMPONENTS) {
    const defaultImport = getImport(rootNode, { type: 'default', from: `@material-ui/core/${componentName}` })
    if (defaultImport) {
      localNames.set(defaultImport.alias, componentName)
      deepComponents.push(componentName)
    }
    for (const named of getAllImports(rootNode, { type: 'named', name: componentName, from: '@material-ui/core' })) {
      localNames.set(named.alias, componentName)
      if (!barrelNames.includes(componentName)) {
        barrelNames.push(componentName)
      }
    }
  }

  return { localNames, deepComponents, barrelNames }
}

function getElementName(opening: SgNode<TSX>): string | null {
  for (const child of opening.children()) {
    if (child.is('identifier') || child.is('member_expression')) {
      return child.text()
    }
  }
  return null
}

function getPropAttr(opening: SgNode<TSX>, propName: string): SgNode<TSX> | null {
  return opening.find({
    rule: {
      kind: 'jsx_attribute',
      has: {
        kind: 'property_identifier',
        regex: `^${escapeRegex(propName)}$`,
      },
    },
  })
}

function hasProp(opening: SgNode<TSX>, propName: string): boolean {
  return getPropAttr(opening, propName) !== null
}

function getPropRawValue(opening: SgNode<TSX>, propName: string): string | null {
  const attr = getPropAttr(opening, propName)
  if (!attr) {
    return null
  }
  for (const child of attr.children()) {
    const kind = child.kind()
    if (kind === 'string' || kind === 'jsx_expression') {
      return child.text()
    }
  }
  return null
}

function getSimpleOnCloseHandler(opening: SgNode<TSX>): string | null {
  const attr = getPropAttr(opening, 'onClose')
  if (!attr) {
    return null
  }
  const expr = attr.find({ rule: { kind: 'jsx_expression' } })
  if (!expr) {
    return null
  }
  const children: SgNode<TSX>[] = []
  for (const child of expr.children()) {
    if (child.kind() !== '{' && child.kind() !== '}') {
      children.push(child)
    }
  }
  const [onlyChild] = children
  if (children.length === 1 && onlyChild?.is('identifier')) {
    return onlyChild.text()
  }
  return null
}

function getChildContent(element: SgNode<TSX>): string {
  return element
    .children()
    .filter((child) => child.kind() !== 'jsx_opening_element' && child.kind() !== 'jsx_closing_element')
    .map((child) => child.text())
    .join('')
}

function getJsxChildren(element: SgNode<TSX>): SgNode<TSX>[] {
  const children: SgNode<TSX>[] = []
  for (const child of element.children()) {
    const kind = child.kind()
    if (kind === 'jsx_opening_element' || kind === 'jsx_closing_element') {
      continue
    }
    children.push(child)
  }
  return children
}

function getNonWhitespaceChildren(element: SgNode<TSX>): SgNode<TSX>[] {
  const children: SgNode<TSX>[] = []
  for (const child of element.children()) {
    const kind = child.kind()
    if (kind === 'jsx_opening_element' || kind === 'jsx_closing_element') {
      continue
    }
    if (kind === 'jsx_text' && child.text().trim().length === 0) {
      continue
    }
    children.push(child)
  }
  return children
}

function isTriggerElement(node: SgNode<TSX>): boolean {
  const kind = node.kind()
  if (kind !== 'jsx_element' && kind !== 'jsx_self_closing_element') {
    return false
  }

  const opening = kind === 'jsx_self_closing_element' ? node : node.child(0)
  if (!opening) {
    return false
  }

  const name = getElementName(opening)
  if (!name) {
    return false
  }

  if (/Button$/i.test(name) || name === 'button') {
    return true
  }

  return hasProp(opening, 'onClick')
}

/**
 * Prefer the immediately preceding sibling when it looks like a trigger.
 * Avoid grabbing an earlier button elsewhere in the parent (common in
 * multi-button fragments), which would wrap the wrong element.
 */
function findTriggerSibling(menuEl: SgNode<TSX>): SgNode<TSX> | null {
  const parent = menuEl.parent()
  if (!parent) {
    return null
  }

  const parentKind = parent.kind()
  if (parentKind !== 'jsx_element' && parentKind !== 'jsx_fragment') {
    return null
  }

  let previousSibling: SgNode<TSX> | null = null
  for (const sibling of getNonWhitespaceChildren(parent)) {
    if (sibling.id() === menuEl.id()) {
      return previousSibling && isTriggerElement(previousSibling) ? previousSibling : null
    }
    previousSibling = sibling
  }

  return null
}

function transformMenuItemChildren(element: SgNode<TSX>, menuItemLocalName: string): string {
  const children = getJsxChildren(element)
  const parts: string[] = []

  for (const child of children) {
    const kind = child.kind()

    if (kind === 'jsx_text') {
      parts.push(child.text())
      continue
    }

    if (kind === 'jsx_element' || kind === 'jsx_self_closing_element') {
      const childOpening = kind === 'jsx_self_closing_element' ? child : child.child(0)
      if (!childOpening) {
        parts.push(child.text())
        continue
      }

      const childName = getElementName(childOpening)
      if (childName === menuItemLocalName) {
        const onClickAttr = getPropAttr(childOpening, 'onClick')

        const newProps: string[] = []

        // Map onClick → onAction
        if (onClickAttr) {
          for (const attrChild of onClickAttr.children()) {
            const attrKind = attrChild.kind()
            if (attrKind === 'string' || attrKind === 'jsx_expression') {
              newProps.push(`onAction=${attrChild.text()}`)
              break
            }
          }
          migrationMetric.increment({ action: 'onClick-to-onAction' })
        }

        // Preserve other safe props
        const handledProps = new Set(['onClick'])
        const allAttrs = childOpening.findAll({ rule: { kind: 'jsx_attribute' } })
        for (const attr of allAttrs) {
          const propIdent = attr.find({ rule: { kind: 'property_identifier' } })
          if (!propIdent) {
            continue
          }
          if (handledProps.has(propIdent.text())) {
            continue
          }
          newProps.push(attr.text())
        }

        const propsStr = newProps.length > 0 ? ` ${newProps.join(' ')}` : ''

        if (kind === 'jsx_self_closing_element') {
          parts.push(`<MenuItem${propsStr} />`)
        } else {
          const innerContent = getChildContent(child)
          parts.push(`<MenuItem${propsStr}>${innerContent}</MenuItem>`)
        }
        migrationMetric.increment({ action: 'menu-item-migrated' })
        continue
      }
    }

    // Preserve anything else as-is
    parts.push(child.text())
  }

  return parts.join('')
}

/**
 * Unwrap MenuList if it's the only structural child inside a Popover/Menu.
 * Returns the inner content of the MenuList, or the original content if no MenuList wrapper.
 */
function unwrapMenuList(
  element: SgNode<TSX>,
  menuListLocalName: string | null,
  menuItemLocalName: string | null,
): string {
  if (!menuListLocalName) {
    if (menuItemLocalName) {
      return transformMenuItemChildren(element, menuItemLocalName)
    }
    return getChildContent(element)
  }

  const meaningfulChildren = getNonWhitespaceChildren(element)

  // If the only meaningful child is a MenuList, unwrap it
  if (meaningfulChildren.length === 1) {
    const [onlyChild] = meaningfulChildren
    if (onlyChild?.kind() === 'jsx_element') {
      const childOpening = onlyChild.child(0)
      if (childOpening) {
        const childName = getElementName(childOpening)
        if (childName === menuListLocalName) {
          migrationMetric.increment({ action: 'menu-list-unwrapped' })
          if (menuItemLocalName) {
            return transformMenuItemChildren(onlyChild, menuItemLocalName)
          }
          return getChildContent(onlyChild)
        }
      }
    }
  }

  // No unwrapping needed — transform menu items directly
  if (menuItemLocalName) {
    return transformMenuItemChildren(element, menuItemLocalName)
  }
  return getChildContent(element)
}

/**
 * Locked heuristic: a Popover whose descendants include MenuList follows the
 * Menu migration path; otherwise it becomes BUI Popover.
 *
 * MenuItem alone is not enough — Select/FormControl also use MenuItem, and the
 * recipe runs this codemod before Select migration.
 */
function hasMenuDescendants(element: SgNode<TSX>, menuListLocalName: string | null): boolean {
  if (!menuListLocalName) {
    return false
  }

  for (const child of element.findAll({
    rule: {
      any: [{ kind: 'jsx_element' }, { kind: 'jsx_self_closing_element' }],
    },
  })) {
    if (child.id() === element.id()) {
      continue
    }
    const childOpening = child.is('jsx_self_closing_element') ? child : child.child(0)
    if (!childOpening) {
      continue
    }
    const childName = getElementName(childOpening)
    if (childName === menuListLocalName) {
      return true
    }
  }

  return false
}

function insertHostTodo(el: SgNode<TSX>, reason: string, edits: Edit[]): void {
  edits.push(
    el.replace(
      withTodoComment(`{/* TODO(backstage-codemod): finish menu host migration manually (${reason}) */}`, el.text()),
    ),
  )
  migrationMetric.increment({ action: 'todo-inserted', reason })
}

function buildTriggerWrapperProps(opening: SgNode<TSX>): string[] | null {
  const triggerProps: string[] = []
  const openValue = getPropRawValue(opening, 'open')
  if (openValue) {
    triggerProps.push(`isOpen=${openValue}`)
  }

  if (hasProp(opening, 'onClose')) {
    const simpleHandler = getSimpleOnCloseHandler(opening)
    if (!simpleHandler) {
      return null
    }
    triggerProps.push(`onOpenChange={isOpen => !isOpen && ${simpleHandler}()}`)
    migrationMetric.increment({ action: 'onClose-rewritten' })
  }

  return triggerProps
}

function transformMenuElements(
  rootNode: SgNode<TSX, 'program'>,
  localNames: Map<string, string>,
  edits: Edit[],
): {
  preserveImport: boolean
  migrated: boolean
  buiNames: Set<string>
  consumedMuiNames: Set<string>
} {
  let preserveImport = false
  let migrated = false
  const buiNames = new Set<string>()
  const consumedMuiNames = new Set<string>()
  const menuListLocalName = [...localNames.entries()].find(([, v]) => v === 'MenuList')?.[0] ?? null
  const menuItemLocalName = [...localNames.entries()].find(([, v]) => v === 'MenuItem')?.[0] ?? null

  const jsxElements = rootNode.findAll({
    rule: {
      any: [{ kind: 'jsx_element' }, { kind: 'jsx_self_closing_element' }],
    },
  })

  for (const el of jsxElements) {
    const isSelfClosing = el.is('jsx_self_closing_element')
    const opening = isSelfClosing ? el : el.child(0)
    if (!opening) {
      continue
    }

    const name = getElementName(opening)
    if (!name) {
      continue
    }

    const muiName = localNames.get(name)
    if (!muiName) {
      continue
    }

    // Only process top-level Menu / Popover elements (skip MenuItem — handled inline)
    if (muiName !== 'Menu' && muiName !== 'Popover') {
      continue
    }

    // Check for TODO-triggering props
    let needsTodo = false
    const todoReasons: string[] = []
    for (const prop of TODO_PROPS) {
      if (hasProp(opening, prop)) {
        needsTodo = true
        todoReasons.push(prop)
      }
    }

    // anchorEl implies positional control — always TODO
    if (hasProp(opening, 'anchorEl')) {
      needsTodo = true
      if (!todoReasons.includes('anchorEl')) {
        todoReasons.push('anchorEl')
      }
    }

    if (needsTodo) {
      preserveImport = true
      insertHostTodo(el, todoReasons.join(', '), edits)
      continue
    }

    const useMenuPath = muiName === 'Menu' || hasMenuDescendants(el, menuListLocalName)

    if (isSelfClosing) {
      if (useMenuPath) {
        edits.push(el.replace('<Menu />'))
        buiNames.add('Menu')
        consumedMuiNames.add(muiName)
        migrated = true
        migrationMetric.increment({ action: 'menu-migrated', variant: 'self-closing' })
      } else {
        preserveImport = true
        insertHostTodo(el, 'no-trigger-element', edits)
      }
      continue
    }

    if (!useMenuPath) {
      // Plain Popover → BUI Popover via DialogTrigger. Trigger is required.
      const triggerSibling = findTriggerSibling(el)
      if (!triggerSibling) {
        preserveImport = true
        insertHostTodo(el, 'no-trigger-element', edits)
        continue
      }

      const triggerProps = buildTriggerWrapperProps(opening)
      if (triggerProps === null) {
        preserveImport = true
        insertHostTodo(el, 'complex-onClose', edits)
        continue
      }

      const triggerPropsStr = triggerProps.length > 0 ? ` ${triggerProps.join(' ')}` : ''
      const content = getChildContent(el)
      const output = `<DialogTrigger${triggerPropsStr}>${triggerSibling.text()}<Popover>${content}</Popover></DialogTrigger>`
      edits.push(triggerSibling.replace(''))
      edits.push(el.replace(output))
      buiNames.add('DialogTrigger')
      buiNames.add('Popover')
      consumedMuiNames.add(muiName)
      migrated = true
      migrationMetric.increment({ action: 'popover-migrated' })
      migrationMetric.increment({ action: 'dialog-trigger-wrapped' })
      continue
    }

    const hasControlledState = hasProp(opening, 'open') || hasProp(opening, 'onClose')
    let triggerSibling: SgNode<TSX> | null = null
    if (hasControlledState) {
      triggerSibling = findTriggerSibling(el)
      if (!triggerSibling) {
        preserveImport = true
        insertHostTodo(el, 'no-trigger-element', edits)
        continue
      }

      if (hasProp(opening, 'onClose') && !getSimpleOnCloseHandler(opening)) {
        preserveImport = true
        insertHostTodo(el, 'complex-onClose', edits)
        continue
      }
    }

    // Transform children: unwrap MenuList, convert MenuItems
    const innerContent = unwrapMenuList(el, menuListLocalName, menuItemLocalName)
    let menuOutput = `<Menu>${innerContent}</Menu>`

    if (hasControlledState && triggerSibling) {
      const triggerProps = buildTriggerWrapperProps(opening)
      if (triggerProps === null) {
        preserveImport = true
        insertHostTodo(el, 'complex-onClose', edits)
        continue
      }
      const triggerPropsStr = triggerProps.length > 0 ? ` ${triggerProps.join(' ')}` : ''
      menuOutput = `<MenuTrigger${triggerPropsStr}>${triggerSibling.text()}${menuOutput}</MenuTrigger>`
      edits.push(triggerSibling.replace(''))
      buiNames.add('MenuTrigger')
      migrationMetric.increment({ action: 'menu-trigger-wrapped' })
    }

    buiNames.add('Menu')
    consumedMuiNames.add(muiName)
    if (menuListLocalName) {
      consumedMuiNames.add('MenuList')
    }
    if (menuItemLocalName) {
      buiNames.add('MenuItem')
      consumedMuiNames.add('MenuItem')
    }
    edits.push(el.replace(menuOutput))
    migrated = true
    migrationMetric.increment({ action: 'menu-migrated', variant: muiName === 'Popover' ? 'popover' : 'menu' })
  }

  return { preserveImport, migrated, buiNames, consumedMuiNames }
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  const { localNames, deepComponents } = collectMenuImports(rootNode)

  if (localNames.size === 0) {
    return null
  }

  const { preserveImport, migrated, buiNames, consumedMuiNames } = transformMenuElements(rootNode, localNames, edits)

  if (migrated) {
    const addEdit = addImport(rootNode, {
      type: 'named',
      specifiers: [...buiNames].sort().map((name) => ({ name })),
      from: BUI_SOURCE,
    })
    if (addEdit) {
      edits.push(addEdit)
      const hasBuiNamedImport =
        rootNode.find({
          rule: {
            kind: 'import_statement',
            all: [
              {
                has: {
                  kind: 'string',
                  has: { kind: 'string_fragment', regex: `^${escapeRegex(BUI_SOURCE)}$` },
                },
              },
              { has: { kind: 'import_clause', has: { kind: 'named_imports' } } },
            ],
          },
        }) !== null
      migrationMetric.increment({ action: hasBuiNamedImport ? 'import-merged' : 'import-added' })
    }
  }

  if (!preserveImport) {
    // Only drop imports for MUI symbols we actually migrated. MenuItem under Select
    // must stay when a Popover takes the plain Popover path. A barrel that imports
    // only menu components is removed wholesale, matching the previous behavior.
    const menuComponentSet = new Set(MUI_MENU_COMPONENTS)
    for (const item of listImports(rootNode, { from: '@material-ui/core' })) {
      const menuSpecs = item.specifiers.filter((spec) => menuComponentSet.has(spec.importedName))
      if (menuSpecs.length === 0) {
        continue
      }
      const removable =
        menuSpecs.length >= item.specifiers.length
          ? menuSpecs.map((spec) => spec.importedName)
          : menuSpecs.map((spec) => spec.importedName).filter((name) => consumedMuiNames.has(name))
      if (removable.length === 0) {
        continue
      }
      const edit = removeImport(rootNode, { type: 'named', specifiers: removable, from: '@material-ui/core' })
      if (edit) {
        edits.push(...edit)
        migrationMetric.increment({ action: 'import-removed' })
      }
    }
    for (const component of deepComponents) {
      if (!consumedMuiNames.has(component)) {
        continue
      }
      const edit = removeImport(rootNode, { type: 'default', from: `@material-ui/core/${component}` })
      if (edit) {
        edits.push(...edit)
        migrationMetric.increment({ action: 'import-removed' })
      }
    }
  }

  const result = await Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
  return result
}

export default transform
