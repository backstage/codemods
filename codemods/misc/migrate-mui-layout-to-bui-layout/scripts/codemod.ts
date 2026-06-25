import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('migrate-mui-layout-to-bui-layout')

const BUI_SOURCE = '@backstage/ui'

const MUI_LAYOUT_COMPONENTS = ['Box', 'Grid', 'Paper']

/** Box props that map to Flex props. */
const BOX_FLEX_PROP_MAP: Record<string, string> = {
  flexDirection: 'direction',
  alignItems: 'align',
  justifyContent: 'justify',
  flexWrap: 'wrap',
  gap: 'gap',
}

/** Box props that trigger a TODO — polymorphic or complex usage. */
const BOX_TODO_PROPS = new Set(['component', 'clone', 'css', 'sx', 'classes'])

/** Paper props that trigger a TODO. */
const PAPER_TODO_PROPS = new Set(['variant', 'elevation', 'square', 'component', 'classes'])

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

interface LayoutImports {
  localNames: Map<string, string>
  importNodes: SgNode<TSX>[]
}

function collectLayoutImports(rootNode: SgNode<TSX>): LayoutImports {
  const localNames = new Map<string, string>()
  const importNodes: SgNode<TSX>[] = []

  for (const componentName of MUI_LAYOUT_COMPONENTS) {
    for (const imp of findImportStatementsFrom(rootNode, `@material-ui/core/${componentName}`)) {
      const name = getDefaultImportName(imp)
      if (name) {
        localNames.set(name, componentName)
      }
      importNodes.push(imp)
    }
  }

  for (const imp of findImportStatementsFrom(rootNode, '@material-ui/core')) {
    for (const componentName of MUI_LAYOUT_COMPONENTS) {
      const localName = getNamedImportLocalName(imp, componentName)
      if (localName) {
        localNames.set(localName, componentName)
      }
    }
    const hasLayoutImport = MUI_LAYOUT_COMPONENTS.some(
      (componentName) => getNamedImportLocalName(imp, componentName) !== null,
    )
    if (hasLayoutImport) {
      importNodes.push(imp)
    }
  }

  return { localNames, importNodes }
}

function isMuiComponentStillUsed(rootNode: SgNode<TSX>, localName: string): boolean {
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

    for (const child of opening.children()) {
      if (child.is('identifier') && child.text() === localName) {
        return true
      }
    }
  }

  return false
}

