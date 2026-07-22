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
  importSpecifiersToRemove: Map<SgNode<TSX>, { source: string; names: string[] }>
}

function getImportedName(spec: SgNode<TSX>): string | null {
  const identifiers = spec.findAll({
    rule: { any: [{ kind: 'identifier' }, { kind: 'type_identifier' }] },
  })
  return identifiers[0]?.text() ?? null
}

function getPrunedBarrelImportText(imp: SgNode<TSX>, namesToRemove: string[], source: string): string {
  const remainingSpecs = imp.findAll({ rule: { kind: 'import_specifier' } }).filter((spec) => {
    const importedName = getImportedName(spec)
    return importedName !== null && !namesToRemove.includes(importedName)
  })

  if (remainingSpecs.length === 0) {
    return ''
  }

  const typeOnly = imp.text().trimStart().startsWith('import type')
  const isMultiline = imp.text().includes('\n')
  const specTexts = remainingSpecs.map((spec) => spec.text())
  const typeKw = typeOnly ? 'type ' : ''

  return isMultiline
    ? `import ${typeKw}{\n  ${specTexts.join(',\n  ')},\n} from '${source}';`
    : `import ${typeKw}{ ${specTexts.join(', ')} } from '${source}';`
}

function pruneBarrelImportSpecifiers(imp: SgNode<TSX>, source: string, namesToRemove: string[], edits: Edit[]): void {
  edits.push(imp.replace(getPrunedBarrelImportText(imp, namesToRemove, source)))
  migrationMetric.increment({ action: 'import-removed' })
}

function withTodoComment(comment: string, elementText: string): string {
  return `<>
  ${comment}
  ${elementText}
</>`
}

function collectMenuImports(rootNode: SgNode<TSX>): MenuImports {
  const localNames = new Map<string, string>()
  const importNodesToRemove: SgNode<TSX>[] = []
  const importSpecifiersToRemove = new Map<SgNode<TSX>, { source: string; names: string[] }>()

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
    const namesToRemove: string[] = []
    for (const componentName of MUI_MENU_COMPONENTS) {
      const localName = getNamedImportLocalName(imp, componentName)
      if (localName) {
        localNames.set(localName, componentName)
        namesToRemove.push(componentName)
      }
    }
    if (namesToRemove.length > 0) {
      const allSpecifiers = imp.findAll({ rule: { kind: 'import_specifier' } })
      if (namesToRemove.length >= allSpecifiers.length) {
        importNodesToRemove.push(imp)
      } else {
        importSpecifiersToRemove.set(imp, { source: '@material-ui/core', names: namesToRemove })
      }
    }
  }

  return { localNames, importNodesToRemove, importSpecifiersToRemove }
}

