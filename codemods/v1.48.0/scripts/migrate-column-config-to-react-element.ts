import { addImport } from '@jssg/utils/javascript/imports'
import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('migrate-column-config-to-react-element')

const UI_SOURCE = '@backstage/ui'
const COLUMN_CONFIG_NAMES = new Set(['ColumnConfig'])

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

function hasRelevantImport(importStatements: SgNode<TSX, 'import_statement'>[]): boolean {
  for (const imp of importStatements) {
    for (const spec of imp.findAll({ rule: { kind: 'import_specifier' } })) {
      const identifiers = spec.findAll({
        rule: {
          any: [{ kind: 'identifier' }, { kind: 'type_identifier' }],
        },
      })
      const [importedNameNode] = identifiers
      if (
        importedNameNode &&
        (COLUMN_CONFIG_NAMES.has(importedNameNode.text()) || importedNameNode.text() === 'useTable')
      ) {
        return true
      }
    }
  }
  return false
}

function isJsxExpression(node: SgNode<TSX>): boolean {
  const kind = node.kind()
  return kind === 'jsx_element' || kind === 'jsx_self_closing_element' || kind === 'jsx_fragment'
}

function isParenthesizedJsx(node: SgNode<TSX>): boolean {
  if (node.kind() === 'parenthesized_expression') {
    const inner = node.child(1) // skip '('
    if (inner && isJsxExpression(inner)) {
      return true
    }
  }
  return false
}

function getArrowBody(arrowFn: SgNode<TSX>): SgNode<TSX> | null {
  // Arrow function body is the last child that's not the parameters
  const children = arrowFn.children()
  for (let i = children.length - 1; i >= 0; i--) {
    const child = children[i]
    if (!child) {
      continue
    }
    if (child.kind() === 'statement_block') {
      return child
    }
    if (child.kind() !== '=>' && child.kind() !== 'formal_parameters' && child.kind() !== '(' && child.kind() !== ')') {
      return child
    }
  }
  return null
}

function processColumnConfigProperty(
  pair: SgNode<TSX>,
  propName: string,
  rootNode: SgNode<TSX>,
  edits: Edit[],
  needsImport: { cellText: boolean; column: boolean },
): void {
  const keyNode = pair.field('key')
  if (!keyNode || keyNode.text() !== propName) {
    return
  }

  const valueNode = pair.field('value')
  if (!valueNode) {
    return
  }

  // Value should be an arrow function or function
  if (valueNode.kind() !== 'arrow_function') {
    return
  }

  const body = getArrowBody(valueNode)
  if (!body) {
    return
  }

  // If body is a block, check return statements
  if (body.kind() === 'statement_block') {
    // TODO: block body handling is complex, skip for now
    return
  }

  // If body is already JSX, skip
  if (isJsxExpression(body) || isParenthesizedJsx(body)) {
    return
  }

  if (propName === 'cell') {
    // Wrap in <CellText title={value} />
    const bodyText = body.text()
    edits.push(body.replace(`<CellText title={${bodyText}} />`))
    needsImport.cellText = true
    migrationMetric.increment({ action: 'cell-wrapped' })
  } else if (propName === 'header') {
    // Wrap in <Column>value</Column>
    const bodyText = body.text()
    // If it's a string literal, put the value inside directly
    if (body.kind() === 'string') {
      const fragment = body.find({ rule: { kind: 'string_fragment' } })
      const text = fragment?.text() ?? bodyText
      edits.push(body.replace(`<Column>${text}</Column>`))
    } else {
      edits.push(body.replace(`<Column>{${bodyText}}</Column>`))
    }
    needsImport.column = true
    migrationMetric.increment({ action: 'header-wrapped' })
  }
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  const uiImports = findImportStatementsFrom(rootNode, UI_SOURCE)
  if (uiImports.length === 0) {
    return null
  }

  if (!hasRelevantImport(uiImports)) {
    return null
  }

  const needsImport = { cellText: false, column: false }

  // Find all pairs (object properties) with key 'cell' or 'header'
  // that are inside an array of objects (i.e. a columns array)
  const allPairs = rootNode.findAll({
    rule: {
      kind: 'pair',
      has: {
        field: 'key',
        kind: 'property_identifier',
        regex: '^(cell|header)$',
      },
    },
  })

  for (const pair of allPairs) {
    const keyNode = pair.field('key')
    if (!keyNode) {
      continue
    }
    const propName = keyNode.text()
    if (propName !== 'cell' && propName !== 'header') {
      continue
    }

    // Narrow matching: walk up from the pair and verify it's inside an
    // object literal that's an element of an array (i.e. a columns array).
    // This prevents matching standalone objects like `{ cell: ... }` that
    // are not ColumnConfig entries.
    if (pair.parent()?.kind() !== 'object') {
      continue
    }
    if (pair.parent()?.parent()?.kind() !== 'array') {
      continue
    }

    processColumnConfigProperty(pair, propName, rootNode, edits, needsImport)
  }

  // Add imports for CellText and Column if needed
  if (needsImport.cellText || needsImport.column) {
    const specifiers: { name: string }[] = []
    if (needsImport.cellText) {
      specifiers.push({ name: 'CellText' })
    }
    if (needsImport.column) {
      specifiers.push({ name: 'Column' })
    }

    const edit = addImport(rootNode, {
      type: 'named',
      specifiers,
      from: UI_SOURCE,
    })
    if (edit) {
      edits.push(edit)
    }
  }

  const result = await Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
  return result
}

export default transform
