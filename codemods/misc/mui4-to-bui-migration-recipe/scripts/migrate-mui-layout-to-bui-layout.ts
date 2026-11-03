import { addImport, getAllImports, listImports, removeImport } from '@jssg/utils/javascript/imports'
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

/** MUI spacing shorthand props — no deterministic BUI mapping yet. */
const BOX_SPACING_PROPS = new Set([
  'p',
  'px',
  'py',
  'pt',
  'pb',
  'pl',
  'pr',
  'm',
  'mx',
  'my',
  'mt',
  'mb',
  'ml',
  'mr',
  'padding',
  'margin',
])

/** Paper props that trigger a TODO. */
const PAPER_TODO_PROPS = new Set(['variant', 'elevation', 'square', 'component', 'classes'])

function escapeRegex(str: string): string {
  return str.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

interface LayoutImports {
  localNames: Map<string, string>
}

function collectLayoutImports(rootNode: SgNode<TSX, 'program'>): LayoutImports {
  const localNames = new Map<string, string>()

  for (const componentName of MUI_LAYOUT_COMPONENTS) {
    for (const imp of getAllImports(rootNode, { type: 'default', from: `@material-ui/core/${componentName}` })) {
      localNames.set(imp.alias, componentName)
    }
    for (const named of getAllImports(rootNode, { type: 'named', name: componentName, from: '@material-ui/core' })) {
      localNames.set(named.alias, componentName)
    }
  }

  return { localNames }
}

function isMuiComponentStillUsed(
  rootNode: SgNode<TSX, 'program'>,
  localName: string,
  migratedLocalNames: Set<string>,
): boolean {
  if (migratedLocalNames.has(localName)) {
    return false
  }

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
  rootNode: SgNode<TSX, 'program'>,
  localNames: Map<string, string>,
  migratedLocalNames: Set<string>,
  edits: Edit[],
): void {
  // Deep default imports: import Box from '@material-ui/core/Box'
  for (const componentName of MUI_LAYOUT_COMPONENTS) {
    const source = `@material-ui/core/${componentName}`
    for (const imp of getAllImports(rootNode, { type: 'default', from: source })) {
      if (!localNames.has(imp.alias) || isMuiComponentStillUsed(rootNode, imp.alias, migratedLocalNames)) {
        continue
      }
      const edit = removeImport(rootNode, { type: 'default', from: source, alias: imp.alias })
      if (edit) {
        edits.push(...edit)
        migrationMetric.increment({ action: 'import-removed' })
      }
    }
  }

  // Barrel imports: import { Box, Grid } from '@material-ui/core'
  for (const item of listImports(rootNode, { from: '@material-ui/core' })) {
    const specifiers = item.specifiers.map((spec) => ({
      importedName: spec.importedName,
      localName: spec.localName,
      isLayout: localNames.has(spec.localName),
      stillUsed:
        localNames.has(spec.localName) && isMuiComponentStillUsed(rootNode, spec.localName, migratedLocalNames),
    }))
    const touchesLayout =
      specifiers.some((spec) => spec.isLayout) || (item.defaultName !== null && localNames.has(item.defaultName))
    if (!touchesLayout) {
      continue
    }

    const defaultIsUnusedLayout =
      item.defaultName !== null &&
      localNames.has(item.defaultName) &&
      !isMuiComponentStillUsed(rootNode, item.defaultName, migratedLocalNames)
    const removable = specifiers.filter((spec) => spec.isLayout && !spec.stillUsed)
    const keepsAnyNamed = specifiers.length > removable.length

    if (!keepsAnyNamed && !defaultIsUnusedLayout && item.defaultName === null) {
      // Every specifier is an unused layout import — drop the whole statement.
      const edit = removeImport(rootNode, {
        type: 'named',
        specifiers: removable.map((spec) => ({ name: spec.importedName, alias: spec.localName })),
        from: '@material-ui/core',
      })
      if (edit) {
        edits.push(...edit)
        migrationMetric.increment({ action: 'import-removed' })
      }
      continue
    }

    if (!keepsAnyNamed && (defaultIsUnusedLayout || item.defaultName === null)) {
      // Mixed statement whose default and named bindings are all removable.
      edits.push(item.node.replace(''))
      migrationMetric.increment({ action: 'import-removed' })
      continue
    }

    let trimmed = false
    if (removable.length > 0) {
      const edit = removeImport(rootNode, {
        type: 'named',
        specifiers: removable.map((spec) => ({ name: spec.importedName, alias: spec.localName })),
        from: '@material-ui/core',
      })
      if (edit) {
        edits.push(...edit)
        trimmed = true
      }
    }
    if (defaultIsUnusedLayout && item.defaultName !== null) {
      const edit = removeImport(rootNode, { type: 'default', from: '@material-ui/core', alias: item.defaultName })
      if (edit) {
        edits.push(...edit)
        trimmed = true
      }
    }
    if (trimmed) {
      migrationMetric.increment({ action: 'import-trimmed' })
    }
  }
}

function withTodoComment(comment: string, elementText: string): string {
  return `<>
  ${comment}
  ${elementText}
</>`
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

const LAYOUT_TODO_COMMENT = '{/* TODO(backstage-codemod): verify BUI layout mapping manually */}'

function transformBoxElement(el: SgNode<TSX>, opening: SgNode<TSX>, edits: Edit[]): string | null {
  for (const prop of BOX_SPACING_PROPS) {
    if (hasProp(opening, prop)) {
      edits.push(el.replace(withTodoComment(LAYOUT_TODO_COMMENT, el.text())))
      migrationMetric.increment({ action: 'todo-inserted', reason: 'box-spacing' })
      return null
    }
  }

  // Check for TODO-triggering props
  for (const prop of BOX_TODO_PROPS) {
    if (hasProp(opening, prop)) {
      edits.push(el.replace(withTodoComment(LAYOUT_TODO_COMMENT, el.text())))
      migrationMetric.increment({ action: 'todo-inserted', reason: `box-${prop}` })
      return null
    }
  }

  // Check for dynamic display prop
  if (isPropDynamic(opening, 'display')) {
    edits.push(el.replace(withTodoComment(LAYOUT_TODO_COMMENT, el.text())))
    migrationMetric.increment({ action: 'todo-inserted', reason: 'dynamic-display' })
    return null
  }

  if (!isFlexBox(opening)) {
    // Non-flex Box — TODO
    edits.push(el.replace(withTodoComment(LAYOUT_TODO_COMMENT, el.text())))
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

/** Card-structure child tags that indicate Paper is card-like (MUI or post-Card-codemod BUI). */
const CARD_LIKE_CHILD_NAMES = new Set([
  'CardHeader',
  'CardContent',
  'CardActions',
  'CardBody',
  'CardFooter',
  'CardMedia',
  'CardActionArea',
])

function getDirectJsxChildElements(el: SgNode<TSX>): SgNode<TSX>[] {
  return el.children().filter((child) => {
    const kind = child.kind()
    return kind === 'jsx_element' || kind === 'jsx_self_closing_element'
  })
}

function isCardLikePaper(el: SgNode<TSX>): boolean {
  for (const child of getDirectJsxChildElements(el)) {
    const opening = child.is('jsx_self_closing_element') ? child : child.child(0)
    if (!opening) {
      continue
    }
    const name = getElementName(opening)
    if (name && CARD_LIKE_CHILD_NAMES.has(name)) {
      return true
    }
  }
  return false
}

function collectPreservedPaperProps(opening: SgNode<TSX>): string[] {
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

  return newProps
}

function transformPaperElement(el: SgNode<TSX>, opening: SgNode<TSX>, edits: Edit[]): string | null {
  for (const prop of PAPER_TODO_PROPS) {
    if (hasProp(opening, prop)) {
      edits.push(el.replace(withTodoComment(LAYOUT_TODO_COMMENT, el.text())))
      migrationMetric.increment({ action: 'todo-inserted', reason: `paper-${prop}` })
      return null
    }
  }

  const isSelfClosing = el.is('jsx_self_closing_element')
  const preservedProps = collectPreservedPaperProps(opening)
  const isCardLike = !isSelfClosing && isCardLikePaper(el)

  if (isCardLike) {
    const propsStr = preservedProps.length > 0 ? ` ${preservedProps.join(' ')}` : ''
    const children = getChildContent(el)
    edits.push(el.replace(`<Card${propsStr}>${children}</Card>`))
    migrationMetric.increment({ action: 'paper-to-card' })
    return 'Card'
  }

  // Bare Paper → Box with neutral background (Surface was removed from BUI).
  // MUI Paper defaults to elevation={1}; BUI Box has no elevation chrome — leave a verify TODO.
  const newProps = [`bg="neutral"`, ...preservedProps]
  const propsStr = ` ${newProps.join(' ')}`
  const boxElement = isSelfClosing ? `<Box${propsStr} />` : `<Box${propsStr}>${getChildContent(el)}</Box>`
  const paperElevationTodo =
    '{/* TODO(backstage-codemod): verify Paper elevation/visual chrome (MUI default elevation dropped) */}'

  edits.push(el.replace(withTodoComment(paperElevationTodo, boxElement)))
  migrationMetric.increment({ action: 'paper-to-box' })
  migrationMetric.increment({ action: 'todo-inserted', reason: 'paper-default-elevation' })
  return 'Box'
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
  const attr = getPropAttr(opening, propName)
  if (!attr) {
    return false
  }

  const jsxExpr = attr.find({ rule: { kind: 'jsx_expression' } })
  if (!jsxExpr) {
    return true
  }

  const inner = jsxExpr.text().slice(1, -1).trim()
  return inner !== 'false'
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

function replaceJsxOpeningTag(opening: SgNode<TSX>, tagName: string, propsStr: string, edits: Edit[]): void {
  edits.push(opening.replace(`<${tagName}${propsStr}>`))
}

function replaceJsxClosingTag(closing: SgNode<TSX>, tagName: string, edits: Edit[]): void {
  edits.push(closing.replace(`</${tagName}>`))
}

function transformGridElement(el: SgNode<TSX>, opening: SgNode<TSX>, edits: Edit[]): string | null {
  for (const prop of GRID_TODO_PROPS) {
    if (hasProp(opening, prop)) {
      edits.push(el.replace(withTodoComment(LAYOUT_TODO_COMMENT, el.text())))
      migrationMetric.increment({ action: 'todo-inserted', reason: `grid-${prop}` })
      return null
    }
  }

  const isContainer = hasBooleanProp(opening, 'container')
  const isItem = hasBooleanProp(opening, 'item')

  if (!isContainer && !isItem) {
    edits.push(el.replace(withTodoComment(LAYOUT_TODO_COMMENT, el.text())))
    migrationMetric.increment({ action: 'todo-inserted', reason: 'grid-unknown-role' })
    return null
  }

  const isSelfClosing = el.is('jsx_self_closing_element')

  if (isContainer) {
    const { props, isTodo } = buildGridRootProps(opening)
    if (isTodo) {
      edits.push(el.replace(withTodoComment(LAYOUT_TODO_COMMENT, el.text())))
      migrationMetric.increment({ action: 'todo-inserted', reason: 'grid-dynamic-spacing' })
      return null
    }

    const propsStr = props.length > 0 ? ` ${props.join(' ')}` : ''

    if (isSelfClosing) {
      edits.push(el.replace(`<Grid.Root${propsStr} />`))
    } else {
      replaceJsxOpeningTag(opening, 'Grid.Root', propsStr, edits)
      const closing = el.children().find((child) => child.kind() === 'jsx_closing_element')
      if (closing) {
        replaceJsxClosingTag(closing, 'Grid.Root', edits)
      }
    }

    migrationMetric.increment({ action: 'grid-container-to-root' })
    return 'Grid'
  }

  const { props, isTodo } = buildGridItemProps(opening)
  if (isTodo) {
    edits.push(el.replace(withTodoComment(LAYOUT_TODO_COMMENT, el.text())))
    migrationMetric.increment({ action: 'todo-inserted', reason: 'grid-item-colspan' })
    return null
  }

  const propsStr = props.length > 0 ? ` ${props.join(' ')}` : ''

  if (isSelfClosing) {
    edits.push(el.replace(`<Grid.Item${propsStr} />`))
  } else {
    replaceJsxOpeningTag(opening, 'Grid.Item', propsStr, edits)
    const closing = el.children().find((child) => child.kind() === 'jsx_closing_element')
    if (closing) {
      replaceJsxClosingTag(closing, 'Grid.Item', edits)
    }
  }

  migrationMetric.increment({ action: 'grid-item-migrated' })
  return 'Grid'
}

function transformLayoutElements(
  rootNode: SgNode<TSX, 'program'>,
  localNames: Map<string, string>,
  edits: Edit[],
): { usedBuiNames: Set<string>; migratedLocalNames: Set<string> } {
  const usedBuiNames = new Set<string>()
  const migratedLocalNames = new Set<string>()

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
        migratedLocalNames.add(name)
      }
      continue
    }

    if (muiName === 'Paper') {
      const buiName = transformPaperElement(el, opening, edits)
      if (buiName) {
        usedBuiNames.add(buiName)
        migratedLocalNames.add(name)
      }
      continue
    }

    if (muiName === 'Grid') {
      const buiName = transformGridElement(el, opening, edits)
      if (buiName) {
        usedBuiNames.add(buiName)
        migratedLocalNames.add(name)
      }
      continue
    }
  }

  return { usedBuiNames, migratedLocalNames }
}

const transform: Codemod<TSX> = (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  const { localNames } = collectLayoutImports(rootNode)

  if (localNames.size === 0) {
    return Promise.resolve(null)
  }

  // Transform elements before removing imports so TODO paths keep MUI imports.
  const { usedBuiNames, migratedLocalNames } = transformLayoutElements(rootNode, localNames, edits)

  removeUnusedLayoutImports(rootNode, localNames, migratedLocalNames, edits)

  if (usedBuiNames.size > 0) {
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

  return Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
}

export default transform
