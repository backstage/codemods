import { addImport, getAllImports, getImport, listImports, removeImport } from '@jssg/utils/javascript/imports'
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

interface TabImports {
  localNames: Map<string, string>
  defaultSources: string[]
  coreBarrelNames: string[]
  labBarrelNames: string[]
}

function withTodoComment(comment: string, elementText: string): string {
  return `<>
  ${comment}
  ${elementText}
</>`
}

function collectTabImports(rootNode: SgNode<TSX, 'program'>): TabImports {
  const localNames = new Map<string, string>()
  const defaultSources: string[] = []
  const coreBarrelNames: string[] = []
  const labBarrelNames: string[] = []

  const corePaths = ['Tabs', 'Tab']
  const labPaths = ['TabContext', 'TabList', 'TabPanel']
  for (const componentName of corePaths) {
    const defaultImport = getImport(rootNode, { type: 'default', from: `@material-ui/core/${componentName}` })
    if (defaultImport) {
      localNames.set(defaultImport.alias, componentName)
      defaultSources.push(`@material-ui/core/${componentName}`)
    }
    for (const named of getAllImports(rootNode, { type: 'named', name: componentName, from: '@material-ui/core' })) {
      localNames.set(named.alias, componentName)
      if (!coreBarrelNames.includes(componentName)) {
        coreBarrelNames.push(componentName)
      }
    }
  }

  for (const componentName of labPaths) {
    const defaultImport = getImport(rootNode, { type: 'default', from: `@material-ui/lab/${componentName}` })
    if (defaultImport) {
      localNames.set(defaultImport.alias, componentName)
      defaultSources.push(`@material-ui/lab/${componentName}`)
    }
    for (const named of getAllImports(rootNode, { type: 'named', name: componentName, from: '@material-ui/lab' })) {
      localNames.set(named.alias, componentName)
      if (!labBarrelNames.includes(componentName)) {
        labBarrelNames.push(componentName)
      }
    }
  }

  return { localNames, defaultSources, coreBarrelNames, labBarrelNames }
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
  return ident?.text() ?? paramNode.text()
}

function applyNodeTextReplacements(node: SgNode<TSX>, replacements: { target: SgNode<TSX>; text: string }[]): string {
  const base = node.range().start.index
  let text = node.text()
  const sorted = [...replacements].sort((a, b) => b.target.range().start.index - a.target.range().start.index)
  for (const { target, text: next } of sorted) {
    const start = target.range().start.index - base
    const end = target.range().end.index - base
    text = `${text.slice(0, start)}${next}${text.slice(end)}`
  }
  return text
}

function identifierUsedInBody(body: SgNode<TSX>, name: string): boolean {
  return (
    body.find({
      rule: {
        kind: 'identifier',
        regex: `^${escapeRegex(name)}$`,
      },
    }) !== null
  )
}

function replaceIdentifierInBody(body: SgNode<TSX>, name: string, replacement: string): string {
  const targets = body.findAll({
    rule: {
      kind: 'identifier',
      regex: `^${escapeRegex(name)}$`,
    },
  })
  return applyNodeTextReplacements(
    body,
    targets.map((target) => ({ target, text: replacement })),
  )
}

function getJsxExpressionInnerReference(expr: SgNode<TSX>): SgNode<TSX> | null {
  const meaningful: SgNode<TSX>[] = []
  for (const child of expr.children()) {
    const kind = child.kind()
    if (kind === '{' || kind === '}') {
      continue
    }
    meaningful.push(child)
  }
  if (meaningful.length !== 1) {
    return null
  }
  const [inner] = meaningful
  if (inner?.is('identifier') || inner?.is('member_expression')) {
    return inner
  }
  return null
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
    const innerRef = getJsxExpressionInnerReference(expr)
    if (innerRef) {
      return `{(key) => ${innerRef.text()}(undefined, key)}`
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

  const eventUsed = identifierUsedInBody(body, eventName) && !eventName.startsWith('_')

  if (!eventUsed) {
    return `{key => ${replaceIdentifierInBody(body, valueName, 'key')}}`
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
  rootNode: SgNode<TSX, 'program'>,
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

  const { localNames, defaultSources, coreBarrelNames, labBarrelNames } = collectTabImports(rootNode)

  if (localNames.size === 0) {
    return null
  }

  const { usedBuiNames, preserveImport, migrated } = transformTabElements(rootNode, localNames, edits)

  if (migrated) {
    const addEdit = addImport(rootNode, {
      type: 'named',
      specifiers: [...usedBuiNames].sort().map((name) => ({ name })),
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
    for (const [barrel, barrelNames] of [
      ['@material-ui/core', coreBarrelNames],
      ['@material-ui/lab', labBarrelNames],
    ] as const) {
      if (barrelNames.length === 0) {
        continue
      }
      const removedNames = new Set(barrelNames)
      for (const item of listImports(rootNode, { from: barrel })) {
        const matching = item.specifiers.filter((spec) => removedNames.has(spec.importedName))
        if (matching.length > 0) {
          migrationMetric.increment({ action: 'import-removed' })
        }
      }
      const edit = removeImport(rootNode, { type: 'named', specifiers: barrelNames, from: barrel })
      if (edit) {
        edits.push(...edit)
      }
    }
    for (const source of defaultSources) {
      const edit = removeImport(rootNode, { type: 'default', from: source })
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