function addBuiImport(
  rootNode: SgNode<TSX>,
  names: string[],
  importNodesToRemove: SgNode<TSX>[],
  importSpecifiersToRemove: Map<SgNode<TSX>, { source: string; names: string[] }>,
  edits: Edit[],
  handledBarrelIds: Set<number>,
): boolean {
  const existingImports = findImportStatementsFrom(rootNode, BUI_SOURCE)
  const existingImport = existingImports[0] ?? null
  const sortedNames = [...names].sort()
  const buiImport = `import { ${sortedNames.join(', ')} } from '${BUI_SOURCE}';`

  if (existingImport) {
    const namedImports = existingImport.find({ rule: { kind: 'named_imports' } })
    if (namedImports) {
      const specifiers = existingImport.findAll({ rule: { kind: 'import_specifier' } })
      const existingImported = new Set<string>()
      const existingTexts: string[] = []
      for (const spec of specifiers) {
        const imported = getImportedName(spec)
        if (imported) {
          existingImported.add(imported)
        }
        existingTexts.push(spec.text())
      }
      for (const name of names) {
        if (!existingImported.has(name)) {
          existingTexts.push(name)
          existingImported.add(name)
        }
      }
      existingTexts.sort()
      edits.push(namedImports.replace(`{ ${existingTexts.join(', ')} }`))
      migrationMetric.increment({ action: 'import-merged' })
    }
    return false
  }

  const skipIds = new Set([
    ...importNodesToRemove.map((imp) => imp.id()),
    ...[...importSpecifiersToRemove.keys()].map((imp) => imp.id()),
  ])
  const allImports = rootNode.findAll({ rule: { kind: 'import_statement' } })
  const anchorImport = [...allImports].reverse().find((imp) => !skipIds.has(imp.id())) ?? null

  if (anchorImport) {
    edits.push(anchorImport.replace(`${anchorImport.text()}\n${buiImport}`))
  } else {
    const [barrelToFold] = [...importSpecifiersToRemove.entries()]
    if (barrelToFold) {
      const [imp, { source, names: namesToRemove }] = barrelToFold
      const pruned = getPrunedBarrelImportText(imp, namesToRemove, source)
      edits.push(imp.replace(pruned.length > 0 ? `${pruned}\n${buiImport}` : buiImport))
      handledBarrelIds.add(imp.id())
      migrationMetric.increment({ action: 'import-added' })
      migrationMetric.increment({ action: 'import-removed' })
      return false
    }

    if (importNodesToRemove.length > 0) {
      const [importNode] = importNodesToRemove
      if (importNode) {
        edits.push(importNode.replace(buiImport))
        migrationMetric.increment({ action: 'import-added' })
        return true
      }
    }
  }

  migrationMetric.increment({ action: 'import-added' })
  return false
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

function transformMenuElements(
  rootNode: SgNode<TSX>,
  localNames: Map<string, string>,
  edits: Edit[],
): { preserveImport: boolean; migrated: boolean; buiNames: Set<string> } {
  let preserveImport = false
  let migrated = false
  const buiNames = new Set<string>()
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
      edits.push(
        el.replace(
          withTodoComment(
            `{/* TODO(backstage-codemod): finish menu host migration manually (${todoReasons.join(', ')}) */}`,
            el.text(),
          ),
        ),
      )
      migrationMetric.increment({ action: 'todo-inserted', reason: todoReasons.join(', ') })
      continue
    }

    if (isSelfClosing) {
      edits.push(el.replace('<Menu />'))
      buiNames.add('Menu')
      migrated = true
      migrationMetric.increment({ action: 'menu-migrated', variant: 'self-closing' })
      continue
    }

    const hasControlledState = hasProp(opening, 'open') || hasProp(opening, 'onClose')
    let triggerSibling: SgNode<TSX> | null = null
    if (hasControlledState) {
      triggerSibling = findTriggerSibling(el)
      if (!triggerSibling) {
        preserveImport = true
        edits.push(
          el.replace(
            withTodoComment(
              `{/* TODO(backstage-codemod): finish menu host migration manually (no-trigger-element) */}`,
              el.text(),
            ),
          ),
        )
        migrationMetric.increment({ action: 'todo-inserted', reason: 'no-trigger-element' })
        continue
      }

      if (hasProp(opening, 'onClose') && !getSimpleOnCloseHandler(opening)) {
        preserveImport = true
        edits.push(
          el.replace(
            withTodoComment(
              `{/* TODO(backstage-codemod): finish menu host migration manually (complex-onClose) */}`,
              el.text(),
            ),
          ),
        )
        migrationMetric.increment({ action: 'todo-inserted', reason: 'complex-onClose' })
        continue
      }
    }

    // Transform children: unwrap MenuList, convert MenuItems
    const innerContent = unwrapMenuList(el, menuListLocalName, menuItemLocalName)
    let menuOutput = `<Menu>${innerContent}</Menu>`

    if (hasControlledState && triggerSibling) {
      const triggerProps: string[] = []
      const openValue = getPropRawValue(opening, 'open')
      if (openValue) {
        triggerProps.push(`isOpen=${openValue}`)
      }

      const simpleHandler = getSimpleOnCloseHandler(opening)
      if (simpleHandler) {
        triggerProps.push(`onOpenChange={isOpen => !isOpen && ${simpleHandler}()}`)
        migrationMetric.increment({ action: 'onClose-rewritten' })
      }

      const triggerPropsStr = triggerProps.length > 0 ? ` ${triggerProps.join(' ')}` : ''
      menuOutput = `<MenuTrigger${triggerPropsStr}>${triggerSibling.text()}${menuOutput}</MenuTrigger>`
      edits.push(triggerSibling.replace(''))
      buiNames.add('MenuTrigger')
      migrationMetric.increment({ action: 'menu-trigger-wrapped' })
    }

    buiNames.add('Menu')
    if (menuItemLocalName) {
      buiNames.add('MenuItem')
    }
    edits.push(el.replace(menuOutput))
    migrated = true
    migrationMetric.increment({ action: 'menu-migrated', variant: muiName === 'Popover' ? 'popover' : 'menu' })
  }

  return { preserveImport, migrated, buiNames }
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  const { localNames, importNodesToRemove, importSpecifiersToRemove } = collectMenuImports(rootNode)

  if (localNames.size === 0) {
    return null
  }

  const { preserveImport, migrated, buiNames } = transformMenuElements(rootNode, localNames, edits)

  let replacedImport = false
  const handledBarrelIds = new Set<number>()
  if (migrated) {
    replacedImport = addBuiImport(
      rootNode,
      [...buiNames],
      importNodesToRemove,
      importSpecifiersToRemove,
      edits,
      handledBarrelIds,
    )
  }

  if (!preserveImport) {
    for (const [imp, { source, names }] of importSpecifiersToRemove) {
      if (handledBarrelIds.has(imp.id())) {
        continue
      }
      pruneBarrelImportSpecifiers(imp, source, names, edits)
    }
    for (const imp of importNodesToRemove) {
      if (replacedImport && imp.id() === importNodesToRemove[0]?.id()) {
        migrationMetric.increment({ action: 'import-removed' })
        continue
      }
      edits.push(imp.replace(''))
      migrationMetric.increment({ action: 'import-removed' })
    }
  }

  const result = await Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
  return result
}

export default transform
