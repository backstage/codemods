import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('migrate-mui-link-to-bui-link')

const BUI_SOURCE = '@backstage/ui'
const MUI_BARREL = '@material-ui/core'
const MUI_LINK = '@material-ui/core/Link'
const CORE_COMPONENTS = '@backstage/core-components'

/** Props that need TODO markers because their semantics don't map mechanically. */
const TODO_PROPS = new Set(['component', 'to'])

const DROPPED_LINK_PROPS = new Set(['underline', 'color', 'variant', 'classes', 'TypographyClasses'])

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

function fileImportsCoreComponentsLink(rootNode: SgNode<TSX>): boolean {
  for (const imp of findImportStatementsFrom(rootNode, CORE_COMPONENTS)) {
    if (getNamedImportLocalName(imp, 'Link')) {
      return true
    }
  }
  return false
}

function collectMuiLinkImports(rootNode: SgNode<TSX>): {
  localName: string | null
  importNodesToRemove: SgNode<TSX>[]
  importSpecifiersToRemove: Map<SgNode<TSX>, { source: string; names: string[] }>
} {
  let localName: string | null = null
  const importNodesToRemove: SgNode<TSX>[] = []
  const importSpecifiersToRemove = new Map<SgNode<TSX>, { source: string; names: string[] }>()

  for (const imp of findImportStatementsFrom(rootNode, MUI_LINK)) {
    localName = getDefaultImportName(imp)
    importNodesToRemove.push(imp)
  }

  for (const imp of findImportStatementsFrom(rootNode, MUI_BARREL)) {
    const name = getNamedImportLocalName(imp, 'Link')
    if (name) {
      localName = name
      const allSpecifiers = imp.findAll({ rule: { kind: 'import_specifier' } })
      if (allSpecifiers.length <= 1) {
        importNodesToRemove.push(imp)
      } else {
        importSpecifiersToRemove.set(imp, { source: MUI_BARREL, names: ['Link'] })
      }
    }
  }

  return { localName, importNodesToRemove, importSpecifiersToRemove }
}

