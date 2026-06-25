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

function findImportStatementsFrom(rootNode: SgNode<TSX>, source: string): SgNode<TSX>[] {
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
  })
}

function getDefaultImportName(imp: SgNode<TSX>): string | null {
  const clause = imp.find({ rule: { kind: 'import_clause' } })
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

function getNamedImportLocalName(imp: SgNode<TSX>, targetName: string): string | null {
  for (const spec of imp.findAll({ rule: { kind: 'import_specifier' } })) {
    const identifiers = spec.findAll({
      rule: { any: [{ kind: 'identifier' }, { kind: 'type_identifier' }] },
    })
    const [importedNameNode] = identifiers
    if (importedNameNode?.text() === targetName) {
      const localNameNode = identifiers[1] ?? importedNameNode
      return localNameNode.text()
    }
  }
  return null
}

interface MenuImports {
  localNames: Map<string, string>
  importNodesToRemove: SgNode<TSX>[]
}

function collectMenuImports(rootNode: SgNode<TSX>): MenuImports {
  const localNames = new Map<string, string>()
  const importNodesToRemove: SgNode<TSX>[] = []

  for (const componentName of MUI_MENU_COMPONENTS) {
    for (const imp of findImportStatementsFrom(rootNode, `@material-ui/core/${componentName}`)) {
      const name = getDefaultImportName(imp)
      if (name) {
        localNames.set(name, componentName)
      }
      importNodesToRemove.push(imp)
    }
  }

  for (const imp of findImportStatementsFrom(rootNode, '@material-ui/core')) {
    let foundCount = 0
    for (const componentName of MUI_MENU_COMPONENTS) {
      const localName = getNamedImportLocalName(imp, componentName)
      if (localName) {
        localNames.set(localName, componentName)
        foundCount++
      }
    }
    if (foundCount > 0) {
      const allSpecifiers = imp.findAll({ rule: { kind: 'import_specifier' } })
      if (foundCount >= allSpecifiers.length) {
        importNodesToRemove.push(imp)
      }
    }
  }

  return { localNames, importNodesToRemove }
}

function addBuiImport(rootNode: SgNode<TSX>, names: string[], edits: Edit[]): void {
  const existingImports = findImportStatementsFrom(rootNode, BUI_SOURCE)
  const existingImport = existingImports[0] ?? null

  if (existingImport) {
    const namedImports = existingImport.find({ rule: { kind: 'named_imports' } })
    if (namedImports) {
      const text = namedImports.text()
      const inner = text.slice(1, -1).trim()
      const existing = inner
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean)
      for (const name of names) {
        if (!existing.includes(name)) {
          existing.push(name)
        }
      }
      existing.sort()
      edits.push(namedImports.replace(`{ ${existing.join(', ')} }`))
      migrationMetric.increment({ action: 'import-merged' })
    }
  } else {
    const allImports = rootNode.findAll({ rule: { kind: 'import_statement' } })
    const sortedNames = [...names].sort()
    if (allImports.length > 0) {
      const lastImport = allImports.at(-1)
      if (lastImport) {
        edits.push(
          lastImport.replace(`${lastImport.text()}\nimport { ${sortedNames.join(', ')} } from '${BUI_SOURCE}';`),
        )
      }
    }
    migrationMetric.increment({ action: 'import-added' })
  }
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

/**
 * Transform MenuItem children: map onClick → onAction, preserve text content.
 */
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

function transformMenuElements(rootNode: SgNode<TSX>, localNames: Map<string, string>, edits: Edit[]): void {
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
      edits.push(
        el.replace(
          `{/* TODO(backstage-codemod): finish menu host migration manually (${todoReasons.join(', ')}) */}\n${el.text()}`,
        ),
      )
      migrationMetric.increment({ action: 'todo-inserted', reason: todoReasons.join(', ') })
      continue
    }

    if (isSelfClosing) {
      edits.push(el.replace('<Menu />'))
      migrationMetric.increment({ action: 'menu-migrated', variant: 'self-closing' })
      continue
    }

    // Transform children: unwrap MenuList, convert MenuItems
    const innerContent = unwrapMenuList(el, menuListLocalName, menuItemLocalName)
    let menuOutput = `<Menu>${innerContent}</Menu>`

    const hasControlledState = hasProp(opening, 'open') || hasProp(opening, 'onClose')
    if (hasControlledState) {
      const triggerProps: string[] = []
      const openValue = getPropRawValue(opening, 'open')
      if (openValue) {
        triggerProps.push(`isOpen=${openValue}`)
      }

      const simpleHandler = getSimpleOnCloseHandler(opening)
      if (hasProp(opening, 'onClose')) {
        if (simpleHandler) {
          triggerProps.push(`onOpenChange={isOpen => !isOpen && ${simpleHandler}()}`)
          migrationMetric.increment({ action: 'onClose-rewritten' })
        } else {
          edits.push(
            el.replace(
              `{/* TODO(backstage-codemod): finish menu host migration manually (complex-onClose) */}\n${el.text()}`,
            ),
          )
          migrationMetric.increment({ action: 'todo-inserted', reason: 'complex-onClose' })
          continue
        }
      }

      const triggerPropsStr = triggerProps.length > 0 ? ` ${triggerProps.join(' ')}` : ''
      menuOutput = `<MenuTrigger${triggerPropsStr}>${menuOutput}</MenuTrigger>`
      migrationMetric.increment({ action: 'menu-trigger-wrapped' })
    }

    edits.push(el.replace(menuOutput))
    migrationMetric.increment({ action: 'menu-migrated', variant: muiName === 'Popover' ? 'popover' : 'menu' })
  }
}

const transform: Codemod<TSX> = (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  const { localNames, importNodesToRemove } = collectMenuImports(rootNode)

  if (localNames.size === 0) {
    return Promise.resolve(null)
  }

  // Remove MUI imports
  for (const imp of importNodesToRemove) {
    edits.push(imp.replace(''))
    migrationMetric.increment({ action: 'import-removed' })
  }

  // Determine which BUI names we need
  const buiNames = new Set<string>()
  for (const [, muiName] of localNames) {
    if (muiName === 'Menu' || muiName === 'Popover' || muiName === 'MenuList') {
      buiNames.add('Menu')
      buiNames.add('MenuTrigger')
    }
    if (muiName === 'MenuItem') {
      buiNames.add('MenuItem')
    }
  }
  addBuiImport(rootNode, [...buiNames], edits)

  // Transform elements
  transformMenuElements(rootNode, localNames, edits)

  return Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
}

export default transform
