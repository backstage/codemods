import { addImport, getImport, removeImport } from '@jssg/utils/javascript/imports'
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

const MUI_SKELETON_SOURCES = ['@material-ui/lab/Skeleton', '@material-ui/core/Skeleton']
const MUI_BARRELS = [MUI_LAB_BARREL, MUI_CORE_BARREL]

function hasSingleSpecifier(importNode: SgNode<TSX>): boolean {
  const stmt = importNode.ancestors().find((a) => a.kind() === 'import_statement')
  if (!stmt) {
    return false
  }
  return stmt.findAll({ rule: { kind: 'import_specifier' } }).length <= 1
}

const transform: Codemod<TSX> = (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  const defaultImports = MUI_SKELETON_SOURCES.map((source) => ({
    source,
    imp: getImport(rootNode, { type: 'default', from: source }),
  })).filter(({ imp }) => imp !== null)
  const barrelImports = MUI_BARRELS.map((barrel) => ({
    barrel,
    imp: getImport(rootNode, { type: 'named', name: 'Skeleton', from: barrel }),
  })).filter(({ imp }) => imp !== null)
  const skeletonLocalName = defaultImports[0]?.imp?.alias ?? barrelImports[0]?.imp?.alias ?? null

  if (!skeletonLocalName) {
    return Promise.resolve(null)
  }

  const { preserveImport, migrated } = transformSkeletonElements(rootNode, skeletonLocalName, edits)

  if (migrated) {
    const addEdit = addImport(rootNode, {
      type: 'named',
      specifiers: [{ name: 'Skeleton' }],
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
    for (const { barrel, imp } of barrelImports) {
      const edit = removeImport(rootNode, { type: 'named', specifiers: ['Skeleton'], from: barrel })
      if (edit && imp) {
        edits.push(...edit)
        migrationMetric.increment({ action: hasSingleSpecifier(imp.node) ? 'import-removed' : 'import-pruned' })
      }
    }
    for (const { source } of defaultImports) {
      const edit = removeImport(rootNode, { type: 'default', from: source })
      if (edit) {
        edits.push(...edit)
        migrationMetric.increment({ action: 'import-removed' })
      }
    }
  }

  return Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
}

export default transform
