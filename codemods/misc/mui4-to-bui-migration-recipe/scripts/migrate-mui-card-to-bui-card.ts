import { addImport, getAllImports, getImport, listImports, removeImport } from '@jssg/utils/javascript/imports'
import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('migrate-mui-card-to-bui-card')

const BUI_SOURCE = '@backstage/ui'
const MUI_BARREL = '@material-ui/core'

const MUI_CARD_COMPONENTS = ['Card', 'CardHeader', 'CardContent', 'CardActions', 'CardMedia'] as const
type MuiCardComponent = (typeof MUI_CARD_COMPONENTS)[number]

const COMPONENT_MAP: Partial<Record<MuiCardComponent, string>> = {
  Card: 'Card',
  CardContent: 'CardBody',
  CardActions: 'CardFooter',
  CardHeader: 'CardHeader',
}

const COMPLEX_HEADER_PROPS = new Set(['avatar', 'action', 'subheader'])

function escapeRegex(str: string): string {
  return str.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function withTodoComment(comment: string, elementText: string): string {
  return `<>
  ${comment}
  ${elementText}
</>`
}

interface CardImports {
  localNames: Map<string, MuiCardComponent>
  deepComponents: MuiCardComponent[]
  barrelNames: string[]
}

function collectCardImports(rootNode: SgNode<TSX, 'program'>): CardImports {
  const localNames = new Map<string, MuiCardComponent>()
  const deepComponents: MuiCardComponent[] = []
  const barrelNames: string[] = []

  for (const componentName of MUI_CARD_COMPONENTS) {
    const defaultImport = getImport(rootNode, { type: 'default', from: `@material-ui/core/${componentName}` })
    if (defaultImport) {
      localNames.set(defaultImport.alias, componentName)
      deepComponents.push(componentName)
    }
    for (const named of getAllImports(rootNode, { type: 'named', name: componentName, from: MUI_BARREL })) {
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

function getOpeningAttrs(opening: SgNode<TSX>): string {
  const attrs = opening
    .children()
    .filter(
      (child) =>
        child.kind() === 'jsx_attribute' || (child.kind() === 'jsx_expression' && child.text().startsWith('{...')),
    )
    .map((child) => child.text())
  return attrs.length > 0 ? ` ${attrs.join(' ')}` : ''
}

function getChildContent(element: SgNode<TSX>): string {
  return element
    .children()
    .filter((child) => child.kind() !== 'jsx_opening_element' && child.kind() !== 'jsx_closing_element')
    .map((child) => child.text())
    .join('')
}

function hasNonWhitespaceChildren(element: SgNode<TSX>): boolean {
  return getChildContent(element).trim().length > 0
}

function isSimpleCardHeader(opening: SgNode<TSX>, element: SgNode<TSX>): { ok: true; title?: string } | { ok: false } {
  for (const prop of COMPLEX_HEADER_PROPS) {
    if (hasProp(opening, prop)) {
      return { ok: false }
    }
  }

  const titleAttr = getPropAttr(opening, 'title')
  const stringTitle = getPropStringValue(opening, 'title')
  const hasChildren = !element.is('jsx_self_closing_element') && hasNonWhitespaceChildren(element)

  if (titleAttr && stringTitle === null) {
    return { ok: false }
  }

  if (titleAttr && stringTitle !== null && !hasChildren) {
    return { ok: true, title: stringTitle }
  }

  if (!titleAttr && hasChildren) {
    return { ok: true }
  }

  return { ok: false }
}

interface TransformResult {
  text: string
  migrated: boolean
  todo: boolean
  buiNames: Set<string>
  preservedMui: Set<MuiCardComponent>
}

function transformMuiJsx(el: SgNode<TSX>, localNames: Map<string, MuiCardComponent>): TransformResult | null {
  const isSelfClosing = el.is('jsx_self_closing_element')
  const opening = isSelfClosing ? el : el.child(0)
  if (!opening) {
    return null
  }

  const name = getElementName(opening)
  if (!name || !localNames.has(name)) {
    return null
  }

  const muiName = localNames.get(name)
  if (!muiName) {
    return null
  }

  const buiNames = new Set<string>()
  const preservedMui = new Set<MuiCardComponent>()

  if (muiName === 'CardMedia') {
    migrationMetric.increment({ action: 'todo-inserted', reason: 'card-media' })
    preservedMui.add('CardMedia')
    return {
      text: withTodoComment(
        `{/* TODO(backstage-codemod): CardMedia has no BUI equivalent — migrate manually */}`,
        el.text(),
      ),
      migrated: false,
      todo: true,
      buiNames,
      preservedMui,
    }
  }

  if (muiName === 'CardHeader') {
    const simple = isSimpleCardHeader(opening, el)
    if (!simple.ok) {
      migrationMetric.increment({ action: 'todo-inserted', reason: 'complex-card-header' })
      preservedMui.add('CardHeader')
      return {
        text: withTodoComment(
          `{/* TODO(backstage-codemod): verify complex CardHeader migration manually (avatar/action/subheader) */}`,
          el.text(),
        ),
        migrated: false,
        todo: true,
        buiNames,
        preservedMui,
      }
    }

    buiNames.add('CardHeader')
    migrationMetric.increment({ action: 'card-header-migrated' })
    if (simple.title !== undefined) {
      return {
        text: `<CardHeader>${simple.title}</CardHeader>`,
        migrated: true,
        todo: false,
        buiNames,
        preservedMui,
      }
    }
    return {
      text: `<CardHeader>${getChildContent(el)}</CardHeader>`,
      migrated: true,
      todo: false,
      buiNames,
      preservedMui,
    }
  }

  const buiName = COMPONENT_MAP[muiName]
  if (!buiName) {
    return null
  }

  buiNames.add(buiName)

  if (muiName === 'Card' && !isSelfClosing) {
    const parts: string[] = []
    let childMigrated = false
    for (const child of el.children()) {
      const kind = child.kind()
      if (kind === 'jsx_opening_element' || kind === 'jsx_closing_element') {
        continue
      }
      if (kind === 'jsx_element' || kind === 'jsx_self_closing_element') {
        const nested = transformMuiJsx(child, localNames)
        if (nested) {
          parts.push(nested.text)
          childMigrated = childMigrated || nested.migrated
          for (const n of nested.buiNames) {
            buiNames.add(n)
          }
          for (const n of nested.preservedMui) {
            preservedMui.add(n)
          }
          continue
        }
      }
      parts.push(child.text())
    }

    migrationMetric.increment({ action: 'card-migrated', from: 'Card', to: 'Card' })
    return {
      text: `<Card${getOpeningAttrs(opening)}>${parts.join('')}</Card>`,
      migrated: true,
      todo: false,
      buiNames,
      preservedMui,
    }
  }

  migrationMetric.increment({ action: 'card-migrated', from: muiName, to: buiName })
  if (isSelfClosing) {
    return {
      text: `<${buiName}${getOpeningAttrs(opening)} />`,
      migrated: true,
      todo: false,
      buiNames,
      preservedMui,
    }
  }

  return {
    text: `<${buiName}${getOpeningAttrs(opening)}>${getChildContent(el)}</${buiName}>`,
    migrated: true,
    todo: false,
    buiNames,
    preservedMui,
  }
}

function isInsideTransformedCard(el: SgNode<TSX>, cardLocalNames: Set<string>): boolean {
  for (const ancestor of el.ancestors()) {
    if (!ancestor.is('jsx_element') && !ancestor.is('jsx_self_closing_element')) {
      continue
    }
    const opening = ancestor.is('jsx_self_closing_element') ? ancestor : ancestor.child(0)
    if (!opening) {
      continue
    }
    const name = getElementName(opening)
    if (name && cardLocalNames.has(name)) {
      return true
    }
  }
  return false
}

function transformCardElements(
  rootNode: SgNode<TSX, 'program'>,
  localNames: Map<string, MuiCardComponent>,
  edits: Edit[],
  buiNames: Set<string>,
  preservedMui: Set<MuiCardComponent>,
): boolean {
  let migrated = false
  const cardLocalNames = new Set([...localNames.entries()].filter(([, mui]) => mui === 'Card').map(([local]) => local))

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
    if (!name || !localNames.has(name)) {
      continue
    }

    const muiName = localNames.get(name)
    if (!muiName) {
      continue
    }

    // Children of Card are rewritten as part of the Card replacement.
    if (muiName !== 'Card' && isInsideTransformedCard(el, cardLocalNames)) {
      continue
    }

    const result = transformMuiJsx(el, localNames)
    if (!result) {
      continue
    }

    edits.push(el.replace(result.text))
    migrated = migrated || result.migrated
    for (const n of result.buiNames) {
      buiNames.add(n)
    }
    for (const n of result.preservedMui) {
      preservedMui.add(n)
    }
  }

  return migrated
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  const { localNames, deepComponents } = collectCardImports(rootNode)

  if (localNames.size === 0) {
    return null
  }

  const buiNames = new Set<string>()
  const preservedMui = new Set<MuiCardComponent>()
  const migrated = transformCardElements(rootNode, localNames, edits, buiNames, preservedMui)

  const namesToStripFromBarrel = new Set<string>()
  for (const [, muiName] of localNames) {
    if (!preservedMui.has(muiName)) {
      namesToStripFromBarrel.add(muiName)
    }
  }

  if (migrated && buiNames.size > 0) {
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

  for (const item of listImports(rootNode, { from: MUI_BARREL })) {
    const cardSpecs = item.specifiers.filter((spec) =>
      (MUI_CARD_COMPONENTS as readonly string[]).includes(spec.importedName),
    )
    if (cardSpecs.length === 0) {
      continue
    }
    if (cardSpecs.length >= item.specifiers.length) {
      const edit = removeImport(rootNode, {
        type: 'named',
        specifiers: cardSpecs.map((spec) => spec.importedName),
        from: MUI_BARREL,
      })
      if (edit) {
        edits.push(...edit)
        migrationMetric.increment({ action: 'import-removed' })
      }
      continue
    }
    const removable = cardSpecs.map((spec) => spec.importedName).filter((n) => namesToStripFromBarrel.has(n))
    if (removable.length === 0) {
      continue
    }
    const edit = removeImport(rootNode, { type: 'named', specifiers: removable, from: MUI_BARREL })
    if (edit) {
      edits.push(...edit)
      migrationMetric.increment({ action: 'import-removed' })
    }
  }

  for (const component of deepComponents) {
    if (preservedMui.has(component)) {
      continue
    }
    const edit = removeImport(rootNode, { type: 'default', from: `@material-ui/core/${component}` })
    if (edit) {
      edits.push(...edit)
      migrationMetric.increment({ action: 'import-removed' })
    }
  }

  const result = await Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
  return result
}

export default transform
