import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('migrate-select-combobox-props')

const UI_SOURCE = '@backstage/ui'
const SELECT_COMPONENTS = new Set(['Select'])
const COMBOBOX_COMPONENTS = new Set(['Combobox'])
const ALL_COMPONENTS = new Set([...SELECT_COMPONENTS, ...COMBOBOX_COMPONENTS])

/** Select deprecated search props */
const SELECT_SEARCH_PROPS = new Set(['searchable', 'searchPlaceholder'])
/** Combobox deprecated search props */
const COMBOBOX_SEARCH_PROPS = new Set(['inputValue', 'onInputChange'])

function escapeRegex(str: string): string {
  return str.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ---------------------------------------------------------------------------
// Import analysis (mirrors loading-to-is-pending pattern)
// ---------------------------------------------------------------------------

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

interface ImportedComponents {
  /** Map of localName → originalName (e.g. "MySelect" → "Select") */
  localNames: Map<string, string>
  namespaceAliases: string[]
}

function collectImportedComponents(importStatements: SgNode<TSX, 'import_statement'>[]): ImportedComponents {
  const localNames = new Map<string, string>()
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
      if (!importedNameNode || !ALL_COMPONENTS.has(importedNameNode.text())) {
        continue
      }

      const localNameNode = identifiers[1] ?? importedNameNode
      localNames.set(localNameNode.text(), importedNameNode.text())
    }
  }

  return { localNames, namespaceAliases }
}

// ---------------------------------------------------------------------------
// JSX element helpers (mirrors loading-to-is-pending pattern)
// ---------------------------------------------------------------------------

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

