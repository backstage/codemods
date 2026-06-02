import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('table-to-use-table-hook')

const BUI_SOURCE = '@backstage/ui'
const TODO_COMMENT = '/* TODO(backstage-codemod): Review Table migration — verify column config and pagination mode */'

function escapeRegex(str: string): string {
  return `^${str.replaceAll(/[.*+?^${}()|[\]\\/]/g, '\\$&')}$`
}

/**
 * Find all import statements from a given source.
 */
function findImportsFrom(rootNode: SgNode<TSX>, source: string): SgNode<TSX, 'import_statement'>[] {
  return rootNode.findAll({
    rule: {
      kind: 'import_statement',
      has: {
        kind: 'string',
        has: {
          kind: 'string_fragment',
          regex: escapeRegex(source),
        },
      },
    },
  }) as SgNode<TSX, 'import_statement'>[]
}

/**
 * Check if a specific named import exists in an import statement.
 */
function hasNamedImport(importNode: SgNode<TSX>, name: string): boolean {
  const specifiers = importNode.findAll({ rule: { kind: 'import_specifier' } })
  for (const spec of specifiers) {
    const identifiers = spec.findAll({ rule: { kind: 'identifier' } })
    if (identifiers[0]?.text() === name) {
      return true
    }
  }
  return false
}

/**
 * Get the local name for an imported identifier (handles aliasing).
 */
function getLocalName(importNode: SgNode<TSX>, importedName: string): string | null {
  const specifiers = importNode.findAll({ rule: { kind: 'import_specifier' } })
  for (const spec of specifiers) {
    const identifiers = spec.findAll({ rule: { kind: 'identifier' } })
    if (identifiers[0]?.text() === importedName) {
      return (identifiers[1] ?? identifiers[0]).text()
    }
  }
  return null
}

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  const buiImports = findImportsFrom(rootNode, BUI_SOURCE)

  if (buiImports.length === 0) {
    return null
  }

  let hasTableImport = false
  let hasUseTableImport = false
  let hasTableHeaderImport = false
  let hasTableBodyImport = false
  let hasTablePaginationImport = false

  for (const imp of buiImports) {
    if (hasNamedImport(imp, 'Table')) hasTableImport = true
    if (hasNamedImport(imp, 'useTable')) hasUseTableImport = true
    if (hasNamedImport(imp, 'TableHeader')) hasTableHeaderImport = true
    if (hasNamedImport(imp, 'TableBody')) hasTableBodyImport = true
    if (hasNamedImport(imp, 'TablePagination')) hasTablePaginationImport = true
  }

  // Only proceed if file uses the old Table-related imports
  if (!hasTableImport && !hasUseTableImport) {
    return null
  }

  // 1. Rename import specifiers: remove TableHeader, TableBody, TablePagination
  //    from the import and ensure Table stays (it will be the new high-level component)
  for (const imp of buiImports) {
    const specifiers = imp.findAll({ rule: { kind: 'import_specifier' } })
    const specsToRemove = new Set(['TableHeader', 'TableBody', 'TablePagination'])
    const removedSpecs: string[] = []
    const keptSpecs: string[] = []

    for (const spec of specifiers) {
      const identifiers = spec.findAll({ rule: { kind: 'identifier' } })
      const importedName = identifiers[0]?.text()
      if (importedName && specsToRemove.has(importedName)) {
        removedSpecs.push(importedName)
      } else {
        keptSpecs.push(spec.text())
      }
    }

    if (removedSpecs.length > 0) {
      // Check if 'type' keyword is before the named imports
      const isTypeOnly = imp.children().some((c) => c.text() === 'type')
      const typeKw = isTypeOnly ? 'type ' : ''

      if (keptSpecs.length === 0) {
        // All specifiers removed — remove the whole import
        edits.push(imp.replace(''))
      } else {
        // Rebuild import with remaining specifiers
        const specList = keptSpecs.length <= 3 ? keptSpecs.join(', ') : `\n  ${keptSpecs.join(',\n  ')},\n`
        const newImport = `import ${typeKw}{ ${specList} } from '${BUI_SOURCE}';`
        edits.push(imp.replace(newImport))
      }

      for (const name of removedSpecs) {
        migrationMetric.increment({
          type: 'import-removed',
          action: name,
        })
      }
    }
  }

  // 2. Transform useTable hook calls: old API → new API
  //    Old: const { data, paginationProps } = useTable({ data: items, pagination: {...} })
  //    New: const { tableProps } = useTable({ mode: 'complete', getData: () => items })
  const useTableCalls = rootNode.findAll({
    rule: {
      kind: 'variable_declarator',
      has: {
        kind: 'call_expression',
        has: {
          kind: 'identifier',
          regex: '^useTable$',
        },
      },
    },
  })

  for (const declarator of useTableCalls) {
    const callExpr = declarator.find({ rule: { kind: 'call_expression' } })
    if (!callExpr) continue

    // Check if the destructured return has old-style properties (data, paginationProps)
    const objectPattern = declarator.find({ rule: { kind: 'object_pattern' } })
    if (!objectPattern) continue

    const patternText = objectPattern.text()
    const hasOldData = /\bdata\b/.test(patternText)
    const hasOldPaginationProps = /\bpaginationProps\b/.test(patternText)

    if (!hasOldData && !hasOldPaginationProps) continue

    // Replace the destructuring pattern with new shape
    edits.push(objectPattern.replace('{ tableProps }'))

    // Transform the call arguments
    const args = callExpr.find({ rule: { kind: 'arguments' } })
    if (!args) continue

    const firstArg = args.find({ rule: { kind: 'object' } })
    if (!firstArg) continue

    // Find the 'data' property in the argument object
    const dataProperty = firstArg.findAll({ rule: { kind: 'pair' } })
    let dataValueText: string | null = null

    for (const pair of dataProperty) {
      const key = pair.find({ rule: { kind: 'property_identifier' } })
      if (key?.text() === 'data') {
        const value = pair.field('value')
        if (value) {
          dataValueText = value.text()
        }
      }
    }

    // Build new argument object
    const newArgText = dataValueText ? `{ mode: 'complete', getData: () => ${dataValueText} }` : `{ mode: 'complete' }`

    edits.push(firstArg.replace(newArgText))

    // Add TODO comment above the declaration
    const varDecl = declarator.parent()
    if (varDecl) {
      const startPos = varDecl.range().start.index
      const fullText = rootNode.text()
      let lineStart = startPos
      while (lineStart > 0 && fullText[lineStart - 1] !== '\n') {
        lineStart--
      }
      const indent = fullText.slice(lineStart, startPos)

      edits.push({
        startPos,
        endPos: startPos,
        insertedText: `${TODO_COMMENT}\n${indent}`,
      })
    }

    migrationMetric.increment({
      type: 'useTable-hook',
      action: 'migrated',
    })
  }

  const result = await Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
  return result
}

export default transform
