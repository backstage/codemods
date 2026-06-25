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

function collectChipImports(rootNode: SgNode<TSX>): {
  chipLocalName: string | null
  importNodesToRemove: SgNode<TSX>[]
} {
  let chipLocalName: string | null = null
  const importNodesToRemove: SgNode<TSX>[] = []

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
      }
    }
  }

  return { chipLocalName, importNodesToRemove }
}

function addBuiImport(
  rootNode: SgNode<TSX>,
  names: string[],
  importNodesToRemove: SgNode<TSX>[],
  edits: Edit[],
): boolean {
  const existingImports = findImportStatementsFrom(rootNode, BUI_SOURCE)
  const existingImport = existingImports[0] ?? null
  const sortedNames = [...names].sort()

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
    return false
  }

  const removableIds = new Set(importNodesToRemove.map((imp) => imp.id()))
  const allImports = rootNode.findAll({ rule: { kind: 'import_statement' } })
  const anchorImport = [...allImports].reverse().find((imp) => !removableIds.has(imp.id())) ?? null

  if (anchorImport) {
    edits.push(
      anchorImport.replace(`${anchorImport.text()}\nimport { ${sortedNames.join(', ')} } from '${BUI_SOURCE}';`),
    )
  } else if (importNodesToRemove.length === 1) {
    const [importNode] = importNodesToRemove
    if (importNode) {
      edits.push(importNode.replace(`import { ${sortedNames.join(', ')} } from '${BUI_SOURCE}';`))
      migrationMetric.increment({ action: 'import-added' })
      return true
    }
  } else if (allImports.length > 0) {
    const lastImport = allImports.at(-1)
    if (lastImport) {
      edits.push(lastImport.replace(`${lastImport.text()}\nimport { ${sortedNames.join(', ')} } from '${BUI_SOURCE}';`))
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
  const stringNode = attr.find({ rule: { kind: 'string' } })
  if (stringNode) {
    const frag = stringNode.find({ rule: { kind: 'string_fragment' } })
    return frag?.text() ?? null
  }
  return null
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

  // Group chips by parent for TagGroup detection
  const parentGroups = new Map<number, ChipInfo[]>()
  for (const info of chipInfos) {
    const parent = info.element.parent()
    if (!parent) {
      continue
    }
    const parentId = parent.id()
    const group = parentGroups.get(parentId) ?? []
    group.push(info)
    parentGroups.set(parentId, group)
  }

  // Track which elements are part of a group
  const groupedElements = new Set<number>()

  for (const [, group] of parentGroups) {
    // Only group if 2+ chips are siblings AND all are plain display chips
    if (group.length >= 2 && group.every((c) => !c.isInteractive)) {
      needsTagGroup = true
      const tags = group.map((c) => buildTagReplacement(c))
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
          `<>{/* TODO(backstage-codemod): verify interactive chip migration manually */}\n${info.element.text()}</>`,
        ),
      )
      migrationMetric.increment({ action: 'todo-inserted', reason: 'interactive-chip' })
      continue
    }

    edits.push(info.element.replace(buildTagReplacement(info)))
    migrated = true
    migrationMetric.increment({ action: 'chip-migrated' })
  }

  return { needsTagGroup, preserveImport, migrated }
}

const transform: Codemod<TSX> = (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  const { chipLocalName, importNodesToRemove } = collectChipImports(rootNode)

  if (!chipLocalName) {
    return Promise.resolve(null)
  }

  const { needsTagGroup, preserveImport, migrated } = transformChipElements(rootNode, chipLocalName, edits)

  let replacedImport = false
  if (migrated) {
    const importNames = ['Tag']
    if (needsTagGroup) {
      importNames.push('TagGroup')
    }
    replacedImport = addBuiImport(rootNode, importNames, importNodesToRemove, edits)
  }

  if (!preserveImport) {
    for (const imp of importNodesToRemove) {
      if (replacedImport && imp.id() === importNodesToRemove[0]?.id()) {
        migrationMetric.increment({ action: 'import-removed' })
        continue
      }
      edits.push(imp.replace(''))
      migrationMetric.increment({ action: 'import-removed' })
    }
  }

  return Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
}

export default transform
