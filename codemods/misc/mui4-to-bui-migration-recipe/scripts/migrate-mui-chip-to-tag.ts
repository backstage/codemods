import { addImport, getImport, removeImport } from '@jssg/utils/javascript/imports'
import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('migrate-mui-chip-to-tag')

const BUI_SOURCE = '@backstage/ui'
const MUI_CHIP_SOURCE = '@material-ui/core/Chip'
const MUI_BARREL_SOURCE = '@material-ui/core'

/** Props that indicate an interactive chip — not safe to auto-migrate. */
const INTERACTIVE_PROPS = new Set(['onDelete', 'clickable', 'avatar', 'deleteIcon', 'onClick'])

function escapeRegex(str: string): string {
  return str.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function withTodoComment(comment: string, elementText: string): string {
  return `<>
  ${comment}
  ${elementText}
</>`
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

  const defaultImport = getImport(rootNode, { type: 'default', from: MUI_CHIP_SOURCE })
  const namedImport = getImport(rootNode, { type: 'named', name: 'Chip', from: MUI_BARREL_SOURCE })
  const chipLocalName = defaultImport?.alias ?? namedImport?.alias ?? null

  if (!chipLocalName) {
    return null
  }

  const { needsTagGroup, preserveImport, migrated } = transformChipElements(rootNode, chipLocalName, edits)

  if (migrated) {
    const importNames = [{ name: 'Tag' }]
    if (needsTagGroup) {
      importNames.push({ name: 'TagGroup' })
    }
    const addEdit = addImport(rootNode, {
      type: 'named',
      specifiers: importNames,
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
    if (namedImport) {
      const edit = removeImport(rootNode, { type: 'named', specifiers: ['Chip'], from: MUI_BARREL_SOURCE })
      if (edit) {
        edits.push(...edit)
        migrationMetric.increment({ action: 'import-removed' })
      }
    }
    if (defaultImport) {
      const edit = removeImport(rootNode, { type: 'default', from: MUI_CHIP_SOURCE })
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
