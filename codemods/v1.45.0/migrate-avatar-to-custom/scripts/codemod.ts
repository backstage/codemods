import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('migrate-avatar-to-custom')

const TARGET_COMPONENT = 'Avatar'
const UI_SOURCE = '@backstage/ui'

function escapeRegex(str: string): string {
  return str.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function findImportStatementsFrom(rootNode: SgNode<TSX>, source: string): SgNode<TSX, 'import_statement'>[] {
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
  }) as SgNode<TSX, 'import_statement'>[]
}

interface ImportedComponent {
  localNames: Set<string>
  namespaceAliases: string[]
}

function collectImportedComponent(importStatements: SgNode<TSX, 'import_statement'>[]): ImportedComponent {
  const localNames = new Set<string>()
  const namespaceAliases: string[] = []

  for (const imp of importStatements) {
    const nsImport = imp.find({ rule: { kind: 'namespace_import' } })
    if (nsImport) {
      const aliasNode = nsImport.find({ rule: { kind: 'identifier' } })
      if (aliasNode) {
        namespaceAliases.push(aliasNode.text())
      }
      continue
    }

    for (const spec of imp.findAll({ rule: { kind: 'import_specifier' } })) {
      const identifiers = spec.findAll({
        rule: {
          any: [{ kind: 'identifier' }, { kind: 'type_identifier' }],
        },
      })

      const [importedNameNode] = identifiers
      if (!importedNameNode || importedNameNode.text() !== TARGET_COMPONENT) {
        continue
      }

      const localNameNode = identifiers[1] ?? importedNameNode
      localNames.add(localNameNode.text())
    }
  }

  return { localNames, namespaceAliases }
}

function getOpeningElement(el: SgNode<TSX>): SgNode<TSX> | null {
  if (el.is('jsx_self_closing_element')) {
    return el
  }
  if (el.is('jsx_element')) {
    const opening = el.child(0)
    return opening?.is('jsx_opening_element') ? opening : null
  }
  return null
}

function getComponentNameNode(opening: SgNode<TSX>): SgNode<TSX> | null {
  return opening.child(1) ?? null
}

function isTargetComponent(nameNode: SgNode<TSX>, localNames: Set<string>, namespaceAliases: string[]): boolean {
  if (nameNode.is('identifier')) {
    return localNames.has(nameNode.text())
  }

  if (nameNode.is('member_expression')) {
    const objNode = nameNode.child(0)
    const propNode = nameNode.find({ rule: { kind: 'property_identifier' } })
    return (
      objNode?.is('identifier') === true &&
      namespaceAliases.includes(objNode.text()) &&
      propNode?.text() === TARGET_COMPONENT
    )
  }

  return false
}

function findAttr(opening: SgNode<TSX>, propName: string): SgNode<TSX> | null {
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

function getSizeLargeAttr(opening: SgNode<TSX>): SgNode<TSX> | null {
  const sizeAttr = findAttr(opening, 'size')
  if (!sizeAttr) {
    return null
  }

  const stringNode = sizeAttr.find({ rule: { kind: 'string' } })
  if (!stringNode) {
    return null
  }

  const fragment = stringNode.find({ rule: { kind: 'string_fragment' } })
  if (fragment?.text() !== 'large') {
    return null
  }

  return fragment
}

function computeIndent(fullSource: string, startIndex: number): string {
  let lineStart = startIndex
  while (lineStart > 0 && fullSource.charAt(lineStart - 1) !== '\n') {
    lineStart--
  }
  return fullSource.slice(lineStart, startIndex)
}

function transformJsxElements(
  rootNode: SgNode<TSX>,
  fullSource: string,
  localNames: Set<string>,
  namespaceAliases: string[],
  edits: Edit[],
): void {
  const jsxElements = rootNode.findAll({
    rule: {
      any: [{ kind: 'jsx_element' }, { kind: 'jsx_self_closing_element' }],
    },
  })

  for (const el of jsxElements) {
    const opening = getOpeningElement(el)
    if (!opening) {
      continue
    }

    const nameNode = getComponentNameNode(opening)
    if (!nameNode || !isTargetComponent(nameNode, localNames, namespaceAliases)) {
      continue
    }

    const renderAttr = findAttr(opening, 'render')
    const sizeLargeFragment = getSizeLargeAttr(opening)

    if (!renderAttr && !sizeLargeFragment) {
      continue
    }

    if (renderAttr) {
      // When render prop is present, use positional edits within the element text
      const indent = computeIndent(fullSource, el.range().start.index)
      const elStart = el.range().start.index
      const elText = el.text()

      // Build positional replacements within the element text
      interface TextReplacement {
        start: number
        end: number
        newText: string
      }
      const replacements: TextReplacement[] = []

      // Remove the render attribute by position
      const renderStart = renderAttr.range().start.index - elStart
      const renderEnd = renderAttr.range().end.index - elStart
      replacements.push({ start: renderStart, end: renderEnd, newText: '' })

      // Also rename size="large" to size="x-large" if present
      if (sizeLargeFragment) {
        const fragStart = sizeLargeFragment.range().start.index - elStart
        const fragEnd = sizeLargeFragment.range().end.index - elStart
        replacements.push({ start: fragStart, end: fragEnd, newText: 'x-large' })
        migrationMetric.increment({ action: 'size-renamed', from: 'large', to: 'x-large' })
      }

      // Apply replacements in reverse position order
      replacements.sort((a, b) => b.start - a.start)
      let newElText = elText
      for (const r of replacements) {
        newElText = newElText.slice(0, r.start) + r.newText + newElText.slice(r.end)
      }

      // Clean up only extra spaces from attribute removal (not inside strings)
      newElText = newElText.replaceAll(/ {2,}/g, ' ')
      newElText = newElText.replaceAll(' />', ' />')
      newElText = newElText.replaceAll(' >', '>')

      const comment = '// TODO(backstage-codemod): Avatar render prop removed, review custom rendering'
      edits.push(el.replace(`${comment}\n${indent}${newElText}`))
      migrationMetric.increment({ action: 'render-prop-removed' })
    } else if (sizeLargeFragment) {
      // Only size="large" rename, no render prop
      edits.push(sizeLargeFragment.replace('x-large'))
      migrationMetric.increment({ action: 'size-renamed', from: 'large', to: 'x-large' })
    }
  }
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const fullSource = rootNode.text()
  const edits: Edit[] = []

  const uiImports = findImportStatementsFrom(rootNode, UI_SOURCE)
  if (uiImports.length === 0) {
    return null
  }

  const { localNames, namespaceAliases } = collectImportedComponent(uiImports)
  if (localNames.size === 0 && namespaceAliases.length === 0) {
    return null
  }

  transformJsxElements(rootNode, fullSource, localNames, namespaceAliases, edits)

  const result = await Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
  return result
}

export default transform
