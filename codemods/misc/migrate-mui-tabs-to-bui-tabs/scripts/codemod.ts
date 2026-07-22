import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('migrate-mui-tabs-to-bui-tabs')

const BUI_SOURCE = '@backstage/ui'

const TODO_PROPS = new Set([
  'orientation',
  'variant',
  'scrollButtons',
  'centered',
  'indicatorColor',
  'textColor',
  'classes',
  'TabIndicatorProps',
  'TabScrollButtonProps',
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

interface TabImports {
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

function collectTabImports(rootNode: SgNode<TSX>): TabImports {
  const localNames = new Map<string, string>()
  const importNodesToRemove: SgNode<TSX>[] = []
  const importSpecifiersToRemove = new Map<SgNode<TSX>, { source: string; names: string[] }>()

  const corePaths = ['Tabs', 'Tab']
  for (const componentName of corePaths) {
    for (const imp of findImportStatementsFrom(rootNode, `@material-ui/core/${componentName}`)) {
      const name = getDefaultImportName(imp)
      if (name) {
        localNames.set(name, componentName)
      }
      importNodesToRemove.push(imp)
    }
  }

  const labPaths = ['TabContext', 'TabList', 'TabPanel']
  for (const componentName of labPaths) {
    for (const imp of findImportStatementsFrom(rootNode, `@material-ui/lab/${componentName}`)) {
      const name = getDefaultImportName(imp)
      if (name) {
        localNames.set(name, componentName)
      }
      importNodesToRemove.push(imp)
    }
  }

  for (const imp of findImportStatementsFrom(rootNode, '@material-ui/core')) {
    const namesToRemove: string[] = []
    for (const componentName of corePaths) {
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

  for (const imp of findImportStatementsFrom(rootNode, '@material-ui/lab')) {
    const namesToRemove: string[] = []
    for (const componentName of labPaths) {
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
        importSpecifiersToRemove.set(imp, { source: '@material-ui/lab', names: namesToRemove })
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
    // No stable anchor — fold the BUI import into a partial barrel prune so we
    // don't apply two conflicting replacements to the same import node.
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

function getPropStringValue(opening: SgNode<TSX>, propName: string): string | null {
  const attr = getPropAttr(opening, propName)
  if (!attr) {
    return null
  }
  const stringNode = attr.find({ rule: { kind: 'string' } })
  if (stringNode) {
    const frag = stringNode.find({ rule: { kind: 'string_fragment' } })
    return frag?.text() ?? null
  }
  return null
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

function isPropDynamic(opening: SgNode<TSX>, propName: string): boolean {
  const attr = getPropAttr(opening, propName)
  if (!attr) {
    return false
  }
  return attr.find({ rule: { kind: 'jsx_expression' } }) !== null
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

function getParamName(paramNode: SgNode<TSX>): string {
  const ident = paramNode.find({ rule: { kind: 'identifier' } })
  return ident?.text() ?? paramNode.text().replace(/:.*$/, '').trim()
}

function identifierUsedIn(text: string, name: string): boolean {
  return new RegExp(`\\b${escapeRegex(name)}\\b`).test(text)
}

function replaceIdentifier(text: string, name: string, replacement: string): string {
  return text.replaceAll(new RegExp(`\\b${escapeRegex(name)}\\b`, 'g'), replacement)
}

/**
 * Rewrite MUI Tabs/TabList onChange to BUI Tabs onSelectionChange.
 * MUI: (event, value) => ... or handleChange reference
 * BUI: (key) => ...
 */
function rewriteTabsOnChangeHandler(attr: SgNode<TSX>): string | null {
  const expr = attr.find({ rule: { kind: 'jsx_expression' } })
  if (!expr) {
    return null
  }

  const arrow = expr.find({ rule: { kind: 'arrow_function' } })
  if (!arrow) {
    const innerText = expr.text().slice(1, -1).trim()
    if (/^[\w$.]+$/.test(innerText)) {
      return `{(key) => ${innerText}(undefined, key)}`
    }
    return null
  }

  const params = arrow.field('parameters')
  if (params?.kind() !== 'formal_parameters') {
    return null
  }

  const paramChildren: SgNode<TSX>[] = []
  for (const child of params.children()) {
    if (child.is('required_parameter') || child.is('identifier')) {
      paramChildren.push(child)
    }
  }

  if (paramChildren.length !== 2) {
    return null
  }

  const [firstParam, secondParam] = paramChildren
  if (!firstParam || !secondParam) {
    return null
  }

  const eventName = getParamName(firstParam)
  const valueName = getParamName(secondParam)

  const body = arrow.field('body')
  if (!body) {
    return null
  }

  const bodyText = body.text()
  const eventUsed = identifierUsedIn(bodyText, eventName) && !eventName.startsWith('_')

  if (!eventUsed) {
    return `{key => ${replaceIdentifier(bodyText, valueName, 'key')}}`
  }

  // Handler references the event param — cannot safely rewrite without breaking semantics
  return null
}

function findTabListOnChange(element: SgNode<TSX>, tabListLocalName: string | undefined): SgNode<TSX> | null {
  if (!tabListLocalName) {
    return null
  }

  for (const child of getJsxChildren(element)) {
    if (child.kind() !== 'jsx_element') {
      continue
    }
    const opening = child.child(0)
    if (!opening) {
      continue
    }
    if (getElementName(opening) === tabListLocalName) {
      return getPropAttr(opening, 'onChange')
    }
  }

  return null
}

function transformTabListElement(opening: SgNode<TSX>, innerContent: string): string {
  const newProps: string[] = []
  const handledProps = new Set(['onChange'])

  const allAttrs = opening.findAll({ rule: { kind: 'jsx_attribute' } })
  for (const attr of allAttrs) {
    const propIdent = attr.find({ rule: { kind: 'property_identifier' } })
    if (!propIdent || handledProps.has(propIdent.text())) {
      continue
    }
    newProps.push(attr.text())
  }

  const propsStr = newProps.length > 0 ? ` ${newProps.join(' ')}` : ''
  return `<TabList${propsStr}>${innerContent}</TabList>`
}

function transformTabElement(opening: SgNode<TSX>): string {
  const labelStr = getPropStringValue(opening, 'label')
  const labelRaw = getPropRawValue(opening, 'label')
  const valueStr = getPropStringValue(opening, 'value')
  const valueRaw = getPropRawValue(opening, 'value')

  const newProps: string[] = []

  if (valueStr !== null) {
    newProps.push(`id="${valueStr}"`)
  } else if (valueRaw !== null) {
    newProps.push(`id=${valueRaw}`)
  }

  const handledProps = new Set(['label', 'value', 'wrapped', 'disableRipple', 'classes', 'icon'])
  const allAttrs = opening.findAll({ rule: { kind: 'jsx_attribute' } })
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

  let labelContent = ''
  if (labelStr !== null) {
    labelContent = labelStr
  } else if (labelRaw !== null) {
    labelContent = labelRaw
  }

  if (labelContent) {
    return `<Tab${propsStr}>${labelContent}</Tab>`
  }
  return `<Tab${propsStr} />`
}

function transformTabPanelElement(el: SgNode<TSX>, opening: SgNode<TSX>): string {
  const valueStr = getPropStringValue(opening, 'value')
  const valueRaw = getPropRawValue(opening, 'value')

  const newProps: string[] = []

  if (valueStr !== null) {
    newProps.push(`id="${valueStr}"`)
  } else if (valueRaw !== null) {
    newProps.push(`id=${valueRaw}`)
  }

  const handledProps = new Set(['value', 'classes'])
  const allAttrs = opening.findAll({ rule: { kind: 'jsx_attribute' } })
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

  if (el.is('jsx_self_closing_element')) {
    return `<TabPanel${propsStr} />`
  }

  const children = getChildContent(el)
  return `<TabPanel${propsStr}>${children}</TabPanel>`
}

function transformChildren(element: SgNode<TSX>, localNames: Map<string, string>): string {
  const children = getJsxChildren(element)
  const parts: string[] = []

  for (const child of children) {
    const kind = child.kind()

    if (kind === 'jsx_text') {
      parts.push(child.text())
      continue
    }

    if (kind === 'jsx_self_closing_element' || kind === 'jsx_element') {
      const childOpening = kind === 'jsx_self_closing_element' ? child : child.child(0)
      if (childOpening) {
        const childName = getElementName(childOpening)
        if (childName && localNames.has(childName)) {
          const muiName = localNames.get(childName)
          if (!muiName) {
            continue
          }

          if (muiName === 'Tab') {
            parts.push(transformTabElement(childOpening))
            migrationMetric.increment({ action: 'tab-migrated' })
            continue
          }

          if (muiName === 'TabPanel') {
            parts.push(transformTabPanelElement(child, childOpening))
            migrationMetric.increment({ action: 'tab-panel-migrated' })
            continue
          }

          if (muiName === 'TabList') {
            const innerContent = transformChildren(child, localNames)
            parts.push(transformTabListElement(childOpening, innerContent))
            migrationMetric.increment({ action: 'tab-list-migrated' })
            continue
          }

          if (muiName === 'Tabs') {
            const innerContent = transformChildren(child, localNames)
            parts.push(`<TabList>${innerContent}</TabList>`)
            migrationMetric.increment({ action: 'tabs-to-tab-list' })
            continue
          }
        }
      }
    }

    parts.push(child.text())
  }

  return parts.join('')
}

function transformTabElements(
  rootNode: SgNode<TSX>,
  localNames: Map<string, string>,
  edits: Edit[],
): { usedBuiNames: Set<string>; preserveImport: boolean; migrated: boolean } {
  const usedBuiNames = new Set<string>()
  let preserveImport = false
  let migrated = false

  const tabContextLocalName = [...localNames.entries()].find(([, v]) => v === 'TabContext')?.[0]
  const tabListLocalName = [...localNames.entries()].find(([, v]) => v === 'TabList')?.[0]
  const tabsLocalName = [...localNames.entries()].find(([, v]) => v === 'Tabs')?.[0]

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

    if (name && name === tabContextLocalName) {
      let needsTodo = false
      for (const prop of TODO_PROPS) {
        if (hasProp(opening, prop)) {
          needsTodo = true
          break
        }
      }

      if (needsTodo) {
        preserveImport = true
        edits.push(
          el.replace(
            withTodoComment(
              `{/* TODO(backstage-codemod): verify custom tab orientation or selection logic manually */}`,
              el.text(),
            ),
          ),
        )
        migrationMetric.increment({ action: 'todo-inserted', reason: 'complex-props' })
        continue
      }

      const valueRaw = getPropRawValue(opening, 'value')
      const isDynamic = isPropDynamic(opening, 'value')

      const newProps: string[] = []
      if (valueRaw !== null) {
        if (isDynamic) {
          newProps.push(`selectedKey=${valueRaw}`)
        } else {
          newProps.push(`defaultSelectedKey=${valueRaw}`)
        }
      }

      const tabListOnChange = findTabListOnChange(el, tabListLocalName)
      if (tabListOnChange) {
        const rewritten = rewriteTabsOnChangeHandler(tabListOnChange)
        if (rewritten === null) {
          preserveImport = true
          edits.push(
            el.replace(
              withTodoComment(
                `{/* TODO(backstage-codemod): verify custom tab orientation or selection logic manually (event-referenced-onChange) */}`,
                el.text(),
              ),
            ),
          )
          migrationMetric.increment({ action: 'todo-inserted', reason: 'event-referenced-onChange' })
          continue
        }
        newProps.push(`onSelectionChange=${rewritten}`)
        migrationMetric.increment({ action: 'onChange-rewritten' })
      }

      const propsStr = newProps.length > 0 ? ` ${newProps.join(' ')}` : ''

      usedBuiNames.add('Tabs')
      migrated = true

      if (isSelfClosing) {
        edits.push(el.replace(`<Tabs${propsStr} />`))
      } else {
        const transformedChildren = transformChildren(el, localNames)
        edits.push(el.replace(`<Tabs${propsStr}>${transformedChildren}</Tabs>`))
      }

      migrationMetric.increment({ action: 'tab-context-migrated' })
      continue
    }

    if (name && name === tabsLocalName) {
      const parent = el.parent()
      if (parent) {
        const parentOpening = parent.child(0)
        if (parentOpening) {
          const parentName = getElementName(parentOpening)
          if (parentName && parentName === tabContextLocalName) {
            continue
          }
        }
      }

      let needsTodo = false
      for (const prop of TODO_PROPS) {
        if (hasProp(opening, prop)) {
          needsTodo = true
          break
        }
      }

      if (needsTodo) {
        preserveImport = true
        edits.push(
          el.replace(
            withTodoComment(
              `{/* TODO(backstage-codemod): verify custom tab orientation or selection logic manually */}`,
              el.text(),
            ),
          ),
        )
        migrationMetric.increment({ action: 'todo-inserted', reason: 'complex-props' })
        continue
      }

      const valueRaw = getPropRawValue(opening, 'value')
      const isDynamic = isPropDynamic(opening, 'value')

      const newTabsProps: string[] = []
      if (valueRaw !== null) {
        if (isDynamic) {
          newTabsProps.push(`selectedKey=${valueRaw}`)
        } else {
          newTabsProps.push(`defaultSelectedKey=${valueRaw}`)
        }
      }

      const onChangeAttr = getPropAttr(opening, 'onChange')
      if (onChangeAttr) {
        const rewritten = rewriteTabsOnChangeHandler(onChangeAttr)
        if (rewritten === null) {
          preserveImport = true
          edits.push(
            el.replace(
              withTodoComment(
                `{/* TODO(backstage-codemod): verify custom tab orientation or selection logic manually (event-referenced-onChange) */}`,
                el.text(),
              ),
            ),
          )
          migrationMetric.increment({ action: 'todo-inserted', reason: 'event-referenced-onChange' })
          continue
        }
        newTabsProps.push(`onSelectionChange=${rewritten}`)
        migrationMetric.increment({ action: 'onChange-rewritten' })
      }

      const tabsPropsStr = newTabsProps.length > 0 ? ` ${newTabsProps.join(' ')}` : ''

      usedBuiNames.add('Tabs')
      migrated = true

      if (isSelfClosing) {
        edits.push(el.replace(`<Tabs${tabsPropsStr} />`))
      } else {
        const innerContent = transformChildren(el, localNames)
        edits.push(el.replace(`<Tabs${tabsPropsStr}><TabList>${innerContent}</TabList></Tabs>`))
        usedBuiNames.add('TabList')
      }

      migrationMetric.increment({ action: 'tabs-migrated' })
      continue
    }
  }

  for (const [, muiName] of localNames) {
    if (migrated) {
      if (muiName === 'TabContext' || muiName === 'Tabs') {
        usedBuiNames.add('Tabs')
      }
      if (muiName === 'TabList' || muiName === 'Tabs') {
        usedBuiNames.add('TabList')
      }
      if (muiName === 'Tab') {
        usedBuiNames.add('Tab')
      }
      if (muiName === 'TabPanel') {
        usedBuiNames.add('TabPanel')
      }
    }
  }

  return { usedBuiNames, preserveImport, migrated }
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  const { localNames, importNodesToRemove, importSpecifiersToRemove } = collectTabImports(rootNode)

  if (localNames.size === 0) {
    return null
  }

  const { usedBuiNames, preserveImport, migrated } = transformTabElements(rootNode, localNames, edits)

  let replacedImport = false
  const handledBarrelIds = new Set<number>()
  if (migrated) {
    replacedImport = addBuiImport(
      rootNode,
      [...usedBuiNames],
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

  return edits.length > 0 ? rootNode.commitEdits(edits) : null
}

export default transform