function removeUnusedLayoutImports(
  rootNode: SgNode<TSX>,
  localNames: Map<string, string>,
  importNodes: SgNode<TSX>[],
  edits: Edit[],
): void {
  const seenImportIds = new Set<number>()

  for (const imp of importNodes) {
    if (seenImportIds.has(imp.id())) {
      continue
    }
    seenImportIds.add(imp.id())

    const defaultName = getDefaultImportName(imp)
    const allSpecifiers = imp.findAll({ rule: { kind: 'import_specifier' } })

    if (defaultName && allSpecifiers.length === 0) {
      if (localNames.has(defaultName) && !isMuiComponentStillUsed(rootNode, defaultName)) {
        edits.push(imp.replace(''))
        migrationMetric.increment({ action: 'import-removed' })
      }
      continue
    }

    if (defaultName && localNames.has(defaultName) && !isMuiComponentStillUsed(rootNode, defaultName)) {
      // Default + named imports: drop the default binding when unused; trim named below.
    }

    const remainingSpecifiers = allSpecifiers.filter((spec) => {
      const identifiers = spec.findAll({
        rule: { any: [{ kind: 'identifier' }, { kind: 'type_identifier' }] },
      })
      const [importedNameNode] = identifiers
      if (!importedNameNode) {
        return true
      }
      const localNameNode = identifiers[1] ?? importedNameNode
      const localName = localNameNode.text()
      if (!localNames.has(localName)) {
        return true
      }
      return isMuiComponentStillUsed(rootNode, localName)
    })

    if (remainingSpecifiers.length === 0) {
      edits.push(imp.replace(''))
      migrationMetric.increment({ action: 'import-removed' })
    } else if (remainingSpecifiers.length < allSpecifiers.length) {
      const namedImports = imp.find({ rule: { kind: 'named_imports' } })
      if (namedImports) {
        edits.push(namedImports.replace(`{ ${remainingSpecifiers.map((s) => s.text()).join(', ')} }`))
        migrationMetric.increment({ action: 'import-trimmed' })
      }
    }
  }
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

/**
 * Check if a Box element is being used as a flex container.
 */
function isFlexBox(opening: SgNode<TSX>): boolean {
  const displayStr = getPropStringValue(opening, 'display')
  if (displayStr === 'flex' || displayStr === 'inline-flex') {
    return true
  }
  if (
    hasProp(opening, 'flexDirection') ||
    hasProp(opening, 'alignItems') ||
    hasProp(opening, 'justifyContent') ||
    hasProp(opening, 'flexWrap')
  ) {
    return true
  }
  return false
}

function transformBoxElement(el: SgNode<TSX>, opening: SgNode<TSX>, edits: Edit[]): string | null {
  // Check for TODO-triggering props
  for (const prop of BOX_TODO_PROPS) {
    if (hasProp(opening, prop)) {
      edits.push(el.replace(`{/* TODO(backstage-codemod): verify BUI layout mapping manually */}\n${el.text()}`))
      migrationMetric.increment({ action: 'todo-inserted', reason: `box-${prop}` })
      return null
    }
  }

  // Check for dynamic display prop
  if (isPropDynamic(opening, 'display')) {
    edits.push(el.replace(`{/* TODO(backstage-codemod): verify BUI layout mapping manually */}\n${el.text()}`))
    migrationMetric.increment({ action: 'todo-inserted', reason: 'dynamic-display' })
    return null
  }

  if (!isFlexBox(opening)) {
    // Non-flex Box — TODO
    edits.push(el.replace(`{/* TODO(backstage-codemod): verify BUI layout mapping manually */}\n${el.text()}`))
    migrationMetric.increment({ action: 'todo-inserted', reason: 'non-flex-box' })
    return null
  }

  // Build Flex props
  const newProps: string[] = []
  const handledProps = new Set(['display'])

  for (const [muiProp, buiProp] of Object.entries(BOX_FLEX_PROP_MAP)) {
    const strVal = getPropStringValue(opening, muiProp)
    const rawVal = getPropRawValue(opening, muiProp)
    if (strVal !== null) {
      newProps.push(`${buiProp}="${strVal}"`)
    } else if (rawVal !== null) {
      newProps.push(`${buiProp}=${rawVal}`)
    }
    handledProps.add(muiProp)
  }

  // Preserve unhandled safe props (className, style, data-*, etc.)
  const allAttrs = opening.findAll({ rule: { kind: 'jsx_attribute' } })
  for (const attr of allAttrs) {
    const propIdent = attr.find({ rule: { kind: 'property_identifier' } })
    if (!propIdent) {
      continue
    }
    const propName = propIdent.text()
    if (handledProps.has(propName)) {
      continue
    }
    // Skip MUI-only spacing shorthand props
    if (
      ['p', 'px', 'py', 'pt', 'pb', 'pl', 'pr', 'm', 'mx', 'my', 'mt', 'mb', 'ml', 'mr', 'padding', 'margin'].includes(
        propName,
      )
    ) {
      migrationMetric.increment({ action: 'spacing-prop-dropped', prop: propName })
      continue
    }
    newProps.push(attr.text())
  }

  // Preserve spread attributes
  const spreadAttrs = opening.findAll({ rule: { kind: 'jsx_expression' } })
  for (const spread of spreadAttrs) {
    if (spread.text().startsWith('{...')) {
      newProps.push(spread.text())
    }
  }

  const propsStr = newProps.length > 0 ? ` ${newProps.join(' ')}` : ''
  const isSelfClosing = el.is('jsx_self_closing_element')

  if (isSelfClosing) {
    edits.push(el.replace(`<Flex${propsStr} />`))
  } else {
    const children = getChildContent(el)
    edits.push(el.replace(`<Flex${propsStr}>${children}</Flex>`))
  }

  migrationMetric.increment({ action: 'box-to-flex' })
  return 'Flex'
}

function transformPaperElement(el: SgNode<TSX>, opening: SgNode<TSX>, edits: Edit[]): string | null {
  for (const prop of PAPER_TODO_PROPS) {
    if (hasProp(opening, prop)) {
      edits.push(el.replace(`{/* TODO(backstage-codemod): verify BUI layout mapping manually */}\n${el.text()}`))
      migrationMetric.increment({ action: 'todo-inserted', reason: `paper-${prop}` })
      return null
    }
  }

  const isSelfClosing = el.is('jsx_self_closing_element')
  const newProps: string[] = []

  const allAttrs = opening.findAll({ rule: { kind: 'jsx_attribute' } })
  for (const attr of allAttrs) {
    const propIdent = attr.find({ rule: { kind: 'property_identifier' } })
    if (!propIdent) {
      continue
    }
    newProps.push(attr.text())
  }

  const spreadAttrs = opening.findAll({ rule: { kind: 'jsx_expression' } })
  for (const spread of spreadAttrs) {
    if (spread.text().startsWith('{...')) {
      newProps.push(spread.text())
    }
  }

  const propsStr = newProps.length > 0 ? ` ${newProps.join(' ')}` : ''

  if (isSelfClosing) {
    edits.push(el.replace(`<Surface${propsStr} />`))
  } else {
    const children = getChildContent(el)
    edits.push(el.replace(`<Surface${propsStr}>${children}</Surface>`))
  }

  migrationMetric.increment({ action: 'paper-to-surface' })
  return 'Surface'
}

const GRID_BREAKPOINTS = ['xs', 'sm', 'md', 'lg', 'xl'] as const

const GRID_TODO_PROPS = new Set([
  'alignItems',
  'alignContent',
  'justify',
  'justifyContent',
  'wrap',
  'direction',
  'component',
  'classes',
])

function hasBooleanProp(opening: SgNode<TSX>, propName: string): boolean {
  return getPropAttr(opening, propName) !== null
}

function getPropStaticNumericValue(opening: SgNode<TSX>, propName: string): string | null {
  const strVal = getPropStringValue(opening, propName)
  if (strVal !== null) {
    return strVal
  }

  const attr = getPropAttr(opening, propName)
  if (!attr) {
    return null
  }

  const jsxExpr = attr.find({ rule: { kind: 'jsx_expression' } })
  if (!jsxExpr) {
    return null
  }

  const inner = jsxExpr.text().slice(1, -1).trim()
  if (/^\d+$/.test(inner)) {
    return inner
  }

  return null
}

function muiSpacingToBuiGap(spacing: string): string {
  return String(Number(spacing) * 2)
}

function buildGridColSpanProp(opening: SgNode<TSX>): string | null {
  const entries: string[] = []

  for (const breakpoint of GRID_BREAKPOINTS) {
    const value = getPropStaticNumericValue(opening, breakpoint)
    if (value === null) {
      if (hasProp(opening, breakpoint)) {
        return null
      }
      continue
    }
    entries.push(`${breakpoint}: '${value}'`)
  }

  if (entries.length === 0) {
    return null
  }

  return `colSpan={{ ${entries.join(', ')} }}`
}

function buildGridRootProps(opening: SgNode<TSX>): { props: string[]; isTodo: boolean } {
  const props = [`columns={{ sm: '12' }}`]
  const handledProps = new Set(['container', 'item'])

  const spacingValue = getPropStaticNumericValue(opening, 'spacing')
  if (spacingValue !== null) {
    props.push(`gap="${muiSpacingToBuiGap(spacingValue)}"`)
    handledProps.add('spacing')
  } else if (hasProp(opening, 'spacing')) {
    return { props: [], isTodo: true }
  }

  const allAttrs = opening.findAll({ rule: { kind: 'jsx_attribute' } })
  for (const attr of allAttrs) {
    const propIdent = attr.find({ rule: { kind: 'property_identifier' } })
    if (!propIdent) {
      continue
    }
    const propName = propIdent.text()
    if (handledProps.has(propName)) {
      continue
    }
    props.push(attr.text())
  }

  return { props, isTodo: false }
}

function buildGridItemProps(opening: SgNode<TSX>): { props: string[]; isTodo: boolean } {
  const props: string[] = []
  const handledProps = new Set(['container', 'item', ...GRID_BREAKPOINTS])

  const colSpanProp = buildGridColSpanProp(opening)
  if (colSpanProp === null) {
    return { props: [], isTodo: true }
  }
  props.push(colSpanProp)

  const allAttrs = opening.findAll({ rule: { kind: 'jsx_attribute' } })
  for (const attr of allAttrs) {
    const propIdent = attr.find({ rule: { kind: 'property_identifier' } })
    if (!propIdent) {
      continue
    }
    const propName = propIdent.text()
    if (handledProps.has(propName)) {
      continue
    }
    props.push(attr.text())
  }

  return { props, isTodo: false }
}

function transformGridElement(el: SgNode<TSX>, opening: SgNode<TSX>, edits: Edit[]): string | null {
  for (const prop of GRID_TODO_PROPS) {
    if (hasProp(opening, prop)) {
      edits.push(el.replace(`{/* TODO(backstage-codemod): verify BUI layout mapping manually */}\n${el.text()}`))
      migrationMetric.increment({ action: 'todo-inserted', reason: `grid-${prop}` })
      return null
    }
  }

  const isContainer = hasBooleanProp(opening, 'container')
  const isItem = hasBooleanProp(opening, 'item')

  if (!isContainer && !isItem) {
    edits.push(el.replace(`{/* TODO(backstage-codemod): verify BUI layout mapping manually */}\n${el.text()}`))
    migrationMetric.increment({ action: 'todo-inserted', reason: 'grid-unknown-role' })
    return null
  }

  const isSelfClosing = el.is('jsx_self_closing_element')

  if (isContainer) {
    const { props, isTodo } = buildGridRootProps(opening)
    if (isTodo) {
      edits.push(el.replace(`{/* TODO(backstage-codemod): verify BUI layout mapping manually */}\n${el.text()}`))
      migrationMetric.increment({ action: 'todo-inserted', reason: 'grid-dynamic-spacing' })
      return null
    }

    const propsStr = props.length > 0 ? ` ${props.join(' ')}` : ''

    if (isSelfClosing) {
      edits.push(el.replace(`<Grid.Root${propsStr} />`))
    } else {
      const children = getChildContent(el)
      edits.push(el.replace(`<Grid.Root${propsStr}>${children}</Grid.Root>`))
    }

    migrationMetric.increment({ action: 'grid-container-to-root' })
    return 'Grid'
  }

  const { props, isTodo } = buildGridItemProps(opening)
  if (isTodo) {
    edits.push(el.replace(`{/* TODO(backstage-codemod): verify BUI layout mapping manually */}\n${el.text()}`))
    migrationMetric.increment({ action: 'todo-inserted', reason: 'grid-item-colspan' })
    return null
  }

  const propsStr = props.length > 0 ? ` ${props.join(' ')}` : ''

  if (isSelfClosing) {
    edits.push(el.replace(`<Grid.Item${propsStr} />`))
  } else {
    const children = getChildContent(el)
    edits.push(el.replace(`<Grid.Item${propsStr}>${children}</Grid.Item>`))
  }

  migrationMetric.increment({ action: 'grid-item-migrated' })
  return 'Grid'
}

function transformLayoutElements(rootNode: SgNode<TSX>, localNames: Map<string, string>, edits: Edit[]): Set<string> {
  const usedBuiNames = new Set<string>()

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

    if (muiName === 'Box') {
      const buiName = transformBoxElement(el, opening, edits)
      if (buiName) {
        usedBuiNames.add(buiName)
      }
      continue
    }

    if (muiName === 'Paper') {
      const buiName = transformPaperElement(el, opening, edits)
      if (buiName) {
        usedBuiNames.add(buiName)
      }
      continue
    }

    if (muiName === 'Grid') {
      const buiName = transformGridElement(el, opening, edits)
      if (buiName) {
        usedBuiNames.add(buiName)
      }
      continue
    }
  }

  return usedBuiNames
}

const transform: Codemod<TSX> = (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  const { localNames, importNodes } = collectLayoutImports(rootNode)

  if (localNames.size === 0) {
    return Promise.resolve(null)
  }

  // Transform elements before removing imports so TODO paths keep MUI imports.
  const usedBuiNames = transformLayoutElements(rootNode, localNames, edits)

  removeUnusedLayoutImports(rootNode, localNames, importNodes, edits)

  if (usedBuiNames.size > 0) {
    addBuiImport(rootNode, [...usedBuiNames], edits)
  }

  return Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
}

export default transform
