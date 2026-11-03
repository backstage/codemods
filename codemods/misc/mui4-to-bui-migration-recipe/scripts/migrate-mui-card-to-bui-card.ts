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

interface CardImports {
  localNames: Map<string, MuiCardComponent>
  importNodesToRemove: SgNode<TSX>[]
  importSpecifiersToRemove: Map<SgNode<TSX>, { source: string; names: string[] }>
  deepImportByComponent: Map<MuiCardComponent, SgNode<TSX>>
}

function collectCardImports(rootNode: SgNode<TSX>): CardImports {
  const localNames = new Map<string, MuiCardComponent>()
  const importNodesToRemove: SgNode<TSX>[] = []
  const importSpecifiersToRemove = new Map<SgNode<TSX>, { source: string; names: string[] }>()
  const deepImportByComponent = new Map<MuiCardComponent, SgNode<TSX>>()

  for (const componentName of MUI_CARD_COMPONENTS) {
    for (const imp of findImportStatementsFrom(rootNode, `@material-ui/core/${componentName}`)) {
      const name = getDefaultImportName(imp)
      if (name) {
        localNames.set(name, componentName)
      }
      importNodesToRemove.push(imp)
      deepImportByComponent.set(componentName, imp)
    }
  }

  for (const imp of findImportStatementsFrom(rootNode, MUI_BARREL)) {
    const namesToRemove: string[] = []
    for (const componentName of MUI_CARD_COMPONENTS) {
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
        importSpecifiersToRemove.set(imp, { source: MUI_BARREL, names: namesToRemove })
      }
    }
  }

  return { localNames, importNodesToRemove, importSpecifiersToRemove, deepImportByComponent }
}

function addBuiImport(
  rootNode: SgNode<TSX>,
  names: string[],
  importNodesToRemove: SgNode<TSX>[],
  importSpecifiersToRemove: Map<SgNode<TSX>, { source: string; names: string[] }>,
  edits: Edit[],
  handledBarrelIds: Set<number>,
  replacedDeepImportIds: Set<number>,
): void {
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
    return
  }

  const skipIds = new Set([
    ...importNodesToRemove.map((imp) => imp.id()),
    ...[...importSpecifiersToRemove.keys()].map((imp) => imp.id()),
  ])
  const allImports = rootNode.findAll({ rule: { kind: 'import_statement' } })
  const anchorImport = [...allImports].reverse().find((imp) => !skipIds.has(imp.id())) ?? null

  if (anchorImport) {
    edits.push(anchorImport.replace(`${anchorImport.text()}\n${buiImport}`))
    migrationMetric.increment({ action: 'import-added' })
    return
  }

  const [barrelToFold] = [...importSpecifiersToRemove.entries()]
  if (barrelToFold) {
    const [imp, { source, names: namesToRemove }] = barrelToFold
    const pruned = getPrunedBarrelImportText(imp, namesToRemove, source)
    edits.push(imp.replace(pruned.length > 0 ? `${pruned}\n${buiImport}` : buiImport))
    handledBarrelIds.add(imp.id())
    migrationMetric.increment({ action: 'import-added' })
    migrationMetric.increment({ action: 'import-removed' })
    return
  }

  const removableDeep = importNodesToRemove.find((imp) => !replacedDeepImportIds.has(imp.id()))
  if (removableDeep) {
    edits.push(removableDeep.replace(buiImport))
    replacedDeepImportIds.add(removableDeep.id())
    migrationMetric.increment({ action: 'import-added' })
    return
  }

  migrationMetric.increment({ action: 'import-added' })
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
  rootNode: SgNode<TSX>,
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

  const { localNames, importNodesToRemove, importSpecifiersToRemove, deepImportByComponent } =
    collectCardImports(rootNode)

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

  const handledBarrelIds = new Set<number>()
  const replacedDeepImportIds = new Set<number>()

  if (migrated && buiNames.size > 0) {
    const removableDeepImports = importNodesToRemove.filter((imp) => {
      for (const [component, node] of deepImportByComponent) {
        if (node.id() === imp.id() && preservedMui.has(component)) {
          return false
        }
      }
      return true
    })

    const foldableBarrels = new Map<SgNode<TSX>, { source: string; names: string[] }>()
    for (const [imp, value] of importSpecifiersToRemove) {
      const names = value.names.filter((n) => namesToStripFromBarrel.has(n))
      if (names.length > 0) {
        foldableBarrels.set(imp, { source: value.source, names })
      }
    }

    addBuiImport(
      rootNode,
      [...buiNames],
      removableDeepImports,
      foldableBarrels,
      edits,
      handledBarrelIds,
      replacedDeepImportIds,
    )
  }

  for (const [imp, { source, names }] of importSpecifiersToRemove) {
    if (handledBarrelIds.has(imp.id())) {
      continue
    }
    const removable = names.filter((n) => namesToStripFromBarrel.has(n))
    if (removable.length === 0) {
      continue
    }
    pruneBarrelImportSpecifiers(imp, source, removable, edits)
  }

  for (const imp of importNodesToRemove) {
    if (replacedDeepImportIds.has(imp.id())) {
      migrationMetric.increment({ action: 'import-removed' })
      continue
    }
    let preserve = false
    for (const [component, node] of deepImportByComponent) {
      if (node.id() === imp.id() && preservedMui.has(component)) {
        preserve = true
        break
      }
    }
    if (preserve) {
      continue
    }
    edits.push(imp.replace(''))
    migrationMetric.increment({ action: 'import-removed' })
  }

  const result = await Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
  return result
}

export default transform