function addBuiImport(
  rootNode: SgNode<TSX>,
  importNodesToRemove: SgNode<TSX>[],
  importSpecifiersToRemove: Map<SgNode<TSX>, { source: string; names: string[] }>,
  edits: Edit[],
  handledBarrelIds: Set<number>,
  replacedDeepImportIds: Set<number>,
): void {
  const existingImports = findImportStatementsFrom(rootNode, BUI_SOURCE)
  const existingImport = existingImports[0] ?? null
  const buiImport = `import { Link } from '${BUI_SOURCE}';`

  if (existingImport) {
    if (getNamedImportLocalName(existingImport, 'Link')) {
      return
    }
    const namedImports = existingImport.find({ rule: { kind: 'named_imports' } })
    if (namedImports) {
      const specifiers = existingImport.findAll({ rule: { kind: 'import_specifier' } })
      const existingTexts = specifiers.map((spec) => spec.text())
      existingTexts.push('Link')
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
    const [imp, { source, names }] = barrelToFold
    const pruned = getPrunedBarrelImportText(imp, names, source)
    edits.push(imp.replace(pruned.length > 0 ? `${pruned}\n${buiImport}` : buiImport))
    handledBarrelIds.add(imp.id())
    migrationMetric.increment({ action: 'import-added' })
    migrationMetric.increment({ action: 'import-removed' })
    return
  }

  const [deep] = importNodesToRemove
  if (deep) {
    edits.push(deep.replace(buiImport))
    replacedDeepImportIds.add(deep.id())
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

function getChildContent(element: SgNode<TSX>): string {
  return element
    .children()
    .filter((child) => child.kind() !== 'jsx_opening_element' && child.kind() !== 'jsx_closing_element')
    .map((child) => child.text())
    .join('')
}

function hasProp(opening: SgNode<TSX>, propName: string): boolean {
  return (
    opening.find({
      rule: {
        kind: 'jsx_attribute',
        has: {
          kind: 'property_identifier',
          regex: `^${escapeRegex(propName)}$`,
        },
      },
    }) !== null
  )
}

function isBareLookingLink(element: SgNode<TSX>): boolean {
  const parent = element.parent()
  if (!parent) {
    return true
  }

  for (const sibling of parent.children()) {
    if (sibling.id() === element.id()) {
      continue
    }
    if (sibling.kind() === 'jsx_text' && sibling.text().trim().length > 0) {
      return false
    }
  }
  return true
}

function buildBuiLink(element: SgNode<TSX>, opening: SgNode<TSX>): string {
  const attrs: string[] = []
  for (const child of opening.children()) {
    if (child.kind() === 'jsx_attribute') {
      const propIdent = child.find({ rule: { kind: 'property_identifier' } })
      const propName = propIdent?.text()
      if (!propName || DROPPED_LINK_PROPS.has(propName) || TODO_PROPS.has(propName)) {
        continue
      }
      attrs.push(child.text())
      continue
    }
    if (child.kind() === 'jsx_expression' && child.text().startsWith('{...')) {
      attrs.push(child.text())
    }
  }

  if (isBareLookingLink(element) && !attrs.some((attr) => attr.startsWith('standalone'))) {
    attrs.push('standalone')
  }

  const propsStr = attrs.length > 0 ? ` ${attrs.join(' ')}` : ''
  if (element.is('jsx_self_closing_element')) {
    return `<Link${propsStr} />`
  }
  return `<Link${propsStr}>${getChildContent(element)}</Link>`
}

function transformLinkElements(
  rootNode: SgNode<TSX>,
  localName: string,
  edits: Edit[],
): { migrated: boolean; preserveImport: boolean } {
  let migrated = false
  let preserveImport = false

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
    if (getElementName(opening) !== localName) {
      continue
    }

    const todoReasons: string[] = []
    for (const prop of TODO_PROPS) {
      if (hasProp(opening, prop)) {
        todoReasons.push(prop)
      }
    }

    if (todoReasons.length > 0) {
      preserveImport = true
      edits.push(
        el.replace(
          withTodoComment(
            `{/* TODO(backstage-codemod): verify Link intent manually (${todoReasons.join(', ')}) */}`,
            el.text(),
          ),
        ),
      )
      migrationMetric.increment({ action: 'todo-inserted', reason: todoReasons.join(', ') })
      continue
    }

    edits.push(el.replace(buildBuiLink(el, opening)))
    migrated = true
    migrationMetric.increment({ action: 'link-migrated' })
  }

  return { migrated, preserveImport }
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const filename = root.filename()

  if (filename.includes('packages/core-components')) {
    migrationMetric.increment({ action: 'skipped', reason: 'core-components-path' })
    return null
  }

  if (fileImportsCoreComponentsLink(rootNode)) {
    migrationMetric.increment({ action: 'skipped', reason: 'core-components-import' })
    return null
  }

  const { localName, importNodesToRemove, importSpecifiersToRemove } = collectMuiLinkImports(rootNode)
  if (!localName) {
    return null
  }

  const edits: Edit[] = []
  const { migrated, preserveImport } = transformLinkElements(rootNode, localName, edits)
  if (!migrated && !preserveImport) {
    return null
  }

  const handledBarrelIds = new Set<number>()
  const replacedDeepImportIds = new Set<number>()

  if (migrated) {
    addBuiImport(
      rootNode,
      importNodesToRemove,
      importSpecifiersToRemove,
      edits,
      handledBarrelIds,
      replacedDeepImportIds,
    )
  }

  if (!preserveImport) {
    for (const [imp, { source, names }] of importSpecifiersToRemove) {
      if (handledBarrelIds.has(imp.id())) {
        continue
      }
      edits.push(imp.replace(getPrunedBarrelImportText(imp, names, source)))
      migrationMetric.increment({ action: 'import-removed' })
    }
    for (const imp of importNodesToRemove) {
      if (replacedDeepImportIds.has(imp.id())) {
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
