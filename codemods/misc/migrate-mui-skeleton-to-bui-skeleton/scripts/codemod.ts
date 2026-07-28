import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('migrate-mui-skeleton-to-bui-skeleton')

const BUI_SOURCE = '@backstage/ui'
const MUI_LAB_BARREL = '@material-ui/lab'
const MUI_CORE_BARREL = '@material-ui/core'

const PASSTHROUGH_PROPS = new Set(['width', 'height', 'className', 'style', 'id'])

const TODO_PROPS = new Set(['animation', 'classes', 'component'])

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
  const sourceText = sourceNode?.text() ?? `'${MUI_LAB_BARREL}'`

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

function collectSkeletonImports(rootNode: SgNode<TSX>): {
  skeletonLocalName: string | null
  importNodesToRemove: SgNode<TSX>[]
  barrelImportsToPrune: { imp: SgNode<TSX>; namesToRemove: Set<string> }[]
} {
  let skeletonLocalName: string | null = null
  const importNodesToRemove: SgNode<TSX>[] = []
  const barrelImportsToPrune: { imp: SgNode<TSX>; namesToRemove: Set<string> }[] = []

  for (const source of ['@material-ui/lab/Skeleton', '@material-ui/core/Skeleton']) {
    for (const imp of findImportStatementsFrom(rootNode, source)) {
      skeletonLocalName = getDefaultImportName(imp)
      importNodesToRemove.push(imp)
    }
  }

  for (const barrel of [MUI_LAB_BARREL, MUI_CORE_BARREL]) {
    for (const imp of findImportStatementsFrom(rootNode, barrel)) {
      const localName = getNamedImportLocalName(imp, 'Skeleton')
      if (localName) {
        skeletonLocalName = localName
        const allSpecifiers = imp.findAll({ rule: { kind: 'import_specifier' } })
        if (allSpecifiers.length <= 1) {
          importNodesToRemove.push(imp)
        } else {
          barrelImportsToPrune.push({ imp, namesToRemove: new Set(['Skeleton']) })
        }
      }
    }
  }

  return { skeletonLocalName, importNodesToRemove, barrelImportsToPrune }
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
    const alreadyImported = getNamedImportLocalName(existingImport, 'Skeleton') !== null
    if (!alreadyImported) {
      const namedImports = existingImport.find({ rule: { kind: 'named_imports' } })
      if (namedImports) {
        const text = namedImports.text()
        const inner = text.slice(1, -1).trim()
        const names = inner
          .split(',')
          .map((n) => n.trim())
          .filter(Boolean)
        names.push('Skeleton')
        names.sort()
        edits.push(namedImports.replace(`{ ${names.join(', ')} }`))
        migrationMetric.increment({ action: 'import-merged' })
      } else {
        edits.push(existingImport.replace(`${existingImport.text()}\nimport { Skeleton } from '${BUI_SOURCE}';`))
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
  const buiImport = `import { Skeleton } from '${BUI_SOURCE}';`

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

function transformSkeletonElements(
  rootNode: SgNode<TSX>,
  skeletonLocalName: string,
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
    if (name !== skeletonLocalName) {
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
            `{/* TODO(backstage-codemod): finish skeleton migration manually (${todoReasons.join(', ')}) */}`,
            el.text(),
          ),
        ),
      )
      migrationMetric.increment({ action: 'todo-inserted', reason: todoReasons.join(', ') })
      continue
    }

    const newProps: string[] = []
    const variant = getPropStringValue(opening, 'variant')
    if (variant === 'circle') {
      newProps.push('rounded')
      migrationMetric.increment({ action: 'variant-mapped', from: 'circle', to: 'rounded' })
    }

    for (const child of opening.children()) {
      const kind = child.kind()
      if (kind === 'jsx_attribute') {
        const propIdent = child.find({ rule: { kind: 'property_identifier' } })
        if (!propIdent) {
          continue
        }
        const propName = propIdent.text()
        if (propName === 'variant') {
          continue
        }
        if (PASSTHROUGH_PROPS.has(propName) || propName.startsWith('aria-') || propName.startsWith('data-')) {
          newProps.push(child.text())
        }
      } else if (kind === 'jsx_expression' && child.text().startsWith('{...')) {
        newProps.push(child.text())
      }
    }

    const propsStr = newProps.length > 0 ? ` ${newProps.join(' ')}` : ''
    if (isSelfClosing) {
      edits.push(el.replace(`<Skeleton${propsStr} />`))
    } else {
      const children = el
        .children()
        .filter((c) => c.kind() !== 'jsx_opening_element' && c.kind() !== 'jsx_closing_element')
        .map((c) => c.text())
        .join('')
      edits.push(el.replace(`<Skeleton${propsStr}>${children}</Skeleton>`))
    }

    migrated = true
    migrationMetric.increment({ action: 'skeleton-migrated' })
  }

  return { preserveImport, migrated }
}

const transform: Codemod<TSX> = (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  const { skeletonLocalName, importNodesToRemove, barrelImportsToPrune } = collectSkeletonImports(rootNode)

  if (!skeletonLocalName) {
    return Promise.resolve(null)
  }

  const { preserveImport, migrated } = transformSkeletonElements(rootNode, skeletonLocalName, edits)

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