function getOriginalComponentName(
  nameNode: SgNode<TSX>,
  localNames: Map<string, string>,
  namespaceAliases: string[],
): string | null {
  if (nameNode.is('identifier')) {
    return localNames.get(nameNode.text()) ?? null
  }

  if (nameNode.is('member_expression')) {
    const objNode = nameNode.child(0)
    const propNode = nameNode.find({ rule: { kind: 'property_identifier' } })
    if (
      objNode?.is('identifier') === true &&
      namespaceAliases.includes(objNode.text()) &&
      propNode !== null &&
      ALL_COMPONENTS.has(propNode.text())
    ) {
      return propNode.text()
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// JSX attribute helpers
// ---------------------------------------------------------------------------

function getAttrName(attr: SgNode<TSX>): string | null {
  const propId = attr.find({ rule: { kind: 'property_identifier' } })
  return propId ? propId.text() : null
}

/**
 * Return the expression text for a JSX attribute value.
 * - Boolean shorthand (`searchable`) → returns `null`
 * - String literal (`searchPlaceholder="text"`) → returns the full quoted string
 * - Expression (`inputValue={query}`) → returns the inner expression text
 */
function getAttrValueExpression(attr: SgNode<TSX>): string | null {
  // Boolean shorthand: <Select searchable />
  const children = attr.children()
  const hasEquals = children.some((c) => c.text() === '=')
  if (!hasEquals) {
    return null
  }

  // JSX expression container: attr={expr}
  const exprContainer = attr.find({ rule: { kind: 'jsx_expression' } })
  if (exprContainer) {
    const inner = exprContainer.children().filter((c) => c.kind() !== '{' && c.kind() !== '}')
    if (inner.length > 0) {
      return inner.map((c) => c.text()).join('')
    }
  }

  // String literal: attr="text"
  const strNode = attr.find({ rule: { kind: 'string' } })
  if (strNode) {
    return strNode.text()
  }

  return null
}

// ---------------------------------------------------------------------------
// Search prop migration
// ---------------------------------------------------------------------------

interface DeprecatedAttr {
  node: SgNode<TSX>
  value: string | null
}

function migrateSearchProps(opening: SgNode<TSX>, originalName: string, rootNode: SgNode<TSX>, edits: Edit[]): void {
  const isSelect = SELECT_COMPONENTS.has(originalName)
  const deprecatedPropNames = isSelect ? SELECT_SEARCH_PROPS : COMBOBOX_SEARCH_PROPS

  const allAttrs = opening.findAll({ rule: { kind: 'jsx_attribute' } })

  const found = new Map<string, DeprecatedAttr>()
  for (const attr of allAttrs) {
    const name = getAttrName(attr)
    if (name && deprecatedPropNames.has(name)) {
      found.set(name, { node: attr, value: getAttrValueExpression(attr) })
    }
  }

  if (found.size === 0) {
    return
  }

  // Skip if a `search` prop already exists — user already partially migrated
  const hasExistingSearch = allAttrs.some((attr) => getAttrName(attr) === 'search')
  if (hasExistingSearch) {
    migrationMetric.increment({ action: 'skipped-existing-search', component: originalName })
    return
  }

  // Dynamic searchable (has a non-literal expression value) → TODO
  // searchable={true} and searchable={false} are static literals — handle them normally
  if (isSelect && found.has('searchable')) {
    const searchableEntry = found.get('searchable')
    if (!searchableEntry) {
      return
    }
    if (searchableEntry.value !== null && searchableEntry.value !== 'true' && searchableEntry.value !== 'false') {
      edits.push(
        searchableEntry.node.replace(
          `/* TODO(backstage-codemod): dynamic searchable prop — migrate to search config manually */ ${searchableEntry.node.text()}`,
        ),
      )
      migrationMetric.increment({ action: 'todo-dynamic-searchable', component: originalName })
      return
    }
    // searchable={false} means search is disabled — remove the prop, don't add search config
    if (searchableEntry.value === 'false') {
      edits.push(searchableEntry.node.replace(''))
      found.delete('searchable')
      // If searchPlaceholder was also present, remove it too
      const spEntry = found.get('searchPlaceholder')
      if (spEntry) {
        edits.push(spEntry.node.replace(''))
        found.delete('searchPlaceholder')
      }
      migrationMetric.increment({ action: 'searchable-false-removed', component: originalName })
      return
    }
  }

  // Build the search object entries
  const entries: string[] = []

  if (isSelect) {
    // Select: searchable + searchPlaceholder → search={{ placeholder: ... }}
    const spEntry = found.get('searchPlaceholder')
    if (spEntry?.value) {
      entries.push(`placeholder: ${spEntry.value}`)
    }
  } else {
    // Combobox: inputValue + onInputChange → search={{ inputValue: ..., onInputChange: ... }}
    const ivEntry = found.get('inputValue')
    if (ivEntry?.value) {
      entries.push(`inputValue: ${ivEntry.value}`)
    }
    const oicEntry = found.get('onInputChange')
    if (oicEntry?.value) {
      entries.push(`onInputChange: ${oicEntry.value}`)
    }
  }

  const searchValue = entries.length > 0 ? `search={{ ${entries.join(', ')} }}` : 'search={{}}'

  // Sort deprecated attrs by source position
  const sorted = [...found.values()].sort((a, b) => a.node.range().start.index - b.node.range().start.index)

  // Replace the first deprecated attr with the search prop
  const [first] = sorted
  if (first) {
    edits.push(first.node.replace(searchValue))
  }

  // Remove remaining deprecated attrs including leading whitespace
  // (mirrors codemods/v1.48.0/remove-alert-surface-prop pattern)
  const fullSource = rootNode.text()
  for (let i = 1; i < sorted.length; i++) {
    const entry = sorted[i]
    if (entry) {
      let removeStart = entry.node.range().start.index
      while (removeStart > 0 && fullSource.charAt(removeStart - 1) === ' ') {
        removeStart -= 1
      }
      edits.push({
        startPos: removeStart,
        endPos: entry.node.range().end.index,
        insertedText: '',
      })
    }
  }

  migrationMetric.increment({ action: 'search-props-migrated', component: originalName })
}

// ---------------------------------------------------------------------------
// Inline option value → id migration
// ---------------------------------------------------------------------------

function migrateInlineOptionValues(opening: SgNode<TSX>, originalName: string, edits: Edit[]): void {
  // Find the options={...} attribute
  const optionsAttr = opening
    .findAll({ rule: { kind: 'jsx_attribute' } })
    .find((attr) => getAttrName(attr) === 'options')

  if (!optionsAttr) {
    return
  }

  // Check for inline array: options={[...]}
  const exprContainer = optionsAttr.find({ rule: { kind: 'jsx_expression' } })
  if (!exprContainer) {
    return
  }

  const arrayNode = exprContainer.find({ rule: { kind: 'array' } })
  if (!arrayNode) {
    // Variable reference — not an inline array, add TODO
    edits.push(
      optionsAttr.replace(
        `/* TODO(backstage-codemod): migrate option 'value' to 'id' — see https://backstage.io/docs/releases/v1.52.0 */ ${optionsAttr.text()}`,
      ),
    )
    migrationMetric.increment({ action: 'todo-variable-options', component: originalName })
    return
  }

  // Find all object literals with a `value` property key
  const objects = arrayNode.findAll({ rule: { kind: 'object' } })
  let changed = false

  for (const obj of objects) {
    const pairs = obj.findAll({ rule: { kind: 'pair' } })
    for (const pair of pairs) {
      const keyNode = pair.find({ rule: { kind: 'property_identifier' } })
      if (keyNode?.text() === 'value') {
        edits.push(keyNode.replace('id'))
        changed = true
      }
    }
  }

  if (changed) {
    migrationMetric.increment({ action: 'option-value-to-id', component: originalName })
  }
}

// ---------------------------------------------------------------------------
// Main transform
// ---------------------------------------------------------------------------

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  const uiImports = findImportStatementsFrom(rootNode, UI_SOURCE)
  if (uiImports.length === 0) {
    return null
  }

  const { localNames, namespaceAliases } = collectImportedComponents(uiImports)
  if (localNames.size === 0 && namespaceAliases.length === 0) {
    return null
  }

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
    if (!nameNode) {
      continue
    }

    const originalName = getOriginalComponentName(nameNode, localNames, namespaceAliases)
    if (!originalName) {
      continue
    }

    migrateSearchProps(opening, originalName, rootNode, edits)
    migrateInlineOptionValues(opening, originalName, edits)
  }

  const result = await Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
  return result
}

export default transform
