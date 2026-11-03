import { addImport, getImport, listImports, removeImport } from '@jssg/utils/javascript/imports'
import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('migrate-mui-link-to-bui-link')

const BUI_SOURCE = '@backstage/ui'
const MUI_BARREL = '@material-ui/core'
const MUI_LINK = '@material-ui/core/Link'

/** Match the core-components package root, not incidental path substrings. */
const CORE_COMPONENTS_PATH_RE = /(?:^|[\\/])packages[\\/]core-components(?:[\\/]|$)/

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

function resolveBuiLinkName(rootNode: SgNode<TSX, 'program'>, muiLocalName: string): string {
  const existingBuiLink = getImport(rootNode, { type: 'named', name: 'Link', from: BUI_SOURCE })
  if (existingBuiLink) {
    return existingBuiLink.alias
  }

  // MUI local name will be removed; ignore it when checking for `Link` collisions
  // (e.g. `@backstage/core-components` Link or `@backstage/core-components/Link`).
  const bound = new Set<string>()
  for (const item of listImports(rootNode)) {
    if (item.defaultName) {
      bound.add(item.defaultName)
    }
    if (item.namespaceName) {
      bound.add(item.namespaceName)
    }
    for (const spec of item.specifiers) {
      bound.add(spec.localName)
    }
  }
  if (bound.has('Link') && muiLocalName !== 'Link') {
    return 'BuiLink'
  }
  return 'Link'
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
  const str = attr.find({ rule: { kind: 'string' } })
  if (!str) {
    return null
  }
  return str.text().slice(1, -1)
}

function buildBuiLink(element: SgNode<TSX>, opening: SgNode<TSX>, buiLocalName: string): string {
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

  // Only emit standalone when MUI explicitly opted out of underline — avoid over-applying
  // to sole children of layout containers (div/li/fragment).
  if (getPropStringValue(opening, 'underline') === 'none' && !attrs.some((attr) => attr.startsWith('standalone'))) {
    attrs.push('standalone')
  }

  const propsStr = attrs.length > 0 ? ` ${attrs.join(' ')}` : ''
  if (element.is('jsx_self_closing_element')) {
    return `<${buiLocalName}${propsStr} />`
  }
  return `<${buiLocalName}${propsStr}>${getChildContent(element)}</${buiLocalName}>`
}

function transformLinkElements(
  rootNode: SgNode<TSX, 'program'>,
  localName: string,
  buiLocalName: string,
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

    edits.push(el.replace(buildBuiLink(el, opening, buiLocalName)))
    migrated = true
    migrationMetric.increment({ action: 'link-migrated' })
  }

  return { migrated, preserveImport }
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const filename = root.filename()

  if (CORE_COMPONENTS_PATH_RE.test(filename)) {
    migrationMetric.increment({ action: 'skipped', reason: 'core-components-path' })
    return null
  }

  const linkDefault = getImport(rootNode, { type: 'default', from: MUI_LINK })
  const linkBarrelNamed = getImport(rootNode, { type: 'named', name: 'Link', from: MUI_BARREL })
  const localName = linkBarrelNamed?.alias ?? linkDefault?.alias ?? null
  if (!localName) {
    return null
  }

  const buiLocalName = resolveBuiLinkName(rootNode, localName)
  const edits: Edit[] = []
  const { migrated, preserveImport } = transformLinkElements(rootNode, localName, buiLocalName, edits)
  if (!migrated && !preserveImport) {
    return null
  }

  if (migrated) {
    const addEdit = addImport(rootNode, {
      type: 'named',
      specifiers: [buiLocalName === 'Link' ? { name: 'Link' } : { name: 'Link', alias: buiLocalName }],
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
    if (linkBarrelNamed) {
      const edit = removeImport(rootNode, { type: 'named', specifiers: ['Link'], from: MUI_BARREL })
      if (edit) {
        edits.push(...edit)
        migrationMetric.increment({ action: 'import-removed' })
      }
    }
    if (linkDefault) {
      const edit = removeImport(rootNode, { type: 'default', from: MUI_LINK })
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
