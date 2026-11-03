import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('migrate-mui-chip-to-tag')

const BUI_SOURCE = '@backstage/ui'

/** Props that indicate an interactive chip — not safe to auto-migrate. */
const INTERACTIVE_PROPS = new Set(['onDelete', 'clickable', 'avatar', 'deleteIcon', 'onClick'])

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

function collectChipImports(rootNode: SgNode<TSX>): {
  chipLocalName: string | null
  importNodesToRemove: SgNode<TSX>[]
  importSpecifiersToRemove: Map<SgNode<TSX>, { source: string; names: string[] }>
} {
  let chipLocalName: string | null = null
  const importNodesToRemove: SgNode<TSX>[] = []
  const importSpecifiersToRemove = new Map<SgNode<TSX>, { source: string; names: string[] }>()

  // Default import: import Chip from '@material-ui/core/Chip'
  for (const imp of findImportStatementsFrom(rootNode, '@material-ui/core/Chip')) {
    chipLocalName = getDefaultImportName(imp)
    importNodesToRemove.push(imp)
  }

  // Named import from barrel: import { Chip } from '@material-ui/core'
  for (const imp of findImportStatementsFrom(rootNode, '@material-ui/core')) {
    const localName = getNamedImportLocalName(imp, 'Chip')
    if (localName) {
      chipLocalName = localName
      const allSpecifiers = imp.findAll({ rule: { kind: 'import_specifier' } })
      if (allSpecifiers.length <= 1) {
        importNodesToRemove.push(imp)
      } else {
        importSpecifiersToRemove.set(imp, { source: '@material-ui/core', names: ['Chip'] })
      }
    }
  }

  return { chipLocalName, importNodesToRemove, importSpecifiersToRemove }
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

function getPropStringValue(opening: SgNode<TSX>, propName: string): string | null {
  const attr = opening.find({
    rule: {
      kind: 'jsx_attribute',
      has: {
        kind: 'property_identifier',
        regex: `^${escapeRegex(propName)}$`,
      },
    },
  })
  if (!attr) {
    return null
  }
  // Only accept a direct string child (size="small"). Nested strings inside
  // expressions like size={cond ? 'small' : 'medium'} are dynamic, not static.
  for (const child of attr.children()) {
    if (child.kind() === 'string') {
      const frag = child.find({ rule: { kind: 'string_fragment' } })
      return frag?.text() ?? null
    }
  }
  return null
}

function isDynamicSizeProp(opening: SgNode<TSX>): boolean {
  return hasProp(opening, 'size') && getPropStringValue(opening, 'size') === null
}

function recordSizeMetric(sizeValue: string | null): void {
  if (sizeValue === 'small') {
    migrationMetric.increment({ action: 'size-mapped', size: 'small' })
    return
  }
  if (sizeValue === 'medium') {
    migrationMetric.increment({ action: 'size-mapped', size: 'medium' })
    return
  }
  if (sizeValue === 'large') {
    migrationMetric.increment({ action: 'size-large-to-medium' })
    return
  }
  migrationMetric.increment({ action: 'size-defaulted-to-medium' })
}

function getPropRawValue(opening: SgNode<TSX>, propName: string): string | null {
  const attr = opening.find({
    rule: {
      kind: 'jsx_attribute',
      has: {
        kind: 'property_identifier',
        regex: `^${escapeRegex(propName)}$`,
      },
    },
  })
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

function isInteractiveChip(opening: SgNode<TSX>): boolean {
  for (const propName of INTERACTIVE_PROPS) {
    if (hasProp(opening, propName)) {
      return true
    }
  }
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

interface ChipInfo {
  element: SgNode<TSX>
  opening: SgNode<TSX>
  isInteractive: boolean
  labelStr: string | null
  labelRaw: string | null
  sizeValue: string | null
}

function analyzeChipElement(el: SgNode<TSX>, chipLocalName: string): ChipInfo | null {
  const isSelfClosing = el.is('jsx_self_closing_element')
  const opening = isSelfClosing ? el : el.child(0)
  if (!opening) {
    return null
  }

  const nameNode = getElementName(opening)
  if (nameNode !== chipLocalName) {
    return null
  }

  return {
    element: el,
    opening,
    isInteractive: isInteractiveChip(opening),
    labelStr: getPropStringValue(opening, 'label'),
    labelRaw: getPropRawValue(opening, 'label'),
    sizeValue: getPropStringValue(opening, 'size'),
  }
}

function buildTagReplacement(info: ChipInfo): string {
  const props: string[] = []
  if (info.sizeValue === 'small') {
    props.push('size="small"')
  } else {
    props.push('size="medium"')
  }
  const propsStr = props.length > 0 ? ` ${props.join(' ')}` : ''

  // Static string label
  if (info.labelStr !== null) {
    return `<Tag${propsStr}>${info.labelStr}</Tag>`
  }

  // Dynamic label (JSX expression like {variable})
  if (info.labelRaw !== null) {
    return `<Tag${propsStr}>${info.labelRaw}</Tag>`
  }

  // No label prop — self-closing Tag
  return `<Tag${propsStr} />`
}

function getNonWhitespaceJsxSiblings(parent: SgNode<TSX>): SgNode<TSX>[] {
  const children: SgNode<TSX>[] = []
  for (const child of parent.children()) {
    const kind = child.kind()
    if (kind === 'jsx_text' && child.text().trim().length === 0) {
      continue
    }
    children.push(child)
  }
  return children
}

function findConsecutiveChipGroupsForParent(parent: SgNode<TSX>, chipLocalName: string): ChipInfo[][] {
  const groups: ChipInfo[][] = []
  let current: ChipInfo[] = []

  for (const sibling of getNonWhitespaceJsxSiblings(parent)) {
    const info = analyzeChipElement(sibling, chipLocalName)
    if (info && !info.isInteractive) {
      current.push(info)
      continue
    }

    if (current.length >= 2) {
      groups.push(current)
    }
    current = []
  }

  if (current.length >= 2) {
    groups.push(current)
  }

  return groups
}

function transformChipElements(
  rootNode: SgNode<TSX>,
  chipLocalName: string,
  edits: Edit[],
): { needsTagGroup: boolean; preserveImport: boolean; migrated: boolean } {
  let needsTagGroup = false
  let preserveImport = false
  let migrated = false

  const jsxElements = rootNode.findAll({
    rule: {
      any: [{ kind: 'jsx_element' }, { kind: 'jsx_self_closing_element' }],
    },
  })

  // Collect chip info
  const chipInfos: ChipInfo[] = []
  for (const el of jsxElements) {
    const info = analyzeChipElement(el, chipLocalName)
    if (info) {
      chipInfos.push(info)
    }
  }

  // Group consecutive non-interactive chip siblings for TagGroup
  const groupedElements = new Set<number>()
  const processedParents = new Set<number>()

  for (const info of chipInfos) {
    const parent = info.element.parent()
    if (!parent || processedParents.has(parent.id())) {
      continue
    }
    processedParents.add(parent.id())

    for (const group of findConsecutiveChipGroupsForParent(parent, chipLocalName)) {
      if (group.some((c) => isDynamicSizeProp(c.opening))) {
        continue
      }

      needsTagGroup = true
      const tags = group.map((c) => {
        recordSizeMetric(c.sizeValue)
        return buildTagReplacement(c)
      })
      const tagGroupContent = tags.join('\n  ')
      const [firstChip] = group
      if (!firstChip) {
        continue
      }
      edits.push(firstChip.element.replace(`<TagGroup>\n  ${tagGroupContent}\n</TagGroup>`))
      migrated = true
      migrationMetric.increment({ action: 'tag-group-created', count: `${group.length}` })

      for (let i = 1; i < group.length; i++) {
        const chip = group[i]
        if (chip) {
          edits.push(chip.element.replace(''))
        }
      }
      for (const c of group) {
        groupedElements.add(c.element.id())
      }
    }
  }

  // Process remaining individual chips
  for (const info of chipInfos) {
    if (groupedElements.has(info.element.id())) {
      continue
    }

    if (info.isInteractive) {
      preserveImport = true
      edits.push(
        info.element.replace(
          withTodoComment(
            `{/* TODO(backstage-codemod): verify interactive chip migration manually */}`,
            info.element.text(),
          ),
        ),
      )
      migrationMetric.increment({ action: 'todo-inserted', reason: 'interactive-chip' })
      continue
    }

    if (isDynamicSizeProp(info.opening)) {
      preserveImport = true
      edits.push(
        info.element.replace(
          withTodoComment(
            `{/* TODO(backstage-codemod): finish Chip migration manually (size) */}`,
            info.element.text(),
          ),
        ),
      )
      migrationMetric.increment({ action: 'todo-inserted', reason: 'size' })
      continue
    }

    edits.push(info.element.replace(buildTagReplacement(info)))
    recordSizeMetric(info.sizeValue)
    migrated = true
    migrationMetric.increment({ action: 'chip-migrated' })
  }

  return { needsTagGroup, preserveImport, migrated }
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  const { chipLocalName, importNodesToRemove, importSpecifiersToRemove } = collectChipImports(rootNode)

  if (!chipLocalName) {
    return null
  }

  const { needsTagGroup, preserveImport, migrated } = transformChipElements(rootNode, chipLocalName, edits)

  let replacedImport = false
  const handledBarrelIds = new Set<number>()
  if (migrated) {
    const importNames = ['Tag']
    if (needsTagGroup) {
      importNames.push('TagGroup')
    }
    replacedImport = addBuiImport(
      rootNode,
      importNames,
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
