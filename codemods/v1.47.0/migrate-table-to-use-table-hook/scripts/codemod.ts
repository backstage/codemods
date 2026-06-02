import type { Codemod, Edit, SgNode } from 'codemod:ast-grep'
import type TSX from 'codemod:ast-grep/langs/tsx'
import { useMetricAtom } from 'codemod:metrics'

const migrationMetric = useMetricAtom('table-to-use-table-hook')

const BUI_SOURCE = '@backstage/ui'
const TODO_COMMENT = '/* TODO(backstage-codemod): Review Table migration — verify column config and pagination mode */'
const TODO_JSX_COMMENT =
  '{/* TODO(backstage-codemod): Migrate TableHeader/TableBody/TablePagination to new Table API */}'

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

const transform: Codemod<TSX> = async (root) => {
  const rootNode = root.root()
  const edits: Edit[] = []

  const buiImports = findImportsFrom(rootNode, BUI_SOURCE)

  if (buiImports.length === 0) {
    return null
  }

  let hasTableImport = false
  let hasUseTableImport = false

  for (const imp of buiImports) {
    if (hasNamedImport(imp, 'Table')) {
      hasTableImport = true
    }
    if (hasNamedImport(imp, 'useTable')) {
      hasUseTableImport = true
    }
  }

  // Only proceed if file uses the old Table-related imports
  if (!hasTableImport && !hasUseTableImport) {
    return null
  }

  // 1. Find TableHeader/TableBody/TablePagination usage and add TODO comments.
  //    Keep imports intact — the AI fixup step handles the actual rewrite.
  const tableComponents = new Set(['TableHeader', 'TableBody', 'TablePagination'])

  for (const imp of buiImports) {
    const specifiers = imp.findAll({ rule: { kind: 'import_specifier' } })
    const foundComponents: string[] = []

    for (const spec of specifiers) {
      const identifiers = spec.findAll({ rule: { kind: 'identifier' } })
      const importedName = identifiers[0]?.text()
      if (importedName && tableComponents.has(importedName)) {
        foundComponents.push(importedName)
      }
    }

    if (foundComponents.length > 0) {
      // Add TODO comments before JSX elements that use these components
      for (const name of foundComponents) {
        const jsxElements = rootNode.findAll({
          rule: {
            any: [
              { kind: 'jsx_self_closing_element', has: { kind: 'identifier', regex: `^${name}$` } },
              { kind: 'jsx_opening_element', has: { kind: 'identifier', regex: `^${name}$` } },
            ],
          },
        })

        for (const el of jsxElements) {
          // Navigate to the enclosing jsx_element (or self-closing element)
          const jsxNode = el.kind() === 'jsx_opening_element' ? el.parent() : el
          if (!jsxNode) {
            continue
          }

          const startPos = jsxNode.range().start.index
          const fullText = rootNode.text()
          let lineStart = startPos
          while (lineStart > 0 && fullText[lineStart - 1] !== '\n') {
            lineStart--
          }
          const indent = fullText.slice(lineStart, startPos)

          edits.push({
            startPos,
            endPos: startPos,
            insertedText: `${TODO_JSX_COMMENT}\n${indent}`,
          })
        }

        migrationMetric.increment({
          type: 'jsx-todo-added',
          action: name,
        })
      }
    }
  }

  // 2. Add TODO comments above useTable hook calls that use old API patterns.
  //    Keep the code intact — the AI fixup step handles the full refactor.
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
    if (!callExpr) {
      continue
    }

    // Check if the destructured return has old-style properties (data, paginationProps)
    const objectPattern = declarator.find({ rule: { kind: 'object_pattern' } })
    if (!objectPattern) {
      continue
    }

    const patternText = objectPattern.text()
    const hasOldData = /\bdata\b/.test(patternText)
    const hasOldPaginationProps = /\bpaginationProps\b/.test(patternText)

    if (!hasOldData && !hasOldPaginationProps) {
      continue
    }

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
      action: 'todo-added',
    })
  }

  const result = await Promise.resolve(edits.length > 0 ? rootNode.commitEdits(edits) : null)
  return result
}

export default transform
