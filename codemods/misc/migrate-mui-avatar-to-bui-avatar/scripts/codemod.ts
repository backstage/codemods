import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('migrate-mui-avatar-to-bui-avatar')

const BUI_SOURCE = '@backstage/ui'
const MUI_BARREL_SOURCE = '@material-ui/core'

const PASSTHROUGH_PROPS = new Set(['className', 'id', 'onClick', 'onMouseEnter', 'onMouseLeave', 'title'])

const TODO_PROPS = new Set(['variant', 'classes', 'imgProps', 'component', 'sizes', 'srcSet'])

function escapeRegex(str: string): string {
  return str.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function withTodoComment(comment: string, elementText: string): string {
  return `<>
  ${comment}
  ${elementText}
</>`
}

function rebuildImportWithout(importStmt: SgNode<TSX>, specifiersToRemove: Set<string>): string {
  const specifiers = importStmt.findAll({ rule: { kind: 'import_specifier' } })
  const remaining: string[] = []
  for (const spec of specifiers) {
    const identifiers = spec.findAll({
      rule: { any: [{ kind: 'identifier' }, { kind: 'type_identifier' }] },
    })
    const importedName = identifiers[0]?.text()
    if (importedName && !specifiersToRemove.has(importedName)) {
      remaining.push(spec.text())
    }
  }

  if (remaining.length === 0) {
    return ''
  }

  const sourceNode = importStmt.find({ rule: { kind: 'string' } })
  const sourceText = sourceNode?.text() ?? `'${MUI_BARREL_SOURCE}'`

  if (remaining.length <= 2) {
    return `import { ${remaining.join(', ')} } from ${sourceText};`
  }
  return `import {\n  ${remaining.join(',\n  ')},\n} from ${sourceText};`
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

function collectAvatarImports(rootNode: SgNode<TSX>): {
  avatarLocalName: string | null
  importNodesToRemove: SgNode<TSX>[]
  barrelImportsToPrune: { imp: SgNode<TSX>; namesToRemove: Set<string> }[]
} {
  let avatarLocalName: string | null = null
  const importNodesToRemove: SgNode<TSX>[] = []
  const barrelImportsToPrune: { imp: SgNode<TSX>; namesToRemove: Set<string> }[] = []

  for (const imp of findImportStatementsFrom(rootNode, '@material-ui/core/Avatar')) {
    avatarLocalName = getDefaultImportName(imp)
    importNodesToRemove.push(imp)
  }

  for (const imp of findImportStatementsFrom(rootNode, MUI_BARREL_SOURCE)) {
    const localName = getNamedImportLocalName(imp, 'Avatar')
    if (localName) {
      avatarLocalName = localName
      const allSpecifiers = imp.findAll({ rule: { kind: 'import_specifier' } })
      if (allSpecifiers.length <= 1) {
        importNodesToRemove.push(imp)
      } else {
        barrelImportsToPrune.push({ imp, namesToRemove: new Set(['Avatar']) })
      }
    }
  }

  return { avatarLocalName, importNodesToRemove, barrelImportsToPrune }
}

function addBuiImport(
  rootNode: SgNode<TSX>,
  importNodesToRemove: SgNode<TSX>[],
  barrelImportsToPrune: { imp: SgNode<TSX>; namesToRemove: Set<string> }[],
  edits: Edit[],
  handledBarrelIds: Set<number>,
): boolean {
  const existingImports = findImportStatementsFrom(rootNode, BUI_SOURCE)
  const existingImport = existingImports[0] ?? null

  if (existingImport) {
    const alreadyImported = getNamedImportLocalName(existingImport, 'Avatar') !== null
    if (!alreadyImported) {
      const namedImports = existingImport.find({ rule: { kind: 'named_imports' } })
      if (namedImports) {
        const text = namedImports.text()
        const inner = text.slice(1, -1).trim()
        const names = inner
          .split(',')
          .map((n) => n.trim())
          .filter(Boolean)
        names.push('Avatar')
        names.sort()
        edits.push(namedImports.replace(`{ ${names.join(', ')} }`))
        migrationMetric.increment({ action: 'import-merged' })
      } else {
        edits.push(existingImport.replace(`${existingImport.text()}\nimport { Avatar } from '${BUI_SOURCE}';`))
        migrationMetric.increment({ action: 'import-added' })
      }
    }
    return false
  }

  const skipIds = new Set([
    ...importNodesToRemove.map((imp) => imp.id()),
    ...barrelImportsToPrune.map(({ imp }) => imp.id()),
  ])
  const allImports = rootNode.findAll({ rule: { kind: 'import_statement' } })
  const anchorImport = [...allImports].reverse().find((imp) => !skipIds.has(imp.id())) ?? null
  const buiImport = `import { Avatar } from '${BUI_SOURCE}';`

  if (anchorImport) {
    edits.push(anchorImport.replace(`${anchorImport.text()}\n${buiImport}`))
    migrationMetric.increment({ action: 'import-added' })
    return false
  }

  const [barrelToFold] = barrelImportsToPrune
  if (barrelToFold) {
    const pruned = rebuildImportWithout(barrelToFold.imp, barrelToFold.namesToRemove)
    edits.push(barrelToFold.imp.replace(pruned.length > 0 ? `${pruned}\n${buiImport}` : buiImport))
    handledBarrelIds.add(barrelToFold.imp.id())
    migrationMetric.increment({ action: 'import-added' })
    migrationMetric.increment({ action: 'import-pruned' })
    return false
  }

  if (importNodesToRemove.length >= 1) {
    const [importNode] = importNodesToRemove
    if (importNode) {
      edits.push(importNode.replace(buiImport))
      migrationMetric.increment({ action: 'import-added' })
      return true
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
  return ''
}

function mapPixelSize(px: number): string | null {
  if (px <= 24) {
    return 'x-small'
  }
  if (px <= 32) {
    return 'small'
  }
  if (px <= 40) {
    return 'medium'
  }
  if (px <= 56) {
    return 'large'
  }
  if (px <= 80) {
    return 'x-large'
  }
  return null
}

/**
 * Extract a numeric width from `style={{ width: N, height: N }}` when both are
 * the same number literal. Returns null if style is absent or unmapped.
 */
function extractStyleSize(opening: SgNode<TSX>): { size: string | null; unknown: boolean; hasStyle: boolean } {
  const styleAttr = getPropAttr(opening, 'style')
  if (!styleAttr) {
    return { size: null, unknown: false, hasStyle: false }
  }

  const expr = styleAttr.find({ rule: { kind: 'jsx_expression' } })
  if (!expr) {
    return { size: null, unknown: true, hasStyle: true }
  }

  const obj = expr.find({ rule: { kind: 'object' } })
  if (!obj) {
    return { size: null, unknown: true, hasStyle: true }
  }

  let width: number | null = null
  let height: number | null = null

  for (const pair of obj.findAll({ rule: { kind: 'pair' } })) {
    const key = pair.child(0)?.text()
    const valueNode = pair.child(2) ?? pair.children().at(-1)
    const valueText = valueNode?.text()
    if (!key || valueText === undefined) {
      continue
    }
    if (!/^\d+(\.\d+)?$/.test(valueText)) {
      continue
    }
    const num = Number(valueText)
    if (key === 'width' || key === '"width"' || key === "'width'") {
      width = num
    }
    if (key === 'height' || key === '"height"' || key === "'height'") {
      height = num
    }
  }

  if (width === null && height === null) {
    // style present but no numeric width/height we understand
    return { size: null, unknown: true, hasStyle: true }
  }

  const px = width ?? height
  if (px === null) {
    return { size: null, unknown: true, hasStyle: true }
  }
  if (width !== null && height !== null && width !== height) {
    return { size: null, unknown: true, hasStyle: true }
  }

  const mapped = mapPixelSize(px)
  if (mapped === null) {
    return { size: null, unknown: true, hasStyle: true }
  }
  return { size: mapped, unknown: false, hasStyle: true }
}

function transformAvatarElements(
  rootNode: SgNode<TSX>,
  avatarLocalName: string,
  edits: Edit[],
): { preserveImport: boolean; migrated: boolean } {
  let preserveImport = false
  let migrated = false

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
    if (name !== avatarLocalName) {
      continue
    }

    const todoReasons: string[] = []
    for (const prop of TODO_PROPS) {
      if (hasProp(opening, prop)) {
        todoReasons.push(prop)
      }
    }

    const nameString = getPropStringValue(opening, 'name')
    const altString = getPropStringValue(opening, 'alt')
    const nameRaw = getPropRawValue(opening, 'name')
    const altRaw = getPropRawValue(opening, 'alt')

    let resolvedName: string | null = nameString
    if (resolvedName === null && altString !== null) {
      resolvedName = altString
    }

    if (resolvedName === null) {
      if (nameRaw !== null || altRaw !== null) {
        todoReasons.push('complex-name')
      } else {
        todoReasons.push('missing-name')
      }
    }

    const { size: mappedSize, unknown: unknownSize, hasStyle } = extractStyleSize(opening)
    if (unknownSize) {
      todoReasons.push('unknown-size')
    }

    if (todoReasons.length > 0) {
      preserveImport = true
      edits.push(
        el.replace(
          withTodoComment(
            `{/* TODO(backstage-codemod): finish avatar migration manually (${todoReasons.join(', ')}) */}`,
            el.text(),
          ),
        ),
      )
      migrationMetric.increment({ action: 'todo-inserted', reason: todoReasons.join(', ') })
      continue
    }

    const newProps: string[] = []
    newProps.push(`name="${resolvedName}"`)

    const srcString = getPropStringValue(opening, 'src')
    const srcRaw = getPropRawValue(opening, 'src')
    if (srcString !== null) {
      newProps.push(`src="${srcString}"`)
    } else if (srcRaw !== null && srcRaw !== '') {
      newProps.push(`src=${srcRaw}`)
    } else {
      newProps.push('src=""')
    }

    if (mappedSize) {
      newProps.push(`size="${mappedSize}"`)
      migrationMetric.increment({ action: 'size-mapped', size: mappedSize })
    }

    for (const child of opening.children()) {
      const kind = child.kind()
      if (kind === 'jsx_attribute') {
        const propIdent = child.find({ rule: { kind: 'property_identifier' } })
        if (!propIdent) {
          continue
        }
        const propName = propIdent.text()
        if (propName === 'alt' || propName === 'name' || propName === 'src' || propName === 'style') {
          continue
        }
        if (PASSTHROUGH_PROPS.has(propName) || propName.startsWith('aria-') || propName.startsWith('data-')) {
          newProps.push(child.text())
        }
      } else if (kind === 'jsx_expression' && child.text().startsWith('{...')) {
        newProps.push(child.text())
      }
    }

    // Drop children (initials) — BUI derives fallback from name
    const propsStr = newProps.length > 0 ? ` ${newProps.join(' ')}` : ''
    edits.push(el.replace(`<Avatar${propsStr} />`))
    migrated = true
    migrationMetric.increment({
      action: 'avatar-migrated',
      droppedStyle: hasStyle && mappedSize !== null ? 'true' : 'false',
    })
  }

  return { preserveImport, migrated }
}

const transform: Codemod<TSX> = (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  const { avatarLocalName, importNodesToRemove, barrelImportsToPrune } = collectAvatarImports(rootNode)

  if (!avatarLocalName) {
    return Promise.resolve(null)
  }

  const { preserveImport, migrated } = transformAvatarElements(rootNode, avatarLocalName, edits)

  let replacedImport = false
  const handledBarrelIds = new Set<number>()
  if (migrated) {
    replacedImport = addBuiImport(rootNode, importNodesToRemove, barrelImportsToPrune, edits, handledBarrelIds)
  }

  if (!preserveImport) {
    for (const { imp, namesToRemove } of barrelImportsToPrune) {
      if (handledBarrelIds.has(imp.id())) {
        continue
      }
      edits.push(imp.replace(rebuildImportWithout(imp, namesToRemove)))
      migrationMetric.increment({ action: 'import-pruned' })
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

  return Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
}

export default transform
